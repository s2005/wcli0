import { resolveVariables, Wcli0Settings } from './settings';

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
 * Build the wcli0 CLI flags (everything after the package/script name) from
 * normalized settings. Path-like values are variable-resolved here.
 */
export function buildServerArgs(s: Wcli0Settings): string[] {
  const args: string[] = [];

  if (s.configFile.trim()) {
    args.push('--config', resolveVariables(s.configFile.trim()));
  }
  if (s.shell && s.shell !== 'all') {
    args.push('--shell', s.shell);
  }
  for (const dir of s.allowedDirectories) {
    if (dir.trim()) {
      args.push('--allowedDir', resolveVariables(dir.trim()));
    }
  }
  if (s.initialDir.trim()) {
    args.push('--initialDir', resolveVariables(s.initialDir.trim()));
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
    args.push('--blockedCommand', cmd);
  }
  for (const arg of s.blockedArguments) {
    args.push('--blockedArgument', arg);
  }
  for (const op of s.blockedOperators) {
    args.push('--blockedOperator', op);
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
  if (s.logDirectory.trim()) {
    args.push('--logDirectory', resolveVariables(s.logDirectory.trim()));
  }
  if (s.allowAllDirs) {
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
  if (s.transportMode !== 'stdio') {
    args.push('--transport', s.transportMode);
    const hostFlag = s.transportMode === 'http' ? '--http-host' : '--sse-host';
    const portFlag = s.transportMode === 'http' ? '--http-port' : '--sse-port';
    const originFlag =
      s.transportMode === 'http' ? '--http-allowed-origins' : '--sse-allowed-origins';
    if (s.transportHost.trim()) {
      args.push(hostFlag, s.transportHost.trim());
    }
    if (Number.isFinite(s.transportPort)) {
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
  const cwd = s.cwd.trim() ? resolveVariables(s.cwd.trim()) : undefined;

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

/** Validate a launch spec, returning human-readable problems (empty = OK). */
export function validateLaunchSpec(s: Wcli0Settings): string[] {
  const problems: string[] = [];
  if (s.launchMethod === 'node' && !s.nodeScriptPath.trim()) {
    problems.push('Launch method is "node" but wcli0.launch.nodeScriptPath is empty.');
  }
  if (s.launchMethod === 'custom' && !s.customCommand.trim()) {
    problems.push('Launch method is "custom" but wcli0.launch.customCommand is empty.');
  }
  if (s.safetyMode === 'unsafe') {
    problems.push('Safety mode is "unsafe": all command and directory restrictions are disabled.');
  }
  return problems;
}

/** Render a launch spec as a copy-pasteable shell command line. */
export function renderCommandLine(spec: LaunchSpec): string {
  const quote = (part: string) =>
    /[\s"'\\]/.test(part) ? `"${part.replace(/(["\\])/g, '\\$1')}"` : part;
  return [spec.command, ...spec.args].map(quote).join(' ');
}
