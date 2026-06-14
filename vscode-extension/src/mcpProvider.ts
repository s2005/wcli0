import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { buildLaunchSpec, isValidPort, validateLaunchSpec } from './argsBuilder';
import { buildConfigFile } from './configFile';
import { hasPerShellConfig, primaryWorkspaceFolder, readSettings, Wcli0Settings } from './settings';

/** File name for the extension-owned, auto-generated per-shell config. */
export const MANAGED_CONFIG_FILE = 'managed-config.json';

const SERVER_LABEL = 'wcli0';

/**
 * Provides the wcli0 MCP server definition to VS Code based on the current
 * `wcli0.*` settings. Settings are read for the primary workspace folder so
 * that workspace-scoped overrides win over user-scoped values, exactly as
 * VS Code's settings resolution dictates.
 */
export class Wcli0McpProvider implements vscode.McpServerDefinitionProvider {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeMcpServerDefinitions = this._onDidChange.event;

  /**
   * @param log Sink for configuration problems. provideMcpServerDefinitions is
   *   called eagerly by VS Code, so problems are logged rather than shown as
   *   popups (per the API guidance). Defaults to console.
   */
  /**
   * @param log Sink for configuration problems (see above).
   * @param safeCwd A private, extension-owned directory to use as the process cwd
   *   when launch.cwd is unset — avoids the server auto-loading a config.json
   *   from the workspace or a world-writable temp dir. Falls back to os.tmpdir().
   */
  /**
   * @param managedConfigDir A private, extension-owned directory where the
   *   auto-managed per-shell config file is written. Should be workspace-scoped
   *   (context.storageUri) so separate windows don't clobber each other's config;
   *   falls back to safeCwd, then os.tmpdir().
   */
  constructor(
    private readonly log: (message: string) => void = (m) => console.warn(m),
    private readonly safeCwd?: string,
    private readonly managedConfigDir?: string,
  ) {}

  /** Cached unique private dir, created lazily when no safe cwd was injected. */
  private fallbackDir?: string;

  /**
   * A unique, extension-owned temp directory created once (mkdtemp) and reused.
   * Never the shared `os.tmpdir()` root: the server reads `config.json` from its
   * process cwd, so a world-writable directory would let another user plant one
   * and control safety settings/shell executables. Returns undefined (caller
   * registers no server) if even mkdtemp fails. Unique per provider instance, so
   * two VS Code windows never share it.
   */
  private uniqueTempDir(): string | undefined {
    if (this.fallbackDir) {
      return this.fallbackDir;
    }
    try {
      this.fallbackDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcli0-'));
    } catch (err) {
      // Do NOT fall back to the shared os.tmpdir() root: loadConfig reads
      // config.json from the cwd, so a world-writable dir would let another user
      // plant one. The caller registers no server instead.
      this.log(`could not create a private temp dir: ${(err as Error).message}`);
      return undefined;
    }
    return this.fallbackDir;
  }

  /**
   * A private directory to use as the server cwd when no cwd is configured. Uses
   * the injected safe cwd (global storage) when available — safe to share across
   * windows because it is only a neutral cwd — otherwise a unique temp dir.
   */
  private privateDir(): string | undefined {
    if (this.safeCwd) {
      return this.safeCwd;
    }
    return this.uniqueTempDir();
  }

  /**
   * The directory the provider writes the auto-managed config into. NEVER the
   * shared global `safeCwd`: the config has a fixed filename (managed-config.json),
   * so every window would write the same path there and clobber each other's
   * per-shell/safety settings. Prefer the workspace-scoped managedConfigDir, else
   * a per-window-unique temp dir. Shared with `showLaunchCommand` so the displayed
   * command matches what is actually registered.
   */
  managedConfigTargetDir(): string | undefined {
    return this.managedConfigDir ?? this.uniqueTempDir();
  }

  /**
   * Write the auto-managed config file from settings and return its absolute
   * path, or undefined if it cannot be written (caller then registers no server
   * rather than launching with no per-shell config silently in effect).
   */
  private writeManagedConfig(settings: Wcli0Settings): string | undefined {
    // Use the same target as managedConfigTargetDir (workspace storage, else a
    // per-window-unique temp dir) — never the shared global safeCwd, which two
    // windows would clobber via the fixed managed-config.json filename.
    const dir = this.managedConfigTargetDir();
    if (!dir) {
      this.log('no writable private directory available for the managed config; not registering.');
      return undefined;
    }
    const target = path.join(dir, MANAGED_CONFIG_FILE);
    try {
      fs.mkdirSync(dir, { recursive: true });
      const config = buildConfigFile(settings);
      fs.writeFileSync(target, JSON.stringify(config, null, 2) + '\n', 'utf8');
      return target;
    } catch (err) {
      this.log(`could not write managed config at ${target}: ${(err as Error).message}`);
      return undefined;
    }
  }

  /** Notify VS Code that definitions may have changed (re-reads settings). */
  refresh(): void {
    this._onDidChange.fire();
  }

  dispose(): void {
    this._onDidChange.dispose();
  }

  provideMcpServerDefinitions(): vscode.ProviderResult<vscode.McpServerDefinition[]> {
    const scope = primaryWorkspaceFolder()?.uri;
    const settings = readSettings(scope);

    if (settings.transportMode === 'sse') {
      // McpHttpServerDefinition represents the modern Streamable HTTP transport,
      // not legacy SSE, so it can't drive an SSE server. Don't auto-register;
      // users can still write a `.vscode/mcp.json` SSE entry via the command.
      this.log(
        'legacy "sse" transport cannot be auto-registered. Use "http" or run the server and add an SSE entry to .vscode/mcp.json.',
      );
      return [];
    }

    if (settings.transportMode === 'http') {
      // HTTP only connects to an already-running endpoint; local launch settings
      // (launch method, allowed dirs) are irrelevant, so validate only the port.
      if (!isValidPort(settings.transportPort)) {
        this.log(`transport.port (${settings.transportPort}) must be an integer between 1 and 65535.`);
        return [];
      }
      const uri = vscode.Uri.parse(
        `http://${clientHost(settings.transportHost)}:${settings.transportPort}/mcp`,
      );
      return [new vscode.McpHttpServerDefinition(SERVER_LABEL, uri)];
    }

    // When any shell is configured individually, per-shell settings can only be
    // expressed in a config file, so launch against an auto-managed one instead
    // of the global CLI flags.
    const managed = hasPerShellConfig(settings);
    let managedConfigPath: string | undefined;
    if (managed) {
      managedConfigPath = this.writeManagedConfig(settings);
      if (!managedConfigPath) {
        // Could not write the managed config — don't launch with per-shell config
        // silently missing (the global flags wouldn't reflect the user's intent).
        return [];
      }
    }

    const problems = validateLaunchSpec(settings, managed);
    const blocking = problems.filter((p) => p.blocking);
    if (blocking.length > 0) {
      // Misconfigured launch: log rather than register a broken server.
      this.log(blocking.map((p) => p.message).join(' '));
      return [];
    }
    // Surface non-blocking safety notes (e.g. "safe mode + allowedDirectories
    // disables injection protection") so a reduced-protection launch isn't silent.
    for (const p of problems) {
      if (!p.blocking) {
        this.log(p.message);
      }
    }
    // The auto-managed config takes precedence over any wcli0.configFile; say so
    // rather than letting the referenced file appear to be in effect.
    if (managed && settings.configFile.trim()) {
      this.log(
        'wcli0.configFile is ignored while shells are configured individually (wcli0.shells); the auto-managed config is used instead.',
      );
    }

    const spec = buildLaunchSpec(settings, managedConfigPath ? { managedConfigPath } : {});
    const def = new vscode.McpStdioServerDefinition(
      SERVER_LABEL,
      spec.command,
      spec.args,
      spec.env,
    );
    // Use the configured cwd when set, otherwise a private extension-owned
    // directory. VS Code defaults an stdio server's cwd to the workspace folder,
    // which would make the server auto-load <workspace>/config.json (loadConfig
    // searches process.cwd()) and let a committed config.json silently override
    // safe settings. A world-writable temp dir is also unsafe (another user could
    // plant /tmp/config.json), so prefer the injected private dir. All path args
    // are already resolved to absolute values, so a non-workspace cwd is fine.
    const cwd = spec.cwd ?? this.privateDir();
    if (!cwd) {
      // No configured cwd and no writable private dir: refuse rather than launch
      // from the shared temp root (where another user could plant config.json).
      this.log(
        'no writable private working directory available; refusing to launch from the shared temp root.',
      );
      return [];
    }
    def.cwd = vscode.Uri.file(cwd);
    return [def];
  }
}

/**
 * Turn a server *bind* host into a host a client can connect to. Wildcard binds
 * (`0.0.0.0`, `::`) are not routable destinations, so map them to loopback;
 * literal IPv6 addresses are wrapped in brackets for use in a URL authority.
 */
export function clientHost(bindHost: string): string {
  // Trim before defaulting so a whitespace-only host falls back to loopback
  // rather than producing an empty authority (e.g. "http://:9444/mcp").
  const host = (bindHost ?? '').trim() || '127.0.0.1';
  if (host === '0.0.0.0' || host === '::' || host === '[::]') {
    return host === '0.0.0.0' ? '127.0.0.1' : '[::1]';
  }
  // Bracket bare IPv6 literals (contain ':' and aren't already bracketed).
  if (host.includes(':') && !host.startsWith('[')) {
    return `[${host}]`;
  }
  return host;
}
