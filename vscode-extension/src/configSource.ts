import * as vscode from 'vscode';
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
// http/sse-specific flag names the forward builder emits.
const VALUE_OPTIONS: Record<string, OptionSpec> = {
  '--config': { key: 'configFile', kind: 'string' },
  '--shell': { key: 'shell', kind: 'string' },
  '--allowedDir': { key: 'allowedDirectories', kind: 'array' },
  '--initialDir': { key: 'initialDir', kind: 'string' },
  '--commandTimeout': { key: 'commandTimeout', kind: 'number' },
  '--maxCommandLength': { key: 'maxCommandLength', kind: 'number' },
  '--wslMountPoint': { key: 'wslMountPoint', kind: 'string' },
  '--blockedCommand': { key: 'blockedCommands', kind: 'array' },
  '--blockedArgument': { key: 'blockedArguments', kind: 'array' },
  '--blockedOperator': { key: 'blockedOperators', kind: 'array' },
  '--maxOutputLines': { key: 'maxOutputLines', kind: 'number' },
  '--maxReturnLines': { key: 'maxReturnLines', kind: 'number' },
  '--logDirectory': { key: 'logDirectory', kind: 'string' },
  '--transport': { key: 'transportMode', kind: 'string' },
  '--http-host': { key: 'transportHost', kind: 'string' },
  '--sse-host': { key: 'transportHost', kind: 'string' },
  '--http-port': { key: 'transportPort', kind: 'number' },
  '--sse-port': { key: 'transportPort', kind: 'number' },
  '--http-allowed-origins': { key: 'transportAllowedOrigins', kind: 'csv' },
  '--sse-allowed-origins': { key: 'transportAllowedOrigins', kind: 'csv' },
};

/**
 * Whether `tokens` parse cleanly as a run of wcli0 server flags — the shape the forward
 * builder emits as the suffix after a launcher's own args. Every token must be a flag
 * (a recognized value-option consuming the next token as its value, an attached
 * `--opt=value`, a recognized boolean/tri-state, or any other `--flag` that round-trips
 * as an extraArg); a bare non-flag token that is not the value of a recognized
 * value-option is an "orphan" and disqualifies the run. Used to find where the wcli0
 * flags begin so launcher options that collide with wcli0 flag names stay in the launcher
 * portion (see {@link serverFlagSuffixStart}).
 */
function isPureServerFlagRun(tokens: string[]): boolean {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.startsWith('-')) {
      return false; // orphan bare token — not a flag and not consumed as a value
    }
    const eq = t.indexOf('=');
    if (t.startsWith('--') && eq > 0) {
      continue; // attached --opt=value (recognized or an extraArg) — self-contained
    }
    if (t in VALUE_OPTIONS) {
      if (i + 1 >= tokens.length) {
        return false; // a value-option with no value cannot be a clean server flag
      }
      i++; // consume the value
      continue;
    }
    // A recognized boolean/tri-state, or any other bare `--flag` that round-trips as an
    // extraArg. An unrecognized flag can also carry a space-separated value (`--futureFlag x`),
    // which appears as a trailing bare token. Consume that token as the flag's value so a
    // suffix ending in a valued extraArg is not mistaken for an orphan and wrongly rejected
    // (P24). Only the LAST token is consumed this way: a bare token with more tokens after it
    // is a launcher positional (e.g. uvx's package before the wcli0 flags), which must still
    // disqualify the run so it stays in the launcher portion (P15).
    if (i === tokens.length - 2 && !tokens[i + 1].startsWith('-')) {
      i++; // consume the trailing bare value of this extraArg
    }
  }
  return true;
}

/**
 * The index where the wcli0 server-flag suffix begins in a launcher's full arg list. The
 * forward builder emits `[...launcherArgs, ...serverFlags]`, so the server flags are a
 * contiguous suffix: return the smallest index whose remaining tokens form a pure
 * server-flag run starting with a flag. Everything before it is the launcher's own args.
 * Defaults to `args.length` (no server flags). Scanning for the longest such suffix keeps
 * launcher options whose names collide with wcli0 flags (a wrapper's `--config`, node's
 * `--inspect`) in the launcher portion (P15).
 */
function serverFlagSuffixStart(args: string[]): number {
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('-') && isPureServerFlagRun(args.slice(i))) {
      return i;
    }
  }
  return args.length;
}

/**
 * Reverse of {@link buildServerArgs}: parse a wcli0 flag list back into the subset
 * of settings the form models, plus the leftover (unrecognized) flags. Accepts both
 * `--opt value` and `--opt=value` forms and the boolean/tri-state/safety flags the
 * forward builder emits. Anything unrecognized is preserved verbatim in `extraArgs`
 * so a save round-trips it rather than silently dropping it.
 */
export function parseServerArgs(args: string[]): {
  settings: Partial<Wcli0Settings>;
  extraArgs: string[];
} {
  const out: Partial<Wcli0Settings> = {};
  const extraArgs: string[] = [];
  const arrays: Partial<Record<keyof Wcli0Settings, string[]>> = {};

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

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    // Boolean / tri-state / safety flags carry no value.
    if (token === '--allowAllDirs') {
      out.allowAllDirs = true;
      continue;
    }
    if (token === '--debug') {
      out.debug = true;
      continue;
    }
    if (token === '--yolo') {
      out.safetyMode = 'yolo';
      continue;
    }
    if (token === '--unsafe') {
      out.safetyMode = 'unsafe';
      continue;
    }
    if (token === '--enableTruncation' || token === '--no-enableTruncation') {
      out.enableTruncation = (token.startsWith('--no-') ? 'disabled' : 'enabled') as TriState;
      continue;
    }
    if (token === '--enableLogResources' || token === '--no-enableLogResources') {
      out.enableLogResources = (token.startsWith('--no-') ? 'disabled' : 'enabled') as TriState;
      continue;
    }
    // Attached `--opt=value` form.
    const eq = token.indexOf('=');
    if (token.startsWith('--') && eq > 0) {
      const flag = token.slice(0, eq);
      const spec = VALUE_OPTIONS[flag];
      if (spec) {
        applyValue(spec, token.slice(eq + 1));
        continue;
      }
      extraArgs.push(token);
      continue;
    }
    // Space-separated `--opt value` form.
    const spec = VALUE_OPTIONS[token];
    if (spec && i + 1 < args.length) {
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
  const type = asString(entry.type) || 'stdio';

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
    if (parsed && parsed.port > 0) {
      // Fully modeled: an explicit host AND port the form's fields can edit.
      s.transportHost = parsed.host;
      s.transportPort = parsed.port;
      if (!isCanonicalTransportUrl(url, type, parsed)) {
        notes.push(
          `The ${type} URL "${url}" uses a custom scheme or path. It is preserved as-is ` +
            'when you save, but editing the host or port here rewrites it to the ' +
            `http://host:port/${canonicalPath} form.`,
        );
      }
    } else if (parsed) {
      // Decomposes to a host but no explicit port (a default-port URL such as
      // https://host/path). Show the host, but keep the form's default port so the
      // number field stays valid (min=1) rather than rendering an invalid 0 (P8); the
      // verbatim URL above round-trips, and a host edit rebuilds the canonical form.
      s.transportHost = parsed.host;
      notes.push(
        `The ${type} URL "${url}" does not specify a port (it uses the scheme default). ` +
          'It is preserved as-is when you save; editing the host rewrites it to the ' +
          `http://host:port/${canonicalPath} form, and the port field does not affect it.`,
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
  const args = Array.isArray(entry.args) ? entry.args.map((a) => asString(a)) : [];
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
    const start = serverFlagSuffixStart(args);
    s.customArgs = args.slice(0, start);
    serverArgs = args.slice(start);
  }

  const { settings: parsed, extraArgs } = parseServerArgs(serverArgs);
  Object.assign(s, parsed);
  s.extraArgs = extraArgs;
  s.cwd = asString(entry.cwd);
  s.env = asStringMap(entry.env);

  if (s.configFile.trim()) {
    notes.push(
      'This entry references a config file via --config. Per-shell settings and ' +
        'environment profiles inside that file are not editable here; edit the referenced ' +
        'config file directly.',
    );
  }
  return { settings: s, notes };
}

/** Parse host/port out of an http/sse URL; returns undefined when unparseable. */
export function parseHttpUrl(url: string): { host: string; port: number } | undefined {
  if (!url) {
    return undefined;
  }
  // Match `scheme://[userinfo@]host[:port]/...`, where host may be a bracketed IPv6
  // literal. The optional `userinfo@` is skipped so credentials (`user:pass@host:port`)
  // do not get mistaken for the host and an explicit port behind them is still read (P21).
  const m = /^[a-z]+:\/\/(?:[^@/]*@)?(\[[^\]]+\]|[^:/]+)(?::(\d+))?/i.exec(url);
  if (!m) {
    return undefined;
  }
  const host = m[1];
  const port = m[2] ? Number(m[2]) : 0;
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
  parsed: { host: string; port: number },
): boolean {
  const path = type === 'http' ? '/mcp' : '/sse';
  return url === `http://${parsed.host}:${parsed.port}${path}` && parsed.port > 0;
}
