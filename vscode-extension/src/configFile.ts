import * as path from 'path';
import { isValidPort } from './argsBuilder';
import {
  hasUnresolvedVariables,
  PerShellConfig,
  primaryWorkspaceFolder,
  resolveVariables,
  ShellName,
  SHELL_NAMES,
  Wcli0Settings,
} from './settings';

/**
 * Return the value only when it is a positive integer within `max`; otherwise
 * undefined. The upper bound mirrors the server's validateConfig limits so a
 * generated config never carries a value the server rejects at startup.
 */
function posInt(n: number | null, max = Infinity): number | undefined {
  return typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= max ? n : undefined;
}

/**
 * Return the value only when it is a finite number >= 1 (fractional allowed); the
 * server's validateConfig accepts e.g. commandTimeout 1.5 and only rejects < 1.
 */
function posNum(n: number | null): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 ? n : undefined;
}

/**
 * `maxOutputLines` value the server accepts: the server's validateLoggingConfig
 * only enforces the 1..10000 range (no integer requirement), so a fractional
 * value such as 1.5 is valid and must be preserved in the generated config.
 */
function maxOutputLinesValue(n: number | null): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 10000 ? n : undefined;
}

/**
 * Resolve a path-like value to an absolute path: resolve variables, drop values
 * that don't fully resolve, and anchor a relative result to the workspace folder
 * (the server resolves relative config paths against C:\, not the workspace).
 */
function resolveConfigPath(value: string): string | undefined {
  const resolved = resolveVariables(value.trim());
  if (!resolved.trim() || hasUnresolvedVariables(resolved)) {
    return undefined;
  }
  if (!path.isAbsolute(resolved)) {
    const base = primaryWorkspaceFolder()?.uri.fsPath;
    // No workspace to anchor a relative path: drop it rather than emit a value
    // the server would C-root (normalizeWindowsPath turns "src" into C:\src),
    // matching the launch-path handling in argsBuilder.resolvedPath.
    return base ? path.resolve(base, resolved) : undefined;
  }
  return resolved;
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
    // The server's mergeConfigs always rebuilds bash.wslConfig with
    // inheritGlobalPaths defaulting to true, so omitting it is not enough:
    // explicitly disable inheritance so native bash doesn't gain /mnt/<drive>
    // copies of Windows allowed paths (applyWslPathInheritance early-returns when
    // inheritGlobalPaths is false).
    type: 'bash',
    enabled: true,
    executable: { command: 'bash', args: ['-c'] },
    wslConfig: { inheritGlobalPaths: false },
  },
};

/** Normalize a WSL mount point to the trailing-slash form the server expects. */
function normalizeMount(mount: string): string {
  const m = mount.trim();
  return m.endsWith('/') ? m : `${m}/`;
}

/**
 * Merge a user's per-shell config (`wcli0.shells[name]`) onto a shell entry built
 * from SHELL_DEFAULTS. Values are sanitized the same way the global section is:
 * numeric limits via posNum, paths via resolveConfigPath, empty strings dropped.
 * Per-shell restriction lists REPLACE the shell's default blocked list for
 * whichever list is provided, matching the server's override semantics (shell
 * `overrides` replace, not merge with, the resolved global values).
 */
function applyPerShellOverrides(
  entry: Record<string, unknown>,
  perShell: PerShellConfig | undefined,
  name: string,
): void {
  if (!perShell) {
    return;
  }
  if (perShell.enabled !== undefined) {
    entry.enabled = perShell.enabled;
  }

  const exec = entry.executable as { command: string; args: string[] };
  if (perShell.executable?.command?.trim()) {
    exec.command = perShell.executable.command.trim();
  }
  // Honor an explicit args list, including an empty one: `args: []` is valid
  // server config (run the executable with no prefix args) and must replace the
  // shell's default arguments rather than being treated as "not set".
  if (perShell.executable?.args !== undefined) {
    exec.args = [...perShell.executable.args];
  }

  const ov = perShell.overrides;
  if (ov) {
    const overrides = (entry.overrides as Record<string, unknown>) ?? {};

    if (ov.security) {
      const sec = (overrides.security as Record<string, unknown>) ?? {};
      // commandTimeout/maxCommandLength accept fractional values >= 1 (the server
      // only rejects < 1), so validate with posNum like the global section.
      if (posNum(ov.security.maxCommandLength ?? null) != null) {
        sec.maxCommandLength = ov.security.maxCommandLength;
      }
      if (posNum(ov.security.commandTimeout ?? null) != null) {
        sec.commandTimeout = ov.security.commandTimeout;
      }
      if (ov.security.enableInjectionProtection !== undefined) {
        sec.enableInjectionProtection = ov.security.enableInjectionProtection;
      }
      if (ov.security.restrictWorkingDirectory !== undefined) {
        sec.restrictWorkingDirectory = ov.security.restrictWorkingDirectory;
      }
      if (Object.keys(sec).length > 0) {
        overrides.security = sec;
      }
    }

    if (ov.restrictions) {
      const rest = (overrides.restrictions as Record<string, unknown>) ?? {};
      const r = ov.restrictions;
      if (r.blockedCommands) {
        rest.blockedCommands = r.blockedCommands.filter((v) => v !== '');
      }
      if (r.blockedArguments) {
        rest.blockedArguments = r.blockedArguments.filter((v) => v !== '');
      }
      if (r.blockedOperators) {
        rest.blockedOperators = r.blockedOperators.filter((v) => v !== '');
      }
      if (Object.keys(rest).length > 0) {
        overrides.restrictions = rest;
      }
    }

    if (ov.paths) {
      const paths = (overrides.paths as Record<string, unknown>) ?? {};
      if (ov.paths.allowedPaths) {
        // Drop unresolved/empty entries (the server treats an empty allowed
        // prefix as matching every path), mirroring the global paths handling.
        paths.allowedPaths = ov.paths.allowedPaths
          .map((p) => resolveConfigPath(p))
          .filter((p): p is string => p !== undefined);
      }
      const initial = ov.paths.initialDir ? resolveConfigPath(ov.paths.initialDir) : undefined;
      if (initial !== undefined) {
        paths.initialDir = initial;
      }
      if (Object.keys(paths).length > 0) {
        overrides.paths = paths;
      }
    }

    if (Object.keys(overrides).length > 0) {
      entry.overrides = overrides;
    }
  }

  // wslConfig only applies to the wsl/bash shells.
  if (perShell.wslConfig && (name === 'wsl' || name === 'bash')) {
    const wsl = (entry.wslConfig as Record<string, unknown>) ?? {};
    if (perShell.wslConfig.mountPoint?.trim()) {
      wsl.mountPoint = normalizeMount(perShell.wslConfig.mountPoint);
    }
    if (perShell.wslConfig.inheritGlobalPaths !== undefined) {
      wsl.inheritGlobalPaths = perShell.wslConfig.inheritGlobalPaths;
    }
    if (Object.keys(wsl).length > 0) {
      entry.wslConfig = wsl;
    }
  }
}

/**
 * Build a wcli0 config.json object from settings. This is a convenience for
 * users who prefer a committed config file over CLI flags; the produced file
 * can be referenced via `wcli0.configFile` / `--config`. It is also the source
 * for the auto-managed config the extension launches with when any shell is
 * configured individually via `wcli0.shells` (see mcpProvider.ts).
 */
export function buildConfigFile(s: Wcli0Settings): Record<string, unknown> {
  // Resolve the path values that will actually be emitted first, so downstream
  // decisions reflect what ends up in the file (an unresolved ${workspaceFolder}
  // entry is dropped and must not count as "configured").
  const resolvedAllowedPaths = s.allowedDirectories
    .map((d) => resolveConfigPath(d))
    .filter((d): d is string => d !== undefined);
  const resolvedInitialDir = resolveConfigPath(s.initialDir);

  // Per-shell allowed paths / initialDir also count as configured paths: a shell
  // inherits the global restrictWorkingDirectory unless it overrides it, so if
  // allowAllDirs disabled the global restriction the shell's allowlist would be
  // present but never enforced. Include resolved per-shell paths in the decision.
  const hasPerShellPaths = SHELL_NAMES.some((name) => {
    const p = s.shells?.[name]?.overrides?.paths;
    if (!p) {
      return false;
    }
    const resolvedShellPaths = (p.allowedPaths ?? [])
      .map((x) => resolveConfigPath(x))
      .filter((x): x is string => x !== undefined);
    return resolvedShellPaths.length > 0 || (p.initialDir ? resolveConfigPath(p.initialDir) !== undefined : false);
  });
  // allowAllDirs only lifts the restriction when nothing else is configured,
  // matching the server's "when no allowed paths are configured" behavior. Base
  // this on the resolved paths actually written, not the raw settings.
  const hasConfiguredPaths =
    resolvedAllowedPaths.length > 0 || resolvedInitialDir !== undefined || hasPerShellPaths;
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
  // commandTimeout/maxCommandLength accept fractional values >= 1 (the server
  // only rejects < 1), unlike the integer-bounded logging limits below.
  if (posNum(s.commandTimeout) != null) {
    security.commandTimeout = s.commandTimeout;
  }
  if (posNum(s.maxCommandLength) != null) {
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

  // Reuse the resolved values computed above (whitespace-only and unresolved
  // entries already dropped — the server treats an empty allowed prefix as
  // matching every path).
  const paths: Record<string, unknown> = { allowedPaths: resolvedAllowedPaths };
  if (resolvedInitialDir !== undefined) {
    paths.initialDir = resolvedInitialDir;
  }

  const logging: Record<string, unknown> = {};
  // The server's validateLoggingConfig rejects maxOutputLines/maxReturnLines
  // above 10000, so don't emit out-of-range values the settings schema allows.
  if (maxOutputLinesValue(s.maxOutputLines) != null) {
    logging.maxOutputLines = s.maxOutputLines;
  }
  if (s.enableTruncation !== 'default') {
    logging.enableTruncation = s.enableTruncation === 'enabled';
  }
  if (s.enableLogResources !== 'default') {
    logging.enableLogResources = s.enableLogResources === 'enabled';
  }
  if (posInt(s.maxReturnLines, 10000) != null) {
    logging.maxReturnLines = s.maxReturnLines;
  }
  // Drop an unresolved ${workspaceFolder} token and anchor a relative path to
  // the workspace rather than writing something the server resolves against C:\.
  const resolvedLog = resolveConfigPath(s.logDirectory);
  if (resolvedLog !== undefined) {
    logging.logDirectory = resolvedLog;
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
  const knownShells: ShellName[] = ['powershell', 'cmd', 'gitbash', 'wsl', 'bash'];
  const clearShellRestrictions = s.safetyMode === 'unsafe' || s.safetyMode === 'yolo';
  const shells: Record<string, unknown> = {};
  for (const name of knownShells) {
    if (!SHELL_DEFAULTS[name]) {
      continue;
    }
    const entry = structuredClone(SHELL_DEFAULTS[name]) as Record<string, unknown>;
    // Default enabled honors the legacy single-shell selector; a per-shell
    // `enabled` set in wcli0.shells (applied below) overrides it.
    entry.enabled = s.shell === 'all' ? true : name === s.shell;
    // Seed the wsl mount point from the global --wslMountPoint; a per-shell
    // wslConfig.mountPoint (applied next) overrides it. The server expects a
    // trailing slash (e.g. /mnt/), matching applyCliWslMountPoint.
    if (name === 'wsl' && s.wslMountPoint.trim()) {
      const wsl = entry.wslConfig as Record<string, unknown> | undefined;
      if (wsl) {
        wsl.mountPoint = normalizeMount(s.wslMountPoint);
      }
    }
    applyPerShellOverrides(entry, s.shells?.[name], name);
    if (clearShellRestrictions && entry.overrides) {
      // --yolo/--unsafe clear shell-specific blocked lists AND force per-shell
      // injection protection off (matching applyCliUnsafeMode, which sets
      // shell.overrides.security.enableInjectionProtection = false). Otherwise the
      // server deep-merges a lingering enableInjectionProtection: true over the
      // global false and keeps protection on for that shell.
      const overrides = entry.overrides as {
        restrictions?: Record<string, unknown>;
        security?: Record<string, unknown>;
      };
      if (overrides.restrictions) {
        overrides.restrictions = {
          blockedCommands: [],
          blockedArguments: [],
          blockedOperators: [],
        };
      }
      if (overrides.security && overrides.security.enableInjectionProtection !== undefined) {
        overrides.security.enableInjectionProtection = false;
      }
    }
    shells[name] = entry;
  }

  const config: Record<string, unknown> = { global, shells };

  if (s.transportMode !== 'stdio') {
    const host = s.transportHost.trim();
    const origins = s.transportAllowedOrigins.map((o) => o.trim()).filter((o) => o.length > 0);
    const transport: Record<string, unknown> = { mode: s.transportMode };
    // Only emit a port the server accepts; an out-of-range value (the schema
    // allows manual JSON edits) would fail validateTransportConfig at startup,
    // so omit it and let the server default apply.
    const portOk = isValidPort(s.transportPort);
    if (portOk) {
      transport.ssePort = s.transportPort;
    }
    // The server rejects an empty host; omit it so the default applies.
    if (host) {
      transport.sseHost = host;
    }
    if (s.transportMode === 'http') {
      if (portOk) {
        transport.httpPort = s.transportPort;
      }
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
