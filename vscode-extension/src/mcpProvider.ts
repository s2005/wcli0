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

  /**
   * Write the auto-managed config file from settings and return its absolute
   * path, or undefined if it cannot be written (caller then registers no server
   * rather than launching with no per-shell config silently in effect).
   */
  private writeManagedConfig(settings: Wcli0Settings): string | undefined {
    const dir = this.managedConfigDir ?? this.safeCwd ?? os.tmpdir();
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
    def.cwd = vscode.Uri.file(spec.cwd ?? this.safeCwd ?? os.tmpdir());
    return [def];
  }
}

/**
 * Turn a server *bind* host into a host a client can connect to. Wildcard binds
 * (`0.0.0.0`, `::`) are not routable destinations, so map them to loopback;
 * literal IPv6 addresses are wrapped in brackets for use in a URL authority.
 */
export function clientHost(bindHost: string): string {
  const host = (bindHost || '127.0.0.1').trim();
  if (host === '0.0.0.0' || host === '::' || host === '[::]') {
    return host === '0.0.0.0' ? '127.0.0.1' : '[::1]';
  }
  // Bracket bare IPv6 literals (contain ':' and aren't already bracketed).
  if (host.includes(':') && !host.startsWith('[')) {
    return `[${host}]`;
  }
  return host;
}
