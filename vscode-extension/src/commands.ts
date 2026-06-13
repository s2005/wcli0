import * as vscode from 'vscode';
import { buildLaunchSpec, isValidPort, renderCommandLine, validateLaunchSpec } from './argsBuilder';
import { buildConfigFile } from './configFile';
import { primaryWorkspaceFolder, readSettings, resolveVariables } from './settings';
import { clientHost, Wcli0McpProvider } from './mcpProvider';

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
    await vscode.workspace
      .getConfiguration('wcli0', scope ?? null)
      .update('configFile', target.fsPath, cfgTarget);
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

  const spec = buildLaunchSpec(settings);

  let entry: Record<string, unknown>;
  if (settings.transportMode === 'stdio') {
    // Default the process cwd to the workspace folder, matching the automatic
    // provider. VS Code otherwise starts an MCP process without `cwd` in the
    // user home directory, changing relative-path resolution and config
    // auto-discovery compared with the registered server.
    const cwd = spec.cwd ?? folder.uri.fsPath;
    entry = {
      type: 'stdio',
      command: spec.command,
      args: spec.args,
      ...(cwd ? { cwd } : {}),
      ...(Object.keys(spec.env).length ? { env: spec.env } : {}),
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
export async function showLaunchCommand(output: vscode.OutputChannel): Promise<void> {
  const scope = primaryWorkspaceFolder()?.uri;
  const settings = readSettings(scope);
  const spec = buildLaunchSpec(settings);
  const line = renderCommandLine(spec);
  const problems = validateLaunchSpec(settings);

  output.clear();
  output.appendLine('Resolved wcli0 launch command:');
  output.appendLine('');
  output.appendLine(line);
  if (spec.cwd) {
    output.appendLine('');
    output.appendLine(`cwd: ${spec.cwd}`);
  }
  if (Object.keys(spec.env).length) {
    output.appendLine(`env: ${JSON.stringify(spec.env)}`);
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
      i++; // skip the closing '/'
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
