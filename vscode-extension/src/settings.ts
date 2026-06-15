import * as vscode from 'vscode';

export const CONFIG_SECTION = 'wcli0';

export type LaunchMethod = 'npx' | 'node' | 'custom';
export type SafetyMode = 'safe' | 'yolo' | 'unsafe';
export type TriState = 'default' | 'enabled' | 'disabled';
export type TransportMode = 'stdio' | 'http' | 'sse';

/** Shell names that can be configured individually (matches the server's ShellType). */
export const SHELL_NAMES = ['powershell', 'cmd', 'gitbash', 'wsl', 'bash'] as const;
export type ShellName = (typeof SHELL_NAMES)[number];

/**
 * Per-shell configuration mirroring the server's BaseShellConfig /
 * WslShellConfig (see src/types/config.ts). All fields are optional: only the
 * ones the user actually sets are stored and emitted into the generated config.
 */
export interface PerShellConfig {
  /** Whether this shell is enabled. Omitted means "leave at the default (on)". */
  enabled?: boolean;
  /** Override the shell executable. */
  executable?: {
    command?: string;
    args?: string[];
  };
  /** Shell-specific overrides for global configuration. */
  overrides?: {
    security?: {
      maxCommandLength?: number | null;
      commandTimeout?: number | null;
      enableInjectionProtection?: boolean;
      restrictWorkingDirectory?: boolean;
    };
    restrictions?: {
      blockedCommands?: string[];
      blockedArguments?: string[];
      blockedOperators?: string[];
    };
    paths?: {
      allowedPaths?: string[];
      initialDir?: string;
    };
  };
  /** WSL-specific options (only meaningful for the wsl/bash shells). */
  wslConfig?: {
    mountPoint?: string;
    inheritGlobalPaths?: boolean;
  };
}

/** Map of shell name -> per-shell configuration. */
export type ShellsConfig = Partial<Record<ShellName, PerShellConfig>>;

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
  shells: ShellsConfig;
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
    shells: g<ShellsConfig>('shells', {}),
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

/** Whether a single per-shell entry carries any user-set, non-empty field. */
function isMeaningfulShellConfig(c: PerShellConfig | undefined): boolean {
  if (!c) {
    return false;
  }
  if (c.enabled !== undefined) {
    return true;
  }
  // An explicit (even empty) args list is meaningful: `args: []` replaces the
  // shell's default arguments.
  if (c.executable && (c.executable.command?.trim() || c.executable.args !== undefined)) {
    return true;
  }
  const o = c.overrides;
  if (o) {
    const sec = o.security;
    if (
      sec &&
      (sec.maxCommandLength != null ||
        sec.commandTimeout != null ||
        sec.enableInjectionProtection !== undefined ||
        sec.restrictWorkingDirectory !== undefined)
    ) {
      return true;
    }
    // An explicit (even empty) restriction array is meaningful: the server uses
    // [] to clear inherited blocked commands/arguments/operators for the shell.
    const r = o.restrictions;
    if (
      r &&
      (r.blockedCommands !== undefined ||
        r.blockedArguments !== undefined ||
        r.blockedOperators !== undefined)
    ) {
      return true;
    }
    // An explicit (even empty) allowedPaths is meaningful: [] replaces the
    // inherited allowed paths for the shell.
    const p = o.paths;
    if (p && (p.allowedPaths !== undefined || p.initialDir?.trim())) {
      return true;
    }
  }
  const w = c.wslConfig;
  if (w && (w.mountPoint?.trim() || w.inheritGlobalPaths !== undefined)) {
    return true;
  }
  return false;
}

/**
 * Whether the user has configured any shell individually. When true, the
 * extension launches the server with an auto-managed `--config` file rather than
 * the global CLI flags, because per-shell configuration cannot be expressed via
 * CLI options (see src/index.ts — every flag is global or selects a single shell).
 */
export function hasPerShellConfig(s: Wcli0Settings): boolean {
  const shells = s.shells ?? {};
  return SHELL_NAMES.some((name) => isMeaningfulShellConfig(shells[name]));
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

/**
 * Optional string settings where an explicit empty value is meaningful at the
 * workspace scope: an empty override disables a non-empty User-scope default
 * (e.g. clearing a workspace configFile must NOT re-enable the user's global
 * config file). The config form distinguishes such an explicit-empty override
 * from "Inherit" (no override) for exactly these keys.
 */
export const OPTIONAL_STRING_KEYS = [
  'launch.cwd',
  'configFile',
  'initialDir',
  'logDirectory',
] as const;

/**
 * Enum/boolean form fields that have an "Inherit" affordance. Like
 * {@link OPTIONAL_STRING_KEYS}, the form must know whether each is actually set at
 * the scope, because `readSettingsForScope` returns the schema default for an unset
 * value — indistinguishable from an explicit default-valued override. Without this,
 * an unset Workspace `safetyMode` renders as `safe` even when an effective User
 * override is `unsafe`, misreporting the safety state.
 */
export const INHERITABLE_SELECT_KEYS = [
  'launch.method',
  'shell',
  'safetyMode',
  'enableTruncation',
  'enableLogResources',
  'transport.mode',
  'allowAllDirs',
  'debug',
] as const;

/** Which of `keys` is explicitly set (value !== undefined) at the given scope. */
function setKeysAmong(
  keys: readonly string[],
  target: ConfigScope,
  scope?: vscode.Uri,
): string[] {
  const c = vscode.workspace.getConfiguration(CONFIG_SECTION, scope ?? null);
  return keys.filter((key) => {
    const info = c.inspect(key);
    if (!info) {
      return false;
    }
    const value = target === 'Global' ? info.globalValue : info.workspaceValue;
    return value !== undefined;
  });
}

/**
 * The subset of {@link OPTIONAL_STRING_KEYS} that is explicitly set at the given
 * scope (value !== undefined, including an empty string). Lets the config form
 * tell an explicit empty override apart from an unset value, which
 * `readSettingsForScope` alone cannot (it returns the default for both).
 */
export function explicitlySetKeys(target: ConfigScope, scope?: vscode.Uri): string[] {
  return setKeysAmong(OPTIONAL_STRING_KEYS, target, scope);
}

/**
 * The subset of {@link INHERITABLE_SELECT_KEYS} that is explicitly set at the given
 * scope. Lets the config form show "Inherit" for an unset enum/boolean field rather
 * than the schema default it would otherwise read back (see P60).
 */
export function explicitlySetSelectKeys(target: ConfigScope, scope?: vscode.Uri): string[] {
  return setKeysAmong(INHERITABLE_SELECT_KEYS, target, scope);
}
