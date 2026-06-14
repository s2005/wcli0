import * as path from 'path';
import {
  hasUnresolvedVariables,
  primaryWorkspaceFolder,
  resolveVariables,
  SHELL_NAMES,
  Wcli0Settings,
} from './settings';

export interface LaunchSpec {
  /** Executable to run (e.g. `npx`, `node`, or a custom command). */
  command: string;
  /** Arguments, including both launcher args and generated wcli0 flags. */
  args: string[];
  /** Working directory for the process, or undefined to inherit. */
  cwd: string | undefined;
  /** Extra environment variables. */
  env: Record<string, string>;
}

/**
 * Resolve a path-like setting and return it only if it fully resolved to a
 * non-empty value. A `${workspaceFolder}` token with no workspace open is left
 * unresolved (or, for a bare token, empty); emitting such a value as e.g. an
 * allowed path is dangerous (the server treats an empty allowed prefix as
 * matching every path), so these are dropped here.
 */
function resolvedPath(value: string): string | undefined {
  const resolved = resolveVariables(value.trim());
  if (!resolved.trim() || hasUnresolvedVariables(resolved)) {
    return undefined;
  }
  // Resolve a relative path against the workspace folder so it does not depend
  // on the server's process cwd (the provider runs from a neutral temp dir, and
  // the server resolves --config and other paths against process.cwd()).
  if (!path.isAbsolute(resolved)) {
    const base = primaryWorkspaceFolder()?.uri.fsPath;
    if (!base) {
      // No workspace folder to anchor a relative path. The server would C-root
      // it (normalizeWindowsPath turns "src" into C:\src), which is an ambiguous,
      // possibly-unrelated directory, so drop it; validateLaunchSpec reports it.
      return undefined;
    }
    return path.resolve(base, resolved);
  }
  return resolved;
}

/**
 * A logging line limit the server requires as an integer in 1..10000. Used for
 * `maxReturnLines`, whose `validateLoggingConfig` check enforces `Number.isInteger`.
 */
function isValidLogLimit(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 10000;
}

/**
 * The server's `validateLoggingConfig` only enforces the 1..10000 range for
 * `maxOutputLines` (no integer requirement), so a fractional value like 1.5 is
 * accepted. Validate it on that looser constraint to avoid blocking a config the
 * server would run.
 */
function isValidMaxOutputLines(n: number): boolean {
  return n >= 1 && n <= 10000;
}

/** A transport port the server will accept: an integer in 1..65535. */
export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * Whether a RESOLVED (absolute) log directory is one the server's
 * `validateLoggingConfig` rejects at startup: a `..` traversal segment, or (on
 * Windows) any of the characters `<>"|?*` outside the drive letter. Shared by
 * `validateLaunchSpec` and `buildConfigFile` so neither the launched server nor a
 * generated config carries a log directory that crashes the server on launch.
 */
export function isServerInvalidLogPath(resolved: string): boolean {
  const normalized = path.normalize(resolved);
  const invalidWinChars =
    process.platform === 'win32' && /[<>"|?*]/.test(normalized.replace(/^[a-zA-Z]:/, ''));
  return normalized.includes('..') || invalidWinChars;
}

/**
 * Append an option/value pair, using `--option=value` form when the value is
 * dash-prefixed. As separate argv entries, yargs would parse a value like `-e`
 * or `--exec` as a new option and drop it — and an emptied blocked-list option
 * makes the server replace its defaults with nothing, weakening security.
 */
function pushOption(args: string[], flag: string, value: string): void {
  if (value.startsWith('-')) {
    args.push(`${flag}=${value}`);
  } else {
    args.push(flag, value);
  }
}

/** Options controlling how a launch spec / args are built. */
export interface BuildOptions {
  /**
   * When false, path-like values keep portable tokens such as
   * `${workspaceFolder}` verbatim instead of being resolved to absolute paths.
   * Used when emitting a committed `.vscode/mcp.json`, where VS Code resolves the
   * tokens itself and an absolute path would break on teammates' machines.
   */
  resolvePaths?: boolean;

  /**
   * When set, the server is launched against this auto-managed config file
   * (`--config <path>`) and the global CLI flags are NOT emitted. Used when the
   * user configures shells individually (`wcli0.shells`), which can only be
   * expressed in a config file — emitting `--shell`/`--allowedDir`/etc. on top
   * would conflict with the file's per-shell `enabled`/security settings.
   */
  managedConfigPath?: string;
}

/**
 * Build the minimal arg list for an auto-managed-config launch: point the server
 * at the generated config file and force stdio (a provider-launched process must
 * not start an HTTP listener even if the file selected one). Everything else the
 * server needs lives in the file; only `--debug` (a launch-time concern) and the
 * raw `extraArgs` escape hatch are carried over.
 */
function buildManagedServerArgs(s: Wcli0Settings, managedConfigPath: string): string[] {
  const args = ['--config', managedConfigPath, '--transport', 'stdio'];
  if (s.debug) {
    args.push('--debug');
  }
  for (const extra of s.extraArgs) {
    args.push(extra);
  }
  return args;
}

/**
 * Resolve a path-like value, or — when `resolvePaths` is false — return the
 * trimmed value with any tokens left intact. Empty values yield undefined.
 */
function pathValue(value: string, opts: BuildOptions): string | undefined {
  if (opts.resolvePaths === false) {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    // Convert a plain relative path to a ${workspaceFolder}-relative token so VS
    // Code anchors it to the workspace, matching the resolved-path and config-file
    // generators. A bare relative value would otherwise be C-rooted by the
    // server's normalizeWindowsPath (e.g. "src" -> C:\src), denying the intended
    // directory and possibly allowing an unrelated one. Values that already carry
    // a token (or are absolute) are kept verbatim for VS Code to resolve.
    if (!path.isAbsolute(trimmed) && !hasUnresolvedVariables(trimmed)) {
      return `\${workspaceFolder}/${trimmed.split(/[\\/]/).join('/')}`;
    }
    return trimmed;
  }
  return resolvedPath(value);
}

/**
 * Build the wcli0 CLI flags (everything after the package/script name) from
 * normalized settings. Path-like values are variable-resolved unless
 * `opts.resolvePaths` is false (see BuildOptions).
 */
export function buildServerArgs(s: Wcli0Settings, opts: BuildOptions = {}): string[] {
  if (opts.managedConfigPath) {
    return buildManagedServerArgs(s, opts.managedConfigPath);
  }
  const args: string[] = [];

  const configFile = pathValue(s.configFile, opts);
  if (configFile) {
    args.push('--config', configFile);
  }
  if (s.shell && s.shell !== 'all') {
    args.push('--shell', s.shell);
  }
  for (const dir of s.allowedDirectories) {
    const resolved = pathValue(dir, opts);
    if (resolved) {
      args.push('--allowedDir', resolved);
    }
  }
  const initialDir = pathValue(s.initialDir, opts);
  if (initialDir) {
    args.push('--initialDir', initialDir);
  }
  // The server ignores non-positive commandTimeout/maxCommandLength (uses its
  // default), so only emit positive values; invalid ones are surfaced by
  // validateLaunchSpec rather than silently falling back.
  if (s.commandTimeout != null && s.commandTimeout > 0) {
    args.push('--commandTimeout', String(s.commandTimeout));
  }
  if (s.maxCommandLength != null && s.maxCommandLength > 0) {
    args.push('--maxCommandLength', String(s.maxCommandLength));
  }
  if (s.wslMountPoint.trim()) {
    args.push('--wslMountPoint', s.wslMountPoint.trim());
  }
  for (const cmd of s.blockedCommands) {
    pushOption(args, '--blockedCommand', cmd);
  }
  for (const arg of s.blockedArguments) {
    pushOption(args, '--blockedArgument', arg);
  }
  for (const op of s.blockedOperators) {
    pushOption(args, '--blockedOperator', op);
  }
  // Only emit log limits the server accepts; an out-of-range value makes
  // validateLoggingConfig throw on startup (surfaced by validateLaunchSpec).
  if (s.maxOutputLines != null && isValidMaxOutputLines(s.maxOutputLines)) {
    args.push('--maxOutputLines', String(s.maxOutputLines));
  }
  if (s.enableTruncation === 'enabled') {
    args.push('--enableTruncation');
  } else if (s.enableTruncation === 'disabled') {
    args.push('--no-enableTruncation');
  }
  if (s.enableLogResources === 'enabled') {
    args.push('--enableLogResources');
  } else if (s.enableLogResources === 'disabled') {
    args.push('--no-enableLogResources');
  }
  if (s.maxReturnLines != null && isValidLogLimit(s.maxReturnLines)) {
    args.push('--maxReturnLines', String(s.maxReturnLines));
  }
  const logDirectory = pathValue(s.logDirectory, opts);
  if (logDirectory) {
    args.push('--logDirectory', logDirectory);
  }
  // --allowAllDirs disables the working-directory restriction before initialDir
  // is applied, and is meaningless once paths are configured. Only emit it when
  // nothing else constrains the working directory.
  const dirsConfigured = s.allowedDirectories.some((d) => d.trim()) || s.initialDir.trim().length > 0;
  if (s.allowAllDirs && !dirsConfigured) {
    args.push('--allowAllDirs');
  }
  if (s.safetyMode === 'yolo') {
    args.push('--yolo');
  } else if (s.safetyMode === 'unsafe') {
    args.push('--unsafe');
  }
  if (s.debug) {
    args.push('--debug');
  }
  if (s.transportMode === 'stdio') {
    // When a config file is referenced it may select http/sse; force stdio so a
    // provider-launched (stdio) process doesn't start an HTTP listener instead.
    if (configFile) {
      args.push('--transport', 'stdio');
    }
  } else {
    args.push('--transport', s.transportMode);
    const hostFlag = s.transportMode === 'http' ? '--http-host' : '--sse-host';
    const portFlag = s.transportMode === 'http' ? '--http-port' : '--sse-port';
    const originFlag =
      s.transportMode === 'http' ? '--http-allowed-origins' : '--sse-allowed-origins';
    if (s.transportHost.trim()) {
      args.push(hostFlag, s.transportHost.trim());
    }
    // Only emit a port the server will accept; an invalid one is surfaced by
    // validateLaunchSpec instead (otherwise the server silently uses its default).
    if (isValidPort(s.transportPort)) {
      args.push(portFlag, String(s.transportPort));
    }
    if (s.transportAllowedOrigins.length > 0) {
      args.push(originFlag, s.transportAllowedOrigins.join(','));
    }
  }

  for (const extra of s.extraArgs) {
    args.push(extra);
  }

  return args;
}

/**
 * Build the full launch spec (command + launcher args + server flags) for the
 * configured launch method.
 */
export function buildLaunchSpec(s: Wcli0Settings, opts: BuildOptions = {}): LaunchSpec {
  const serverArgs = buildServerArgs(s, opts);
  const env = { ...s.env };
  const cwd = pathValue(s.cwd, opts);
  // When preserving tokens, leave executable paths/args untouched; otherwise
  // resolve workspace variables to concrete values.
  const resolve = (v: string): string =>
    opts.resolvePaths === false ? v.trim() : resolveVariables(v.trim());

  switch (s.launchMethod) {
    case 'node':
      // Resolve the script path like the other path-like settings: anchor a
      // relative value to the workspace (or keep the ${workspaceFolder} token when
      // emitting mcp.json) instead of leaving it relative to the server's process
      // cwd — the provider runs from a private extension dir, so a bare relative
      // "dist/index.js" would resolve there and never start. Fall back to the raw
      // resolved value when it cannot be anchored (validateLaunchSpec blocks it).
      return {
        command: 'node',
        args: [pathValue(s.nodeScriptPath, opts) ?? resolve(s.nodeScriptPath), ...serverArgs],
        cwd,
        env,
      };
    case 'custom':
      return {
        command: resolve(s.customCommand),
        args: [
          ...s.customArgs.map((a) => (opts.resolvePaths === false ? a : resolveVariables(a))),
          ...serverArgs,
        ],
        cwd,
        env,
      };
    case 'npx':
    default:
      return {
        command: 'npx',
        args: ['-y', s.packageSpec.trim() || 'wcli0@latest', ...serverArgs],
        cwd,
        env,
      };
  }
}

/** A problem with the configured launch. Blocking problems prevent launching. */
export interface LaunchProblem {
  message: string;
  /** When true, the server should not be launched with this configuration. */
  blocking: boolean;
}

/** Whether a non-empty value still has unresolved tokens (or resolves to empty). */
function isUnresolvable(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }
  const resolved = resolveVariables(trimmed);
  return !resolved.trim() || hasUnresolvedVariables(resolved);
}

/**
 * Whether a non-empty path-like value cannot be turned into a usable absolute
 * path: it still has an unresolved variable, or it is relative and no workspace
 * folder is open to anchor it. Mirrors exactly what `resolvedPath` drops, so
 * validation refuses what would otherwise be silently omitted or C-rooted.
 */
function isUnanchorablePath(raw: string): boolean {
  return raw.trim().length > 0 && resolvedPath(raw) === undefined;
}

/** The variable tokens this extension is responsible for resolving. */
const EXTENSION_VARIABLE = /\$\{(?:workspaceFolder(?::[^}]+)?|userHome)\}/;

/**
 * Whether a value still contains an extension-owned variable token after
 * resolution (i.e. one that could not be resolved). Unlike
 * `hasUnresolvedVariables`, arbitrary `${...}` shell templates are NOT flagged —
 * custom command arguments may legitimately pass e.g. `echo ${FOO}` to a shell.
 */
function hasUnresolvedExtensionVariable(raw: string): boolean {
  return EXTENSION_VARIABLE.test(resolveVariables(raw.trim()));
}

/**
 * Validate a launch spec, returning problems (empty = OK). When `managed` is
 * true the server is launched against an auto-managed config file (per-shell
 * mode), so CLI-flag-specific notes (the `--allowedDir` injection-protection
 * warning and the referenced-config-file warning) are suppressed — they do not
 * apply because those values live in the generated file instead of CLI flags.
 */
export function validateLaunchSpec(s: Wcli0Settings, managed = false): LaunchProblem[] {
  const problems: LaunchProblem[] = [];
  if (s.launchMethod === 'node') {
    if (!s.nodeScriptPath.trim()) {
      problems.push({
        message: 'Launch method is "node" but wcli0.launch.nodeScriptPath is empty.',
        blocking: true,
      });
    } else if (isUnanchorablePath(s.nodeScriptPath)) {
      // The script path can't be turned into an absolute path: an unresolved
      // ${workspaceFolder} token, or a relative path with no workspace folder to
      // anchor it. Either way `node <path>` would resolve against the provider's
      // private cwd and fail every start; refuse rather than register a broken one.
      problems.push({
        message: `wcli0.launch.nodeScriptPath "${s.nodeScriptPath}" cannot be resolved to an absolute path (unresolved variable, or a relative path with no workspace folder open).`,
        blocking: true,
      });
    }
  }
  if (s.launchMethod === 'custom') {
    if (!s.customCommand.trim()) {
      problems.push({
        message: 'Launch method is "custom" but wcli0.launch.customCommand is empty.',
        blocking: true,
      });
    } else if (isUnresolvable(s.customCommand)) {
      problems.push({
        message: `wcli0.launch.customCommand "${s.customCommand}" contains an unresolved variable (no matching workspace folder is open).`,
        blocking: true,
      });
    }
    // Custom args are variable-resolved like the command; an arg such as
    // ${workspaceFolder}/server.js with no workspace open would be passed
    // literally. Flag only extension-owned variables that fail to resolve — a
    // custom arg may legitimately contain a ${FOO} shell template for the target.
    for (const arg of s.customArgs) {
      if (hasUnresolvedExtensionVariable(arg)) {
        problems.push({
          message: `wcli0.launch.customArgs entry "${arg}" contains an unresolved \${workspaceFolder}/\${userHome} variable (no matching workspace folder is open).`,
          blocking: true,
        });
      }
    }
  }
  // A configured cwd or initialDir that doesn't resolve to an absolute path would
  // silently fall back to a different directory than the user chose; refuse
  // rather than mislead. (Covers unresolved tokens and unanchorable relatives.)
  if (isUnanchorablePath(s.cwd)) {
    problems.push({
      message: `wcli0.launch.cwd "${s.cwd}" cannot be resolved to an absolute path (unresolved variable, or a relative path with no workspace folder open).`,
      blocking: true,
    });
  }
  if (isUnanchorablePath(s.initialDir)) {
    problems.push({
      message: `wcli0.initialDir "${s.initialDir}" cannot be resolved to an absolute path (unresolved variable, or a relative path with no workspace folder open).`,
      blocking: true,
    });
  }
  // A workspace-relative allowed directory that doesn't resolve to an absolute
  // path (no workspace open) would launch an effectively unrestricted server, and
  // a bare relative entry would be C-rooted to an unrelated directory — refuse
  // rather than silently allow all or allow the wrong path.
  for (const dir of s.allowedDirectories) {
    if (isUnanchorablePath(dir)) {
      problems.push({
        message: `wcli0.allowedDirectories entry "${dir}" cannot be resolved to an absolute path (unresolved variable, or a relative path with no workspace folder open); refusing to launch an unrestricted/misdirected server.`,
        blocking: true,
      });
    }
  }
  // An unresolved log directory would be silently dropped, leaving logs in memory
  // instead of the configured persistent location; refuse like the other paths.
  if (isUnanchorablePath(s.logDirectory)) {
    problems.push({
      message: `wcli0.logDirectory "${s.logDirectory}" cannot be resolved to an absolute path (unresolved variable, or a relative path with no workspace folder open).`,
      blocking: true,
    });
  } else if (s.logDirectory.trim()) {
    // It resolves, but the server's validateLoggingConfig still rejects a path
    // with `..` traversal or (on Windows) the characters <>"|?*; mirror that here
    // so we don't register a server that exits at startup.
    const resolved = resolvedPath(s.logDirectory);
    if (resolved) {
      if (isServerInvalidLogPath(resolved)) {
        problems.push({
          message: `wcli0.logDirectory "${s.logDirectory}" is not a valid log directory (path traversal or invalid characters); the server rejects it at startup.`,
          blocking: true,
        });
      }
    }
  }
  // A config file path that doesn't fully resolve would be silently dropped,
  // leaving the server on pathless defaults instead of the intended config. In
  // managed mode the user configFile is bypassed entirely, so don't block on it.
  if (!managed && isUnanchorablePath(s.configFile)) {
    problems.push({
      message: `wcli0.configFile "${s.configFile}" cannot be resolved to an absolute path (unresolved variable, or a relative path with no workspace folder open).`,
      blocking: true,
    });
  }
  // In managed (per-shell) mode the generated config carries per-shell paths and
  // security limits. Apply the same blocking checks as the global equivalents so
  // an unresolved path or an out-of-range limit is reported rather than silently
  // dropped from the config (and the shell launched with the wrong restriction).
  if (managed) {
    for (const name of SHELL_NAMES) {
      const sh = s.shells?.[name];
      if (!sh) {
        continue;
      }
      for (const p of sh.overrides?.paths?.allowedPaths ?? []) {
        if (isUnanchorablePath(p)) {
          problems.push({
            message: `wcli0.shells.${name}.overrides.paths.allowedPaths entry "${p}" cannot be resolved to an absolute path (unresolved variable, or a relative path with no workspace folder open).`,
            blocking: true,
          });
        }
      }
      const initial = sh.overrides?.paths?.initialDir;
      if (initial && isUnanchorablePath(initial)) {
        problems.push({
          message: `wcli0.shells.${name}.overrides.paths.initialDir "${initial}" cannot be resolved to an absolute path (unresolved variable, or a relative path with no workspace folder open).`,
          blocking: true,
        });
      }
      const sec = sh.overrides?.security;
      for (const [field, value] of [
        ['commandTimeout', sec?.commandTimeout],
        ['maxCommandLength', sec?.maxCommandLength],
      ] as const) {
        if (value != null && !(Number.isFinite(value) && value >= 1)) {
          problems.push({
            message: `wcli0.shells.${name}.overrides.security.${field} (${value}) must be a number >= 1; the server rejects smaller values at startup.`,
            blocking: true,
          });
        }
      }
      // A per-shell executable command/arg with an extension-owned variable is
      // resolved when the managed config is written (the server does NOT expand
      // ${workspaceFolder}/${userHome} before spawn). If such a token can't be
      // resolved (no workspace open) the spawned shell path would be wrong, so
      // refuse rather than register a server whose shell never starts. Arbitrary
      // ${FOO} shell templates are not flagged (handled like custom args).
      const cmd = sh.executable?.command;
      if (cmd && cmd.trim() && hasUnresolvedExtensionVariable(cmd)) {
        problems.push({
          message: `wcli0.shells.${name}.executable.command "${cmd}" contains an unresolved \${workspaceFolder}/\${userHome} variable (no matching workspace folder is open).`,
          blocking: true,
        });
      }
      for (const a of sh.executable?.args ?? []) {
        if (hasUnresolvedExtensionVariable(a)) {
          problems.push({
            message: `wcli0.shells.${name}.executable.args entry "${a}" contains an unresolved \${workspaceFolder}/\${userHome} variable (no matching workspace folder is open).`,
            blocking: true,
          });
        }
      }
    }
  }
  // Transport port must be an integer in 1..65535 or the server ignores it and
  // falls back to its default, leaving the provider/endpoint pointing elsewhere.
  if (s.transportMode !== 'stdio' && !isValidPort(s.transportPort)) {
    problems.push({
      message: `wcli0.transport.port (${s.transportPort}) must be an integer between 1 and 65535.`,
      blocking: true,
    });
  }
  // The server disables injection protection whenever directories are restricted
  // via --allowedDir (see applyCliShellAndAllowedDirs). This happens even when a
  // config file is referenced, because the extension still emits --allowedDir, so
  // warn whenever allowedDirectories is set in safe mode.
  if (!managed && s.safetyMode === 'safe' && s.allowedDirectories.some((d) => d.trim())) {
    problems.push({
      message:
        'Restricting directories with wcli0.allowedDirectories passes --allowedDir, which makes the server disable command-injection protection. To keep it enabled, define allowed paths inside the config file (wcli0.configFile) and clear wcli0.allowedDirectories.',
      blocking: false,
    });
  }
  // A referenced config file can disable safety checks that "safe" mode implies;
  // the extension can't override the file, so warn rather than imply enforcement.
  // In managed mode the file is generated from these settings, so no such warning.
  if (!managed && s.safetyMode === 'safe' && s.configFile.trim()) {
    problems.push({
      message:
        'A config file is referenced while safety mode is "safe": settings in the file (including disabled safety checks) take effect and are not overridden by the extension.',
      blocking: false,
    });
  }
  if (s.safetyMode === 'unsafe') {
    problems.push({
      message: 'Safety mode is "unsafe": all command and directory restrictions are disabled.',
      blocking: false,
    });
  }
  // The server's validateLoggingConfig throws (and the server fails to start) for
  // log limits outside 1..10000, so refuse rather than register a server that
  // crashes on launch. maxOutputLines is range-checked only; maxReturnLines must
  // also be an integer (matching each field's server-side validation).
  if (s.maxOutputLines != null && !isValidMaxOutputLines(s.maxOutputLines)) {
    problems.push({
      message: `wcli0.maxOutputLines (${s.maxOutputLines}) must be between 1 and 10000; the server rejects other values at startup.`,
      blocking: true,
    });
  }
  if (s.maxReturnLines != null && !isValidLogLimit(s.maxReturnLines)) {
    problems.push({
      message: `wcli0.maxReturnLines (${s.maxReturnLines}) must be an integer between 1 and 10000; the server rejects other values at startup.`,
      blocking: true,
    });
  }
  // The server ignores a non-positive commandTimeout/maxCommandLength and uses
  // its default, so the value shown in settings would not take effect.
  for (const [name, value] of [
    ['commandTimeout', s.commandTimeout],
    ['maxCommandLength', s.maxCommandLength],
  ] as const) {
    if (value != null && !(value > 0)) {
      problems.push({
        message: `wcli0.${name} (${value}) must be a positive number; the server ignores non-positive values and uses its default.`,
        blocking: true,
      });
    }
  }
  return problems;
}

/**
 * Render a launch spec as a readable, copy-pasteable command line. Arguments
 * containing whitespace, quotes, or shell metacharacters are wrapped in double
 * quotes (embedded double quotes escaped). Backslashes are left intact so
 * Windows paths render correctly; this is a display aid, not a shell-exact
 * serializer for every shell.
 */
export function renderCommandLine(spec: LaunchSpec): string {
  const needsQuoting = (part: string) => part === '' || /[\s"'`$|&;<>(){}\\*?!#~]/.test(part);
  const quote = (part: string) =>
    needsQuoting(part) ? `"${part.replace(/"/g, '\\"')}"` : part;
  return [spec.command, ...spec.args].map(quote).join(' ');
}
