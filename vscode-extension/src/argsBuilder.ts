import { hasUnresolvedVariables, resolveVariables, Wcli0Settings } from './settings';

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
  return resolved;
}

/** A transport port the server will accept: an integer in 1..65535. */
export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
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

/**
 * Build the wcli0 CLI flags (everything after the package/script name) from
 * normalized settings. Path-like values are variable-resolved here.
 */
export function buildServerArgs(s: Wcli0Settings): string[] {
  const args: string[] = [];

  const configFile = resolvedPath(s.configFile);
  if (configFile) {
    args.push('--config', configFile);
  }
  if (s.shell && s.shell !== 'all') {
    args.push('--shell', s.shell);
  }
  for (const dir of s.allowedDirectories) {
    const resolved = resolvedPath(dir);
    if (resolved) {
      args.push('--allowedDir', resolved);
    }
  }
  const initialDir = resolvedPath(s.initialDir);
  if (initialDir) {
    args.push('--initialDir', initialDir);
  }
  if (s.commandTimeout != null) {
    args.push('--commandTimeout', String(s.commandTimeout));
  }
  if (s.maxCommandLength != null) {
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
  if (s.maxOutputLines != null) {
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
  if (s.maxReturnLines != null) {
    args.push('--maxReturnLines', String(s.maxReturnLines));
  }
  const logDirectory = resolvedPath(s.logDirectory);
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
export function buildLaunchSpec(s: Wcli0Settings): LaunchSpec {
  const serverArgs = buildServerArgs(s);
  const env = { ...s.env };
  const cwd = resolvedPath(s.cwd);

  switch (s.launchMethod) {
    case 'node':
      return {
        command: 'node',
        args: [resolveVariables(s.nodeScriptPath.trim()), ...serverArgs],
        cwd,
        env,
      };
    case 'custom':
      return {
        command: resolveVariables(s.customCommand.trim()),
        args: [...s.customArgs.map(resolveVariables), ...serverArgs],
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

/** Validate a launch spec, returning problems (empty = OK). */
export function validateLaunchSpec(s: Wcli0Settings): LaunchProblem[] {
  const problems: LaunchProblem[] = [];
  if (s.launchMethod === 'node') {
    if (!s.nodeScriptPath.trim()) {
      problems.push({
        message: 'Launch method is "node" but wcli0.launch.nodeScriptPath is empty.',
        blocking: true,
      });
    } else if (hasUnresolvedVariables(resolveVariables(s.nodeScriptPath.trim()))) {
      // An unresolved ${workspaceFolder} token would launch `node ${workspaceFolder}/...`
      // and fail every start; refuse rather than register a broken definition.
      problems.push({
        message: `wcli0.launch.nodeScriptPath "${s.nodeScriptPath}" contains an unresolved variable (no matching workspace folder is open).`,
        blocking: true,
      });
    }
  }
  if (s.launchMethod === 'custom' && !s.customCommand.trim()) {
    problems.push({
      message: 'Launch method is "custom" but wcli0.launch.customCommand is empty.',
      blocking: true,
    });
  }
  // A workspace-relative allowed directory that doesn't fully resolve (no
  // workspace open) would launch an effectively unrestricted server — refuse
  // rather than silently allow all.
  for (const dir of s.allowedDirectories) {
    const trimmed = dir.trim();
    if (!trimmed) {
      continue;
    }
    const resolved = resolveVariables(trimmed);
    if (!resolved.trim() || hasUnresolvedVariables(resolved)) {
      problems.push({
        message: `wcli0.allowedDirectories entry "${dir}" cannot be resolved (no matching workspace folder is open); refusing to launch an unrestricted server.`,
        blocking: true,
      });
    }
  }
  // A config file path that doesn't fully resolve would be silently dropped,
  // leaving the server on pathless defaults instead of the intended config.
  if (s.configFile.trim()) {
    const resolved = resolveVariables(s.configFile.trim());
    if (!resolved.trim() || hasUnresolvedVariables(resolved)) {
      problems.push({
        message: `wcli0.configFile "${s.configFile}" cannot be resolved (no matching workspace folder is open).`,
        blocking: true,
      });
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
  // via --allowedDir (see applyCliShellAndAllowedDirs). A config file preserves it.
  if (
    s.safetyMode === 'safe' &&
    !s.configFile.trim() &&
    s.allowedDirectories.some((d) => d.trim())
  ) {
    problems.push({
      message:
        'Restricting directories with --allowedDir makes the server disable command-injection protection. To keep it enabled, define allowed paths in a config file (wcli0.configFile) instead.',
      blocking: false,
    });
  }
  // A referenced config file can disable safety checks that "safe" mode implies;
  // the extension can't override the file, so warn rather than imply enforcement.
  if (s.safetyMode === 'safe' && s.configFile.trim()) {
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
