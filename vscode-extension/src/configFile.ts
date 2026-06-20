import * as path from 'path';
import { isAbsolutePath, isServerInvalidLogPath, isValidPort } from './argsBuilder';
import {
  hasUnresolvedExtensionVariables,
  hasUnresolvedVariables,
  PerShellConfig,
  primaryWorkspaceFolder,
  ProfilesConfig,
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
  if (!isAbsolutePath(resolved)) {
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

/**
 * Whether a shell is effectively enabled in the generated config, using the same
 * precedence applied when each shell entry is emitted: an explicit per-shell
 * `enabled` wins, otherwise the legacy `wcli0.shell` selector ("all" or this
 * shell's name). Used to decide whether a shell's allowlist can actually
 * constrain anything (a disabled shell's paths are never enforced).
 */
function isShellEnabled(s: Wcli0Settings, name: ShellName): boolean {
  const explicit = s.shells?.[name]?.enabled;
  if (explicit !== undefined) {
    return explicit;
  }
  return s.shell === 'all' || name === s.shell;
}

/** Normalize a WSL mount point to the trailing-slash form the server expects. */
function normalizeMount(mount: string): string {
  const m = mount.trim();
  return m.endsWith('/') ? m : `${m}/`;
}

/**
 * Whether a command is path-like — it contains a path separator (`/` or `\`), so
 * the OS resolves it relative to the process cwd rather than looking it up on
 * PATH. Mirrors `isPathLikeCommand` in argsBuilder so per-shell executable
 * commands are anchored the same way as the custom launch command.
 */
function isPathLikeCommand(cmd: string): boolean {
  return /[\\/]/.test(cmd);
}

/**
 * Resolve a per-shell executable command to an absolute path: resolve
 * extension-owned variables, then anchor a path-like RELATIVE command against the
 * configured `launch.cwd` when set, otherwise the workspace folder. Unlike the
 * custom LAUNCH command (which the provider runs from `launch.cwd`), the server
 * spawns a shell's `executable.command` with `cwd` set to the command's REQUESTED
 * working directory (`spawnCwd`), not the launch cwd — so a relative command would
 * resolve under whichever allowed directory a command runs from and usually fail to
 * find the executable (or run a different file at that path). Anchoring it to the
 * launch cwd (where the user expects the relative command to live) makes the
 * spawned path deterministic. A bare PATH command (e.g. `bash`) is left untouched;
 * an unanchorable relative command is left as-is and refused by validateLaunchSpec
 * (an unresolvable `launch.cwd` is reported separately).
 */
function resolvePerShellCommand(command: string, s: Wcli0Settings): string {
  const resolved = resolveVariables(command);
  if (resolved && isPathLikeCommand(resolved) && !isAbsolutePath(resolved)) {
    const base = s.cwd.trim() ? resolveConfigPath(s.cwd) : primaryWorkspaceFolder()?.uri.fsPath;
    if (base) {
      return path.resolve(base, resolved);
    }
  }
  return resolved;
}

/**
 * Convert a resolved Windows drive path (e.g. `C:\repo`) to its WSL mount form
 * (e.g. `/mnt/c/repo`) using the shell's mount point. Mirrors the server's
 * `convertWindowsToWslPath` so per-shell WSL allowlists written by the extension
 * match what the WSL working-directory validator compares against: that validator
 * adds per-shell `allowedPaths` verbatim (only GLOBAL paths are converted), so a
 * Windows path here would never match a `/mnt/...` working directory and every WSL
 * execution would be rejected. A non-drive path (already a `/mnt/...` or `/home`
 * path, or a UNC path the server can't mount) is returned unchanged.
 */
function convertWindowsToWslPath(windowsPath: string, mountPoint: string): string {
  if (windowsPath.startsWith('\\\\') || windowsPath.startsWith('//')) {
    return windowsPath;
  }
  const match = windowsPath.match(/^([a-zA-Z]):([\\/]?.*)$/);
  if (!match) {
    return windowsPath;
  }
  const drive = match[1].toLowerCase();
  let rest = match[2]
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/');
  if (rest.endsWith('/')) {
    rest = rest.slice(0, -1);
  }
  const base = mountPoint.endsWith('/') ? mountPoint : `${mountPoint}/`;
  return rest ? `${base}${drive}/${rest}` : `${base}${drive}`;
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
  s: Wcli0Settings,
): void {
  if (!perShell) {
    return;
  }
  if (perShell.enabled !== undefined) {
    entry.enabled = perShell.enabled;
  }

  const exec = entry.executable as { command: string; args: string[] };
  if (perShell.executable?.command?.trim()) {
    // Resolve extension-owned variables (${workspaceFolder}/${userHome}) before
    // emitting: the server passes executable.command to spawn without expanding
    // them, so a token like ${workspaceFolder}/bin/shell must become a concrete
    // path here. A path-like RELATIVE command is anchored to the workspace (when no
    // launch.cwd is set) so it doesn't resolve under the provider's private cwd; an
    // unresolvable token / unanchorable relative path is left intact and refused by
    // validateLaunchSpec; a bare PATH command (e.g. bash) has no token to resolve.
    exec.command = resolvePerShellCommand(perShell.executable.command.trim(), s);
  }
  // Honor an explicit args list, including an empty one: `args: []` is valid
  // server config (run the executable with no prefix args) and must replace the
  // shell's default arguments rather than being treated as "not set". Resolve
  // extension-owned variables for the same reason as the command above.
  if (perShell.executable?.args !== undefined) {
    exec.args = perShell.executable.args.map((a) => resolveVariables(a));
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
      // For the wsl shell, convert resolved Windows paths to their WSL mount form
      // so they match the working directory the server validates against (it adds
      // per-shell allowedPaths verbatim, converting only GLOBAL paths). Use the
      // effective mount point: a per-shell override wins, else the value already
      // seeded on the entry from --wslMountPoint, else the server default.
      const toShellPath = (resolved: string): string => {
        if (name !== 'wsl') {
          return resolved;
        }
        const seeded = (entry.wslConfig as { mountPoint?: string } | undefined)?.mountPoint;
        const mount = perShell.wslConfig?.mountPoint?.trim()
          ? normalizeMount(perShell.wslConfig.mountPoint)
          : seeded || '/mnt/';
        return convertWindowsToWslPath(resolved, mount);
      };
      if (ov.paths.allowedPaths) {
        // Drop unresolved/empty entries (the server treats an empty allowed
        // prefix as matching every path), mirroring the global paths handling.
        paths.allowedPaths = ov.paths.allowedPaths
          .map((p) => resolveConfigPath(p))
          .filter((p): p is string => p !== undefined)
          .map(toShellPath);
      }
      // A per-shell `initialDir` is intentionally NOT emitted: the server only
      // chdir's to the GLOBAL config.global.paths.initialDir at startup and never
      // consumes a shell-specific initialDir for execution or path validation, so
      // writing one would expose a setting with no effect (see P68).
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
 * Build the server's top-level `profiles` map from the `wcli0.profiles` setting,
 * dropping anything the server's validateProfiles would reject so a generated
 * config never fails to load:
 *  - a blank profile name, or a profile that is not an object, is skipped;
 *  - `env` is kept only for string values under non-blank keys, and a profile
 *    whose resulting `env` is empty is omitted (the server rejects an empty env);
 *  - `${workspaceFolder}` / `${userHome}` are resolved in env values (the same
 *    extension-owned tokens resolved for executable args), while server-resolved
 *    tokens like `${PATH}` are left intact for the server to interpolate; an env
 *    value whose extension-owned token cannot be resolved (e.g. no workspace open)
 *    is dropped rather than emitted, since the server would expand the leftover
 *    `${workspaceFolder}` to an empty string and silently rewrite the value;
 *  - `description` is emitted only when a non-empty string;
 *  - `allowedShells` is filtered to known shell names and emitted only when
 *    non-empty; a profile whose `allowedShells` was provided with entries but
 *    none valid — or is present but not an array (e.g. a hand-edited `"cmd"`) — is
 *    dropped entirely (omitting the field would make the server treat it as
 *    unrestricted, broadening it to every shell — the opposite of the intended
 *    restriction).
 */
function buildProfiles(profiles: ProfilesConfig | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!profiles || typeof profiles !== 'object') {
    return out;
  }
  for (const [name, profile] of Object.entries(profiles)) {
    if (!name.trim() || !profile || typeof profile !== 'object') {
      continue;
    }
    const env: Record<string, string> = {};
    const rawEnv = profile.env;
    if (rawEnv && typeof rawEnv === 'object' && !Array.isArray(rawEnv)) {
      for (const [key, value] of Object.entries(rawEnv)) {
        if (key.trim() && typeof value === 'string') {
          const resolved = resolveVariables(value);
          // Drop an env value whose extension-owned token (${workspaceFolder} /
          // ${userHome}) could not be resolved: emitting it would let the server
          // expand the leftover token to an empty string and silently rewrite the
          // value. Server-owned tokens like ${PATH} are intentionally preserved.
          if (hasUnresolvedExtensionVariables(resolved)) {
            continue;
          }
          env[key] = resolved;
        }
      }
    }
    // The server rejects a profile with an empty env, so drop it rather than emit
    // a config it refuses to load.
    if (Object.keys(env).length === 0) {
      continue;
    }
    const entry: Record<string, unknown> = { env };
    if (typeof profile.description === 'string' && profile.description.trim()) {
      entry.description = profile.description;
    }
    const rawAllowedShells = profile.allowedShells as unknown;
    if (rawAllowedShells !== undefined) {
      // Fail closed on a present-but-non-array allowedShells (e.g. a hand-edited
      // `"allowedShells": "cmd"`). Skipping it would emit the profile without the
      // field, and the server treats an absent allowedShells as unrestricted, so a
      // profile the user tried to limit to one shell would become selectable from
      // EVERY shell. Drop the profile entirely instead.
      if (!Array.isArray(rawAllowedShells)) {
        continue;
      }
      const valid = rawAllowedShells.filter((sh): sh is ShellName =>
        (SHELL_NAMES as readonly string[]).includes(sh),
      );
      // A non-empty allowedShells with no valid entries (e.g. a typo like
      // ['powershel']) must not collapse to an omitted field: the server treats an
      // absent allowedShells as unrestricted, so the profile would be selectable
      // from EVERY shell — the opposite of the restriction the user expressed.
      // Drop the profile entirely so it fails closed.
      if (rawAllowedShells.length > 0 && valid.length === 0) {
        continue;
      }
      if (valid.length > 0) {
        entry.allowedShells = valid;
      }
    }
    out[name] = entry;
  }
  return out;
}

/**
 * Build a wcli0 config.json object from settings. This is a convenience for
 * users who prefer a committed config file over CLI flags; the produced file
 * can be referenced via `wcli0.configFile` / `--config`. It is also the source
 * for the auto-managed config the extension launches with when any shell is
 * configured individually via `wcli0.shells` (see mcpProvider.ts).
 */
export function buildConfigFile(sInput: Wcli0Settings): Record<string, unknown> {
  // When a scope opts out of inherited per-shell config (ignoreInheritedShells),
  // the generated/pinned config must reflect ONLY the global CLI-flag settings, not
  // the deep-merged wcli0.shells inherited from another scope. hasPerShellConfig
  // already gates the launch path off, but a plain launch still gets pinned to a
  // generated config when an implicit home/cwd config.json exists (P66/P74), and
  // that pinned config is built here — so without masking, the inherited shell
  // executables/security overrides would silently take effect despite the opt-out
  // (P95). Treat shells as empty so every shell entry is built from its defaults
  // plus the legacy single-shell selector and the global security/limits.
  const s: Wcli0Settings = sInput.ignoreInheritedShells ? { ...sInput, shells: {} } : sInput;
  // Resolve the path values that will actually be emitted first, so downstream
  // decisions reflect what ends up in the file (an unresolved ${workspaceFolder}
  // entry is dropped and must not count as "configured").
  const resolvedAllowedPaths = s.allowedDirectories
    .map((d) => resolveConfigPath(d))
    .filter((d): d is string => d !== undefined);
  const resolvedInitialDir = resolveConfigPath(s.initialDir);

  // Per-shell allowed paths also count as configured paths: a shell inherits the
  // global restrictWorkingDirectory unless it overrides it, so if allowAllDirs
  // disabled the global restriction the shell's allowlist would be present but
  // never enforced. Include resolved per-shell allowedPaths in the decision.
  const hasPerShellPaths = SHELL_NAMES.some((name) => {
    // A disabled shell is never launched, so its allowlist can't constrain
    // anything; counting it would keep restrictWorkingDirectory on and leave the
    // ENABLED shells with an empty global allowlist (commands fail with "No
    // allowed paths configured"). Only enabled shells' paths block the lift.
    if (!isShellEnabled(s, name)) {
      return false;
    }
    // A shell that explicitly disables its own working-directory restriction never
    // enforces its allowlist either, so its paths must not block the allAllDirs lift.
    // Counting them would keep the global restriction on with an empty global
    // allowlist, and every OTHER enabled shell (inheriting the global restriction)
    // would reject commands with "No allowed paths configured".
    if (s.shells?.[name]?.overrides?.security?.restrictWorkingDirectory === false) {
      return false;
    }
    const p = s.shells?.[name]?.overrides?.paths;
    if (!p) {
      return false;
    }
    // Only resolved per-shell allowedPaths can satisfy the working-directory
    // restriction. Counting anything else here would keep restrictWorkingDirectory
    // enabled with an empty allowlist, so every command fails with "No allowed paths
    // configured" instead of honoring allowAllDirs.
    const resolvedShellPaths = (p.allowedPaths ?? [])
      .map((x) => resolveConfigPath(x))
      .filter((x): x is string => x !== undefined);
    return resolvedShellPaths.length > 0;
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
  // Also drop a resolved path the server's validateLoggingConfig would reject
  // (`..` traversal or Windows-invalid characters): the Generate Config File
  // command builds the config directly (no validateLaunchSpec), so without this
  // it could emit a logDirectory that crashes the server at startup.
  const resolvedLog = resolveConfigPath(s.logDirectory);
  if (resolvedLog !== undefined && !isServerInvalidLogPath(resolvedLog)) {
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
    // Seed the wsl mount point from the global --wslMountPoint on BOTH WSL-family
    // shells; a per-shell wslConfig.mountPoint (applied next) overrides it. The
    // server expects a trailing slash (e.g. /mnt/), matching applyCliWslMountPoint,
    // which seeds wsl AND bash — without bash here, a bash shell inheriting global
    // paths would convert them with the /mnt/ default instead of the configured
    // mount, so commands under a custom mount are rejected.
    if ((name === 'wsl' || name === 'bash') && s.wslMountPoint.trim()) {
      const wsl = entry.wslConfig as Record<string, unknown> | undefined;
      if (wsl) {
        wsl.mountPoint = normalizeMount(s.wslMountPoint);
      }
    }
    applyPerShellOverrides(entry, s.shells?.[name], name, s);
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
      // A per-shell restrictWorkingDirectory override is resolved by the server
      // OVER the global value, so a stale per-shell value silently contradicts the
      // safety mode: yolo (global restrict: true, documented to keep directory
      // restrictions) would still allow any directory for a shell pinned to false,
      // and unsafe (global restrict: false) would keep a shell pinned to true.
      // Force the per-shell value to match the mode: true for yolo, false for unsafe.
      if (overrides.security && overrides.security.restrictWorkingDirectory !== undefined) {
        overrides.security.restrictWorkingDirectory = s.safetyMode === 'yolo';
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

  // Emit named environment profiles when any survive sanitization. Profiles are
  // independent of the launch transport, so they are added regardless of mode.
  const profiles = buildProfiles(s.profiles);
  if (Object.keys(profiles).length > 0) {
    config.profiles = profiles;
  }

  return config;
}
