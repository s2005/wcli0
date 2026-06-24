import * as vscode from 'vscode';
import { isValidLogLimit, isValidMaxOutputLines } from './argsBuilder';
import { parseJsonc } from './commands';
import { defaultSettings, TransportMode, TriState, Wcli0Settings } from './settings';

/**
 * The kinds of configuration source the form can edit, one at a time. `settings`
 * is the existing VS Code settings editing (the default); `mcpJson` is the
 * workspace `.vscode/mcp.json` file's `servers.wcli0` entry. The model is kept
 * deliberately small so later tasks (arbitrary file browse, `config.json`) can add
 * kinds without reworking it.
 */
export type ConfigSourceKind = 'settings' | 'mcpJson';

/** A selectable configuration source surfaced in the source switcher. */
export interface ConfigSource {
  kind: ConfigSourceKind;
  /** Display label, e.g. "VS Code Settings" or ".vscode/mcp.json". */
  label: string;
  /** Absolute path of the backing file (file sources only). */
  fsPath?: string;
  /** JSON pointer of the edited entry, e.g. `servers.wcli0` (file sources only). */
  pointer?: string;
  /**
   * A read-only preview entry (e.g. the implicit `~/.win-cli-mcp/config.json`):
   * listed for awareness but never loadable or a save target.
   */
  readOnly?: boolean;
  /** Whether a detected file actually contains a wcli0 entry to load. */
  hasWcli0?: boolean;
}

/** Result of probing the workspace `.vscode/mcp.json` for a wcli0 entry. */
export interface McpJsonDetection {
  uri: vscode.Uri;
  fsPath: string;
  /** Whether the file exists and parses as JSON/JSONC with an object root. */
  exists: boolean;
  /** Whether a `servers.wcli0` entry is present. */
  hasWcli0: boolean;
}

/** The `.vscode/mcp.json` Uri for a workspace folder. */
export function mcpJsonUri(folder: vscode.WorkspaceFolder): vscode.Uri {
  return vscode.Uri.joinPath(folder.uri, '.vscode', 'mcp.json');
}

/**
 * Probe `<folder>/.vscode/mcp.json` for a `servers.wcli0` entry. Tolerates JSONC
 * (the format VS Code registers for mcp.json) via {@link parseJsonc}, and never
 * throws: a missing, unreadable, or malformed file reports `exists`/`hasWcli0`
 * false so detection can run eagerly on panel open without breaking it.
 */
export async function detectWorkspaceMcpJson(
  folder: vscode.WorkspaceFolder,
): Promise<McpJsonDetection> {
  const uri = mcpJsonUri(folder);
  const base: McpJsonDetection = { uri, fsPath: uri.fsPath, exists: false, hasWcli0: false };
  let raw: Uint8Array;
  try {
    raw = await vscode.workspace.fs.readFile(uri);
  } catch {
    // Not found / unreadable — no committed entry to detect.
    return base;
  }
  let parsed: unknown;
  try {
    parsed = parseJsonc(Buffer.from(raw).toString('utf8'));
  } catch {
    // Present but malformed — surface as existing-but-no-entry rather than throwing.
    return { ...base, exists: true };
  }
  if (!isPlainObject(parsed)) {
    return { ...base, exists: true };
  }
  const servers = parsed.servers;
  const hasWcli0 = isPlainObject(servers) && isPlainObject(servers.wcli0);
  return { ...base, exists: true, hasWcli0 };
}

/** Read and return the `servers.wcli0` entry from a workspace `.vscode/mcp.json`. */
export async function readWcli0Entry(
  folder: vscode.WorkspaceFolder,
): Promise<Record<string, unknown> | undefined> {
  const uri = mcpJsonUri(folder);
  let raw: Uint8Array;
  try {
    raw = await vscode.workspace.fs.readFile(uri);
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = parseJsonc(Buffer.from(raw).toString('utf8'));
  } catch {
    return undefined;
  }
  if (!isPlainObject(parsed) || !isPlainObject(parsed.servers)) {
    return undefined;
  }
  const entry = parsed.servers.wcli0;
  return isPlainObject(entry) ? entry : undefined;
}

/** The result of reverse-mapping an mcp.json entry into the form's settings. */
export interface ParsedEntry {
  settings: Wcli0Settings;
  /** Non-blocking notes about parts of the entry the form cannot fully model. */
  notes: string[];
}

/** A recognized value-bearing CLI option and how it maps onto settings. */
type OptionKind = 'string' | 'number' | 'array' | 'csv';
interface OptionSpec {
  key: keyof Wcli0Settings;
  kind: OptionKind;
}

// Recognized `--option value` / `--option=value` flags, keyed by flag name. Mirror
// of the forward emission in argsBuilder.buildServerArgs. Transport host/port use the
// http/sse-specific flag names the forward builder emits. The `config` option's `c`
// alias (`-c`, `--c`) is included so a hand-written entry that uses the short form is
// modeled like `--config` instead of dumped to extraArgs (matching the forward
// builder's stripConfigArgs, which recognizes the same alias forms — P32).
//
// The server defines its multi-word options in camelCase, but yargs camel-case
// expansion ALSO accepts the kebab-case spelling, so a hand-written entry may use
// `--max-command-length` etc.; the kebab-case aliases below are modeled identically to
// their camelCase forms so such a value is recognized rather than hidden in extraArgs and
// then re-emitted in both spellings on save (which yargs parses as an array — P47).
const VALUE_OPTIONS: Record<string, OptionSpec> = {
  '--config': { key: 'configFile', kind: 'string' },
  '-c': { key: 'configFile', kind: 'string' },
  '--c': { key: 'configFile', kind: 'string' },
  '--shell': { key: 'shell', kind: 'string' },
  '--allowedDir': { key: 'allowedDirectories', kind: 'array' },
  '--allowed-dir': { key: 'allowedDirectories', kind: 'array' },
  '--initialDir': { key: 'initialDir', kind: 'string' },
  '--initial-dir': { key: 'initialDir', kind: 'string' },
  '--commandTimeout': { key: 'commandTimeout', kind: 'number' },
  '--command-timeout': { key: 'commandTimeout', kind: 'number' },
  '--maxCommandLength': { key: 'maxCommandLength', kind: 'number' },
  '--max-command-length': { key: 'maxCommandLength', kind: 'number' },
  '--wslMountPoint': { key: 'wslMountPoint', kind: 'string' },
  '--wsl-mount-point': { key: 'wslMountPoint', kind: 'string' },
  '--blockedCommand': { key: 'blockedCommands', kind: 'array' },
  '--blocked-command': { key: 'blockedCommands', kind: 'array' },
  '--blockedArgument': { key: 'blockedArguments', kind: 'array' },
  '--blocked-argument': { key: 'blockedArguments', kind: 'array' },
  '--blockedOperator': { key: 'blockedOperators', kind: 'array' },
  '--blocked-operator': { key: 'blockedOperators', kind: 'array' },
  '--maxOutputLines': { key: 'maxOutputLines', kind: 'number' },
  '--max-output-lines': { key: 'maxOutputLines', kind: 'number' },
  '--maxReturnLines': { key: 'maxReturnLines', kind: 'number' },
  '--max-return-lines': { key: 'maxReturnLines', kind: 'number' },
  '--logDirectory': { key: 'logDirectory', kind: 'string' },
  '--log-directory': { key: 'logDirectory', kind: 'string' },
  '--transport': { key: 'transportMode', kind: 'string' },
  '--http-host': { key: 'transportHost', kind: 'string' },
  '--sse-host': { key: 'transportHost', kind: 'string' },
  '--http-port': { key: 'transportPort', kind: 'number' },
  '--sse-port': { key: 'transportPort', kind: 'number' },
  '--http-allowed-origins': { key: 'transportAllowedOrigins', kind: 'csv' },
  '--sse-allowed-origins': { key: 'transportAllowedOrigins', kind: 'csv' },
};

// Boolean / tri-state / safety flags the forward builder emits with no value. Shared by
// parseServerArgs (which models them) and isRecognizedServerFlag (the suffix detector).
// The kebab-case spellings are yargs camel-case-expansion aliases of the camelCase
// options, accepted just like their camelCase forms (P47).
const BOOLEAN_FLAGS = new Set<string>([
  '--allowAllDirs',
  '--allow-all-dirs',
  '--no-allowAllDirs',
  '--no-allow-all-dirs',
  '--debug',
  '--no-debug',
  '--yolo',
  '--no-yolo',
  '--unsafe',
  '--no-unsafe',
  '--enableTruncation',
  '--no-enableTruncation',
  '--enable-truncation',
  '--no-enable-truncation',
  '--enableLogResources',
  '--no-enableLogResources',
  '--enable-log-resources',
  '--no-enable-log-resources',
]);

// The value-option flags that select/override transport. For a stdio entry the
// authoritative `type` field — not a flag in the args — sets transportMode, so these
// must NOT be consumed when parsing a stdio entry's args; otherwise a stray
// `--transport http` (or `--http-port`) in a stdio entry flips the type and deletes the
// launcher on save (P30).
const TRANSPORT_FLAGS = new Set<string>([
  '--transport',
  '--http-host',
  '--sse-host',
  '--http-port',
  '--sse-port',
  '--http-allowed-origins',
  '--sse-allowed-origins',
]);

/** Options for {@link parseServerArgs}. */
export interface ParseServerArgsOptions {
  /**
   * When true, transport flags (`--transport`, `--http-*`, `--sse-*`) are NOT consumed
   * and instead fall through to `extraArgs` verbatim. Set when parsing a stdio entry,
   * whose `type` is authoritative and must not be overridden by a transport flag in its
   * args (P30).
   */
  stdio?: boolean;
}

/**
 * Whether a bare flag token (no `=`) is one the form models — a recognized value-option
 * or a recognized boolean/tri-state. Used by the suffix detector to know when the
 * modeled-flags portion of the run has begun, so unknown `--flag value` pairs AFTER it
 * are treated as extraArgs rather than launcher positionals (P42).
 */
function isRecognizedServerFlag(token: string): boolean {
  if (token in VALUE_OPTIONS || BOOLEAN_FLAGS.has(token)) {
    return true;
  }
  const eq = token.indexOf('=');
  return eq > 0 && token.startsWith('-') && token.slice(0, eq) in VALUE_OPTIONS;
}

/**
 * Whether `tokens` parse cleanly as a run of wcli0 server flags — the shape the forward
 * builder emits as the suffix after a launcher's own args. Every token must be a flag
 * (a recognized value-option consuming the next token as its value, an attached
 * `--opt=value`, a recognized boolean/tri-state, or any other `--flag` that round-trips
 * as an extraArg); a bare non-flag token that is not the value of a recognized
 * value-option is an "orphan" and disqualifies the run. Used to find where the wcli0
 * flags begin so launcher options that collide with wcli0 flag names stay in the launcher
 * portion (see {@link serverFlagSuffixStart}).
 *
 * When `requireModeled` is true the run must contain at least one MODELED wcli0 flag to
 * qualify: an unknown-only run such as `--verbose` is then NOT a server-flag suffix and is
 * left in the launcher portion. This guards a non-wcli0 wrapper whose own trailing option
 * follows a positional (`wrapper target --verbose`) — without evidence of a modeled flag the
 * suffix is the wrapper's, not wcli0's, so moving it into extraArgs would reorder it after the
 * generated server flags on save (`target --shell cmd --verbose`) and change the invocation
 * (P56). For the wcli0 binary itself (the index-0 case) `requireModeled` stays false: its args
 * really are wcli0's, so an unknown-only run is a legitimate extraArg.
 */
function isPureServerFlagRun(tokens: string[], requireModeled = false): boolean {
  let seenModeled = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '--') {
      return false; // options separator — positionals follow, not a pure server-flag run
    }
    if (!t.startsWith('-')) {
      return false; // orphan bare token — not a flag and not consumed as a value
    }
    const eq = t.indexOf('=');
    if (eq > 0) {
      // Attached `--opt=value` / `-c=value` (recognized modeled or an extraArg) — self-contained.
      if (isRecognizedServerFlag(t)) {
        seenModeled = true;
      }
      continue;
    }
    if (t in VALUE_OPTIONS) {
      if (i + 1 >= tokens.length) {
        return false; // a value-option with no value cannot be a clean server flag
      }
      seenModeled = true;
      i++; // consume the value
      continue;
    }
    if (BOOLEAN_FLAGS.has(t)) {
      seenModeled = true; // a recognized boolean/tri-state modeled flag
      continue;
    }
    // Any other bare `--flag` round-trips as an extraArg. Once the modeled portion has
    // begun, it may carry a space-separated value; consume that value so a run of
    // `--unknown value` pairs in the suffix stays pure (P42, generalizing the P24 trailing
    // rule to any number of pairs). Before any modeled flag the following bare token is a
    // launcher positional and must NOT be consumed — it disqualifies the run via the orphan
    // check above, keeping wrapper options/positionals in the launcher portion (P15/P17).
    if (
      seenModeled &&
      i + 1 < tokens.length &&
      !tokens[i + 1].startsWith('-') &&
      tokens[i + 1] !== '--'
    ) {
      i++; // consume this extraArg's value
    }
  }
  // A pure flag run qualifies unconditionally, except when the caller demands evidence of a
  // modeled wcli0 flag (a wrapper scan): an unknown-only run is then not a server-flag suffix
  // and stays in the launcher portion (P56).
  return requireModeled ? seenModeled : true;
}

/**
 * The index where the wcli0 server-flag suffix begins in a launcher's full arg list. The
 * forward builder emits `[...launcherArgs, ...serverFlags]`, so the server flags are a
 * contiguous suffix: return the smallest index whose remaining tokens form a pure
 * server-flag run starting with a flag. Everything before it is the launcher's own args.
 * Defaults to `args.length` (no server flags). Scanning for the longest such suffix keeps
 * launcher options whose names collide with wcli0 flags (a wrapper's `--config`, node's
 * `--inspect`) in the launcher portion (P15).
 *
 * `allowIndexZero` is true only when the command IS the wcli0 binary, so an index-0 run
 * really is server flags. For a non-wcli0 (wrapper) command an index-0 flag run is
 * ambiguous — `mywrapper --transport fast` is the wrapper's own option, not a wcli0 flag
 * (P-wrapperflags) — so scanning starts at index 1: the leading token stays in the
 * launcher portion and the scan still finds a LATER modeled-flag suffix, e.g. the
 * `--shell` in `wrapper --no-cache --shell bash`, instead of stranding it (P43).
 *
 * A wrapper scan additionally requires the suffix to contain a modeled wcli0 flag
 * (`requireModeled`), so an unknown-only run such as the wrapper's own `--verbose` in
 * `wrapper target --verbose` is NOT mistaken for a server-flag suffix and stays in the
 * launcher portion (P56). The wcli0 binary itself (allowIndexZero) does not require this: its
 * args are genuinely wcli0's, including unknown-only extraArgs.
 */
function serverFlagSuffixStart(args: string[], allowIndexZero: boolean): number {
  for (let i = allowIndexZero ? 0 : 1; i < args.length; i++) {
    if (args[i].startsWith('-') && isPureServerFlagRun(args.slice(i), !allowIndexZero)) {
      return i;
    }
  }
  return args.length;
}

/**
 * Whether a custom launch `command` is the wcli0 binary itself (so its args are wcli0
 * server flags rather than a wrapper's own options). Matched by basename, tolerating a
 * directory prefix and a `.js`/`.cjs`/`.mjs`/`.cmd`/`.bat`/`.exe` suffix. Used to decide
 * whether a server-flag run starting at arg index 0 can be trusted (P-wrapperflags).
 */
function isWcli0Command(command: string): boolean {
  const base = command.trim().replace(/\\/g, '/').split('/').pop() ?? '';
  return /^wcli0(\.(js|cjs|mjs|cmd|bat|exe))?$/i.test(base);
}

/**
 * The config-file string yargs derives from a single-dash bundle's remainder after the `c`
 * alias (the part after `c` in `-c<remainder>`), or `undefined` when yargs would NOT read it
 * as the config string. Verified against yargs-parser: it attaches the remainder as the value
 * only when the remainder is fully numeric (`-c123`, `-c-5`, `-c5.5`) or when its first
 * character is a non-word, non-dot character with at least one more character following
 * (`-c/etc/x.json`, `-c~/x.json`, `-c\\srv\share`). A word-character start (`-cfoo`, `-cX`,
 * even `-cC:/x.json`) makes yargs split the remainder into separate short boolean flags so
 * `config` is empty; a leading `.` triggers dot-notation object parsing (`-c.foo` =>
 * `config={foo:true}`); and a lone non-word char (`-c/`) is also read as a boolean. In every
 * such case `config` is NOT the literal remainder, so the bundle must round-trip verbatim
 * rather than fabricate a config path (P62).
 */
function yargsBundleConfigValue(remainder: string): string | undefined {
  if (/^-?\d+(\.\d*)?(e-?\d+)?$/.test(remainder)) {
    return remainder;
  }
  if (remainder.length >= 2 && /\W/.test(remainder[0]) && remainder[0] !== '.') {
    return remainder;
  }
  return undefined;
}

/**
 * Reverse of {@link buildServerArgs}: parse a wcli0 flag list back into the subset
 * of settings the form models, plus the leftover (unrecognized) flags. Accepts both
 * `--opt value` and `--opt=value` forms and the boolean/tri-state/safety flags the
 * forward builder emits. Anything unrecognized is preserved verbatim in `extraArgs`
 * so a save round-trips it rather than silently dropping it.
 */
export function parseServerArgs(
  args: string[],
  opts: ParseServerArgsOptions = {},
): {
  settings: Partial<Wcli0Settings>;
  extraArgs: string[];
} {
  const out: Partial<Wcli0Settings> = {};
  const extraArgs: string[] = [];
  const arrays: Partial<Record<keyof Wcli0Settings, string[]>> = {};

  // Look up a value-option, honoring the stdio exclusion: a stdio entry's authoritative
  // `type` sets transportMode, so a transport flag in its args is NOT modeled and falls
  // through to extraArgs verbatim (P30).
  const optionFor = (flag: string): OptionSpec | undefined => {
    const spec = VALUE_OPTIONS[flag];
    if (spec && opts.stdio && TRANSPORT_FLAGS.has(flag)) {
      return undefined;
    }
    return spec;
  };

  const pushArray = (key: keyof Wcli0Settings, value: string) => {
    const list = (arrays[key] ??= []);
    list.push(value);
  };
  const applyValue = (spec: OptionSpec, value: string) => {
    switch (spec.kind) {
      case 'array':
        pushArray(spec.key, value);
        break;
      case 'csv':
        (out as Record<string, unknown>)[spec.key] = value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case 'number': {
        const n = Number(value);
        (out as Record<string, unknown>)[spec.key] = Number.isFinite(n) ? n : value;
        break;
      }
      default:
        (out as Record<string, unknown>)[spec.key] = value;
    }
  };
  // Whether a numeric option's value should be preserved verbatim in extraArgs rather than
  // modeled into the typed field. An unparseable value would poison the typed field and then
  // block every save (P34). A log limit (maxReturnLines / maxOutputLines) the typed field
  // cannot faithfully re-emit — finite but outside the config-file bound the forward builder
  // and validateLaunchSpec enforce (1..10000, integer for maxReturnLines) — is also diverted:
  // the server still applies any such CLI value > 0 via applyCliLogging (no re-validation), so
  // a hand-authored `--maxReturnLines 50000` or `--maxOutputLines 0` must round-trip rather
  // than strand the save (maxReturnLines has no form control, so it is otherwise unfixable). A
  // non-positive commandTimeout / maxCommandLength is diverted too: the server simply ignores
  // such a value and runs on its default (applyCliShellAndAllowedDirs never lowers the limit
  // for it), but the form's number input rejects a negative and validateLaunchSpec blocks any
  // value <= 0, so modeling a hand-authored `--commandTimeout 0` / `--maxCommandLength=-1`
  // would strand every save. Preserving it lets an unrelated edit round-trip the entry (P64).
  // A value the field CAN hold is modeled normally so the form stays editable (P59).
  const divertNumber = (spec: OptionSpec, raw: string): boolean => {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      return true;
    }
    if (spec.key === 'maxReturnLines') {
      return !isValidLogLimit(n);
    }
    if (spec.key === 'maxOutputLines') {
      return !isValidMaxOutputLines(n);
    }
    if (spec.key === 'commandTimeout' || spec.key === 'maxCommandLength') {
      return n <= 0;
    }
    return false;
  };

  // yargs declares allowAllDirs/debug/yolo/unsafe/enableTruncation/enableLogResources as
  // `type:'boolean'` (src/index.ts), and a boolean option consumes a following bare
  // `true`/`false` token as its value (verified against yargs: `--debug false` => debug=false;
  // any OTHER following token is left as a positional and the flag reads true). Model that
  // explicit value rather than recording every bare flag as true and stranding the `false` in
  // extraArgs, which would make the form show the opposite of what the server runs and let the
  // preserved value defeat a later edit (P68). The negated `--no-*` spellings already mean false
  // and do not consume a following token, so they are matched verbatim below.
  const boolValueFollows = (i: number): boolean =>
    args[i + 1] === 'true' || args[i + 1] === 'false';
  const boolValueAt = (i: number): boolean => args[i + 1] !== 'false';

  // A hand-authored entry that sets BOTH --yolo and --unsafe is rejected by the server, which
  // declares them mutually exclusive (.conflicts('unsafe','yolo') in src/index.ts). yargs' check
  // fails whenever both keys are DEFINED, regardless of their boolean value — and yargs-parser
  // defines the key for every spelling: `--yolo`, `--yolo true/false`, `--no-yolo`, and the
  // attached `--yolo=true/false`. So pairing --unsafe with ANY yolo spelling (even `--yolo false`
  // or `--no-yolo`) is rejected, not just the both-positive case (verified against yargs). Detect
  // the conflict whenever both families are present in any form; the loop then preserves every
  // safety-family token verbatim in extraArgs and leaves safetyMode at its default. Collapsing the
  // pair to one mode would let a no-op save rewrite a previously-failing entry into a valid launch
  // the user never chose (P70/P71).
  const yoloPresent = args.some(
    (t) => t === '--yolo' || t === '--no-yolo' || t.startsWith('--yolo='),
  );
  const unsafePresent = args.some(
    (t) => t === '--unsafe' || t === '--no-unsafe' || t.startsWith('--unsafe='),
  );
  const safetyConflict = yoloPresent && unsafePresent;

  // Model a yargs attached boolean assignment (`--debug=true`, `--enableTruncation=false`, the
  // safety flags, ...) the same way the bare spellings below are modeled, so the form reflects
  // the real setting and a later edit is not defeated by a stale attached value surviving in
  // extraArgs (yargs parses `--debug --debug=false` as debug=false, last-wins) (P72). Returns
  // false when the flag is not a known boolean (the caller then preserves it verbatim) — including
  // a safety flag under a conflict, which must round-trip unchanged to keep the server-rejected
  // state intact (P71).
  const applyAttachedBoolean = (flag: string, on: boolean): boolean => {
    switch (flag) {
      case '--allowAllDirs':
      case '--allow-all-dirs':
        out.allowAllDirs = on;
        return true;
      case '--debug':
        out.debug = on;
        return true;
      case '--enableTruncation':
      case '--enable-truncation':
        out.enableTruncation = (on ? 'enabled' : 'disabled') as TriState;
        return true;
      case '--enableLogResources':
      case '--enable-log-resources':
        out.enableLogResources = (on ? 'enabled' : 'disabled') as TriState;
        return true;
      case '--yolo':
      case '--unsafe':
        if (safetyConflict) {
          return false; // preserve verbatim — the conflicting entry is server-rejected (P71)
        }
        if (on) {
          out.safetyMode = flag === '--yolo' ? 'yolo' : 'unsafe';
        }
        return true; // `--yolo=false` / `--unsafe=false` leaves the default safe mode
      default:
        return false;
    }
  };

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    // Boolean / tri-state / safety flags. Each positive spelling accepts both the camelCase
    // form and its yargs kebab-case alias (P47), and consumes a following explicit
    // `true`/`false` value the way yargs does (P68).
    if (token === '--allowAllDirs' || token === '--allow-all-dirs') {
      out.allowAllDirs = boolValueAt(i);
      if (boolValueFollows(i)) {
        i++;
      }
      continue;
    }
    // yargs accepts a negated boolean (`--no-X`) for every boolean option the server declares
    // (allowAllDirs / debug / yolo / unsafe — see src/index.ts). Consume and model these here
    // rather than letting them fall through to extraArgs: a preserved `--no-debug` survives a
    // save and yargs then parses `--debug --no-debug` as debug=false, silently discarding the
    // user's form edit (P63).
    if (token === '--no-allowAllDirs' || token === '--no-allow-all-dirs') {
      out.allowAllDirs = false;
      continue;
    }
    if (token === '--debug') {
      out.debug = boolValueAt(i);
      if (boolValueFollows(i)) {
        i++;
      }
      continue;
    }
    if (token === '--no-debug') {
      out.debug = false;
      continue;
    }
    // --yolo / --unsafe select the safety mode. Under a conflict (both safety keys defined in any
    // form — see safetyConflict) the server rejects the entry, so the flag is preserved verbatim
    // in extraArgs rather than collapsed to one mode that silently turns the rejected entry into a
    // valid launch (P70/P71); the following true/false (if any) falls through to extraArgs on the
    // next iteration, keeping the original tokens intact. With no conflict an explicit `--yolo
    // false` / `--unsafe false` is not a positive (it leaves the default mode) and consumes its
    // value.
    if (token === '--yolo' || token === '--unsafe') {
      if (safetyConflict) {
        extraArgs.push(token);
        continue;
      }
      const on = boolValueAt(i);
      if (boolValueFollows(i)) {
        i++;
      }
      if (on) {
        out.safetyMode = token === '--yolo' ? 'yolo' : 'unsafe';
      }
      continue;
    }
    // Under a safety conflict (both yolo and unsafe keys defined) the entry is server-rejected, so
    // a negation must round-trip verbatim alongside the positive flags rather than be modeled or
    // dropped — otherwise a no-op save of `--no-yolo --unsafe` collapses to a valid `--unsafe`
    // launch (P71).
    if (safetyConflict && (token === '--no-yolo' || token === '--no-unsafe')) {
      extraArgs.push(token);
      continue;
    }
    // A negated safety flag clears only the matching mode. With no conflict only one family is
    // present, so a `--no-yolo` simply mirrors yargs' last-wins (`--yolo --no-yolo` => safe)
    // without clobbering an unrelated selection. With no positive seen, safetyMode stays default.
    if (token === '--no-yolo' && out.safetyMode === 'yolo') {
      out.safetyMode = 'safe';
      continue;
    }
    if (token === '--no-unsafe' && out.safetyMode === 'unsafe') {
      out.safetyMode = 'safe';
      continue;
    }
    if (token === '--no-yolo' || token === '--no-unsafe') {
      continue;
    }
    if (token === '--enableTruncation' || token === '--enable-truncation') {
      out.enableTruncation = (boolValueAt(i) ? 'enabled' : 'disabled') as TriState;
      if (boolValueFollows(i)) {
        i++;
      }
      continue;
    }
    if (token === '--no-enableTruncation' || token === '--no-enable-truncation') {
      out.enableTruncation = 'disabled' as TriState;
      continue;
    }
    if (token === '--enableLogResources' || token === '--enable-log-resources') {
      out.enableLogResources = (boolValueAt(i) ? 'enabled' : 'disabled') as TriState;
      if (boolValueFollows(i)) {
        i++;
      }
      continue;
    }
    if (token === '--no-enableLogResources' || token === '--no-enable-log-resources') {
      out.enableLogResources = 'disabled' as TriState;
      continue;
    }
    // Attached `--opt=value` / `-c=value` form (any single-or-double dash flag with `=`).
    const eq = token.indexOf('=');
    if (eq > 0 && token.startsWith('-')) {
      const flag = token.slice(0, eq);
      const value = token.slice(eq + 1);
      // A yargs attached boolean assignment (`--debug=true`, `--enableTruncation=false`, ...):
      // model it so the form reflects the real setting and a later edit is not defeated by a
      // stale value preserved in extraArgs (P72). Only the literal true/false yargs round-trips
      // are modeled; any other attached value (or a safety flag under a conflict) falls through
      // and is preserved verbatim below.
      if (value === 'true' || value === 'false') {
        if (applyAttachedBoolean(flag, value === 'true')) {
          continue;
        }
      }
      const spec = optionFor(flag);
      if (spec) {
        const v = value;
        if (spec.kind === 'number' && divertNumber(spec, v)) {
          // A numeric value the typed field cannot faithfully hold: an unparseable value
          // (P34) or an out-of-range log limit (P59). Preserve it verbatim so it round-trips
          // instead of poisoning the field and blocking every save.
          extraArgs.push(token);
          continue;
        }
        applyValue(spec, v);
        continue;
      }
      extraArgs.push(token);
      continue;
    }
    // Short-option bundle carrying the `c` config alias without `=` (yargs reads the `c`
    // alias anywhere in a single-dash bundle as --config): `-c/other.json`, `-cX`,
    // `-xc/other.json`, `-dc /other.json`. Mirror argsBuilder.stripConfigArgs so a bundled
    // config pin is modeled as configFile instead of being hidden in extraArgs, where the
    // Config file field and loadability checks would miss it (P45). The `--config`/`--c`
    // long forms and every `=` form are handled by the value-option paths above/below.
    if (token.length > 1 && token[0] === '-' && token[1] !== '-' && token.includes('c')) {
      const attached = token.slice(token.indexOf('c') + 1);
      if (attached) {
        const config = yargsBundleConfigValue(attached);
        if (config !== undefined) {
          out.configFile = config; // value attached to the bundle, e.g. `-c/other.json`
          continue;
        }
        // yargs would NOT read this remainder as the config string (`-cfoo` parses as the
        // separate short flags `-c -f -o -o`, leaving config empty; `-c.foo` as a
        // dot-notation object). Modeling it as configFile would fabricate a path the server
        // never used and let a no-op save emit a spurious `--config <value>`. Preserve the
        // token verbatim so it round-trips instead (P62).
        extraArgs.push(token);
        continue;
      }
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        out.configFile = args[i + 1]; // `c` is the bundle's last char; the next token is its value
        i++;
        continue;
      }
      // `c` is the bundle's last char with no following value (the next token is another
      // flag, or there is none): yargs would read config as empty. Preserve the token
      // verbatim so it round-trips rather than fabricating a value (mirrors P44/P86).
      extraArgs.push(token);
      continue;
    }
    // Space-separated `--opt value` form. Consume the next token as the value ONLY when it
    // is a real value, not another option: yargs parses e.g. `--blockedCommand --debug` as
    // an empty `blockedCommand` plus a still-applied `--debug`, so swallowing the flag would
    // drop it and rewrite the option with a bogus value on save (P44, mirroring
    // stripConfigArgs). A value-option whose next token is a flag is preserved verbatim in
    // extraArgs and the flag is parsed on the next iteration.
    const spec = optionFor(token);
    if (spec && i + 1 < args.length && !args[i + 1].startsWith('-')) {
      if (spec.kind === 'number' && divertNumber(spec, args[i + 1])) {
        // A numeric value the typed field cannot faithfully hold (unparseable, P34; or an
        // out-of-range log limit, P59): don't consume it. The flag is preserved here, and the
        // following value token falls through to extraArgs on the next iteration.
        extraArgs.push(token);
        continue;
      }
      applyValue(spec, args[i + 1]);
      i++;
      continue;
    }
    extraArgs.push(token);
  }

  for (const [key, list] of Object.entries(arrays)) {
    (out as Record<string, unknown>)[key] = list;
  }
  return { settings: out, extraArgs };
}

/** Whether a value is a plain JSON object (not null, not an array). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Coerce an unknown value to a trimmed string, or '' when not a string. */
function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Coerce an unknown value to a string-keyed string map (for env). */
function asStringMap(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string') {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Reverse-map a `.vscode/mcp.json` `servers.wcli0` entry into a complete
 * {@link Wcli0Settings} the form can render, plus notes for parts that cannot be
 * fully represented. The entry is the inverse of what {@link buildLaunchSpec} emits:
 * `type` -> transport mode; for stdio the `command`/`args` give the launch method
 * and server flags; `cwd`/`env` give the launch directory and environment. For
 * http/sse the `url` gives host/port. Unmodeled flags survive in `extraArgs`.
 */
export function parseMcpEntry(entry: Record<string, unknown>): ParsedEntry {
  const s = defaultSettings();
  const notes: string[] = [];
  // Match `type` case-insensitively so an entry written as `HTTP`/`Sse` is modeled as
  // http/sse rather than silently coerced to stdio (P31).
  const rawType = asString(entry.type);
  const type = rawType ? rawType.toLowerCase() : 'stdio';

  if (type === 'http' || type === 'sse') {
    s.transportMode = type as TransportMode;
    const url = asString(entry.url);
    // Always retain the verbatim URL so a save round-trips it unchanged, even when the
    // host/port fields cannot fully represent it: a custom scheme/path (P5), a URL with
    // no explicit port (P8), or a socket/named-pipe URL (P10).
    if (url) {
      s.transportUrl = url;
    }
    const canonicalPath = type === 'http' ? 'mcp' : 'sse';
    const parsed = parseHttpUrl(url);
    if (parsed && parsed.port !== undefined && parsed.port >= 1 && parsed.port <= 65535) {
      // Fully modeled: an explicit host AND usable port the form's fields can edit.
      s.transportHost = parsed.host;
      s.transportPort = parsed.port;
      if (!isCanonicalTransportUrl(url, type, parsed)) {
        notes.push(
          `The ${type} URL "${url}" uses a custom scheme or path. It is preserved as-is ` +
            'when you save, but editing the host or port here rewrites it to the ' +
            `http://host:port/${canonicalPath} form.`,
        );
      }
    } else if (parsed && parsed.port === undefined) {
      // Decomposes to a host but no explicit port (a default-port URL such as
      // https://host/path). Show the host, but keep the form's default port so the
      // number field stays valid (min=1) rather than rendering an invalid 0 (P8); the
      // verbatim URL above round-trips, and a host edit rebuilds the canonical form.
      s.transportHost = parsed.host;
      notes.push(
        `The ${type} URL "${url}" does not specify a port (it uses the scheme default). ` +
          'It is preserved as-is when you save; editing the host or port rewrites it to the ' +
          `http://host:port/${canonicalPath} form.`,
      );
    } else if (parsed) {
      // An explicitly-written but unusable port: a number outside 1..65535 (`:0`, or one above
      // 65535 such as `:70000`), or a non-numeric/malformed one (`:abc`, `:-1`, reported as NaN
      // by parseHttpUrl, P66). The port field cannot hold any of these (it is constrained to
      // 1..65535), so show the host and keep the form's default port. Unlike a default-port URL
      // the verbatim URL is NOT preserved on save (preservedFileUrl requires the port to be
      // unchanged, and an out-of-range or NaN value can never match the default), so saving
      // rebuilds the canonical http://host:port form from the port field rather than loading an
      // invalid port that strands the form's number input and blocks unrelated saves
      // (P-port0/P-portmax/P66).
      s.transportHost = parsed.host;
      const portText = Number.isNaN(parsed.port)
        ? 'has a non-numeric port, which is not a usable port'
        : `specifies port ${parsed.port}, which is not a usable port`;
      notes.push(
        `The ${type} URL "${url}" ${portText} ` +
          '(it must be an integer between 1 and 65535). Saving rewrites it to the ' +
          `http://host:port/${canonicalPath} form using the port field below.`,
      );
    } else if (url) {
      // Cannot be decomposed into host/port at all (a socket or named-pipe URL such as
      // unix:///tmp/server.sock#/mcp). Keep the form's defaults and preserve the URL
      // verbatim so an unrelated save does not rewrite it to http://host:port (P10).
      notes.push(
        `The ${type} URL "${url}" cannot be represented by the host and port fields. ` +
          'It is preserved as-is when you save; edit .vscode/mcp.json directly to change it.',
      );
    }
    return { settings: s, notes };
  }

  // stdio: command + args carry the launch method and server flags.
  s.transportMode = 'stdio';
  const command = asString(entry.command);
  // Coerce each arg like node's spawn would (String()) rather than dropping non-strings
  // to '', so a numeric arg such as 9229 round-trips as "9229" instead of being corrupted
  // to an empty string (P33).
  const args = Array.isArray(entry.args)
    ? entry.args.map((a) => (typeof a === 'string' ? a : String(a)))
    : [];
  let serverArgs: string[];
  // The npx/node fast paths only apply when the launcher has no options before the
  // package/script — `npx -y <pkg>` or `node <script>`. An entry like
  // `npx --package=x -- wcli0 ...` (P17) or `node --inspect dist/index.js ...` (P14)
  // carries launcher options the form cannot model as a package/script, so it falls
  // through to custom parsing, where the launcher args round-trip verbatim.
  const npxPackageAt = args[0] === '-y' ? 1 : 0;
  const isPlainNpx =
    command === 'npx' && (args[npxPackageAt] === undefined || !args[npxPackageAt].startsWith('-'));
  const isPlainNode = command === 'node' && args[0] !== undefined && !args[0].startsWith('-');
  if (isPlainNpx) {
    s.launchMethod = 'npx';
    // Forward emits ['-y', packageSpec, ...flags]; tolerate a missing -y.
    if (args[0] === '-y') {
      s.packageSpec = args[1] ?? '';
      serverArgs = args.slice(2);
    } else {
      s.packageSpec = args[0] ?? '';
      serverArgs = args.slice(1);
    }
  } else if (isPlainNode) {
    s.launchMethod = 'node';
    s.nodeScriptPath = args[0] ?? '';
    serverArgs = args.slice(1);
  } else {
    s.launchMethod = 'custom';
    s.customCommand = command;
    // Leading tokens are the custom command's own args; the wcli0 server flags are the
    // contiguous suffix the forward builder appends (`[...customArgs, ...serverFlags]`).
    // Split at the START of the longest pure server-flag suffix, not the first dashed
    // token, so a launcher option that collides with a wcli0 flag name (a wrapper's own
    // `--config`/`--transport`, node's `--inspect`, uvx's `--from`) stays in customArgs
    // and a load/save round-trip preserves the command order (P15).
    //
    // Only trust an index-0 boundary when the command IS the wcli0 binary (its args really
    // are server flags). For a wrapper command an index-0 flag run is ambiguous —
    // `mywrapper --transport fast` is the wrapper's own option, not wcli0's — so the scan
    // skips index 0 and keeps looking for a later modeled-flag suffix, so the `--shell` in
    // `wrapper --no-cache --shell bash` is still recovered instead of stranded in customArgs
    // (P-wrapperflags / P43).
    const start = serverFlagSuffixStart(args, isWcli0Command(command));
    s.customArgs = args.slice(0, start);
    serverArgs = args.slice(start);
  }

  // Parse the server flags as stdio: a transport flag (`--transport`, `--http-*`, `--sse-*`)
  // in a stdio entry's args must NOT override the authoritative `type` — it falls through
  // to extraArgs verbatim instead of flipping transportMode and deleting the launcher on
  // save (P30).
  const { settings: parsed, extraArgs } = parseServerArgs(serverArgs, { stdio: true });
  Object.assign(s, parsed);
  s.extraArgs = extraArgs;
  s.cwd = asString(entry.cwd);
  s.env = asStringMap(entry.env);

  if (rawType && type !== 'stdio' && type !== 'http' && type !== 'sse') {
    // An entry whose `type` the form cannot model (e.g. "websocket", or a future
    // transport). It is parsed as stdio for the editable fields, but the original type is
    // not one the form offers; surface it so the user knows a save will normalize it (P31).
    notes.push(
      `The entry type "${rawType}" is not stdio/http/sse and cannot be fully modeled here. ` +
        'Edit .vscode/mcp.json directly to change the transport type.',
    );
  }
  if (s.configFile.trim()) {
    notes.push(
      'This entry references a config file via --config. Per-shell settings and ' +
        'environment profiles inside that file are not editable here; edit the referenced ' +
        'config file directly.',
    );
  }
  return { settings: s, notes };
}

/**
 * Parse host/port out of an http/sse URL; returns undefined when unparseable. An OMITTED
 * port is reported as `port: undefined` (the URL relies on the scheme default), distinct
 * from an explicitly-written port — including an unusable `:0`, reported as `port: 0`. The
 * two must not be conflated: a `:0` URL is a real explicit port, not a default-port URL, so
 * it must not be preserved verbatim in a way that ignores a port-field edit (P-port0). An
 * explicit but NON-NUMERIC port (`:abc`, `:-1`) is reported as `port: NaN` — also distinct
 * from an omitted port — so the caller rebuilds the canonical URL from the port field rather
 * than treating the malformed URL as a default-port one that a port edit cannot fix (P66).
 */
export function parseHttpUrl(url: string): { host: string; port: number | undefined } | undefined {
  if (!url) {
    return undefined;
  }
  // Match `scheme://[userinfo@]host[:port]/...`, where host may be a bracketed IPv6
  // literal. The optional `userinfo@` is skipped so credentials (`user:pass@host:port`)
  // do not get mistaken for the host and an explicit port behind them is still read (P21).
  // The port group captures everything between `:` and the path/query/fragment so an explicit
  // non-numeric port is seen (and rejected below) rather than left out of the match — which
  // would make the URL look like it omitted its port entirely (P66).
  const m = /^[a-z]+:\/\/(?:[^@/]*@)?(\[[^\]]+\]|[^:/]+)(?::([^/?#]*))?/i.exec(url);
  if (!m) {
    return undefined;
  }
  const host = m[1];
  // No `:` after the host -> omitted port (scheme default). An explicit digit-only port -> its
  // number (range-checked by the caller). An explicit but malformed port (`:abc`, `:-1`, or an
  // empty `:`) -> NaN, flagged as an unusable explicit port the port field must rebuild.
  let port: number | undefined;
  if (m[2] === undefined) {
    port = undefined;
  } else if (/^\d+$/.test(m[2])) {
    port = Number(m[2]);
  } else {
    port = NaN;
  }
  return { host, port };
}

/**
 * Whether `url` is exactly the shape the forward builder emits for an http/sse
 * entry: `http://<host>:<port>/<mcp|sse>` with an explicit port and no userinfo,
 * query, or fragment. A canonical URL round-trips losslessly through host/port, so
 * it needs no preservation note; anything else does (P5).
 */
function isCanonicalTransportUrl(
  url: string,
  type: 'http' | 'sse',
  parsed: { host: string; port: number | undefined },
): boolean {
  const path = type === 'http' ? '/mcp' : '/sse';
  return (
    parsed.port !== undefined &&
    parsed.port > 0 &&
    url === `http://${parsed.host}:${parsed.port}${path}`
  );
}
