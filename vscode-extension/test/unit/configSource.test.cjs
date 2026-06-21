const test = require('node:test');
const assert = require('node:assert/strict');

const vscode = require('../stubs/vscode.cjs');
const {
  detectWorkspaceMcpJson,
  readWcli0Entry,
  parseServerArgs,
  parseMcpEntry,
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

test('buildLaunchSpec -> parseMcpEntry round-trips an http endpoint', () => {
  const s = defaults({ transportMode: 'http', transportHost: '127.0.0.1', transportPort: 7777 });
  const spec = buildLaunchSpec(s, { resolvePaths: false });
  // An http launch command still carries --transport http etc.; parse them back.
  const { settings } = parseMcpEntry({ type: 'stdio', command: spec.command, args: spec.args });
  assert.equal(settings.transportMode, 'http');
  assert.equal(settings.transportPort, 7777);
});
