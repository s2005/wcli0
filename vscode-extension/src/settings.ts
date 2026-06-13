import * as vscode from 'vscode';

export const CONFIG_SECTION = 'wcli0';

export type LaunchMethod = 'npx' | 'node' | 'custom';
export type SafetyMode = 'safe' | 'yolo' | 'unsafe';
export type TriState = 'default' | 'enabled' | 'disabled';
export type TransportMode = 'stdio' | 'http' | 'sse';

/**
 * Normalized view of the `wcli0.*` settings for a given scope/resource.
 * Mirrors the CLI options accepted by the wcli0 server (see src/index.ts).
 */
export interface Wcli0Settings {
  launchMethod: LaunchMethod;
  packageSpec: string;
  nodeScriptPath: string;
  customCommand: string;
  customArgs: string[];
  cwd: string;
  env: Record<string, string>;

  configFile: string;
  shell: string;
  allowedDirectories: string[];
  initialDir: string;
  commandTimeout: number | null;
  maxCommandLength: number | null;
  wslMountPoint: string;
  blockedCommands: string[];
  blockedArguments: string[];
  blockedOperators: string[];
  maxOutputLines: number | null;
  enableTruncation: TriState;
  enableLogResources: TriState;
  maxReturnLines: number | null;
  logDirectory: string;
  allowAllDirs: boolean;
  safetyMode: SafetyMode;
  debug: boolean;

  transportMode: TransportMode;
  transportHost: string;
  transportPort: number;
  transportAllowedOrigins: string[];

  extraArgs: string[];
}

/** The workspace folder used as the base for `${workspaceFolder}` resolution. */
export function primaryWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders?.[0];
}

/**
 * Resolve `${workspaceFolder}` / `${workspaceFolder:name}` / `${userHome}`
 * tokens in a string. When a token cannot be resolved (e.g. no workspace is
 * open), it is left intact rather than replaced with an empty string — turning
 * `${workspaceFolder}/x` into `/x` could silently widen an allowed path to a
 * root-level directory. Callers detect leftover tokens via
 * `hasUnresolvedVariables` and refuse to use such values.
 */
export function resolveVariables(value: string): string {
  if (!value) {
    return value;
  }
  const folders = vscode.workspace.workspaceFolders ?? [];
  const primary = folders[0];
  const userHome = process.env.HOME ?? process.env.USERPROFILE;
  return value
    .replace(/\$\{workspaceFolder:([^}]+)\}/g, (_m, name: string) => {
      const match = folders.find((f) => f.name === name);
      return match ? match.uri.fsPath : _m;
    })
    .replace(/\$\{workspaceFolder\}/g, (m) => (primary ? primary.uri.fsPath : m))
    .replace(/\$\{userHome\}/g, (m) => (userHome ? userHome : m));
}

/** Whether a string still contains an unresolved `${...}` variable token. */
export function hasUnresolvedVariables(value: string): boolean {
  return /\$\{[^}]+\}/.test(value);
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Read and normalize the wcli0 settings for the given scope resource.
 * Pass a workspace-folder Uri to read folder-scoped values, or undefined for
 * the merged user/workspace view.
 */
export function readSettings(scope?: vscode.Uri): Wcli0Settings {
  const c = vscode.workspace.getConfiguration(CONFIG_SECTION, scope ?? null);
  return {
    launchMethod: c.get<LaunchMethod>('launch.method', 'npx'),
    packageSpec: c.get<string>('launch.packageSpec', 'wcli0@latest'),
    nodeScriptPath: c.get<string>('launch.nodeScriptPath', ''),
    customCommand: c.get<string>('launch.customCommand', ''),
    customArgs: c.get<string[]>('launch.customArgs', []),
    cwd: c.get<string>('launch.cwd', ''),
    env: c.get<Record<string, string>>('launch.env', {}),

    configFile: c.get<string>('configFile', ''),
    shell: c.get<string>('shell', 'all'),
    allowedDirectories: c.get<string[]>('allowedDirectories', []),
    initialDir: c.get<string>('initialDir', ''),
    commandTimeout: num(c.get('commandTimeout', null)),
    maxCommandLength: num(c.get('maxCommandLength', null)),
    wslMountPoint: c.get<string>('wslMountPoint', ''),
    blockedCommands: c.get<string[]>('blockedCommands', []),
    blockedArguments: c.get<string[]>('blockedArguments', []),
    blockedOperators: c.get<string[]>('blockedOperators', []),
    maxOutputLines: num(c.get('maxOutputLines', null)),
    enableTruncation: c.get<TriState>('enableTruncation', 'default'),
    enableLogResources: c.get<TriState>('enableLogResources', 'default'),
    maxReturnLines: num(c.get('maxReturnLines', null)),
    logDirectory: c.get<string>('logDirectory', ''),
    allowAllDirs: c.get<boolean>('allowAllDirs', false),
    safetyMode: c.get<SafetyMode>('safetyMode', 'safe'),
    debug: c.get<boolean>('debug', false),

    transportMode: c.get<TransportMode>('transport.mode', 'stdio'),
    transportHost: c.get<string>('transport.host', '127.0.0.1'),
    transportPort: c.get<number>('transport.port', 9444),
    transportAllowedOrigins: c.get<string[]>('transport.allowedOrigins', []),

    extraArgs: c.get<string[]>('extraArgs', []),
  };
}
