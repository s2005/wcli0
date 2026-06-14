import * as path from 'path';
import * as vscode from 'vscode';
import { buildLaunchSpec, isValidPort, renderCommandLine, validateLaunchSpec } from './argsBuilder';
import { buildConfigFile } from './configFile';
import { hasPerShellConfig, primaryWorkspaceFolder, readSettings, resolveVariables } from './settings';
import { clientHost, MANAGED_CONFIG_FILE, Wcli0McpProvider } from './mcpProvider';

/** Generate a wcli0 config.json from settings and offer to save it. */
export async function generateConfigFile(): Promise<void> {
  const scope = primaryWorkspaceFolder()?.uri;
  const settings = readSettings(scope);
  const config = buildConfigFile(settings);
  const content = JSON.stringify(config, null, 2) + '\n';

  const folder = primaryWorkspaceFolder();
  const defaultUri = folder
    ? vscode.Uri.joinPath(folder.uri, 'wcli0.config.json')
    : undefined;

  const target = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { JSON: ['json'] },
    saveLabel: 'Save wcli0 config',
  });
  if (!target) {
    return;
  }
  await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
  const doc = await vscode.workspace.openTextDocument(target);
  await vscode.window.showTextDocument(doc);

  const useIt = await vscode.window.showInformationMessage(
    'Config written. Reference it from settings via wcli0.configFile?',
    'Set wcli0.configFile',
    'Not now',
  );
  if (useIt === 'Set wcli0.configFile') {
    const cfgTarget = folder
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
    // For a workspace target, store a ${workspaceFolder}-relative path so the
    // (commonly committed) setting stays valid on other machines.
    const value =
      folder && cfgTarget === vscode.ConfigurationTarget.Workspace
        ? toPortablePath(folder.uri, target)
        : target.fsPath;
    await vscode.workspace
      .getConfiguration('wcli0', scope ?? null)
      .update('configFile', value, cfgTarget);
  }
}

/** Write a `.vscode/mcp.json` entry for the wcli0 server (for clients that read it). */
export async function writeWorkspaceMcpJson(): Promise<void> {
  const folder = primaryWorkspaceFolder();
  if (!folder) {
    void vscode.window.showErrorMessage('wcli0: open a workspace folder first.');
    return;
  }
  const settings = readSettings(folder.uri);

  // Validate only what the generated entry actually uses. A stdio entry needs a
  // working launch command; an http/sse entry only contains a URL, so local
  // launch settings (method, allowed dirs) are irrelevant and only the port
  // matters — otherwise a valid external endpoint couldn't be written.
  if (settings.transportMode === 'stdio') {
    const blocking = validateLaunchSpec(settings).filter((p) => p.blocking);
    if (blocking.length > 0) {
      void vscode.window.showErrorMessage(`wcli0: ${blocking.map((p) => p.message).join(' ')}`);
      return;
    }
  } else if (!isValidPort(settings.transportPort)) {
    void vscode.window.showErrorMessage(
      `wcli0: transport.port (${settings.transportPort}) must be an integer between 1 and 65535.`,
    );
    return;
  }

  // Preserve portable ${workspaceFolder} tokens rather than resolving them: a
  // committed mcp.json is shared across machines and VS Code resolves these
  // variables itself, so baking in absolute paths would break for teammates.
  const spec = buildLaunchSpec(settings, { resolvePaths: false });

  let entry: Record<string, unknown>;
  if (settings.transportMode === 'stdio') {
    // Include cwd only when launch.cwd is explicitly set. NOTE: omitting it does
    // not avoid the workspace — VS Code defaults a committed stdio entry's cwd to
    // the workspace folder, so the server may still auto-load <workspace>/config.json.
    // There is no portable "safe" cwd for a shared mcp.json (an absolute temp path
    // would not be portable); set wcli0.launch.cwd or wcli0.configFile to control it.
    let env = spec.env;
    if (Object.keys(env).length > 0) {
      // env is serialized into the (commonly committed) mcp.json and may hold
      // secrets inherited from User settings — require an explicit choice.
      const pick = await vscode.window.showWarningMessage(
        `wcli0: launch.env has ${Object.keys(env).length} variable(s) that would be written into the committed .vscode/mcp.json. These may include secrets inherited from User settings.`,
        { modal: true },
        'Include environment',
        'Omit environment',
      );
      if (pick === undefined) {
        return; // cancelled — don't write
      }
      if (pick === 'Omit environment') {
        env = {};
      }
    }
    entry = {
      type: 'stdio',
      command: spec.command,
      args: spec.args,
      ...(spec.cwd ? { cwd: spec.cwd } : {}),
      ...(Object.keys(env).length ? { env } : {}),
    };
  } else {
    entry = {
      type: settings.transportMode === 'http' ? 'http' : 'sse',
      // Normalize wildcard/IPv6 bind hosts into a connectable client URL.
      url: `http://${clientHost(settings.transportHost)}:${settings.transportPort}${
        settings.transportMode === 'http' ? '/mcp' : '/sse'
      }`,
    };
  }

  const mcpUri = vscode.Uri.joinPath(folder.uri, '.vscode', 'mcp.json');
  let existing: Record<string, unknown> = {};
  let raw: Uint8Array | undefined;
  try {
    raw = await vscode.workspace.fs.readFile(mcpUri);
  } catch (err) {
    if (!isFileNotFound(err)) {
      // A real read error (permissions, transient FS) — don't risk clobbering.
      void vscode.window.showErrorMessage(
        `wcli0: could not read ${mcpUri.fsPath} (${(err as Error).message}). Not writing.`,
      );
      return;
    }
    // Not found — start fresh.
  }
  if (raw) {
    try {
      // VS Code registers mcp.json as JSON-with-comments, so tolerate comments
      // and trailing commas rather than refusing to merge into a valid JSONC file.
      existing = parseJsonc(Buffer.from(raw).toString('utf8')) as Record<string, unknown>;
    } catch (err) {
      // The file exists but is not valid JSON/JSONC — refuse rather than clobber it.
      void vscode.window.showErrorMessage(
        `wcli0: ${mcpUri.fsPath} is not valid JSON (${(err as Error).message}). Fix it before writing.`,
      );
      return;
    }
  }
  // A syntactically valid file can still have a non-object root or `servers`
  // (e.g. `null`, or `"servers": []`); merging into those would throw or
  // silently drop the entry, so refuse rather than corrupt the file.
  if (!isPlainObject(existing)) {
    void vscode.window.showErrorMessage(
      `wcli0: ${mcpUri.fsPath} root is not a JSON object. Fix it before writing.`,
    );
    return;
  }
  if (existing.servers !== undefined && !isPlainObject(existing.servers)) {
    void vscode.window.showErrorMessage(
      `wcli0: "servers" in ${mcpUri.fsPath} is not a JSON object. Fix it before writing.`,
    );
    return;
  }
  // Re-serializing with JSON.stringify drops any comments/formatting the file
  // had. Warn before discarding them rather than silently reformatting.
  if (raw && containsJsoncComments(Buffer.from(raw).toString('utf8'))) {
    const pick = await vscode.window.showWarningMessage(
      `wcli0: ${mcpUri.fsPath} contains comments that will be removed when the wcli0 entry is written (the file is rewritten as plain JSON).`,
      { modal: true },
      'Write anyway',
    );
    if (pick !== 'Write anyway') {
      return;
    }
  }

  const servers = (existing.servers as Record<string, unknown>) ?? {};
  servers.wcli0 = entry;
  existing.servers = servers;

  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, '.vscode'));
  await vscode.workspace.fs.writeFile(
    mcpUri,
    Buffer.from(JSON.stringify(existing, null, 2) + '\n', 'utf8'),
  );
  const doc = await vscode.workspace.openTextDocument(mcpUri);
  await vscode.window.showTextDocument(doc);
}

/** Show the resolved launch command line and offer to copy it. */
export async function showLaunchCommand(
  output: vscode.OutputChannel,
  managedConfigDir?: string,
): Promise<void> {
  const scope = primaryWorkspaceFolder()?.uri;
  const settings = readSettings(scope);
  // Mirror the provider: when shells are configured individually the server is
  // launched against an auto-managed config file, not the global CLI flags.
  const managed = hasPerShellConfig(settings) && settings.transportMode === 'stdio';
  const managedConfigPath = managed
    ? path.join(managedConfigDir ?? '', MANAGED_CONFIG_FILE)
    : undefined;
  const spec = buildLaunchSpec(settings, managedConfigPath ? { managedConfigPath } : {});
  const line = renderCommandLine(spec);
  const problems = validateLaunchSpec(settings, managed);

  output.clear();
  output.appendLine('Resolved wcli0 launch command:');
  output.appendLine('');
  output.appendLine(line);
  if (managed) {
    output.appendLine('');
    output.appendLine(
      'Note: shells are configured individually (wcli0.shells), so the server is launched',
    );
    output.appendLine(
      `with an auto-managed config file (written to ${managedConfigPath} on launch).`,
    );
  }
  if (spec.cwd) {
    output.appendLine('');
    output.appendLine(`cwd: ${spec.cwd}`);
  }
  if (Object.keys(spec.env).length) {
    // Show only variable names: values may be secrets and this output channel
    // persists. (The mcp.json command similarly guards launch.env.)
    output.appendLine(`env (values hidden): ${Object.keys(spec.env).join(', ')}`);
  }
  if (problems.length) {
    output.appendLine('');
    output.appendLine('Notes:');
    for (const p of problems) {
      output.appendLine(`  - ${p.message}`);
    }
  }
  output.show(true);

  // Don't await: the command should complete as soon as the output is written.
  // Awaiting the notification would keep the command invocation pending until
  // the user dismisses it (and hang headless callers entirely).
  void vscode.window
    .showInformationMessage('wcli0 launch command written to output.', 'Copy command')
    .then((pick) => {
      if (pick === 'Copy command') {
        return vscode.env.clipboard.writeText(line);
      }
      return undefined;
    });
}

/**
 * Republish the server definition from current settings. This does not stop an
 * already-running server process; VS Code restarts it when the definition's
 * launch arguments change. If only non-launch state changed, restart the server
 * from the MCP view (Extensions: Show Installed / MCP Servers) to pick it up.
 */
export async function refreshServerDefinition(provider: Wcli0McpProvider): Promise<void> {
  provider.refresh();
  void vscode.window.showInformationMessage(
    'wcli0: MCP server definition refreshed. If the server was already running with the same launch command, restart it from the MCP view to apply changes.',
  );
}

/**
 * Parse JSON-with-comments (the format VS Code uses for `mcp.json`). Strips line
 * (`//`) and block (`/* *\/`) comments and trailing commas while preserving the
 * contents of double-quoted strings, then defers to `JSON.parse`. Throws on
 * genuinely malformed input so callers can refuse to overwrite it.
 */
export function parseJsonc(text: string): unknown {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (ch === '\\') {
        // Emit the escaped character verbatim so an escaped quote doesn't end the string.
        out += next ?? '';
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') {
        i++;
      }
      out += '\n';
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        i++;
      }
      if (i >= text.length) {
        // EOF before the closing */ — malformed; don't silently accept the
        // truncated remainder and overwrite the user's file.
        throw new SyntaxError('Unterminated block comment in JSONC input');
      }
      i++; // skip the closing '/'
      // Replace the comment with a space so adjacent tokens (e.g. `1/*c*/2`)
      // don't fuse into a different value that parses successfully.
      out += ' ';
      continue;
    }
    if (ch === '}' || ch === ']') {
      // Drop a trailing comma (outside any string) before the closing bracket.
      const trimmed = out.replace(/\s+$/, '');
      out = trimmed.endsWith(',') ? trimmed.slice(0, -1) : out;
    }
    out += ch;
  }
  return JSON.parse(out);
}

/** Whether the text contains a `//` or block comment outside any string. */
function containsJsoncComments(text: string): boolean {
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      if (ch === '\\') {
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '/' && (next === '/' || next === '*')) {
      return true;
    }
  }
  return false;
}

/** Whether a value is a plain JSON object (not null, not an array). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Return a `${workspaceFolder}`-relative path when `target` is inside `folder`,
 * otherwise the absolute fsPath. Workspace settings/artifacts are commonly
 * committed, so a portable token keeps the reference valid on other machines.
 */
function toPortablePath(folder: vscode.Uri, target: vscode.Uri): string {
  const rel = path.relative(folder.fsPath, target.fsPath);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
    return `\${workspaceFolder}/${rel.split(path.sep).join('/')}`;
  }
  return target.fsPath;
}

/** Whether a workspace.fs read error means the file is simply absent. */
function isFileNotFound(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  if (code === 'FileNotFound' || code === 'ENOENT') {
    return true;
  }
  const text = `${(err as { name?: string }).name ?? ''} ${(err as Error)?.message ?? ''}`;
  return /FileNotFound|ENOENT|not found|no such file/i.test(text);
}

export { resolveVariables };
