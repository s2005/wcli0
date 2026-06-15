import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  buildLaunchSpec,
  isValidPort,
  resolvedConfigFilePath,
  validateLaunchSpec,
} from './argsBuilder';
import { buildConfigFile } from './configFile';
import { hasPerShellConfig, primaryWorkspaceFolder, readSettings, Wcli0Settings } from './settings';

/** File name for the extension-owned, auto-generated per-shell config. */
export const MANAGED_CONFIG_FILE = 'managed-config.json';

/**
 * Whether the server's implicit home config (`~/.win-cli-mcp/config.json`) exists.
 * `loadConfig` always falls back to it when no `--config` is passed, so a safe-mode
 * launch with no `configFile` would silently inherit its (possibly unsafe) settings.
 * `validateLaunchSpec` warns when this is true (see P63). Kept here (not in the pure
 * argsBuilder module) so the validator stays free of filesystem dependencies.
 */
export function homeConfigExists(): boolean {
  try {
    return fs.existsSync(path.join(os.homedir(), '.win-cli-mcp', 'config.json'));
  } catch {
    return false;
  }
}

/**
 * Whether a `config.json` exists directly in the given (already resolved, absolute)
 * launch cwd. `loadConfig` discovers `<cwd>/config.json` before the home config, so a
 * launch from a configured `wcli0.launch.cwd` containing one would silently override
 * the extension's settings. The provider pins against this just like the home config
 * (see P74). Injected into the provider (defaulting here) so the decision is
 * deterministic in tests regardless of the host filesystem.
 */
export function cwdConfigExists(cwd: string): boolean {
  try {
    return fs.existsSync(path.join(cwd, 'config.json'));
  } catch {
    return false;
  }
}

/**
 * Whether the file at the given (already resolved, absolute) path can actually be
 * loaded as the server's JSON config. Mirrors the server's `loadConfig`, which
 * `fs.readFileSync` + `JSON.parse`es the path and, on ANY failure (missing,
 * unreadable, a directory, or malformed JSON), silently falls through to
 * `<cwd>/config.json` and `~/.win-cli-mcp/config.json`. The provider passes an
 * explicit `--config` only when this returns true, so a broken `wcli0.configFile`
 * does not masquerade as a pin while the server loads an implicit config (see P85).
 * Injected into the provider (defaulting here) so the decision is deterministic in
 * tests regardless of the host filesystem.
 */
export function configFileIsLoadable(resolvedPath: string): boolean {
  try {
    if (!fs.statSync(resolvedPath).isFile()) {
      return false;
    }
    JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    return true;
  } catch {
    return false;
  }
}

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
   * @param homeConfigPresent Whether the server's implicit home config
   *   (`~/.win-cli-mcp/config.json`) exists. Injected (defaulting to the real
   *   filesystem check) so the pinning decision and the safe-mode warning are
   *   deterministic in tests regardless of the host's home directory.
   * @param cwdConfigPresent Whether a `config.json` exists in the resolved launch
   *   cwd. Injected (defaulting to the real filesystem check) so the cwd-config
   *   pinning decision is deterministic in tests (see P74).
   */
  constructor(
    private readonly log: (message: string) => void = (m) => console.warn(m),
    private readonly safeCwd?: string,
    private readonly managedConfigDir?: string,
    private readonly homeConfigPresent: () => boolean = homeConfigExists,
    private readonly cwdConfigPresent: (cwd: string) => boolean = cwdConfigExists,
    private readonly configFileLoadable: (resolvedPath: string) => boolean = configFileIsLoadable,
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
   * The working directory the provider would launch the server from: the
   * configured cwd when set, otherwise the private extension-owned fallback
   * directory (the same `privateDir()` used at launch — never the shared temp
   * root). Shared with `showLaunchCommand` so the displayed cwd matches what the
   * provider actually registers. Returns undefined only when no private directory
   * is available (the provider then registers no server).
   */
  resolveLaunchCwd(configuredCwd?: string): string | undefined {
    return configuredCwd ?? this.privateDir();
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
   * rather than launching with no per-shell config silently in effect). Public so
   * `showLaunchCommand` can materialize the same file before displaying its
   * `--config` path (see P73), keeping the shown command actually runnable.
   */
  writeManagedConfig(settings: Wcli0Settings): string | undefined {
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
    const perShell = hasPerShellConfig(settings);
    // The cwd the server would actually launch from: the configured wcli0.launch.cwd
    // resolved to an absolute path, or undefined when unset (the private-dir fallback
    // has no config.json to discover). Reused as the final spec when not managed.
    const baseSpec = buildLaunchSpec(settings, {});
    const configuredCwd = baseSpec.cwd;
    // Even a plain launch must be pinned to a generated config when it would
    // otherwise let the server's loadConfig discover an implicit config that
    // overrides the extension's settings. There are two such vectors, neither with
    // a CLI flag to disable discovery, so generate a managed config and launch with
    // --config (which loadConfig uses instead of falling back):
    //   1. ~/.win-cli-mcp/config.json — the home fallback, when it exists (P66).
    //   2. <cwd>/config.json — when an explicit wcli0.launch.cwd is configured and
    //      contains one; loadConfig loads it before the home config (P74). The
    //      private-dir fallback blocks this candidate only when no cwd is configured.
    const homeConfigPresent = this.homeConfigPresent();
    const pinnable = !perShell && !settings.configFile.trim();
    const pinAgainstHomeConfig = pinnable && homeConfigPresent;
    const pinAgainstCwdConfig = pinnable && !!configuredCwd && this.cwdConfigPresent(configuredCwd);
    const managed = perShell || pinAgainstHomeConfig || pinAgainstCwdConfig;
    let managedConfigPath: string | undefined;
    if (managed) {
      managedConfigPath = this.writeManagedConfig(settings);
      if (!managedConfigPath) {
        // Could not write the managed config — don't launch with per-shell config
        // silently missing, or (when pinning) with an implicit config still able to
        // override the settings the extension reports.
        return [];
      }
    }

    // Whether a referenced wcli0.configFile actually exists and parses as JSON. When
    // it does not, the server would ignore the broken pin and load an implicit config
    // instead, so validateLaunchSpec blocks the non-managed launch (P85). Skipped when
    // managed (the user configFile is bypassed by the auto-managed --config).
    const cfgPath = managed ? undefined : resolvedConfigFilePath(settings);
    const configFileLoadable = !cfgPath || this.configFileLoadable(cfgPath);
    const problems = validateLaunchSpec(settings, managed, homeConfigPresent, configFileLoadable);
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

    const spec = managedConfigPath ? buildLaunchSpec(settings, { managedConfigPath }) : baseSpec;
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
