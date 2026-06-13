import { hasUnresolvedVariables, resolveVariables, Wcli0Settings } from './settings';

/** Return the value only when it is a positive integer; otherwise undefined. */
function posInt(n: number | null): number | undefined {
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * Default shell definitions mirroring the server's DEFAULT_CONFIG (see
 * src/utils/config.ts). The per-shell `overrides.restrictions` are reproduced
 * here on purpose: when a generated config names a shell, the server's
 * mergeConfigs treats it as a user override and drops that shell's default
 * restrictions unless they are restated, so omitting them would silently stop
 * blocking `del`/`rd`/`rmdir` (cmd) and `rm` (gitbash).
 */
const SHELL_DEFAULTS: Record<string, Record<string, unknown>> = {
  powershell: {
    type: 'powershell',
    enabled: true,
    executable: { command: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command'] },
  },
  cmd: {
    type: 'cmd',
    enabled: true,
    executable: { command: 'cmd.exe', args: ['/c'] },
    overrides: { restrictions: { blockedCommands: ['del', 'rd', 'rmdir'] } },
  },
  gitbash: {
    type: 'gitbash',
    enabled: true,
    executable: { command: 'C:\\Program Files\\Git\\bin\\bash.exe', args: ['-c'] },
    overrides: { restrictions: { blockedCommands: ['rm'] } },
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
  // allowAllDirs only lifts the restriction when nothing else is configured,
  // matching the server's "when no allowed paths are configured" behavior.
  const hasConfiguredPaths =
    s.allowedDirectories.some((d) => d.trim()) || s.initialDir.trim().length > 0;
  const security: Record<string, unknown> = {
    enableInjectionProtection: s.safetyMode === 'safe',
    // unsafe disables the restriction; yolo always keeps it (the server's --yolo
    // forces it back on even with --allowAllDirs); safe lifts it only when
    // nothing is configured.
    restrictWorkingDirectory:
      s.safetyMode === 'unsafe'
        ? false
        : s.safetyMode === 'yolo'
          ? true
          : !(s.allowAllDirs && !hasConfiguredPaths),
  };
  // Only emit positive-integer limits; the server's validateConfig rejects
  // zero/negative/fractional values that the settings schema would otherwise allow.
  if (posInt(s.commandTimeout) != null) {
    security.commandTimeout = s.commandTimeout;
  }
  if (posInt(s.maxCommandLength) != null) {
    security.maxCommandLength = s.maxCommandLength;
  }

  const restrictions: Record<string, unknown> = {};
  if (s.safetyMode === 'unsafe' || s.safetyMode === 'yolo') {
    // The server's --yolo/--unsafe clear all blocked lists; emit empty arrays so
    // the generated config matches (otherwise mergeConfigs restores the defaults).
    restrictions.blockedCommands = [];
    restrictions.blockedArguments = [];
    restrictions.blockedOperators = [];
  } else {
    if (s.blockedCommands.length > 0) {
      restrictions.blockedCommands = s.blockedCommands.filter((v) => v !== '');
    }
    if (s.blockedArguments.length > 0) {
      restrictions.blockedArguments = s.blockedArguments.filter((v) => v !== '');
    }
    if (s.blockedOperators.length > 0) {
      restrictions.blockedOperators = s.blockedOperators.filter((v) => v !== '');
    }
  }

  const paths: Record<string, unknown> = {
    // Trim first (filter(Boolean) alone keeps whitespace-only entries, which the
    // server normalizes to an empty allowed prefix that matches every path), and
    // drop entries that don't fully resolve.
    allowedPaths: s.allowedDirectories
      .map((d) => d.trim())
      .filter((d) => d.length > 0)
      .map((d) => resolveVariables(d))
      .filter((d) => d.trim().length > 0 && !hasUnresolvedVariables(d)),
  };
  if (s.initialDir.trim()) {
    const resolvedInitial = resolveVariables(s.initialDir.trim());
    if (resolvedInitial.trim() && !hasUnresolvedVariables(resolvedInitial)) {
      paths.initialDir = resolvedInitial;
    }
  }

  const logging: Record<string, unknown> = {};
  if (posInt(s.maxOutputLines) != null) {
    logging.maxOutputLines = s.maxOutputLines;
  }
  if (s.enableTruncation !== 'default') {
    logging.enableTruncation = s.enableTruncation === 'enabled';
  }
  if (s.enableLogResources !== 'default') {
    logging.enableLogResources = s.enableLogResources === 'enabled';
  }
  if (posInt(s.maxReturnLines) != null) {
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

  // Emit every known shell with an explicit `enabled` flag. Omitting a shell is
  // not enough to disable it: the server's mergeConfigs restores any shell that
  // is absent from the file (with enabled: true) from its defaults.
  const knownShells = ['powershell', 'cmd', 'gitbash', 'wsl', 'bash'];
  const clearShellRestrictions = s.safetyMode === 'unsafe' || s.safetyMode === 'yolo';
  const shells: Record<string, unknown> = {};
  for (const name of knownShells) {
    if (!SHELL_DEFAULTS[name]) {
      continue;
    }
    const entry = structuredClone(SHELL_DEFAULTS[name]) as {
      enabled: boolean;
      overrides?: { restrictions?: Record<string, unknown> };
    };
    entry.enabled = s.shell === 'all' ? true : name === s.shell;
    if (clearShellRestrictions && entry.overrides?.restrictions) {
      // --yolo/--unsafe also clear shell-specific blocked lists.
      entry.overrides.restrictions = {
        blockedCommands: [],
        blockedArguments: [],
        blockedOperators: [],
      };
    }
    shells[name] = entry;
  }
  if (s.wslMountPoint.trim()) {
    // The server expects a trailing slash (e.g. /mnt/); applyCliWslMountPoint
    // normalizes it, so match that here.
    const mount = s.wslMountPoint.trim();
    const normalized = mount.endsWith('/') ? mount : `${mount}/`;
    for (const name of ['wsl', 'bash']) {
      const shell = shells[name] as { wslConfig?: Record<string, unknown> } | undefined;
      if (shell?.wslConfig) {
        shell.wslConfig.mountPoint = normalized;
      }
    }
  }

  const config: Record<string, unknown> = { global, shells };

  if (s.transportMode !== 'stdio') {
    const host = s.transportHost.trim();
    const origins = s.transportAllowedOrigins.map((o) => o.trim()).filter((o) => o.length > 0);
    const transport: Record<string, unknown> = {
      mode: s.transportMode,
      ssePort: s.transportPort,
    };
    // The server rejects an empty host; omit it so the default applies.
    if (host) {
      transport.sseHost = host;
    }
    if (s.transportMode === 'http') {
      transport.httpPort = s.transportPort;
      if (host) {
        transport.httpHost = host;
      }
      if (origins.length > 0) {
        transport.httpAllowedOrigins = origins;
      }
    } else if (origins.length > 0) {
      transport.sseAllowedOrigins = origins;
    }
    config.transport = transport;
  }

  return config;
}
