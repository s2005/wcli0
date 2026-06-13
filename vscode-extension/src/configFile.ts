import { resolveVariables, Wcli0Settings } from './settings';

/**
 * Default executable definitions for each shell, matching config.examples in
 * the wcli0 repository. Used to populate a generated config.json.
 */
const SHELL_DEFAULTS: Record<string, unknown> = {
  powershell: {
    type: 'powershell',
    enabled: true,
    executable: { command: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command'] },
  },
  cmd: {
    type: 'cmd',
    enabled: true,
    executable: { command: 'cmd.exe', args: ['/c'] },
  },
  gitbash: {
    type: 'gitbash',
    enabled: true,
    executable: { command: 'C:\\Program Files\\Git\\bin\\bash.exe', args: ['-c'] },
  },
  wsl: {
    type: 'wsl',
    enabled: true,
    executable: { command: 'wsl.exe', args: ['-e'] },
    wslConfig: { mountPoint: '/mnt/', inheritGlobalPaths: true },
  },
  bash: {
    type: 'bash',
    enabled: true,
    executable: { command: 'bash', args: ['-c'] },
    wslConfig: { mountPoint: '/mnt/', inheritGlobalPaths: true },
  },
};

/**
 * Build a wcli0 config.json object from settings. This is a convenience for
 * users who prefer a committed config file over CLI flags; the produced file
 * can be referenced via `wcli0.configFile` / `--config`.
 */
export function buildConfigFile(s: Wcli0Settings): Record<string, unknown> {
  const security: Record<string, unknown> = {
    enableInjectionProtection: s.safetyMode === 'safe',
    restrictWorkingDirectory: s.safetyMode !== 'unsafe' && !s.allowAllDirs,
  };
  if (s.commandTimeout != null) {
    security.commandTimeout = s.commandTimeout;
  }
  if (s.maxCommandLength != null) {
    security.maxCommandLength = s.maxCommandLength;
  }

  const restrictions: Record<string, unknown> = {};
  if (s.blockedCommands.length > 0) {
    restrictions.blockedCommands = s.blockedCommands.filter((v) => v !== '');
  }
  if (s.blockedArguments.length > 0) {
    restrictions.blockedArguments = s.blockedArguments.filter((v) => v !== '');
  }
  if (s.blockedOperators.length > 0) {
    restrictions.blockedOperators = s.blockedOperators.filter((v) => v !== '');
  }

  const paths: Record<string, unknown> = {
    allowedPaths: s.allowedDirectories.map((d) => resolveVariables(d)).filter(Boolean),
  };
  if (s.initialDir.trim()) {
    paths.initialDir = resolveVariables(s.initialDir.trim());
  }

  const logging: Record<string, unknown> = {};
  if (s.maxOutputLines != null) {
    logging.maxOutputLines = s.maxOutputLines;
  }
  if (s.enableTruncation !== 'default') {
    logging.enableTruncation = s.enableTruncation === 'enabled';
  }
  if (s.enableLogResources !== 'default') {
    logging.enableLogResources = s.enableLogResources === 'enabled';
  }
  if (s.maxReturnLines != null) {
    logging.maxReturnLines = s.maxReturnLines;
  }
  if (s.logDirectory.trim()) {
    logging.logDirectory = resolveVariables(s.logDirectory.trim());
  }

  const global: Record<string, unknown> = { security, paths };
  if (Object.keys(restrictions).length > 0) {
    global.restrictions = restrictions;
  }
  if (Object.keys(logging).length > 0) {
    global.logging = logging;
  }

  const shellNames = s.shell === 'all' ? ['powershell', 'cmd', 'gitbash', 'wsl'] : [s.shell];
  const shells: Record<string, unknown> = {};
  for (const name of shellNames) {
    if (SHELL_DEFAULTS[name]) {
      shells[name] = structuredClone(SHELL_DEFAULTS[name]);
    }
  }
  if (s.wslMountPoint.trim()) {
    for (const name of ['wsl', 'bash']) {
      const shell = shells[name] as { wslConfig?: Record<string, unknown> } | undefined;
      if (shell?.wslConfig) {
        shell.wslConfig.mountPoint = s.wslMountPoint.trim();
      }
    }
  }

  const config: Record<string, unknown> = { global, shells };

  if (s.transportMode !== 'stdio') {
    const transport: Record<string, unknown> = {
      mode: s.transportMode,
      sseHost: s.transportHost,
      ssePort: s.transportPort,
    };
    if (s.transportMode === 'http') {
      transport.httpHost = s.transportHost;
      transport.httpPort = s.transportPort;
      if (s.transportAllowedOrigins.length > 0) {
        transport.httpAllowedOrigins = s.transportAllowedOrigins;
      }
    } else if (s.transportAllowedOrigins.length > 0) {
      transport.sseAllowedOrigins = s.transportAllowedOrigins;
    }
    config.transport = transport;
  }

  return config;
}
