import * as vscode from 'vscode';
import { isValidLogLimit, isValidMaxOutputLines } from './argsBuilder';
import { parseJsonc } from './commands';
import { defaultSettings, SHELL_NAMES, TransportMode, TriState, Wcli0Settings } from './settings';

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
 * Whether a flag token is one the form models as a wcli0 server flag — a recognized value-option,
 * a recognized boolean/tri-state, or an attached `--opt=value` form of either. Used by the suffix
 * detector to know when the modeled-flags portion of the run has begun, so unknown `--flag value`
 * pairs AFTER it are treated as extraArgs rather than launcher positionals (P42).
 *
 * When `stdio` is true the transport flags (`--transport`, `--http-*`, `--sse-*`) do NOT count as
 * modeled: a stdio entry's authoritative `type` sets the transport and those flags fall through to
 * extraArgs verbatim (P30), so they must not "prove" a wcli0 server suffix that would otherwise be
 * split out and reorder a wrapper's own options on save (P77).
 *
 * An attached boolean assignment (`--debug=true`, `--enableTruncation=false`, `--debug=0`) is
 * recognized just like its bare spelling, so a wrapper suffix carrying only such a flag is still
 * detected and the flag stays editable instead of being stranded in customArgs (P76). EVERY
 * attached value counts, not only the literal true/false spellings, matching the attached-boolean
 * modeling in {@link parseServerArgs}: yargs coerces any other value to false, so
 * `wrapper target --enableTruncation=0` really does disable truncation and the form must show it
 * rather than the server default (P94).
 *
 * A NEGATED spelling with an attached value is excluded: yargs applies `--name=value` before
 * boolean negation, so `--no-debug=false` defines an unrelated `no-debug` key rather than setting
 * `debug` (verified against yargs-parser). parseServerArgs preserves such a token verbatim, so
 * counting it as modeled evidence would split a wrapper's own trailing token into the server
 * suffix and let a later edit reorder the wrapper's invocation (P108).
 */
function isRecognizedServerFlag(token: string, stdio = false): boolean {
  const isModeledValueOption = (flag: string): boolean =>
    flag in VALUE_OPTIONS && !(stdio && TRANSPORT_FLAGS.has(flag));
  if (isModeledValueOption(token) || BOOLEAN_FLAGS.has(token)) {
    return true;
  }
  const eq = token.indexOf('=');
  if (eq > 0 && token.startsWith('-')) {
    const flag = token.slice(0, eq);
    if (isModeledValueOption(flag)) {
      return true;
    }
    return BOOLEAN_FLAGS.has(flag) && !flag.startsWith('--no-');
  }
  return false;
}

/**
 * Whether the token following a value option is consumed by yargs as that option's VALUE. Any
 * non-dash token is; so is a dash-prefixed token that looks like a negative number, which yargs
 * does NOT treat as a new option (verified against yargs-parser: `--commandTimeout -1` => -1 and
 * `--shell -1` => '-1', while `--shell -x` => '' plus a separate `-x` flag). Reading `-1` as a
 * flag hid a repeated option with a negative value from the duplicate pre-scan, so the pair was
 * modeled last-wins and the save changed the launch (P93). Mirrors argsBuilder's strippers.
 *
 * The accepted shapes are exactly the ones the installed parser consumes: an optional integer part
 * and at most one fractional part (`-1`, `-1.5`, `-.5`, `-0`, `-01`). Scientific notation and a
 * trailing dot are NOT consumed — yargs reads `--shell -1e2` as an empty shell plus the short
 * options `1` and `e` — so accepting them modeled a value the server never sees and let a save
 * rewrite the entry as `--shell=-1e2`, disabling every known shell (P102).
 */
function isOptionValueToken(next: string | undefined): boolean {
  return (
    next !== undefined && (!next.startsWith('-') || /^-(?:\d+(?:\.\d+)?|\.\d+)$/.test(next))
  );
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
function isPureServerFlagRun(tokens: string[], requireModeled = false, stdio = false): boolean {
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
      if (isRecognizedServerFlag(t, stdio)) {
        seenModeled = true;
      }
      continue;
    }
    if (t in VALUE_OPTIONS) {
      if (i + 1 >= tokens.length) {
        return false; // a value-option with no value cannot be a clean server flag
      }
      // A stdio entry's transport flags consume their value structurally but are NOT modeled
      // evidence (they fall through to extraArgs verbatim, P30); counting them would let a
      // transport-only suffix masquerade as wcli0's and reorder a wrapper's options on save (P77).
      if (!(stdio && TRANSPORT_FLAGS.has(t))) {
        seenModeled = true;
      }
      i++; // consume the value
      // An array option is GREEDY in yargs (greedy-arrays defaults to true), so every further
      // value token belongs to it too and is not an orphan that disqualifies the run (P99).
      if (VALUE_OPTIONS[t].kind === 'array') {
        while (isOptionValueToken(tokens[i + 1])) {
          i++;
        }
      }
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
 * Only ever used for a WRAPPER command; a direct wcli0 launch parses its whole arg list instead
 * (P105). An index-0 flag run is ambiguous for a wrapper — `mywrapper --transport fast` is the
 * wrapper's own option, not a wcli0 flag (P-wrapperflags) — so scanning starts at index 1: the
 * leading token stays in the launcher portion and the scan still finds a LATER modeled-flag
 * suffix, e.g. the `--shell` in `wrapper --no-cache --shell bash`, instead of stranding it (P43).
 *
 * The suffix must also contain a modeled wcli0 flag (`requireModeled` in the run check), so an
 * unknown-only run such as the wrapper's own `--verbose` in `wrapper target --verbose` is NOT
 * mistaken for a server-flag suffix and stays in the launcher portion (P56).
 *
 * The scan stops at a `--` options separator, because yargs treats everything after one as
 * positionals, so no server-flag suffix can begin there (P75). The single exception is a
 * pass-through separator that is PROVEN to be one: a wrapper whose separator is followed by the
 * wcli0 binary itself (`npx --package=wcli0 -- wcli0 --shell cmd`, P17). There the scan resumes
 * after that binary token, since the flags following it really are wcli0's. For any other
 * separator -- `node --inspect dist/index.js -- --debug`, a wrapper passing positionals to some
 * other program -- the remainder stays with the launcher, so a positional `--debug` is not modeled
 * as an active flag and a newly saved `--shell cmd` is not appended after a separator where the
 * server would never read it (P83). `stdio` is forwarded to the run check so a stdio entry's
 * transport flags do not count as modeled evidence (P77).
 */
function serverFlagSuffixStart(args: string[], stdio = false): number {
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--') {
      // An options separator: yargs treats every following token as a positional, so no
      // server-flag suffix can begin at or after it (P75). Stop -- unless this is a wrapper
      // separator with the wcli0 binary itself behind it, the one shape that PROVES a
      // pass-through (`npx --package=wcli0 -- wcli0 --shell cmd`, P17): there the scan resumes
      // after that binary token, whose own flags are genuinely wcli0's. Anything else (a generic
      // `node --inspect dist/index.js -- --debug`, a wrapper handing positionals to another
      // program) keeps its remainder in the launcher portion, so a positional is never modeled as
      // an active flag and a saved flag is never appended behind a separator the server ignores
      // (P83). A second `--` after the wrapped binary is that binary's own separator and stops
      // the scan, exactly as parseServerArgs stops at it for a direct wcli0 launch.
      const wrappedBinaryAt = args.findIndex((t, j) => j > i && isWcli0Command(t));
      if (wrappedBinaryAt === -1) {
        break;
      }
      i = wrappedBinaryAt; // resume scanning at the token AFTER the wrapped wcli0 binary
      continue;
    }
    if (args[i].startsWith('-') && isPureServerFlagRun(args.slice(i), true, stdio)) {
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
  // Indices in extraArgs of a recognized value option preserved with NO value token after it. The
  // builder re-emits extraArgs AFTER the modeled flags, so such a flag can end up next to a token
  // the entry kept apart from it and swallow it as its value; makeExtrasReorderSafe() below
  // rewrites those cases (P106/P109). Recorded here because only the parse knows the token had no
  // value: once the tokens sit side by side in extraArgs that fact is no longer visible.
  const valuelessOptionAt = new Set<number>();
  const preserveValueless = (token: string): void => {
    valuelessOptionAt.add(extraArgs.length);
    extraArgs.push(token);
  };
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

  // Whether a `--shell` value must be preserved verbatim instead of modeled. The form's shell
  // control is a fixed <select>, so the ONLY values it can hold are the five real shell names
  // (SHELL_NAMES) plus its own `all` sentinel. Anything else is unrepresentable:
  //   - `all` is an OMISSION sentinel here — buildServerArgs emits no `--shell` for it — but the
  //     server's `--shell all` is a shell NAME, loading only a module called "all" that does not
  //     exist, so the entry has NO usable shells. Modeling it as the sentinel let a no-op save
  //     drop the flag and re-enable every default shell (P96).
  //   - any other name (`fish`, `zsh`, `ALL`) cannot be selected at all: assigning it leaves the
  //     select on its empty/Inherit value, the form counts as changed, and a save drops `--shell`
  //     — again turning an entry the server matched to no shell into one running the defaults
  //     (P100).
  // Both are preserved verbatim instead, so the entry round-trips and the save changes nothing.
  const divertShellValue = (spec: OptionSpec, raw: string): boolean =>
    spec.key === 'shell' && !(SHELL_NAMES as readonly string[]).includes(raw);

  // Whether an option is a single-value (scalar) field rather than an accumulating array. yargs
  // parses a REPEATED scalar option as an array (`--config a --config b` => ['a','b'], `--shell cmd
  // --shell bash` => ['cmd','bash']), which a single-value form field cannot represent and which
  // the server often treats very differently from the last value. Array-kind options legitimately
  // repeat, so they are exempt from the duplicate handling below.
  const isScalarOption = (spec: OptionSpec): boolean => spec.kind !== 'array';

  // The scalar option keys that appear more than once in this arg list. A duplicated scalar is NOT
  // modeled last-wins (which would silently collapse `--config a --config b` to `b` on a no-op
  // save); instead every occurrence is preserved verbatim in extraArgs so the hand-authored entry
  // round-trips unchanged (P78). The count follows the modeling paths in the loop below — it honors
  // the stdio transport exclusion (optionFor), the `-c` config bundle, and stops at the `--`
  // separator (P74) — but deliberately counts a SYNTACTICALLY present occurrence even when its
  // value would be diverted from the typed field (an unparseable or out-of-range number, P34/P59).
  // yargs still turns such a repeat into an array (verified: `--commandTimeout bad
  // --commandTimeout 5` => ['bad', 5], which applyCliSecurityOverrides ignores because it is not a
  // number), so counting only the representable occurrence modeled the entry as a plain
  // `--commandTimeout 5` and let the builder strip the preserved malformed copy — changing a
  // launch that ran on the default timeout into one that applies 5 (P90).
  const duplicatedScalarKeys = ((): Set<keyof Wcli0Settings> => {
    const counts = new Map<keyof Wcli0Settings, number>();
    const bump = (key: keyof Wcli0Settings) => counts.set(key, (counts.get(key) ?? 0) + 1);
    for (let i = 0; i < args.length; i++) {
      const token = args[i];
      if (token === '--') {
        break; // options separator: the remainder is positional and is never parsed (P74)
      }
      const eq = token.indexOf('=');
      if (eq > 0 && token.startsWith('-')) {
        const spec = optionFor(token.slice(0, eq));
        if (spec && isScalarOption(spec)) {
          bump(spec.key); // counted even when divertNumber would keep the value out of the field
        }
        continue;
      }
      // `-c` short bundle carrying the config alias (mirrors the bundle path in the loop below).
      if (token.length > 1 && token[0] === '-' && token[1] !== '-' && token.includes('c')) {
        const attached = token.slice(token.indexOf('c') + 1);
        if (attached) {
          if (yargsBundleConfigValue(attached) !== undefined) {
            bump('configFile');
          }
        } else {
          // `c` is the bundle's last character: yargs defines config from the next token, or as
          // an empty string when none follows -- either way the key is present (P98).
          bump('configFile');
        }
        continue;
      }
      const spec = optionFor(token);
      if (spec && isScalarOption(spec)) {
        // Counted on PRESENCE for a string/csv option, because yargs defines the key even with no
        // value (verified: `--shell --debug --shell bash` => shell: ['', 'bash'], which is not a
        // usable shell name). Requiring a value token hid that occurrence, so only `bash` was
        // modeled, the preserved `--shell` was stripped when the field was emitted, and a no-op
        // save rewrote an entry with NO usable shell into one running commands through Bash (P98).
        // A NUMBER option is different: yargs DROPS a valueless one entirely (`--commandTimeout
        // --commandTimeout 5` => 5, no array), so counting it would preserve a pair the server
        // resolves to a single value and leave the form showing no timeout (P102). Values the
        // typed field cannot hold are still counted (P90).
        if (spec.kind !== 'number' || isOptionValueToken(args[i + 1])) {
          bump(spec.key);
        }
      }
    }
    const dups = new Set<keyof Wcli0Settings>();
    for (const [key, n] of counts) {
      if (n >= 2) {
        dups.add(key);
      }
    }
    return dups;
  })();

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
  // Scan only the tokens BEFORE the `--` options separator. yargs treats everything after it as
  // positional, so a safety flag there never defines its key and cannot conflict: it runs
  // `['--unsafe', '--', '--yolo']` in unsafe mode. Scanning the whole array reported a phantom
  // conflict, which stranded `--unsafe` in extraArgs and left the form showing the default safe
  // mode while the server actually ran unsafe -- and picking another mode from that misreported
  // form could then emit a REAL --yolo/--unsafe conflict the server rejects (P79). Mirrors the
  // parse loop and the duplicate-scalar pre-scan, which both stop at the separator (P74/P78).
  const separatorAt = args.indexOf('--');
  const optionArgs = separatorAt === -1 ? args : args.slice(0, separatorAt);
  const yoloPresent = optionArgs.some(
    (t) => t === '--yolo' || t === '--no-yolo' || t.startsWith('--yolo='),
  );
  const unsafePresent = optionArgs.some(
    (t) => t === '--unsafe' || t === '--no-unsafe' || t.startsWith('--unsafe='),
  );
  const safetyConflict = yoloPresent && unsafePresent;

  // Model a yargs attached boolean assignment (`--debug=true`, `--enableTruncation=false`, the
  // safety flags, ...) the same way the bare spellings below are modeled, so the form reflects
  // the real setting and a later edit is not defeated by a stale attached value surviving in
  // extraArgs (yargs parses `--debug --debug=false` as debug=false, last-wins) (P72). `on` follows
  // yargs' own coercion for a declared boolean -- exactly the string `true` is true, EVERY other
  // attached value (`0`, `1`, `yes`, `FALSE`) is false (P87). Returns false when the flag is not a
  // known boolean (the caller then preserves it verbatim) -- including a safety flag under a
  // conflict, which must round-trip unchanged to keep the server-rejected state intact (P71).
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
      case '--unsafe': {
        if (safetyConflict) {
          return false; // preserve verbatim — the conflicting entry is server-rejected (P71)
        }
        // Last-wins, exactly as yargs resolves a repeated boolean (verified: `--unsafe
        // --unsafe=false` => unsafe:false, `--unsafe=false --unsafe` => unsafe:true). A later
        // FALSE must therefore clear a mode an earlier occurrence set, or a no-op save would
        // rewrite `--unsafe --unsafe=false` as a bare `--unsafe` and disable every protection
        // the entry actually kept (P89).
        const mode = flag === '--yolo' ? 'yolo' : 'unsafe';
        if (on) {
          out.safetyMode = mode;
        } else if (out.safetyMode === mode) {
          out.safetyMode = 'safe';
        }
        return true;
      }
      default:
        return false;
    }
  };

  // Model the REMAINING values of a greedy array option. yargs' `greedy-arrays` defaults to true
  // (documented in yargs-parser's README), so an array option swallows every following value token,
  // not just the first: verified against the installed parser, `--blockedCommand rm del --debug`
  // => ['rm', 'del'] and `--blockedCommand=rm del` => ['rm', 'del']. Modeling only the first value
  // left the rest in extraArgs, and re-emitting them after the modeled pair turned them into
  // positionals the server never applies — an unrelated save silently shrank a blocklist or an
  // allowed-directory list (P99). Only `array` kinds are greedy; the server declares exactly those
  // four options with `array: true` (src/index.ts), and its csv options take a single token.
  const consumeGreedyArrayValues = (spec: OptionSpec, from: number): number => {
    if (spec.kind !== 'array') {
      return from;
    }
    let at = from;
    while (isOptionValueToken(args[at + 1])) {
      applyValue(spec, args[at + 1]);
      at++;
    }
    return at;
  };

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    // The `--` options separator: yargs treats every following token as a positional, not an
    // option (`node script.js -- --shell cmd` leaves `--shell`/`cmd` positional, NOT shell=cmd).
    // Preserve the separator and the remainder verbatim and stop parsing so a no-op save does not
    // re-emit those positionals as active wcli0 flags and change the launch behavior (P74).
    if (token === '--') {
      for (let j = i; j < args.length; j++) {
        extraArgs.push(args[j]);
      }
      break;
    }
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
      // Last-wins like yargs (`--unsafe --unsafe false` => unsafe:false): an explicit false
      // clears a mode an earlier occurrence of the SAME family set, mirroring the `--no-*`
      // spellings below. Without this a repeated flag ending in false was modeled as the
      // positive mode and a no-op save dropped the false, disabling the protections (P89).
      const mode = token === '--yolo' ? 'yolo' : 'unsafe';
      if (on) {
        out.safetyMode = mode;
      } else if (out.safetyMode === mode) {
        out.safetyMode = 'safe';
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
      // A yargs attached boolean assignment (`--debug=true`, `--enableTruncation=false`,
      // `--debug=0`, ...): model it so the form reflects the real setting and a later edit is
      // not defeated by a stale value preserved in extraArgs (P72). EVERY attached value is
      // modeled, not just the literal true/false spellings, because yargs-parser coerces the
      // attached string of a declared boolean with `val === 'true'` (processValue) -- so
      // `--debug=0`, `--debug=1` and `--debug=yes` all mean FALSE. Preserving those in extraArgs
      // let a later "enable Debug" emit `--debug` followed by the preserved `--debug=0`, which
      // yargs resolves last-wins back to false and silently defeats the edit (P87).
      // applyAttachedBoolean returns false for a non-boolean flag (and for a safety flag under a
      // conflict), which then falls through and is preserved verbatim below.
      if (applyAttachedBoolean(flag, value === 'true')) {
        continue;
      }
      const spec = optionFor(flag);
      if (spec) {
        const v = value;
        if (divertShellValue(spec, v)) {
          // A shell name the form's select cannot hold (`all`, `fish`, ...) — preserve it (P96/P100).
          extraArgs.push(token);
          continue;
        }
        if (spec.kind === 'number' && divertNumber(spec, v)) {
          // A numeric value the typed field cannot faithfully hold: an unparseable value
          // (P34) or an out-of-range log limit (P59). Preserve it verbatim so it round-trips
          // instead of poisoning the field and blocking every save.
          extraArgs.push(token);
          continue;
        }
        if (isScalarOption(spec) && duplicatedScalarKeys.has(spec.key)) {
          // A scalar option repeated in the entry: yargs makes it an array, so preserve every
          // occurrence verbatim rather than collapsing to a last-wins value the field can't
          // represent (P78).
          extraArgs.push(token);
          continue;
        }
        applyValue(spec, v);
        i = consumeGreedyArrayValues(spec, i);
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
          if (duplicatedScalarKeys.has('configFile')) {
            extraArgs.push(token); // repeated --config: preserve verbatim, never last-wins (P78)
          } else {
            out.configFile = config; // value attached to the bundle, e.g. `-c/other.json`
          }
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
      if (isOptionValueToken(args[i + 1])) {
        if (duplicatedScalarKeys.has('configFile')) {
          // repeated --config: preserve the bundle verbatim; its value falls through next (P78).
          extraArgs.push(token);
          continue;
        }
        out.configFile = args[i + 1]; // `c` is the bundle's last char; the next token is its value
        i++;
        continue;
      }
      // `c` is the bundle's last char with no following value (the next token is another
      // flag, or there is none): yargs would read config as empty. Preserve the token
      // verbatim so it round-trips rather than fabricating a value (mirrors P44/P86). Recorded as
      // valueless so the reorder guard below can make it safe if a positional follows (P106).
      preserveValueless(token);
      continue;
    }
    // Space-separated `--opt value` form. Consume the next token as the value ONLY when it
    // is a real value, not another option: yargs parses e.g. `--blockedCommand --debug` as
    // an empty `blockedCommand` plus a still-applied `--debug`, so swallowing the flag would
    // drop it and rewrite the option with a bogus value on save (P44, mirroring
    // stripConfigArgs). A value-option whose next token is a flag is preserved verbatim in
    // extraArgs and the flag is parsed on the next iteration.
    const spec = optionFor(token);
    if (spec && isOptionValueToken(args[i + 1])) {
      if (divertShellValue(spec, args[i + 1])) {
        // A shell name the form's select cannot hold — `all` is its omission sentinel (P96), any
        // other name is not offered at all (P100). Preserve the flag here and let its value fall
        // through to extraArgs on the next iteration.
        extraArgs.push(token);
        continue;
      }
      if (spec.kind === 'number' && divertNumber(spec, args[i + 1])) {
        // A numeric value the typed field cannot faithfully hold (unparseable, P34; or an
        // out-of-range log limit, P59): don't consume it. The flag is preserved here, and the
        // following value token falls through to extraArgs on the next iteration.
        extraArgs.push(token);
        continue;
      }
      if (isScalarOption(spec) && duplicatedScalarKeys.has(spec.key)) {
        // A repeated scalar option: preserve the flag verbatim; its value token is not consumed
        // here and falls through to extraArgs on the next iteration, so both round-trip (P78).
        extraArgs.push(token);
        continue;
      }
      applyValue(spec, args[i + 1]);
      i++;
      i = consumeGreedyArrayValues(spec, i);
      continue;
    }
    if (VALUE_OPTIONS[token] && !isOptionValueToken(args[i + 1])) {
      // A recognized value option with no value after it (`--shell --debug ...`). Preserved as
      // today, but recorded so the reorder guard below can re-emit it safely. Looked up in
      // VALUE_OPTIONS directly rather than through optionFor(), so a stdio entry's transport flags
      // (which P30 deliberately leaves unmodeled) get the same treatment.
      preserveValueless(token);
      continue;
    }
    extraArgs.push(token);
  }

  for (const [key, list] of Object.entries(arrays)) {
    (out as Record<string, unknown>)[key] = list;
  }
  return { settings: out, extraArgs: makeExtrasReorderSafe(extraArgs, valuelessOptionAt) };
}

/**
 * Re-emit preserved args so they survive the builder's reordering. `buildServerArgs` appends
 * extraArgs AFTER the flags it generates from the typed fields, so two tokens the entry kept apart
 * can become neighbours. That is only dangerous in one shape: a recognized value option preserved
 * with NO value (`valuelessAt`) followed later by a real POSITIONAL, which the re-emitted order
 * would feed to it as its value. yargs reads `node dist/index.js --shell --debug cmd` as shell='',
 * debug=true and a positional `cmd`, but the rebuilt `--debug --shell cmd` makes `cmd` the shell
 * (P106); the same reordering turns `--allowedDir --debug C:/work` into an allowed directory, which
 * additionally switches restrictWorkingDirectory ON and injection protection OFF (P109).
 *
 * Each kind is re-emitted in the form that cannot capture a following token, verified against the
 * installed yargs-parser:
 *   - string/csv: `--flag=` parses exactly like the valueless flag ('') and consumes nothing.
 *   - number: a valueless number option defines NO key, while `--flag=` would define 0 — the token
 *     is inert, so it is dropped rather than rewritten.
 *   - array: a valueless array option yields [] (ignored by the server's `length > 0` check), while
 *     `--flag=` would yield [''] — the deny-all of P103 — so the inert token is dropped too.
 *
 * When no positional follows, everything round-trips byte-for-byte as before: a valueless flag next
 * to another flag (`--blockedCommand --debug`, P44) or to its own repeated occurrence (P78/P98) is
 * already safe in any order.
 */
function makeExtrasReorderSafe(extras: string[], valuelessAt: Set<number>): string[] {
  // Tokens after a `--` separator stay positional wherever they end up, so they neither create the
  // hazard nor suffer from it (P74).
  const separator = extras.indexOf('--');
  const end = separator === -1 ? extras.length : separator;
  const consumed = new Set<number>();
  for (let i = 0; i < end; i++) {
    if (VALUE_OPTIONS[extras[i]] && !valuelessAt.has(i) && isOptionValueToken(extras[i + 1])) {
      consumed.add(i + 1); // this token is that option's value, not a positional
    }
  }
  let positionalAt = -1;
  for (let i = 0; i < end; i++) {
    if (!extras[i].startsWith('-') && !consumed.has(i)) {
      positionalAt = i;
      break;
    }
  }
  if (positionalAt === -1) {
    return extras;
  }
  const out: string[] = [];
  for (let i = 0; i < extras.length; i++) {
    const token = extras[i];
    if (i >= positionalAt || !valuelessAt.has(i)) {
      out.push(token);
      continue;
    }
    if (token.startsWith('--')) {
      const spec = VALUE_OPTIONS[token];
      if (spec && (spec.kind === 'string' || spec.kind === 'csv')) {
        out.push(`${token}=`);
      }
      continue; // number / array: the valueless token is inert, so it is dropped
    }
    // A single-dash token carrying the `c` config alias (`-c`, or a bundle such as `-dc`). Its own
    // attached form is unusable -- yargs swallows the next token for `-c=` -- so emit any other
    // bundled letters as their own token and the alias in its long attached form. Verified:
    // `-dc --debug x` and `-d --config= --debug x` both give config='', d=true, x positional.
    const others = token.slice(1).replace(/c/g, '');
    if (others) {
      out.push(`-${others}`);
    }
    out.push('--config=');
  }
  return out;
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
    // Trim exactly as preservedFileUrl does before it decides whether to keep the URL verbatim.
    // Parsing the untrimmed value here made `" http://gateway.example:8443/mcp"` undecomposable,
    // so the form showed the default host/port while the save path (which trims) decomposed it,
    // saw a mismatch against those defaults, and rewrote the endpoint to the canonical default on
    // an otherwise no-op save (P91).
    const url = asString(entry.url).trim();
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
    } else {
      // No usable url at all: `{"type":"http"}`, `url: ""`, or a non-string url. There is
      // nothing to model and nothing to preserve verbatim, so a save keeps the entry's url key
      // exactly as it was found rather than manufacturing the canonical default endpoint (P88).
      notes.push(
        `The ${type} entry has no usable url. It is kept as-is when you save; set the host and ` +
          'port below to write one, or edit .vscode/mcp.json directly.',
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
  // The npx fast path additionally requires the forward builder's own `-y`: buildLaunchSpec
  // always emits `npx -y <pkg>`, so modeling a hand-authored `npx wcli0@1.2.3` would let an
  // UNRELATED save add `-y` and silently turn npx's installation confirmation into an automatic
  // accept (npm documents that npx prompts before installing a missing package and that `-y`
  // suppresses that prompt). Without `-y` the entry falls through to custom parsing instead,
  // where `npx` and its package token round-trip verbatim and the server flags after them are
  // still modeled (P82).
  // It also needs a real package token. `npx -y` (or `npx -y ""`) authored no package, but
  // buildLaunchSpec substitutes an empty packageSpec with `wcli0@latest`, so modeling it would let
  // an unrelated save turn an incomplete invocation into an automatic install-and-run of wcli0
  // (npx itself requires a package or an explicit call). Such an entry is a custom launch, where
  // its tokens round-trip untouched (P85).
  const isPlainNpx =
    command === 'npx' &&
    args[0] === '-y' &&
    args[1] !== undefined &&
    args[1].trim() !== '' &&
    !args[1].startsWith('-');
  const isPlainNode = command === 'node' && args[0] !== undefined && !args[0].startsWith('-');
  if (isPlainNpx) {
    s.launchMethod = 'npx';
    // Forward emits ['-y', packageSpec, ...flags].
    s.packageSpec = args[1] ?? '';
    serverArgs = args.slice(2);
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
    // When the command IS the wcli0 binary there is nothing to split: every arg is the server's
    // own, so the WHOLE list is parsed as one server argument list. Scanning it for a suffix could
    // cut it in the wrong place — for `wcli0 --allowAllDirs marker --no-allowAllDirs` the index-0
    // run failed the purity check on the positional `marker`, so the scan picked the trailing
    // negation as the suffix, left the ENABLING flag in customArgs and modeled allowAllDirs=false;
    // a no-op save then emitted `--allowAllDirs marker` and flipped the server from restricted to
    // UNRESTRICTED directories (P105). parseServerArgs handles the `--` separator itself, keeping
    // it and its positionals verbatim in extraArgs (P74), so the round-trip stays exact.
    //
    // For a wrapper command the split is still needed and still starts at index 1: an index-0 flag
    // run is ambiguous — `mywrapper --transport fast` is the wrapper's own option, not wcli0's — so
    // the scan keeps looking for a later modeled-flag suffix, recovering the `--shell` in
    // `wrapper --no-cache --shell bash` instead of stranding it (P-wrapperflags / P43).
    // This branch only ever parses a stdio entry (http/sse return earlier), so pass stdio=true:
    // a transport flag in the args must not "prove" a server-flag suffix that reorders a wrapper's
    // own options on save, since stdio leaves transport flags in extraArgs verbatim (P77).
    const start = isWcli0Command(command) ? 0 : serverFlagSuffixStart(args, true);
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
  if (
    command === 'npx' &&
    args[0] !== undefined &&
    args[0] !== '-y' &&
    args[0].trim() !== '' &&
    !args[0].startsWith('-')
  ) {
    // A plain `npx <pkg>` entry: modeled as a custom command rather than the npx launch method,
    // because the npx launch method always emits `-y` and would suppress npx's installation
    // confirmation the entry deliberately left in place (P82).
    notes.push(
      'This entry runs npx WITHOUT -y, so npx asks before installing the package. It is shown ' +
        'as a custom command to preserve that; saving via the npx launch method would add -y ' +
        'and accept the installation automatically.',
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
  // An authority holding a VS Code substitution token (`http://${input:host}:8080/mcp`,
  // `http://host:${input:port}/mcp`) cannot be decomposed: the colon INSIDE `${...}` is not the
  // host/port delimiter, and the real host/port are unknown until VS Code resolves the variable at
  // launch. Splitting it anyway produced host `${input` with a malformed port, and the save then
  // rebuilt the URL as `http://${input:9444/mcp`, destroying both the variable and the endpoint.
  // Report it as undecomposable so it is preserved verbatim like a socket URL (P10) and host/port
  // edits are refused rather than applied to it (P81/P92).
  const authorityStart = /^[a-z]+:\/\//i.exec(url);
  if (authorityStart) {
    const authority = url.slice(authorityStart[0].length).split(/[/?#]/)[0];
    if (authority.includes('${')) {
      return undefined;
    }
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
