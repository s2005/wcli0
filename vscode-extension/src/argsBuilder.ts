import * as path from 'path';
import {
  hasUnresolvedVariables,
  primaryWorkspaceFolder,
  resolveVariables,
  ShellName,
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
 * Whether a path is absolute under EITHER POSIX or Windows semantics. Node's
 * `path.isAbsolute` is host-specific, so on a WSL/Linux extension host it returns
 * false for a valid Windows path such as `C:\Users\me` (or a UNC path), which
 * would make this code treat the path as workspace-relative and rewrite it (e.g.
 * `/ws/C:\Users\me`). Checking both `path.win32` and `path.posix` keeps configured
 * absolute paths intact regardless of the host OS.
 */
export function isAbsolutePath(p: string): boolean {
  return path.win32.isAbsolute(p) || path.posix.isAbsolute(p);
}

/**
 * Whether a command is path-like — it contains a path separator (`/` or `\`), so
 * the OS resolves it relative to the process cwd rather than looking it up on
 * PATH. A bare name (`npx`, `wcli0`, `bash`) is a PATH lookup and is left alone.
 */
function isPathLikeCommand(cmd: string): boolean {
  return /[\\/]/.test(cmd);
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
  if (!isAbsolutePath(resolved)) {
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
 * The absolute path the server would receive as `--config` for a referenced
 * `wcli0.configFile`, or undefined when the setting is empty or cannot be anchored
 * (an unresolved variable, or a relative path with no workspace folder). Mirrors the
 * launch-time resolution (`pathValue` with default `resolvePaths`), so callers can
 * check on disk whether the very file the server will load actually exists and parses
 * (see `validateLaunchSpec`'s `configFileLoadable`).
 */
export function resolvedConfigFilePath(s: Wcli0Settings): string | undefined {
  if (!s.configFile.trim()) {
    return undefined;
  }
  return resolvedPath(s.configFile);
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
   * Only meaningful together with `resolvePaths: false`. When true, a plain relative
   * path-like value (`--config`, `--allowedDir`, `--initialDir`, `--logDirectory`) is
   * preserved verbatim instead of being anchored to a `${workspaceFolder}` token. Set
   * when re-saving a loaded `.vscode/mcp.json` source, whose relative args were authored
   * relative to the entry's own `cwd` and must round-trip unchanged so an unrelated edit
   * does not retarget them (P27). Left false for a settings-driven export, where relative
   * path settings are workspace-relative (matching the provider) and get the token.
   */
  preserveRelativePaths?: boolean;

  /**
   * When set, the server is launched against this auto-managed config file
   * (`--config <path>`) and the global CLI flags are NOT emitted. Used when the
   * user configures shells individually (`wcli0.shells`), which can only be
   * expressed in a config file — emitting `--shell`/`--allowedDir`/etc. on top
   * would conflict with the file's per-shell `enabled`/security settings.
   */
  managedConfigPath?: string;

  /**
   * When true, a hand-authored `--transport` token kept in `extraArgs` is NOT stripped from a
   * stdio launch. Set only for a file-source round-trip ("Save to file"), where the entry's
   * `type: stdio` is authoritative and the user's verbatim argv — including a stray
   * `--transport http`/`--transport=sse` they wrote alongside `--http-*` options — must survive
   * an unrelated save rather than being silently dropped (P-fileextratransport). The safety
   * strip still applies to the provider and settings-export paths, which must never let an
   * extraArgs `--transport http` turn a stdio registration into a network listener. It is
   * still stripped here when a `--config` is emitted (the builder also pushes `--transport
   * stdio`, and two `--transport` tokens yargs-merge into an array the server applies neither
   * of).
   */
  preserveExtraTransport?: boolean;
}

/**
 * Remove any `--transport` entry (and its value) from a raw extraArgs list. Used
 * whenever the extension has already emitted its own `--transport`: yargs parses a
 * repeated string option as an array, and the server's `applyCliTransport` only
 * matches a scalar string, so a second `--transport` makes it apply neither value
 * and silently fall back to the referenced config's transport. For a provider
 * (stdio) launch that means a process that opens a network listener but never
 * speaks over stdio, so the conflicting override must be dropped.
 */
function stripTransportArgs(extraArgs: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < extraArgs.length; i++) {
    const a = extraArgs[i];
    if (a === '--transport') {
      // Drop the flag, and its separate value token ONLY when that token is an
      // actual value rather than another option. yargs parses `--transport --unsafe`
      // as transport="" plus the still-applied `--unsafe`, so blindly consuming the
      // next token would also discard an unrelated following option (see P86).
      if (i + 1 < extraArgs.length && !extraArgs[i + 1].startsWith('-')) {
        i++;
      }
      continue;
    }
    if (a === '--no-transport') {
      // Boolean negation: yargs parses `--no-transport` as transport=false, which
      // fails the server's string-choice validation and exits the process instead
      // of starting. Drop the flag alone (it carries no value), like --no-config.
      continue;
    }
    if (a.startsWith('--transport=')) {
      continue;
    }
    out.push(a);
  }
  return out;
}

/**
 * Remove any config-option entry (and its value) from a raw extraArgs list. Used
 * whenever the extension has already emitted its own `--config`: always in managed
 * mode, and in non-managed mode when `wcli0.configFile` is set. The server's `config`
 * option is a scalar string with alias `c` (see src/index.ts), so a second `--config`
 * makes yargs parse `args.config` as an array. `loadConfig` passes that array to
 * `fs.existsSync`, which rejects it and silently falls back to `<cwd>/config.json` or
 * `~/.win-cli-mcp/config.json` — bypassing the mandatory managed config (and every
 * generated per-shell/safety setting) or the referenced config file. The conflicting
 * entry must therefore be dropped. A user `--config` is left intact when the
 * extension emits none (plain launch, no configFile): there it is a valid escape hatch.
 *
 * yargs accepts the config alias in several forms, so all must be stripped:
 *   - space-separated: `--config X`, `-c X`, and the single-char alias's long form `--c X`
 *   - attached: `--config=X`, `-c=X`, `--c=X`
 *   - short-option bundling: `-cX` (e.g. `-c/other.json`), and `c` bundled with other
 *     letters anywhere yargs can parse it (e.g. `-dc /other.json`, `-xc/other.json`)
 *   - boolean negation: `--no-config` / `--no-c` (sets `config` to `false`, defeating the file)
 * Leaving any one in place re-introduces the silent-fallback bug above.
 */
function stripConfigArgs(extraArgs: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < extraArgs.length; i++) {
    const a = extraArgs[i];
    // Space-separated forms (drop the flag and, when present, its separate value
    // token). `--c` is the long form yargs also accepts for the single-character `c`
    // alias. Consume the following token only when it is a real value, not another
    // option: yargs parses `--config --debug` as config="" plus the still-applied
    // `--debug`, so blindly consuming it would also discard an unrelated flag (P86).
    if (a === '--config' || a === '-c' || a === '--c') {
      if (i + 1 < extraArgs.length && !extraArgs[i + 1].startsWith('-')) {
        i++;
      }
      continue;
    }
    // Attached forms with `=`.
    if (a.startsWith('--config=') || a.startsWith('-c=') || a.startsWith('--c=')) {
      continue;
    }
    // Boolean negation: `--no-config` / `--no-c` (the alias also negates) carry no
    // value and would make yargs set config === false, so loadConfig skips the file
    // and falls back to implicit cwd/home discovery. Drop the flag alone.
    if (a === '--no-config' || a === '--no-c') {
      continue;
    }
    // Short-option bundling: yargs recognizes the `c` alias (the server's ONLY
    // single-char option) anywhere in a single-dash bundle, not just at the start, so
    // `-c/other.json`, `-dc /other.json` and `-xc/other.json` all set config. Strip any
    // single-dash bundle that contains `c` (the co-bundled letters are not server
    // options). When `c` is the bundle's final character it carries no attached value,
    // so yargs reads the NEXT token as its value — drop that too, but only when it is a
    // real value rather than another option (P86/P88).
    if (a.length > 1 && a[0] === '-' && a[1] !== '-' && a.includes('c')) {
      const cIsLast = a[a.length - 1] === 'c';
      if (cIsLast && i + 1 < extraArgs.length && !extraArgs[i + 1].startsWith('-')) {
        i++;
      }
      continue;
    }
    out.push(a);
  }
  return out;
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
  // Strip any --transport AND --config from extraArgs: a managed launch forces stdio
  // and carries its own mandatory --config. A second --transport would make the server
  // start a network listener instead of speaking stdio (see stripTransportArgs); a
  // second --config would make yargs parse args.config as an array and the server fall
  // back to a different/default config, ignoring the managed file (see stripConfigArgs).
  for (const extra of stripConfigArgs(stripTransportArgs(s.extraArgs))) {
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
    if (!isAbsolutePath(trimmed) && !hasUnresolvedVariables(trimmed)) {
      // For a file-source round-trip, a relative path was authored relative to the
      // entry's own cwd (the server resolves --config/--allowedDir/etc. against
      // process.cwd()). Preserve it verbatim so re-saving an unrelated field does not
      // retarget it: anchoring config.json to ${workspaceFolder} would launch a
      // different file when cwd is not the workspace root, e.g. cwd
      // ${workspaceFolder}/server must keep config.json -> .../server/config.json (P27).
      if (opts.preserveRelativePaths) {
        return trimmed.split(/[\\/]/).join('/');
      }
      // Settings export: convert a plain relative path to a ${workspaceFolder}-relative
      // token so VS Code anchors it to the workspace, matching what the provider does
      // (it resolves relative path settings against the workspace, not cwd). A bare
      // relative value would otherwise be C-rooted by the server's normalizeWindowsPath
      // (e.g. "src" -> C:\src), denying the intended directory and possibly allowing an
      // unrelated one.
      return `\${workspaceFolder}/${trimmed.split(/[\\/]/).join('/')}`;
    }
    // Values that already carry a token (or are absolute) are kept verbatim for VS
    // Code to resolve.
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
  // Whether a --transport in extraArgs must be dropped. yargs parses a repeated
  // string option as an array and the server's applyCliTransport (scalar-only)
  // applies neither, silently keeping the referenced config's transport. This must
  // be stripped whenever the extension emits its own --transport AND for every
  // stdio launch: a provider/mcp.json stdio registration must never let an
  // extraArgs value such as `--transport http` turn the process into a network
  // listener the client never connects to.
  let stripExtraTransport = false;
  if (s.transportMode === 'stdio') {
    // When a config file is referenced it may select http/sse; emit an explicit
    // --transport stdio to force a provider-launched (stdio) process to speak
    // stdio. Without a config file the server already defaults to stdio, so no flag
    // is emitted — but a conflicting --transport in extraArgs is still stripped
    // below so it cannot start a network listener.
    if (configFile) {
      args.push('--transport', 'stdio');
      // A --transport stdio is now emitted, so a conflicting extraArgs --transport must be
      // stripped even for a file-source round-trip — two tokens would yargs-merge into an
      // array the server resolves to neither, silently keeping the referenced config's mode.
      stripExtraTransport = true;
    } else {
      // No --transport is emitted. The provider/settings-export paths still strip a stray
      // extraArgs --transport so a stdio registration cannot become a network listener; a
      // file-source round-trip instead preserves the user's authored token verbatim
      // (P-fileextratransport).
      stripExtraTransport = !opts.preserveExtraTransport;
    }
  } else {
    args.push('--transport', s.transportMode);
    stripExtraTransport = true;
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

  // Drop a conflicting --transport (when the extension emitted its own) and a
  // conflicting --config (when a configFile was emitted): either would be parsed by
  // yargs as a repeated option and silently defeat the extension's flag (forced
  // stdio / the referenced config). A user flag the extension did NOT emit is kept.
  let extras = s.extraArgs;
  if (stripExtraTransport) {
    extras = stripTransportArgs(extras);
  }
  if (configFile) {
    extras = stripConfigArgs(extras);
  }
  for (const extra of extras) {
    args.push(extra);
  }

  return args;
}

/**
 * Build the `node` script-path argument. A relative script must resolve against the
 * directory node actually runs in: when `launch.cwd` is configured the provider
 * launches the server there, so a relative script is resolved against that cwd (or,
 * for mcp.json, left relative for VS Code/node to resolve under cwd) rather than
 * anchored to the workspace root — anchoring would launch a different file (cwd
 * `/repo/server` + `dist/index.js` must be `/repo/server/dist/index.js`, not
 * `/repo/dist/index.js`). Without a cwd it falls back to the workspace-anchored
 * value (`${workspaceFolder}` token for mcp.json), matching the other path settings.
 */
function nodeScriptArg(s: Wcli0Settings, opts: BuildOptions): string {
  const raw = s.nodeScriptPath.trim();
  const cwdSet = s.cwd.trim().length > 0;
  if (opts.resolvePaths === false) {
    // Preserving tokens for mcp.json. With a cwd configured, keep a plain relative
    // script relative so node resolves it under that cwd; converting it to a
    // ${workspaceFolder} token would anchor it to the workspace root instead.
    if (cwdSet && raw && !isAbsolutePath(raw) && !hasUnresolvedVariables(raw)) {
      return raw.split(/[\\/]/).join('/');
    }
    return pathValue(s.nodeScriptPath, opts) ?? raw;
  }
  // Resolving for launch. Resolve a relative script against the configured cwd
  // (what node would do at runtime) when one is set and resolvable.
  const resolvedScript = resolveVariables(raw);
  if (
    cwdSet &&
    resolvedScript.trim() &&
    !hasUnresolvedVariables(resolvedScript) &&
    !isAbsolutePath(resolvedScript)
  ) {
    const resolvedCwd = resolvedPath(s.cwd);
    if (resolvedCwd) {
      return path.resolve(resolvedCwd, resolvedScript);
    }
  }
  return pathValue(s.nodeScriptPath, opts) ?? resolveVariables(raw);
}

/**
 * Whether the `node` script path cannot be turned into a usable absolute path: an
 * unresolved variable, or a relative path with neither a resolvable `launch.cwd`
 * nor a workspace folder to anchor it. Mirrors what `nodeScriptArg` can resolve so
 * validation refuses only what would actually launch the wrong (or no) file.
 */
function isUnanchorableNodeScript(s: Wcli0Settings): boolean {
  const raw = s.nodeScriptPath.trim();
  if (!raw) {
    return false;
  }
  const resolved = resolveVariables(raw);
  if (!resolved.trim() || hasUnresolvedVariables(resolved)) {
    return true;
  }
  if (isAbsolutePath(resolved)) {
    return false;
  }
  // Relative: anchorable by a resolvable configured cwd, otherwise by a workspace.
  if (s.cwd.trim() && resolvedPath(s.cwd)) {
    return false;
  }
  return !primaryWorkspaceFolder();
}

/**
 * Resolve the custom launch command. A path-like relative command (one that
 * contains a path separator, e.g. `./bin/server`) is anchored to the workspace
 * folder when no explicit `launch.cwd` is configured — otherwise the provider,
 * which launches from a private extension directory, would resolve it there and
 * fail to start (and it would also diverge from an exported mcp.json, whose
 * omitted cwd defaults to the workspace). With a cwd set the relative command
 * resolves against it as intended, and a bare PATH command is left untouched.
 * When preserving tokens (mcp.json) the trimmed value is returned for VS Code to
 * resolve. An unanchorable relative path falls back to the resolved value;
 * validateLaunchSpec blocks it.
 */
function customCommandValue(s: Wcli0Settings, opts: BuildOptions): string {
  if (opts.resolvePaths === false) {
    return s.customCommand.trim();
  }
  const resolved = resolveVariables(s.customCommand.trim());
  if (
    resolved &&
    isPathLikeCommand(resolved) &&
    !isAbsolutePath(resolved) &&
    !s.cwd.trim()
  ) {
    const base = primaryWorkspaceFolder()?.uri.fsPath;
    if (base) {
      return path.resolve(base, resolved);
    }
  }
  return resolved;
}

/**
 * Whether a custom command is a relative path-like value that cannot be anchored:
 * no explicit `launch.cwd` to resolve it against and no workspace folder open to
 * anchor it to. Mirrors what `customCommandValue` would fail to anchor, so
 * validation refuses a command that would launch from the provider's private dir.
 */
function isUnanchorableCustomCommand(s: Wcli0Settings): boolean {
  const resolved = resolveVariables(s.customCommand.trim());
  if (!resolved || !isPathLikeCommand(resolved) || isAbsolutePath(resolved)) {
    return false;
  }
  // A configured cwd anchors the relative command (its own validity is checked
  // separately), so only an unset cwd with no workspace folder is unanchorable.
  return !s.cwd.trim() && !primaryWorkspaceFolder();
}

/**
 * Whether a per-shell executable command is a relative path-like value that cannot
 * be anchored: no `launch.cwd` to resolve it against and no workspace folder open.
 * Mirrors what `resolvePerShellCommand` (configFile) would fail to anchor, so
 * validation refuses a command that would launch from the provider's private dir.
 */
function isUnanchorablePerShellCommand(command: string, s: Wcli0Settings): boolean {
  const resolved = resolveVariables(command.trim());
  if (!resolved || !isPathLikeCommand(resolved) || isAbsolutePath(resolved)) {
    return false;
  }
  return !s.cwd.trim() && !primaryWorkspaceFolder();
}

/**
 * Build the full launch spec (command + launcher args + server flags) for the
 * configured launch method.
 */
export function buildLaunchSpec(s: Wcli0Settings, opts: BuildOptions = {}): LaunchSpec {
  const serverArgs = buildServerArgs(s, opts);
  const env = { ...s.env };
  const cwd = pathValue(s.cwd, opts);

  switch (s.launchMethod) {
    case 'node':
      // nodeScriptArg resolves a relative script against the configured cwd (or the
      // workspace when no cwd is set), so it never resolves under the provider's
      // private cwd; validateLaunchSpec blocks a script that cannot be anchored.
      return {
        command: 'node',
        args: [nodeScriptArg(s, opts), ...serverArgs],
        cwd,
        env,
      };
    case 'custom':
      return {
        command: customCommandValue(s, opts),
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

/**
 * Whether a shell is effectively enabled, using the same precedence applied when
 * the managed config is emitted (configFile.isShellEnabled): an explicit per-shell
 * `enabled` wins, otherwise the legacy `wcli0.shell` selector. Duplicated here
 * rather than imported to avoid a circular dependency with configFile.
 */
function isShellEnabledForValidation(s: Wcli0Settings, name: ShellName): boolean {
  const explicit = s.shells?.[name]?.enabled;
  if (explicit !== undefined) {
    return explicit;
  }
  return s.shell === 'all' || name === s.shell;
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
 * `homeConfigPresent` tells the validator whether the server's implicit home
 * config (`~/.win-cli-mcp/config.json`) exists; callers compute it from the
 * filesystem so this function stays pure. When it does, a non-managed safe launch
 * with no `configFile` gets a non-blocking warning that the home config still loads.
 * `configFileLoadable` tells the validator whether a referenced `wcli0.configFile`
 * actually exists and parses as JSON; callers compute it from the filesystem (so this
 * function stays pure) and pass `false` only when the resolved file is missing,
 * unreadable, a directory, or malformed. A non-managed launch with such a file is
 * blocked, because the server's `loadConfig` would silently fall back to an implicit
 * `<cwd>/config.json` or `~/.win-cli-mcp/config.json` instead of the intended pin.
 */
export function validateLaunchSpec(
  s: Wcli0Settings,
  managed = false,
  homeConfigPresent = false,
  configFileLoadable = true,
): LaunchProblem[] {
  const problems: LaunchProblem[] = [];
  if (s.launchMethod === 'node') {
    if (!s.nodeScriptPath.trim()) {
      problems.push({
        message: 'Launch method is "node" but wcli0.launch.nodeScriptPath is empty.',
        blocking: true,
      });
    } else if (isUnanchorableNodeScript(s)) {
      // The script path can't be turned into a usable path: an unresolved
      // ${workspaceFolder} token, or a relative path with neither a resolvable
      // launch.cwd nor a workspace folder to anchor it. Either way `node <path>`
      // would resolve against the provider's private cwd and fail every start;
      // refuse rather than register a broken one.
      problems.push({
        message: `wcli0.launch.nodeScriptPath "${s.nodeScriptPath}" cannot be resolved to an absolute path (unresolved variable, or a relative path with no wcli0.launch.cwd set and no workspace folder open).`,
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
    } else if (isUnanchorableCustomCommand(s)) {
      // A relative path-like command (e.g. ./bin/server) with no wcli0.launch.cwd
      // and no workspace folder would be launched from the provider's private
      // extension directory and fail to start; refuse rather than register it.
      problems.push({
        message: `wcli0.launch.customCommand "${s.customCommand}" is a relative path but cannot be anchored (no wcli0.launch.cwd set and no workspace folder open); it would be launched from a private extension directory.`,
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
    // customArgs are prepended verbatim, BEFORE the server flags buildLaunchSpec
    // appends. When the custom command forwards to wcli0 (directly or via a wrapper
    // — the only way the appended --config/--transport flags make sense), a reserved
    // flag in customArgs collides with the extension's own: the server's scalar yargs
    // `config`/`transport` options parse two values as an array, so loadConfig ignores
    // the mandatory managed/pinned file (and falls back to an implicit config) and
    // applyCliTransport applies neither value (defeating forced stdio). Unlike
    // extraArgs — which are unambiguously wcli0's and get stripped — customArgs belong
    // to the custom command and cannot be silently rewritten, so refuse instead. Only
    // flag the conflict when the extension actually emits its own value: a plain
    // launch with no managed config, no configFile and stdio transport leaves
    // customArgs as a valid escape hatch. (P102)
    const emitsConfig = managed || !!s.configFile.trim();
    const emitsTransport = managed || s.transportMode !== 'stdio' || !!s.configFile.trim();
    if (emitsConfig && stripConfigArgs(s.customArgs).length !== s.customArgs.length) {
      problems.push({
        message:
          'wcli0.launch.customArgs contains a --config/-c option, but the extension already passes its own --config (the managed per-shell config or wcli0.configFile). Two --config values make the server parse them as an array and ignore the intended file, silently loading an implicit config instead. Remove the --config entry from customArgs.',
        blocking: true,
      });
    }
    if (emitsTransport && stripTransportArgs(s.customArgs).length !== s.customArgs.length) {
      problems.push({
        message:
          'wcli0.launch.customArgs contains a --transport option, but the extension already passes its own --transport. Two --transport values make the server apply neither and fall back to a different transport (e.g. opening a network listener instead of speaking stdio). Remove the --transport entry from customArgs.',
        blocking: true,
      });
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
  } else if (!managed && s.configFile.trim() && !configFileLoadable) {
    // The path resolves, but the file cannot actually be loaded (missing,
    // unreadable, a directory, or malformed JSON). The provider would still pass it
    // as an explicit `--config` pin and skip its implicit-config protection, while
    // the server's loadConfig catches the failure and falls back to a
    // <cwd>/config.json or ~/.win-cli-mcp/config.json that can replace shell
    // executables or weaken restrictions. Refuse rather than launch the pin silently
    // (P85).
    problems.push({
      message: `wcli0.configFile "${s.configFile}" cannot be read as a JSON config file (missing, unreadable, a directory, or malformed); the server would ignore it and silently load an implicit config instead.`,
      blocking: true,
    });
  }
  // In managed (per-shell) mode the generated config carries per-shell paths and
  // security limits. Apply the same blocking checks as the global equivalents so
  // an unresolved path or an out-of-range limit is reported rather than silently
  // dropped from the config (and the shell launched with the wrong restriction).
  // When `ignoreInheritedShells` is set, buildConfigFile masks `shells` to {} and
  // emits every shell from its defaults, so none of these inherited entries reach
  // the generated config — validating them would reject the opt-out (and block
  // Generate Config File) over a shell that will never be emitted. Skip the
  // per-shell checks in that case. (P99)
  if (managed && !s.ignoreInheritedShells) {
    for (const name of SHELL_NAMES) {
      const sh = s.shells?.[name];
      if (!sh) {
        continue;
      }
      // A shell disabled explicitly or by the legacy single-shell selector is
      // never spawned and the generated config preserves its disabled state, so
      // its stale machine-specific paths/limits/variables must not block the
      // enabled shells from registering. Skip validation for disabled shells.
      if (!isShellEnabledForValidation(s, name)) {
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
      if (cmd && cmd.trim() && hasUnresolvedVariables(resolveVariables(cmd.trim()))) {
        // Any leftover ${...} after resolving the extension's own tokens — an
        // unresolved ${workspaceFolder}/${userHome} (no workspace open) OR an
        // arbitrary template such as ${SHELL_BIN}. The server passes
        // executable.command straight to spawn WITHOUT shell expansion, so any token
        // makes that shell fail every spawn. (Unlike executable ARGS, which a shell
        // may legitimately expand, the command itself cannot contain ${...} tokens.)
        problems.push({
          message: `wcli0.shells.${name}.executable.command "${cmd}" contains an unresolved variable; the server spawns the command without shell expansion, so it cannot contain \${...} tokens.`,
          blocking: true,
        });
      } else if (cmd && cmd.trim() && isUnanchorablePerShellCommand(cmd, s)) {
        // A relative path-like command (e.g. ./tools/bash) with no launch.cwd and
        // no workspace folder would be written unchanged and resolved under the
        // provider's private extension dir at spawn, so the shell never starts.
        problems.push({
          message: `wcli0.shells.${name}.executable.command "${cmd}" is a relative path but cannot be anchored (no wcli0.launch.cwd set and no workspace folder open); it would be launched from a private extension directory.`,
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
  // Even with no configFile referenced, the server's loadConfig falls back to
  // ~/.win-cli-mcp/config.json (after the private cwd) when no --config is passed. In
  // safe mode that file can silently disable injection/directory restrictions or
  // replace shell executables while the extension reports safe; warn when it exists so
  // the reduced protection isn't silent. Managed mode passes an explicit --config, so
  // the home fallback never applies and no warning is emitted there.
  if (!managed && s.safetyMode === 'safe' && !s.configFile.trim() && homeConfigPresent) {
    problems.push({
      message:
        'Safety mode is "safe" with no config file referenced, but the server still loads ~/.win-cli-mcp/config.json: its settings (including disabled safety checks or replaced shell executables) take effect and are not overridden by the extension. Reference an explicit config file (wcli0.configFile) to control this.',
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
  // commandTimeout/maxCommandLength: the bound depends on how they reach the
  // server. As CLI flags (non-managed) the server ignores a non-positive value and
  // uses its default, so reject <= 0. In managed mode they are written into the
  // generated config, where validateConfig rejects values between 0 and 1 and
  // buildConfigFile drops them silently — so a value such as 0.5 would launch with
  // the server default instead of the configured limit. Require >= 1 there to match.
  for (const [name, value] of [
    ['commandTimeout', s.commandTimeout],
    ['maxCommandLength', s.maxCommandLength],
  ] as const) {
    if (value == null) {
      continue;
    }
    if (managed) {
      if (!(Number.isFinite(value) && value >= 1)) {
        problems.push({
          message: `wcli0.${name} (${value}) must be a number >= 1; in per-shell (managed) mode it is written to the generated config, which the server rejects for values below 1, so the configured value would not take effect.`,
          blocking: true,
        });
      }
    } else if (!(value > 0)) {
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
