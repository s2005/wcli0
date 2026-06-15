import * as path from 'path';
import * as vscode from 'vscode';
import { buildLaunchSpec, isValidPort, renderCommandLine, validateLaunchSpec } from './argsBuilder';
import { buildConfigFile } from './configFile';
import {
  ConfigScope,
  hasPerShellConfig,
  primaryWorkspaceFolder,
  readSettings,
  readSettingsForScope,
  resolveVariables,
  Wcli0Settings,
} from './settings';
import { clientHost, homeConfigExists, MANAGED_CONFIG_FILE, Wcli0McpProvider } from './mcpProvider';

/**
 * Read settings for an export action. When the config form supplies its selected
 * scope, read only that scope's stored values (matching exactly what the form
 * shows) so the export can't pick up hidden overrides from the other scope.
 * Command-palette invocations pass no scope and get the merged effective view.
 */
function readExportSettings(formScope: ConfigScope | undefined, uri?: vscode.Uri): Wcli0Settings {
  return formScope ? readSettingsForScope(formScope, uri) : readSettings(uri);
}

/** Narrow an arbitrary command argument to a valid form scope, else undefined. */
function asScope(arg: unknown): ConfigScope | undefined {
  return arg === 'Global' || arg === 'Workspace' ? arg : undefined;
}

/** Generate a wcli0 config.json from settings and offer to save it. */
export async function generateConfigFile(formScopeArg?: unknown): Promise<void> {
  const scope = primaryWorkspaceFolder()?.uri;
  const settings = readExportSettings(asScope(formScopeArg), scope);
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
    // Honor the form's selected scope when present: a User-scope form save must
    // write to User even when a workspace folder exists. Fall back to the
    // folder-based heuristic only for command-palette invocations (no scope).
    const formScope = asScope(formScopeArg);
    const useWorkspace = formScope ? formScope === 'Workspace' && !!folder : !!folder;
    const cfgTarget = useWorkspace
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
export async function writeWorkspaceMcpJson(formScopeArg?: unknown): Promise<void> {
  const folder = primaryWorkspaceFolder();
  if (!folder) {
    void vscode.window.showErrorMessage('wcli0: open a workspace folder first.');
    return;
  }
  const settings = readExportSettings(asScope(formScopeArg), folder.uri);

  // Validate only what the generated entry actually uses. A stdio entry needs a
  // working launch command; an http/sse entry only contains a URL, so local
  // launch settings (method, allowed dirs) are irrelevant and only the port
  // matters — otherwise a valid external endpoint couldn't be written.
  if (settings.transportMode === 'stdio') {
    // Per-shell settings (wcli0.shells) cannot be expressed as the CLI flags a
    // committed mcp.json carries; the auto-provider launches them via a managed
    // --config file instead. Writing a stdio entry here would silently ignore
    // every per-shell setting (different enabled shells / weaker restrictions),
    // so refuse rather than emit a mismatched entry.
    if (hasPerShellConfig(settings)) {
      void vscode.window.showErrorMessage(
        'wcli0: per-shell settings (wcli0.shells) cannot be represented in .vscode/mcp.json. ' +
          'Generate a config file (wcli0: Generate Config File) and reference it via wcli0.configFile, ' +
          'or clear wcli0.shells before exporting.',
      );
      return;
    }
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
  provider?: Wcli0McpProvider,
  formScopeArg?: unknown,
): Promise<void> {
  const scope = primaryWorkspaceFolder()?.uri;
  const settings = readExportSettings(asScope(formScopeArg), scope);
  // Mirror the provider: when shells are configured individually the server is
  // launched against an auto-managed config file, not the global CLI flags.
  const perShell = hasPerShellConfig(settings) && settings.transportMode === 'stdio';
  // Also mirror the provider's pinning: a plain stdio launch with no per-shell
  // config and no wcli0.configFile is launched against a generated config when the
  // server's implicit ~/.win-cli-mcp/config.json exists, so it cannot silently
  // override the displayed settings (see P66).
  const homeConfigPresent = homeConfigExists();
  const pinAgainstHomeConfig =
    !perShell &&
    settings.transportMode === 'stdio' &&
    !settings.configFile.trim() &&
    homeConfigPresent;
  const managed = perShell || pinAgainstHomeConfig;
  // Use the provider's resolved managed-config directory (which applies the same
  // private-dir fallback used at launch) so the displayed command matches what is
  // actually registered, instead of a bare relative "managed-config.json".
  const managedConfigDir = provider?.managedConfigTargetDir();
  const managedConfigPath =
    managed && managedConfigDir ? path.join(managedConfigDir, MANAGED_CONFIG_FILE) : undefined;

  output.clear();
  // In per-shell mode the provider REQUIRES an auto-managed config file. If no
  // private directory is available to write it, the provider registers no server —
  // so don't render a global-flag command that ignores every per-shell setting (and
  // would claim the config was "written to undefined"). Report that no launch is
  // available instead, mirroring the provider's behavior. (Pinning is only
  // defense-in-depth, so when it can't write a config the plain command is still
  // shown below, with the P63 home-config warning as the fallback.)
  if (perShell && !managedConfigPath) {
    output.appendLine('No wcli0 launch command available.');
    output.appendLine('');
    output.appendLine(
      'Shells are configured individually (wcli0.shells), so the server must launch with an',
    );
    output.appendLine(
      'auto-managed config file, but no private directory is available to write it. The MCP',
    );
    output.appendLine(
      'provider registers no server in this state. Set wcli0.launch.cwd, free up extension',
    );
    output.appendLine('storage, or clear wcli0.shells to use the global launch flags.');
    output.show(true);
    return;
  }

  const spec = buildLaunchSpec(settings, managedConfigPath ? { managedConfigPath } : {});
  const line = renderCommandLine(spec);
  // Whether the command actually launches via a generated config (per-shell or
  // pinned). A pin that could not be written falls back to plain flags, so validate
  // as non-managed there to keep the P63 home-config warning.
  const launchedManaged = !!managedConfigPath;
  // Pass whether the implicit home config exists so a safe launch with no configFile
  // surfaces the same reduced-protection note the provider logs (see P63).
  const problems = validateLaunchSpec(settings, launchedManaged, homeConfigPresent);

  output.appendLine('Resolved wcli0 launch command:');
  output.appendLine('');
  output.appendLine(line);
  if (launchedManaged) {
    output.appendLine('');
    if (perShell) {
      output.appendLine(
        'Note: shells are configured individually (wcli0.shells), so the server is launched',
      );
      output.appendLine(
        `with an auto-managed config file (written to ${managedConfigPath} on launch).`,
      );
    } else {
      output.appendLine(
        'Note: the server is launched with an auto-managed config file (written to',
      );
      output.appendLine(
        `${managedConfigPath} on launch) so the implicit ~/.win-cli-mcp/config.json cannot`,
      );
      output.appendLine('override these settings.');
    }
  }
  // Show the cwd the server actually runs in. With no wcli0.launch.cwd set, the
  // provider does NOT inherit the caller's directory: it launches from a private
  // extension-owned directory so the server can't auto-load a workspace/temp
  // config.json. Display that resolved fallback so a copied command run elsewhere
  // (e.g. a terminal in the workspace) is understood to differ from the provider.
  const launchCwd = provider ? provider.resolveLaunchCwd(spec.cwd) : spec.cwd;
  if (launchCwd) {
    output.appendLine('');
    output.appendLine(`cwd: ${launchCwd}`);
    if (!spec.cwd) {
      output.appendLine(
        '(no wcli0.launch.cwd set; the provider launches from this private extension directory ' +
          'to avoid auto-loading a config.json from the workspace or a shared temp dir)',
      );
    }
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
  // Only an actual parent-traversal component means the target is outside the
  // workspace: a bare `..` or a leading `../` (or `..\\` on Windows). A plain
  // `rel.startsWith('..')` check also matches ordinary in-workspace names such as
  // `..generated`, which would wrongly store an absolute, non-portable path.
  const escapesWorkspace =
    rel === '..' || rel.startsWith(`..${path.sep}`) || rel.startsWith('../');
  if (rel && !escapesWorkspace && !path.isAbsolute(rel)) {
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
