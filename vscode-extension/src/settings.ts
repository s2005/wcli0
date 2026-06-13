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

/** Configuration scope the form can target / be read from. */
export type ConfigScope = 'Global' | 'Workspace';

/** A keyed value getter — the only thing that differs between read modes. */
type Getter = <T>(key: string, def: T) => T;

/** Build a normalized settings object from an arbitrary keyed value getter. */
function buildSettings(g: Getter): Wcli0Settings {
  return {
    launchMethod: g<LaunchMethod>('launch.method', 'npx'),
    packageSpec: g<string>('launch.packageSpec', 'wcli0@latest'),
    nodeScriptPath: g<string>('launch.nodeScriptPath', ''),
    customCommand: g<string>('launch.customCommand', ''),
    customArgs: g<string[]>('launch.customArgs', []),
    cwd: g<string>('launch.cwd', ''),
    env: g<Record<string, string>>('launch.env', {}),

    configFile: g<string>('configFile', ''),
    shell: g<string>('shell', 'all'),
    allowedDirectories: g<string[]>('allowedDirectories', []),
    initialDir: g<string>('initialDir', ''),
    commandTimeout: num(g<number | null>('commandTimeout', null)),
    maxCommandLength: num(g<number | null>('maxCommandLength', null)),
    wslMountPoint: g<string>('wslMountPoint', ''),
    blockedCommands: g<string[]>('blockedCommands', []),
    blockedArguments: g<string[]>('blockedArguments', []),
    blockedOperators: g<string[]>('blockedOperators', []),
    maxOutputLines: num(g<number | null>('maxOutputLines', null)),
    enableTruncation: g<TriState>('enableTruncation', 'default'),
    enableLogResources: g<TriState>('enableLogResources', 'default'),
    maxReturnLines: num(g<number | null>('maxReturnLines', null)),
    logDirectory: g<string>('logDirectory', ''),
    allowAllDirs: g<boolean>('allowAllDirs', false),
    safetyMode: g<SafetyMode>('safetyMode', 'safe'),
    debug: g<boolean>('debug', false),

    transportMode: g<TransportMode>('transport.mode', 'stdio'),
    transportHost: g<string>('transport.host', '127.0.0.1'),
    transportPort: g<number>('transport.port', 9444),
    transportAllowedOrigins: g<string[]>('transport.allowedOrigins', []),

    extraArgs: g<string[]>('extraArgs', []),
  };
}

/**
 * Read and normalize the effective wcli0 settings for the given scope resource.
 * Pass a workspace-folder Uri to read folder-scoped values, or undefined for
 * the merged user/workspace view.
 */
export function readSettings(scope?: vscode.Uri): Wcli0Settings {
  const c = vscode.workspace.getConfiguration(CONFIG_SECTION, scope ?? null);
  return buildSettings((key, def) => c.get(key, def));
}

/**
 * Read settings as stored at a specific scope (User or Workspace), falling back
 * to the default when a key is not set at that scope. Unlike `readSettings`,
 * this does NOT include values inherited from another scope — so the config form
 * can edit one scope without surfacing (and then re-writing) the other's values.
 */
export function readSettingsForScope(target: ConfigScope, scope?: vscode.Uri): Wcli0Settings {
  const c = vscode.workspace.getConfiguration(CONFIG_SECTION, scope ?? null);
  return buildSettings(<T>(key: string, def: T): T => {
    const info = c.inspect<T>(key);
    if (!info) {
      return def;
    }
    // Deliberately do NOT fall back to workspaceFolderValue: the form saves with
    // ConfigurationTarget.Workspace, so surfacing a multi-root folder override
    // here would misreport it as editable and leave the real folder value
    // untouched (and still effective) after a "successful" save.
    const value = target === 'Global' ? info.globalValue : info.workspaceValue;
    return value === undefined ? def : value;
  });
}
