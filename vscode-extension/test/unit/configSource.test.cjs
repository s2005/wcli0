const test = require('node:test');
const assert = require('node:assert/strict');

const vscode = require('../stubs/vscode.cjs');
const {
  detectWorkspaceMcpJson,
  readWcli0Entry,
  parseServerArgs,
  parseMcpEntry,
  parseHttpUrl,
  mcpJsonUri,
} = require('../../dist/configSource.js');
const { buildLaunchSpec } = require('../../dist/argsBuilder.js');

const FOLDER = { uri: vscode.Uri.file('/ws'), name: 'ws', index: 0 };
const MCP_PATH = '/ws/.vscode/mcp.json';

function seedMcpJson(obj) {
  vscode.__state.files.set(MCP_PATH, Buffer.from(JSON.stringify(obj)));
}

function defaults(overrides = {}) {
  return {
    launchMethod: 'npx',
    packageSpec: 'wcli0@latest',
    nodeScriptPath: '',
    customCommand: '',
    customArgs: [],
    cwd: '',
    env: {},
    configFile: '',
    shell: 'all',
    shells: {},
    profiles: {},
    ignoreInheritedShells: false,
    ignoreInheritedProfiles: false,
    allowedDirectories: [],
    initialDir: '',
    commandTimeout: null,
    maxCommandLength: null,
    wslMountPoint: '',
    blockedCommands: [],
    blockedArguments: [],
    blockedOperators: [],
    maxOutputLines: null,
    enableTruncation: 'default',
    enableLogResources: 'default',
    maxReturnLines: null,
    logDirectory: '',
    allowAllDirs: false,
    safetyMode: 'safe',
    debug: false,
    transportMode: 'stdio',
    transportHost: '127.0.0.1',
    transportPort: 9444,
    transportAllowedOrigins: [],
    extraArgs: [],
    ...overrides,
  };
}

test.beforeEach(() => {
  vscode.__reset();
  vscode.__state.workspaceFolders = [FOLDER];
});

// ---- detection -----------------------------------------------------------

test('detectWorkspaceMcpJson finds a wcli0 server entry', async () => {
  seedMcpJson({ servers: { wcli0: { type: 'stdio', command: 'npx' }, other: {} } });
  const d = await detectWorkspaceMcpJson(FOLDER);
  assert.equal(d.exists, true);
  assert.equal(d.hasWcli0, true);
  assert.equal(d.fsPath, MCP_PATH);
});

test('detectWorkspaceMcpJson reports no entry when wcli0 absent', async () => {
  seedMcpJson({ servers: { other: { type: 'stdio' } } });
  const d = await detectWorkspaceMcpJson(FOLDER);
  assert.equal(d.exists, true);
  assert.equal(d.hasWcli0, false);
});

test('detectWorkspaceMcpJson reports absent when the file is missing', async () => {
  const d = await detectWorkspaceMcpJson(FOLDER);
  assert.equal(d.exists, false);
  assert.equal(d.hasWcli0, false);
});

test('detectWorkspaceMcpJson tolerates JSONC comments', async () => {
  vscode.__state.files.set(
    MCP_PATH,
    Buffer.from('{\n  // wcli0 entry\n  "servers": { "wcli0": { "type": "stdio" } },\n}'),
  );
  const d = await detectWorkspaceMcpJson(FOLDER);
  assert.equal(d.hasWcli0, true);
});

test('detectWorkspaceMcpJson reports existing-but-no-entry on malformed JSON', async () => {
  vscode.__state.files.set(MCP_PATH, Buffer.from('{ not valid'));
  const d = await detectWorkspaceMcpJson(FOLDER);
  assert.equal(d.exists, true);
  assert.equal(d.hasWcli0, false);
});

test('detectWorkspaceMcpJson does not throw on a non-not-found read error', async () => {
  const err = new Error('permission denied');
  err.code = 'NoPermissions';
  vscode.__state.readError = err;
  const d = await detectWorkspaceMcpJson(FOLDER);
  assert.equal(d.exists, false);
});

test('readWcli0Entry returns the entry object or undefined', async () => {
  seedMcpJson({ servers: { wcli0: { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest'] } } });
  const entry = await readWcli0Entry(FOLDER);
  assert.equal(entry.command, 'npx');
  vscode.__reset();
  vscode.__state.workspaceFolders = [FOLDER];
  assert.equal(await readWcli0Entry(FOLDER), undefined);
});

test('mcpJsonUri points at .vscode/mcp.json', () => {
  assert.equal(mcpJsonUri(FOLDER).fsPath, MCP_PATH);
});

// ---- parseServerArgs -----------------------------------------------------

test('parseServerArgs maps recognized value flags', () => {
  const { settings } = parseServerArgs([
    '--shell', 'powershell',
    '--commandTimeout', '30',
    '--maxCommandLength', '8000',
    '--initialDir', '/work',
    '--logDirectory', '/logs',
  ]);
  assert.equal(settings.shell, 'powershell');
  assert.equal(settings.commandTimeout, 30);
  assert.equal(settings.maxCommandLength, 8000);
  assert.equal(settings.initialDir, '/work');
  assert.equal(settings.logDirectory, '/logs');
});

test('parseServerArgs collects repeated flags into arrays', () => {
  const { settings } = parseServerArgs([
    '--allowedDir', '/a',
    '--allowedDir', '/b',
    '--blockedCommand', 'rm',
    '--blockedCommand', 'del',
  ]);
  assert.deepEqual(settings.allowedDirectories, ['/a', '/b']);
  assert.deepEqual(settings.blockedCommands, ['rm', 'del']);
});

test('parseServerArgs accepts the --opt=value form', () => {
  const { settings } = parseServerArgs(['--blockedArgument=-rf', '--shell=cmd']);
  assert.deepEqual(settings.blockedArguments, ['-rf']);
  assert.equal(settings.shell, 'cmd');
});

test('parseServerArgs handles boolean, safety and tri-state flags', () => {
  const a = parseServerArgs(['--allowAllDirs', '--debug', '--unsafe', '--no-enableTruncation']);
  assert.equal(a.settings.allowAllDirs, true);
  assert.equal(a.settings.debug, true);
  assert.equal(a.settings.safetyMode, 'unsafe');
  assert.equal(a.settings.enableTruncation, 'disabled');
  const b = parseServerArgs(['--yolo', '--enableLogResources']);
  assert.equal(b.settings.safetyMode, 'yolo');
  assert.equal(b.settings.enableLogResources, 'enabled');
});

test('P63: parseServerArgs consumes negated boolean flags instead of preserving them in extraArgs', () => {
  // A loaded entry may carry yargs negations for the server's boolean options. They must be
  // modeled (and removed from extraArgs), or a preserved `--no-debug` survives a save and
  // yargs parses `--debug --no-debug` as debug=false, silently dropping the user's form edit.
  const a = parseServerArgs([
    '--no-allowAllDirs',
    '--no-debug',
    '--no-yolo',
    '--no-unsafe',
    '--shell',
    'cmd',
  ]);
  assert.equal(a.settings.allowAllDirs, false);
  assert.equal(a.settings.debug, false);
  // parseServerArgs returns a partial: with no positive safety flag it leaves safetyMode unset,
  // so parseMcpEntry overlays the default 'safe'. The negations must not leak into extraArgs.
  assert.equal(a.settings.safetyMode, undefined);
  assert.equal(a.settings.shell, 'cmd');
  assert.deepEqual(a.extraArgs, [], 'no negated boolean leaks into extraArgs');

  // The kebab-case alias of the multi-word boolean is recognized too.
  const b = parseServerArgs(['--no-allow-all-dirs']);
  assert.equal(b.settings.allowAllDirs, false);
  assert.deepEqual(b.extraArgs, []);

  // A negated safety flag clears only the matching mode: `--unsafe --no-yolo` stays unsafe.
  const c = parseServerArgs(['--unsafe', '--no-yolo']);
  assert.equal(c.settings.safetyMode, 'unsafe');
  assert.deepEqual(c.extraArgs, []);

  // Mirrors yargs last-wins for a contradictory pair: `--yolo --no-yolo` resolves to safe.
  const d = parseServerArgs(['--yolo', '--no-yolo']);
  assert.equal(d.settings.safetyMode, 'safe');
  assert.deepEqual(d.extraArgs, []);
});

test('parseServerArgs parses transport flags', () => {
  const { settings } = parseServerArgs([
    '--transport', 'http',
    '--http-host', '0.0.0.0',
    '--http-port', '7000',
    '--http-allowed-origins', 'https://a.test,https://b.test',
  ]);
  assert.equal(settings.transportMode, 'http');
  assert.equal(settings.transportHost, '0.0.0.0');
  assert.equal(settings.transportPort, 7000);
  assert.deepEqual(settings.transportAllowedOrigins, ['https://a.test', 'https://b.test']);
});

test('parseServerArgs preserves unrecognized flags in extraArgs', () => {
  const { settings, extraArgs } = parseServerArgs(['--shell', 'cmd', '--futureFlag', 'x', '--bare']);
  assert.equal(settings.shell, 'cmd');
  assert.deepEqual(extraArgs, ['--futureFlag', 'x', '--bare']);
});

// ---- parseMcpEntry -------------------------------------------------------

test('parseMcpEntry parses an npx stdio entry', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@1.2.3', '--shell', 'cmd', '--allowedDir', '/ws'],
    cwd: '/ws',
    env: { FOO: 'bar' },
  });
  assert.equal(settings.launchMethod, 'npx');
  assert.equal(settings.packageSpec, 'wcli0@1.2.3');
  assert.equal(settings.shell, 'cmd');
  assert.deepEqual(settings.allowedDirectories, ['/ws']);
  assert.equal(settings.cwd, '/ws');
  assert.deepEqual(settings.env, { FOO: 'bar' });
});

test('parseMcpEntry parses a node stdio entry', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'node',
    args: ['/srv/dist/index.js', '--debug'],
  });
  assert.equal(settings.launchMethod, 'node');
  assert.equal(settings.nodeScriptPath, '/srv/dist/index.js');
  assert.equal(settings.debug, true);
});

test('parseMcpEntry splits custom command args from server flags', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'my-wrapper',
    args: ['run', 'wcli0', '--shell', 'gitbash'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.equal(settings.customCommand, 'my-wrapper');
  assert.deepEqual(settings.customArgs, ['run', 'wcli0']);
  assert.equal(settings.shell, 'gitbash');
});

test('P3: parseMcpEntry keeps dash-prefixed custom launcher args before wcli0 flags', () => {
  const { settings, notes } = parseMcpEntry({
    type: 'stdio',
    command: 'uvx',
    args: ['--from', 'git+https://example/repo', 'wcli0', '--shell', 'cmd'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.equal(settings.customCommand, 'uvx');
  // The launcher's own --from option stays in customArgs; only the recognized wcli0
  // flag (--shell) starts the server flags. Nothing leaks into extraArgs.
  assert.deepEqual(settings.customArgs, ['--from', 'git+https://example/repo', 'wcli0']);
  assert.equal(settings.shell, 'cmd');
  assert.deepEqual(settings.extraArgs, []);
  assert.equal(notes.length, 0);
});

test('P3: buildLaunchSpec -> parseMcpEntry round-trips custom launcher args in order', () => {
  const s = defaults({
    launchMethod: 'custom',
    customCommand: 'uvx',
    customArgs: ['--from', 'repo', 'wcli0'],
    shell: 'cmd',
  });
  const spec = buildLaunchSpec(s, { resolvePaths: false });
  const { settings } = parseMcpEntry({ type: 'stdio', command: spec.command, args: spec.args });
  assert.equal(settings.customCommand, 'uvx');
  assert.deepEqual(settings.customArgs, ['--from', 'repo', 'wcli0']);
  assert.equal(settings.shell, 'cmd');
});

test('P14: parseMcpEntry treats node launcher options as custom args, not a script', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'node',
    args: ['--inspect', 'dist/index.js', '--shell', 'cmd'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.equal(settings.customCommand, 'node');
  assert.deepEqual(settings.customArgs, ['--inspect', 'dist/index.js']);
  assert.equal(settings.shell, 'cmd');
});

test('P14: a plain node entry is still parsed as node', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'node',
    args: ['dist/index.js', '--shell', 'cmd'],
  });
  assert.equal(settings.launchMethod, 'node');
  assert.equal(settings.nodeScriptPath, 'dist/index.js');
  assert.equal(settings.shell, 'cmd');
});

test('P17: parseMcpEntry treats npx launcher options as custom, preserving them', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['--package=wcli0', '--', 'wcli0', '--shell', 'cmd'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.equal(settings.customCommand, 'npx');
  assert.deepEqual(settings.customArgs, ['--package=wcli0', '--', 'wcli0']);
  assert.equal(settings.shell, 'cmd');
});

test('P17: a plain npx entry (with or without -y) is still parsed as npx', () => {
  const withY = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@9.9.9', '--shell', 'cmd'],
  }).settings;
  assert.equal(withY.launchMethod, 'npx');
  assert.equal(withY.packageSpec, 'wcli0@9.9.9');
  const noY = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['wcli0@1.2.3', '--shell', 'cmd'],
  }).settings;
  assert.equal(noY.launchMethod, 'npx');
  assert.equal(noY.packageSpec, 'wcli0@1.2.3');
});

test('P15: parseMcpEntry keeps a custom wrapper option that collides with a wcli0 flag', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'mywrapper',
    args: ['--config', 'wrapper.json', 'wcli0', '--shell', 'cmd'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.equal(settings.customCommand, 'mywrapper');
  // The wrapper's own --config stays in customArgs; only --shell is a wcli0 flag.
  assert.deepEqual(settings.customArgs, ['--config', 'wrapper.json', 'wcli0']);
  assert.equal(settings.configFile, '');
  assert.equal(settings.shell, 'cmd');
});

test('P15: a custom suffix with a trailing extra arg still splits at the wcli0 flags', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'mywrapper',
    args: ['wcli0', '--shell', 'cmd', '--unknownFlag'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.deepEqual(settings.customArgs, ['wcli0']);
  assert.equal(settings.shell, 'cmd');
  assert.deepEqual(settings.extraArgs, ['--unknownFlag']);
});

test('P24: a custom suffix ending in a valued extraArg still parses the modeled flags', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'mywrapper',
    args: ['wcli0', '--shell', 'cmd', '--futureFlag', 'x'],
  });
  assert.equal(settings.launchMethod, 'custom');
  // The trailing `--futureFlag x` is a valued extraArg, not a launcher positional, so the
  // split stays at --shell: the launcher keeps only `wcli0`, --shell is modeled, and the
  // unrecognized flag and its value round-trip verbatim in extraArgs.
  assert.deepEqual(settings.customArgs, ['wcli0']);
  assert.equal(settings.shell, 'cmd');
  assert.deepEqual(settings.extraArgs, ['--futureFlag', 'x']);
});

test('P24: a non-trailing bare token still keeps a launcher positional out of the flags', () => {
  // `repo` follows the unrecognized --from but is NOT the last token, so it is a launcher
  // positional (uvx's package) and must stay in customArgs, not be eaten as --from's value.
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'uvx',
    args: ['--from', 'repo', 'wcli0', '--shell', 'cmd'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.deepEqual(settings.customArgs, ['--from', 'repo', 'wcli0']);
  assert.equal(settings.shell, 'cmd');
  assert.deepEqual(settings.extraArgs, []);
});

test('parseMcpEntry parses an http entry url', () => {
  const { settings } = parseMcpEntry({ type: 'http', url: 'http://127.0.0.1:9444/mcp' });
  assert.equal(settings.transportMode, 'http');
  assert.equal(settings.transportHost, '127.0.0.1');
  assert.equal(settings.transportPort, 9444);
});

test('parseMcpEntry parses an sse entry with a bracketed IPv6 host', () => {
  const { settings } = parseMcpEntry({ type: 'sse', url: 'http://[::1]:8080/sse' });
  assert.equal(settings.transportMode, 'sse');
  assert.equal(settings.transportHost, '[::1]');
  assert.equal(settings.transportPort, 8080);
});

test('P8: parseMcpEntry keeps a valid default port and preserves a default-port url', () => {
  const { settings, notes } = parseMcpEntry({
    type: 'http',
    url: 'https://gateway.example/custom/mcp',
  });
  assert.equal(settings.transportMode, 'http');
  assert.equal(settings.transportHost, 'gateway.example');
  // The URL omits an explicit port; the form keeps its default port (a valid min=1
  // value) rather than rendering an invalid 0 that would block Save (P8).
  assert.equal(settings.transportPort, 9444);
  // The verbatim URL is retained so a save round-trips the custom scheme/path and the
  // default port instead of downgrading to http://host:9444/mcp.
  assert.equal(settings.transportUrl, 'https://gateway.example/custom/mcp');
  assert.ok(notes.some((n) => /does not specify a port/.test(n)));
});

test('P21: parseMcpEntry reads host/port past URL userinfo credentials', () => {
  const { settings } = parseMcpEntry({
    type: 'http',
    url: 'https://user:pass@example.com:9444/mcp',
  });
  // The userinfo (user:pass@) is skipped, so the real host and explicit port are read.
  assert.equal(settings.transportHost, 'example.com');
  assert.equal(settings.transportPort, 9444);
  assert.equal(settings.transportUrl, 'https://user:pass@example.com:9444/mcp');
});

test('P-port0: parseHttpUrl distinguishes an omitted port from an explicit :0', () => {
  // An omitted port is reported as undefined (scheme default); an explicit :0 is a real
  // (unusable) port, so the two must not collapse to the same sentinel.
  assert.equal(parseHttpUrl('https://gateway.example/custom/mcp').port, undefined);
  assert.equal(parseHttpUrl('http://host:0/mcp').port, 0);
  assert.equal(parseHttpUrl('http://host:9444/mcp').port, 9444);
});

test('P66: parseHttpUrl reports an explicit non-numeric port as NaN, not omitted', () => {
  // An explicit but malformed port (`:abc`, `:-1`) must NOT collapse to the omitted-port
  // sentinel (undefined). Reporting it as NaN keeps the host modeled while marking the port
  // unusable, so the save path rebuilds the canonical URL from the port field instead of
  // preserving the malformed URL as if it were a default-port one a port edit cannot fix.
  assert.ok(Number.isNaN(parseHttpUrl('http://host:abc/mcp').port));
  assert.ok(Number.isNaN(parseHttpUrl('http://host:-1/mcp').port));
  assert.equal(parseHttpUrl('http://host:abc/mcp').host, 'host');
  // An omitted port is still undefined, and a valid numeric port is unaffected.
  assert.equal(parseHttpUrl('http://host/mcp').port, undefined);
  assert.equal(parseHttpUrl('http://host:8080/mcp').port, 8080);
});

test('P-port0: parseMcpEntry does not preserve an explicit :0 url as a default-port url', () => {
  const { settings, notes } = parseMcpEntry({ type: 'http', url: 'http://host:0/mcp' });
  assert.equal(settings.transportMode, 'http');
  // The host is modeled, but the port field cannot hold 0 (min=1), so it keeps the default.
  assert.equal(settings.transportHost, 'host');
  assert.equal(settings.transportPort, 9444);
  // A note explains the unusable port is rebuilt on save, not preserved verbatim.
  assert.ok(notes.some((n) => /not a usable port/.test(n)));
});

test('P-portmax: parseMcpEntry keeps the default port for an out-of-range url port (>65535)', () => {
  // A port above 65535 cannot be held by the form's number input (max=65535); loading it
  // verbatim would strand the form in an invalid state and block unrelated saves. It is
  // treated like the unusable :0 case: the host is modeled, the port keeps the form default,
  // and a note explains the canonical URL is rebuilt on save.
  const { settings, notes } = parseMcpEntry({ type: 'http', url: 'http://localhost:70000/mcp' });
  assert.equal(settings.transportMode, 'http');
  assert.equal(settings.transportHost, 'localhost');
  assert.equal(settings.transportPort, 9444, 'keeps the form default rather than the unusable 70000');
  assert.ok(notes.some((n) => /not a usable port/.test(n)));
});

test('P66: parseMcpEntry treats a non-numeric url port as unusable, not omitted', () => {
  // A non-numeric port (`:abc`) must be handled like the unusable :0/:70000 cases: model the
  // host, keep the form default port, and note that the canonical URL is rebuilt on save — not
  // classified as a default-port URL preserved verbatim (which a port edit could never fix).
  const { settings, notes } = parseMcpEntry({ type: 'http', url: 'http://host:abc/mcp' });
  assert.equal(settings.transportMode, 'http');
  assert.equal(settings.transportHost, 'host');
  assert.equal(settings.transportPort, 9444, 'keeps the form default rather than the malformed port');
  assert.ok(notes.some((n) => /not a usable port/.test(n)));
  // The note distinguishes the malformed port from an out-of-range numeric one.
  assert.ok(notes.some((n) => /non-numeric port/.test(n)));
});

test('P-wrapperflags: a wrapper command keeps flag-only args in the launcher portion', () => {
  // `mywrapper --transport fast` is the wrapper's own option, not a wcli0 flag; with no
  // launcher positional before it there is no unambiguous server-flag boundary, so it must
  // stay in customArgs rather than be misread as wcli0's transport setting.
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'mywrapper',
    args: ['--transport', 'fast'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.equal(settings.customCommand, 'mywrapper');
  assert.deepEqual(settings.customArgs, ['--transport', 'fast']);
  // None of it leaked into wcli0 settings.
  assert.equal(settings.transportMode, 'stdio');
});

test('P-wrapperflags: a wrapper --config option is not parsed as wcli0.configFile', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'mywrapper',
    args: ['--config', 'wrapper.json'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.deepEqual(settings.customArgs, ['--config', 'wrapper.json']);
  assert.equal(settings.configFile, '');
});

test('P-wrapperflags: an index-0 server-flag run IS trusted when the command is wcli0', () => {
  // Running the wcli0 binary directly: its args really are server flags, so they are modeled.
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: '/usr/local/bin/wcli0',
    args: ['--shell', 'cmd'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.deepEqual(settings.customArgs, []);
  assert.equal(settings.shell, 'cmd');
});

test('P10: parseMcpEntry preserves a socket url it cannot decompose', () => {
  const { settings, notes } = parseMcpEntry({
    type: 'http',
    url: 'unix:///tmp/server.sock#/mcp',
  });
  assert.equal(settings.transportMode, 'http');
  // The host/port fields cannot model a socket URL, so they stay at their defaults...
  assert.equal(settings.transportHost, '127.0.0.1');
  assert.equal(settings.transportPort, 9444);
  // ...but the verbatim URL is retained so an unrelated save does not rewrite it.
  assert.equal(settings.transportUrl, 'unix:///tmp/server.sock#/mcp');
  assert.ok(notes.some((n) => /cannot be represented/.test(n)));
});

test('P5: parseMcpEntry does not note a canonical http url but still preserves it', () => {
  const { settings, notes } = parseMcpEntry({ type: 'http', url: 'http://127.0.0.1:9444/mcp' });
  assert.equal(settings.transportUrl, 'http://127.0.0.1:9444/mcp');
  assert.equal(notes.length, 0);
});

test('parseMcpEntry notes a referenced --config file', () => {
  const { settings, notes } = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest', '--config', '/ws/wcli0.config.json'],
  });
  assert.equal(settings.configFile, '/ws/wcli0.config.json');
  assert.ok(notes.some((n) => /--config/.test(n)));
});

// ---- round trip ----------------------------------------------------------

test('buildLaunchSpec -> parseMcpEntry round-trips modeled stdio fields', () => {
  const s = defaults({
    packageSpec: 'wcli0@2.0.0',
    shell: 'powershell',
    allowedDirectories: ['/abs/one', '/abs/two'],
    commandTimeout: 45,
    maxCommandLength: 9000,
    safetyMode: 'yolo',
    debug: true,
  });
  const spec = buildLaunchSpec(s, { resolvePaths: false });
  const entry = { type: 'stdio', command: spec.command, args: spec.args };
  const { settings } = parseMcpEntry(entry);
  assert.equal(settings.launchMethod, 'npx');
  assert.equal(settings.packageSpec, 'wcli0@2.0.0');
  assert.equal(settings.shell, 'powershell');
  assert.deepEqual(settings.allowedDirectories, ['/abs/one', '/abs/two']);
  assert.equal(settings.commandTimeout, 45);
  assert.equal(settings.maxCommandLength, 9000);
  assert.equal(settings.safetyMode, 'yolo');
  assert.equal(settings.debug, true);
});

test('buildLaunchSpec -> parseMcpEntry round-trips an http endpoint via its url', () => {
  // A real http server in mcp.json is { type, url }, not a stdio entry carrying transport
  // flags. Round-trip the URL representation (host/port are recovered from it).
  const { settings } = parseMcpEntry({ type: 'http', url: 'http://127.0.0.1:7777/mcp' });
  assert.equal(settings.transportMode, 'http');
  assert.equal(settings.transportHost, '127.0.0.1');
  assert.equal(settings.transportPort, 7777);
});

// ---- P30: transport flags must not override a stdio entry's type ------------------

test('P30: a stdio entry with --transport http keeps stdio and preserves the flag', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest', '--transport', 'http', '--http-port', '7777'],
  });
  // The authoritative `type` wins: transportMode stays stdio, and the transport flags
  // round-trip verbatim in extraArgs instead of flipping the type / dropping the launcher.
  assert.equal(settings.transportMode, 'stdio');
  assert.equal(settings.launchMethod, 'npx');
  assert.deepEqual(settings.extraArgs, ['--transport', 'http', '--http-port', '7777']);
});

// ---- P31: unrecognized transport type ---------------------------------------------

test('P31: an uppercase HTTP type is modeled as http, not coerced to stdio', () => {
  const { settings } = parseMcpEntry({ type: 'HTTP', url: 'http://127.0.0.1:9444/mcp' });
  assert.equal(settings.transportMode, 'http');
  assert.equal(settings.transportHost, '127.0.0.1');
});

test('P31: an unrecognized type is noted and parsed as stdio', () => {
  const { settings, notes } = parseMcpEntry({
    type: 'websocket',
    command: 'npx',
    args: ['-y', 'wcli0@latest', '--shell', 'cmd'],
  });
  assert.equal(settings.transportMode, 'stdio');
  assert.equal(settings.shell, 'cmd');
  assert.ok(notes.some((n) => /websocket/.test(n)), 'notes the unmodeled type');
});

// ---- P32: short-form config alias -------------------------------------------------

test('P32: the -c short alias is recognized like --config', () => {
  const { settings, notes } = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest', '-c', '/ws/wcli0.config.json', '--shell', 'cmd'],
  });
  assert.equal(settings.configFile, '/ws/wcli0.config.json');
  assert.ok(notes.some((n) => /--config/.test(n)), 'still emits the config-file note');
  assert.equal(settings.shell, 'cmd');
});

test('P32: the attached -c=value and --c=value forms are recognized', () => {
  const a = parseMcpEntry({ type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest', '-c=/ws/a.json'] });
  const b = parseMcpEntry({ type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest', '--c=/ws/b.json'] });
  assert.equal(a.settings.configFile, '/ws/a.json');
  assert.equal(b.settings.configFile, '/ws/b.json');
});

// ---- P33: non-string args are stringified, not dropped ----------------------------

test('P33: a numeric arg is stringified rather than coerced to empty', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'node',
    args: ['--inspect', 9229, 'dist/index.js'],
  });
  // node-with-options parses as custom; 9229 round-trips as "9229", not "".
  assert.equal(settings.launchMethod, 'custom');
  assert.deepEqual(settings.customArgs, ['--inspect', '9229', 'dist/index.js']);
});

// ---- P34: an unparseable numeric flag round-trips via extraArgs -------------------

test('P34: an invalid numeric value falls through to extraArgs instead of blocking saves', () => {
  const { settings, extraArgs } = parseServerArgs(['--commandTimeout', 'abc', '--shell', 'cmd']);
  // The unparseable value is not stored in the typed field; both tokens survive verbatim.
  assert.equal(settings.commandTimeout, undefined);
  assert.deepEqual(extraArgs, ['--commandTimeout', 'abc']);
  assert.equal(settings.shell, 'cmd');
});

// ---- P59: an out-of-range log limit round-trips via extraArgs ----------------------

test('P59: a finite out-of-range maxReturnLines falls through to extraArgs', () => {
  // The server applies any CLI maxReturnLines > 0 (applyCliLogging, no re-validation), but the
  // typed field's bound (1..10000, integer) cannot hold 50000 and validateLaunchSpec would
  // refuse it. maxReturnLines has no form control, so modeling it would strand every save;
  // preserve it verbatim instead. Both the space-separated and attached forms divert.
  const a = parseServerArgs(['--maxReturnLines', '50000', '--shell', 'cmd']);
  assert.equal(a.settings.maxReturnLines, undefined);
  assert.deepEqual(a.extraArgs, ['--maxReturnLines', '50000']);
  assert.equal(a.settings.shell, 'cmd');

  const b = parseServerArgs(['--max-return-lines=0']);
  assert.equal(b.settings.maxReturnLines, undefined);
  assert.deepEqual(b.extraArgs, ['--max-return-lines=0']);

  // An in-range value is still modeled into the typed field so the form stays editable.
  const c = parseServerArgs(['--maxReturnLines', '200']);
  assert.equal(c.settings.maxReturnLines, 200);
  assert.deepEqual(c.extraArgs, []);
});

test('P59: a finite out-of-range maxOutputLines falls through to extraArgs', () => {
  const a = parseServerArgs(['--maxOutputLines', '50000']);
  assert.equal(a.settings.maxOutputLines, undefined);
  assert.deepEqual(a.extraArgs, ['--maxOutputLines', '50000']);

  // A fractional value in range is accepted by the field (validateLoggingConfig allows it).
  const b = parseServerArgs(['--maxOutputLines', '1.5']);
  assert.equal(b.settings.maxOutputLines, 1.5);
  assert.deepEqual(b.extraArgs, []);
});

// ---- P64: a non-positive security limit round-trips via extraArgs ------------------

test('P64: a non-positive commandTimeout/maxCommandLength falls through to extraArgs', () => {
  // The server ignores a non-positive commandTimeout/maxCommandLength and runs on its default,
  // but the form's number input rejects negatives and validateLaunchSpec blocks any value <= 0.
  // Modeling it would strand every save; preserve it verbatim so an unrelated edit round-trips
  // the existing entry. Both the space-separated and attached forms divert.
  const a = parseServerArgs(['--commandTimeout', '0', '--shell', 'cmd']);
  assert.equal(a.settings.commandTimeout, undefined);
  assert.deepEqual(a.extraArgs, ['--commandTimeout', '0']);
  assert.equal(a.settings.shell, 'cmd');

  const b = parseServerArgs(['--maxCommandLength=-1']);
  assert.equal(b.settings.maxCommandLength, undefined);
  assert.deepEqual(b.extraArgs, ['--maxCommandLength=-1']);

  // A positive value is still modeled into the typed field so the form stays editable.
  const c = parseServerArgs(['--commandTimeout', '30']);
  assert.equal(c.settings.commandTimeout, 30);
  assert.deepEqual(c.extraArgs, []);
});

// ---- P42: multiple unknown value-bearing extras in the suffix ---------------------

test('P42: a suffix with several valued extras still recovers the modeled flags', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'wcli0',
    args: ['--shell', 'cmd', '--future', 'x', '--another', 'y'],
  });
  // The modeled --shell is recovered (not stranded in customArgs), and every unknown
  // flag/value pair round-trips in extraArgs.
  assert.equal(settings.launchMethod, 'custom');
  assert.deepEqual(settings.customArgs, []);
  assert.equal(settings.shell, 'cmd');
  assert.deepEqual(settings.extraArgs, ['--future', 'x', '--another', 'y']);
});

// ---- P43: keep scanning past an ambiguous leading wrapper flag --------------------

test('P43: a wrapper flag before the modeled flags still recovers the server suffix', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'wrapper',
    args: ['--no-cache', '--shell', 'bash'],
  });
  assert.equal(settings.launchMethod, 'custom');
  // The index-0 run is ambiguous for a non-wcli0 command, but instead of stranding the whole
  // argv in the launcher the scan continues and splits at --shell: --no-cache stays in
  // customArgs and --shell is modeled (so a shell edit replaces it, not appends a second).
  assert.deepEqual(settings.customArgs, ['--no-cache']);
  assert.equal(settings.shell, 'bash');
  assert.deepEqual(settings.extraArgs, []);
});

test('P43: a leading colliding wrapper flag still keeps a later modeled flag editable', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'wrapper',
    args: ['--config', 'wrapper.json', '--shell', 'cmd'],
  });
  // The wrapper's own --config stays in customArgs (not misread as wcli0.configFile), while
  // the later --shell is modeled.
  assert.deepEqual(settings.customArgs, ['--config', 'wrapper.json']);
  assert.equal(settings.configFile, '');
  assert.equal(settings.shell, 'cmd');
});

// ---- P56: an unknown-only wrapper suffix stays with the launcher ------------------

test('P56: an unknown-only wrapper suffix after a positional stays in customArgs', () => {
  // `wrapper target --verbose`: --verbose is the wrapper's own option and the suffix carries no
  // modeled wcli0 flag, so it must stay in customArgs. Moving it into extraArgs would reorder it
  // after the generated server flags on a later save (target --shell cmd --verbose), changing
  // the wrapper invocation.
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'wrapper',
    args: ['target', '--verbose'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.deepEqual(settings.customArgs, ['target', '--verbose']);
  assert.deepEqual(settings.extraArgs, []);
});

test('P56: a wrapper suffix with a modeled flag among unknown flags still splits', () => {
  // Evidence of a modeled flag (--shell) means the suffix IS wcli0's, so it is still recovered
  // even when an unknown flag precedes it; only the truly unknown-only suffix stays put.
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'wrapper',
    args: ['target', '--verbose', '--shell', 'cmd'],
  });
  assert.deepEqual(settings.customArgs, ['target']);
  assert.equal(settings.shell, 'cmd');
  assert.deepEqual(settings.extraArgs, ['--verbose']);
});

test('P56: the wcli0 binary still models an unknown-only arg run as extraArgs', () => {
  // For the wcli0 binary the index-0 run is genuinely wcli0's, so an unknown-only flag is a
  // legitimate extraArg, not a launcher positional — requireModeled does not apply.
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: '/usr/local/bin/wcli0',
    args: ['--verbose'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.deepEqual(settings.customArgs, []);
  assert.deepEqual(settings.extraArgs, ['--verbose']);
});

// ---- P44: a value option followed by another flag must not swallow it -------------

test('P44: a value option followed by another flag preserves both', () => {
  const { settings, extraArgs } = parseServerArgs(['--blockedCommand', '--debug']);
  // --blockedCommand has no value (next token is a flag): it round-trips verbatim and --debug
  // is still applied, instead of modeling blockedCommands=['--debug'] and dropping debug.
  assert.equal(settings.debug, true);
  assert.equal(settings.blockedCommands, undefined);
  assert.deepEqual(extraArgs, ['--blockedCommand']);
});

// ---- P45: bundled -c config alias forms ------------------------------------------

test('P45: bundled short config aliases are modeled as configFile', () => {
  // -c with an attached value, and the c alias bundled with other letters (value attached
  // or as the next token) — all set the server's config, mirroring stripConfigArgs.
  assert.equal(parseServerArgs(['-c/ws/a.json']).settings.configFile, '/ws/a.json');
  assert.equal(parseServerArgs(['-xc', '/ws/b.json']).settings.configFile, '/ws/b.json');
  assert.equal(parseServerArgs(['-xc/ws/c.json']).settings.configFile, '/ws/c.json');
});

test('P62: a short bundle yargs would NOT read as config is preserved, not fabricated', () => {
  // yargs (config alias `c`, default parser) only attaches a single-dash bundle remainder as
  // the config string when it is fully numeric or starts with a non-word, non-dot path char.
  // A word-character start parses as separate short boolean flags (`-cfoo` => -c -f -o -o,
  // config=""), and a leading `.` as a dot-notation object — never as the literal remainder.
  // Modeling those as configFile would fabricate a path the server never used and let a no-op
  // save emit a spurious `--config <value>`, so they must round-trip verbatim in extraArgs.
  for (const bundle of ['-cfoo', '-cX', '-cfoo.json', '-cC:/x.json', '-c.foo', '-c.config.json']) {
    const { settings, extraArgs } = parseServerArgs([bundle]);
    assert.equal(settings.configFile, undefined, `${bundle} must not set configFile`);
    assert.deepEqual(extraArgs, [bundle], `${bundle} must round-trip verbatim`);
  }

  // The shapes yargs DOES read as config still resolve (path separator start, or numeric).
  assert.equal(parseServerArgs(['-c/etc/x.json']).settings.configFile, '/etc/x.json');
  assert.equal(parseServerArgs(['-c~/x.json']).settings.configFile, '~/x.json');
  assert.equal(parseServerArgs(['-c123']).settings.configFile, '123');
});

// ---- P47: yargs kebab-case option aliases ----------------------------------------

test('P47: kebab-case option aliases are modeled like their camelCase forms', () => {
  const { settings } = parseServerArgs([
    '--max-command-length', '1000',
    '--blocked-command', 'rm',
    '--allow-all-dirs',
    '--no-enable-truncation',
  ]);
  assert.equal(settings.maxCommandLength, 1000);
  assert.deepEqual(settings.blockedCommands, ['rm']);
  assert.equal(settings.allowAllDirs, true);
  assert.equal(settings.enableTruncation, 'disabled');
});
