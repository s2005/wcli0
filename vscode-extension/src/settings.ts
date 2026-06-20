import * as os from 'os';
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
 * A named environment profile mirroring the server's EnvProfileConfig (see
 * src/types/config.ts). Selected per call via the `profile` parameter on
 * execute_command; its `env` map is merged into the spawned command environment.
 */
export interface ProfileConfig {
  /** Human-readable summary surfaced in the execute_command tool description. */
  description?: string;
  /** Shells this profile may be used with. Omitted/empty means "all shells". */
  allowedShells?: ShellName[];
  /**
   * Environment variables applied when this profile is selected. Values support
   * `${VAR}` interpolation resolved by the SERVER against its own environment
   * (e.g. `${PATH}`), so they are emitted verbatim except for the extension-owned
   * `${workspaceFolder}` / `${userHome}` tokens, which are resolved at emit time.
   */
  env: Record<string, string>;
}

/** Map of profile name -> profile configuration (the server's `profiles`). */
export type ProfilesConfig = Record<string, ProfileConfig>;

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
  /**
   * Named environment profiles (the server's top-level `profiles` map). Like
   * per-shell config, profiles can only be expressed in a config file, so when
   * any profile is configured the extension launches with an auto-managed
   * `--config` (see hasProfilesConfig).
   */
  profiles: ProfilesConfig;
  /**
   * Whether this scope opts out of per-shell configuration entirely. VS Code
   * deep-merges object settings, so a Workspace cannot remove a `shells` entry
   * inherited from User scope by clearing it. This boolean is a separate,
   * non-merged setting the workspace can flip to escape managed per-shell mode
   * and return to the global CLI-flag launch path (see hasPerShellConfig).
   */
  ignoreInheritedShells: boolean;
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
  // Use the platform home resolution so `${userHome}` matches VS Code's own
  // resolution. `os.homedir()` uses USERPROFILE on Windows and $HOME on POSIX;
  // reading `process.env.HOME` first would, on Windows where Git/Cygwin set HOME,
  // resolve to a Unix-style path (e.g. /home/me) instead of the real user home.
  const userHome = os.homedir();
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

/**
 * Whether a string still contains an unresolved EXTENSION-owned token — one of
 * the `${workspaceFolder}` / `${workspaceFolder:name}` / `${userHome}` forms that
 * `resolveVariables` is responsible for expanding. Unlike `hasUnresolvedVariables`
 * this deliberately ignores arbitrary `${VAR}` tokens (e.g. `${PATH}`), which are
 * server-owned and meant to be interpolated by the server at spawn time. Callers
 * that emit values the server later interpolates (profile env) use this to refuse
 * a value whose extension-owned token could not be resolved, since the server
 * would otherwise expand the leftover token to an empty string.
 */
export function hasUnresolvedExtensionVariables(value: string): boolean {
  return /\$\{workspaceFolder(?::[^}]+)?\}|\$\{userHome\}/.test(value);
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
    profiles: g<ProfilesConfig>('profiles', {}),
    ignoreInheritedShells: g<boolean>('ignoreInheritedShells', false),
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
    if (p && p.allowedPaths !== undefined) {
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
 *
 * When `ignoreInheritedShells` is set, the scope has explicitly opted out of
 * per-shell mode (it cannot remove a User-scope `shells` entry via deep-merge),
 * so treat `shells` as empty and return false — the single authoritative gate the
 * provider, showLaunchCommand and writeWorkspaceMcpJson all consult.
 */
export function hasPerShellConfig(s: Wcli0Settings): boolean {
  if (s.ignoreInheritedShells) {
    return false;
  }
  const shells = s.shells ?? {};
  return SHELL_NAMES.some((name) => isMeaningfulShellConfig(shells[name]));
}

/**
 * Whether a single profile entry would survive `buildProfiles` and be emitted into
 * the generated config. This is the launch-mode gate's view of a profile, so it
 * must mirror every drop condition buildProfiles applies — otherwise a profile that
 * is silently dropped from the generated config would still force the managed
 * `--config` launch (overriding `wcli0.configFile`) while the config carries no
 * `profiles`, removing both the selected profile and the referenced config:
 *  - a non-empty `allowedShells` with no valid shell names — or a present-but-non-array
 *    `allowedShells` value — drops the profile (P107);
 *  - `env` must hold at least one non-empty, string-valued key whose value still
 *    resolves after extension-owned-token expansion — a value left with an
 *    unresolved `${workspaceFolder}`/`${userHome}` token is dropped (P106), so it
 *    does not count toward an emittable env (the server rejects an empty `env`).
 */
function isMeaningfulProfile(p: ProfileConfig | undefined): boolean {
  if (!p || typeof p !== 'object') {
    return false;
  }
  const rawAllowedShells = p.allowedShells as unknown;
  if (rawAllowedShells !== undefined) {
    // Mirror buildProfiles: a present-but-non-array allowedShells fails closed and
    // drops the profile, so it must not count as an emittable profile here either.
    if (!Array.isArray(rawAllowedShells)) {
      return false;
    }
    if (rawAllowedShells.length > 0) {
      const anyValid = rawAllowedShells.some((sh) =>
        (SHELL_NAMES as readonly string[]).includes(sh),
      );
      if (!anyValid) {
        return false;
      }
    }
  }
  const env = p.env;
  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    return false;
  }
  return Object.keys(env).some(
    (k) =>
      k.trim() !== '' &&
      typeof env[k] === 'string' &&
      !hasUnresolvedExtensionVariables(resolveVariables(env[k])),
  );
}

/**
 * Whether the user has configured any environment profile. Like
 * {@link hasPerShellConfig}, a true result forces the extension to launch the
 * server with an auto-managed `--config` file: profiles are a config-file-only
 * concept with no CLI flag, so they cannot be expressed via launch flags.
 */
export function hasProfilesConfig(s: Wcli0Settings): boolean {
  const profiles = s.profiles ?? {};
  return Object.keys(profiles).some((name) => name.trim() !== '' && isMeaningfulProfile(profiles[name]));
}

/**
 * Read and normalize the effective wcli0 settings for the given scope resource.
 * Pass a workspace-folder Uri to read folder-scoped values, or undefined for
 * the merged user/workspace view.
 */
export function readSettings(scope?: vscode.Uri): Wcli0Settings {
  const c = vscode.workspace.getConfiguration(CONFIG_SECTION, scope ?? null);
  const s = buildSettings((key, def) => c.get(key, def));
  // `ignoreInheritedShells` is a Workspace-only opt-out (the config form disables the
  // control at User scope). The setting is resource-scoped, though, so a user could set
  // it in User Settings/settings.json; a merged effective read (c.get) would then honor
  // that Global value and suppress the user's own wcli0.shells in every workspace — and
  // even with no workspace open — contrary to the documented behavior. Honor it only
  // when it is explicitly set at Workspace (or workspace-folder) scope. (P101)
  s.ignoreInheritedShells = ignoreInheritedShellsAtWorkspace(c);
  return s;
}

/**
 * Whether `ignoreInheritedShells` is explicitly opted in at Workspace (or
 * workspace-folder) scope. A Global/User value is deliberately ignored: the mask is a
 * Workspace-only affordance, so trusting the merged effective boolean would let a User
 * setting suppress per-shell config everywhere (see {@link readSettings}, P101).
 */
function ignoreInheritedShellsAtWorkspace(c: vscode.WorkspaceConfiguration): boolean {
  const info = c.inspect<boolean>('ignoreInheritedShells');
  if (!info) {
    return false;
  }
  // A workspace-folder value takes precedence over the workspace value for that
  // resource (VS Code resource-setting precedence). ORing the two would keep the mask
  // on for a folder that explicitly opted back into per-shell config (folder=false
  // over workspace=true). Honor the defined folder value first; a Global value is
  // still ignored (the mask is a Workspace-only affordance, see P101). (P105)
  if (info.workspaceFolderValue !== undefined) {
    return info.workspaceFolderValue === true;
  }
  return info.workspaceValue === true;
}

/**
 * Read settings as stored at a specific scope (User or Workspace), falling back
 * to the default when a key is not set at that scope. Unlike `readSettings`,
 * this does NOT include values inherited from another scope — so the config form
 * can edit one scope without surfacing (and then re-writing) the other's values.
 */
export function readSettingsForScope(target: ConfigScope, scope?: vscode.Uri): Wcli0Settings {
  const c = vscode.workspace.getConfiguration(CONFIG_SECTION, scope ?? null);
  const s = buildSettings(<T>(key: string, def: T): T => {
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
  // The inherited-shell mask is Workspace-only, so a Global-scope read (e.g. a Global
  // export) must never report it true even if a stray globalValue exists — mirrors the
  // effective read in {@link readSettings}. (P101)
  if (target === 'Global') {
    s.ignoreInheritedShells = false;
  }
  return s;
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
  'ignoreInheritedShells',
] as const;

/**
 * Array settings the form edits where an explicit empty array is a meaningful
 * override: an empty `allowedDirectories` at the workspace scope masks a non-empty
 * User-scope value (VS Code merges the explicit `[]` over it). The form cannot tell
 * such an explicit-empty override from "Inherit" otherwise, because an empty
 * textarea reads identically to an unset value and `readSettingsForScope` returns
 * the default `[]` for both. `allowedDirectories` is the only array field the form
 * edits (blocked lists, custom args, env and origins are not form-editable).
 */
export const OPTIONAL_ARRAY_KEYS = ['allowedDirectories'] as const;

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

/**
 * The subset of {@link OPTIONAL_ARRAY_KEYS} that is explicitly set at the given
 * scope. Lets the config form tell an explicit empty array override apart from an
 * unset value (both render an empty textarea), so an empty `allowedDirectories`
 * override can be shown as set and persisted to mask the other scope (see P69).
 */
export function explicitlySetArrayKeys(target: ConfigScope, scope?: vscode.Uri): string[] {
  return setKeysAmong(OPTIONAL_ARRAY_KEYS, target, scope);
}
