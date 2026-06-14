const test = require('node:test');
const assert = require('node:assert/strict');

const vscode = require('../stubs/vscode.cjs');
const {
  generateConfigFile,
  writeWorkspaceMcpJson,
  showLaunchCommand,
  refreshServerDefinition,
  parseJsonc,
} = require('../../dist/commands.js');

const WS = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];

test.beforeEach(() => {
  vscode.__reset();
  vscode.__state.workspaceFolders = WS;
});

test('generateConfigFile writes JSON and sets configFile when chosen', async () => {
  const target = vscode.Uri.file('/ws/wcli0.config.json');
  vscode.__state.calls.saveDialog = target;
  vscode.__state.calls.infoReturn = 'Set wcli0.configFile';

  await generateConfigFile();

  const written = vscode.__state.files.get('/ws/wcli0.config.json');
  assert.ok(written, 'config file was written');
  const parsed = JSON.parse(written.toString('utf8'));
  assert.ok(parsed.global && parsed.shells, 'has global + shells');
  assert.equal(vscode.__state.calls.shownDocs.length, 1);
  // configFile setting points at the saved file as a portable workspace-relative path.
  assert.equal(
    vscode.workspace.getConfiguration('wcli0').get('configFile', ''),
    '${workspaceFolder}/wcli0.config.json',
  );
});

test('generateConfigFile is a no-op when the save dialog is cancelled', async () => {
  vscode.__state.calls.saveDialog = undefined;
  await generateConfigFile();
  assert.equal(vscode.__state.files.size, 0);
});

test('writeWorkspaceMcpJson creates a stdio server entry', async () => {
  await writeWorkspaceMcpJson();
  const raw = vscode.__state.files.get('/ws/.vscode/mcp.json');
  assert.ok(raw, 'mcp.json written');
  const parsed = JSON.parse(raw.toString('utf8'));
  assert.equal(parsed.servers.wcli0.type, 'stdio');
  assert.equal(parsed.servers.wcli0.command, 'npx');
});

test('P6: writeWorkspaceMcpJson refuses to export when shells are configured individually', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shells', {
    cmd: { executable: { command: 'cmd.exe', args: ['/k'] } },
  });
  await writeWorkspaceMcpJson();
  // No file written, and an explanatory error was shown (a stdio entry with only
  // CLI flags would silently drop the per-shell settings).
  assert.equal(vscode.__state.files.has('/ws/.vscode/mcp.json'), false);
  assert.ok(vscode.__state.calls.error.some((m) => /per-shell settings/i.test(m)));
});

test('writeWorkspaceMcpJson merges into an existing file', async () => {
  vscode.__state.files.set(
    '/ws/.vscode/mcp.json',
    Buffer.from(JSON.stringify({ servers: { other: { type: 'stdio' } } })),
  );
  await writeWorkspaceMcpJson();
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.ok(parsed.servers.other, 'existing server preserved');
  assert.ok(parsed.servers.wcli0, 'wcli0 server added');
});

test('writeWorkspaceMcpJson emits an http url entry in http mode', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.mode', 'http');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.port', 7000);
  await writeWorkspaceMcpJson();
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.equal(parsed.servers.wcli0.type, 'http');
  assert.match(parsed.servers.wcli0.url, /:7000\/mcp$/);
});

test('writeWorkspaceMcpJson normalizes a wildcard host in the url', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.mode', 'http');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.host', '0.0.0.0');
  await writeWorkspaceMcpJson();
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.match(parsed.servers.wcli0.url, /^http:\/\/127\.0\.0\.1:/);
});

test('writeWorkspaceMcpJson aborts on a non-not-found read error', async () => {
  const err = new Error('permission denied');
  err.code = 'NoPermissions';
  vscode.__state.readError = err;
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.calls.error.length, 1);
  assert.equal(vscode.__state.files.has('/ws/.vscode/mcp.json'), false);
});

test('writeWorkspaceMcpJson errors without a workspace', async () => {
  vscode.__state.workspaceFolders = undefined;
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.calls.error.length, 1);
  assert.equal(vscode.__state.files.size, 0);
});

test('showLaunchCommand writes the command to output and can copy it', async () => {
  const output = vscode.window.createOutputChannel('test');
  vscode.__state.calls.infoReturn = 'Copy command';
  await showLaunchCommand(output);
  const text = output.lines.join('\n');
  assert.match(text, /npx -y wcli0@latest/);
  // copy happens asynchronously via the un-awaited notification.
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(vscode.__state.calls.clipboard.length, 1);
});

test('showLaunchCommand notes unsafe mode in the output', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.safetyMode', 'unsafe');
  const output = vscode.window.createOutputChannel('test');
  await showLaunchCommand(output);
  assert.match(output.lines.join('\n'), /unsafe/);
});

test('showLaunchCommand reports cwd and env when configured', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.cwd', '${workspaceFolder}');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.env', { FOO: 'bar' });
  const output = vscode.window.createOutputChannel('test');
  await showLaunchCommand(output);
  const text = output.lines.join('\n');
  assert.match(text, /cwd: \/ws/);
  // env values are redacted; only names are shown.
  assert.match(text, /env \(values hidden\): FOO/);
  assert.equal(/bar/.test(text), false);
});

test('refreshServerDefinition refreshes the provider', async () => {
  let refreshed = 0;
  await refreshServerDefinition({ refresh: () => (refreshed += 1) });
  assert.equal(refreshed, 1);
});

test('writeWorkspaceMcpJson preserves a portable cwd token', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.cwd', '${workspaceFolder}/sub');
  await writeWorkspaceMcpJson();
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  // Committed mcp.json keeps the portable token rather than an absolute path.
  assert.equal(parsed.servers.wcli0.cwd, '${workspaceFolder}/sub');
});

test('writeWorkspaceMcpJson refuses a broken launch config', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.method', 'node');
  // nodeScriptPath empty -> blocking
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.calls.error.length, 1);
  assert.equal(vscode.__state.files.has('/ws/.vscode/mcp.json'), false);
});

test('writeWorkspaceMcpJson omits cwd unless launch.cwd is configured', async () => {
  await writeWorkspaceMcpJson();
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  // No default cwd: avoids the server auto-loading <workspace>/config.json.
  assert.equal(parsed.servers.wcli0.cwd, undefined);
});

test('writeWorkspaceMcpJson writes an http entry despite a broken local launch config', async () => {
  // node method with no script path would block a stdio write, but an http entry
  // only needs a URL, so the irrelevant local-launch problem must not block it.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.method', 'node');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.mode', 'http');
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.calls.error.length, 0);
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.equal(parsed.servers.wcli0.type, 'http');
});

test('writeWorkspaceMcpJson refuses an http entry with an invalid port', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.mode', 'http');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.port', 70000);
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.calls.error.length, 1);
  assert.equal(vscode.__state.files.has('/ws/.vscode/mcp.json'), false);
});

test('writeWorkspaceMcpJson merges into a JSONC file with comments and trailing commas', async () => {
  vscode.__state.files.set(
    '/ws/.vscode/mcp.json',
    Buffer.from('{\n  // keep this\n  "servers": {\n    "other": { "type": "stdio", },\n  },\n}'),
  );
  // Comments present -> the command confirms before reformatting away comments.
  vscode.__state.calls.warnReturn = 'Write anyway';
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.calls.error.length, 0);
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.ok(parsed.servers.other, 'existing server preserved');
  assert.ok(parsed.servers.wcli0, 'wcli0 server added');
});

test('parseJsonc strips comments and trailing commas but preserves string contents', () => {
  const parsed = parseJsonc(`{
    // line comment
    "a": 1, /* block */
    "b": "x // y, /* z */ \\" still string",
    "c": [1, 2,],
  }`);
  assert.deepEqual(parsed, { a: 1, b: 'x // y, /* z */ " still string', c: [1, 2] });
});

test('parseJsonc throws on genuinely malformed input', () => {
  assert.throws(() => parseJsonc('{ "a": }'));
});

test('parseJsonc throws on an unterminated block comment', () => {
  assert.throws(() => parseJsonc('{"servers": {}} /* unfinished'), /Unterminated block comment/);
});

test('parseJsonc replaces a block comment with a space so tokens do not fuse', () => {
  // `1/*c*/2` must not become `12`; the space makes it invalid JSON.
  assert.throws(() => parseJsonc('{ "x": 1/*c*/2 }'));
  assert.deepEqual(parseJsonc('{ "a"/* */: 1 }'), { a: 1 });
});

test('writeWorkspaceMcpJson confirms before writing env, and can omit it', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.env', { TOKEN: 'secret' });
  // Include path
  vscode.__state.calls.warnReturn = 'Include environment';
  await writeWorkspaceMcpJson();
  let parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.deepEqual(parsed.servers.wcli0.env, { TOKEN: 'secret' });

  // Omit path
  vscode.__reset();
  vscode.__state.workspaceFolders = WS;
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.env', { TOKEN: 'secret' });
  vscode.__state.calls.warnReturn = 'Omit environment';
  await writeWorkspaceMcpJson();
  parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.equal(parsed.servers.wcli0.env, undefined);
});

test('writeWorkspaceMcpJson aborts the env write when the prompt is dismissed', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.env', { TOKEN: 'secret' });
  vscode.__state.calls.warnReturn = undefined; // dismissed
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.files.has('/ws/.vscode/mcp.json'), false);
});

test('writeWorkspaceMcpJson leaves a commented file untouched when not confirmed', async () => {
  vscode.__state.files.set('/ws/.vscode/mcp.json', Buffer.from('{ /* note */ "servers": {} }'));
  vscode.__state.calls.warnReturn = undefined; // declined
  await writeWorkspaceMcpJson();
  assert.equal(
    vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'),
    '{ /* note */ "servers": {} }',
  );
});

test('writeWorkspaceMcpJson refuses a non-object root', async () => {
  vscode.__state.files.set('/ws/.vscode/mcp.json', Buffer.from('null'));
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.calls.error.length, 1);
  assert.equal(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'), 'null');
});

test('writeWorkspaceMcpJson refuses a non-object servers value', async () => {
  vscode.__state.files.set('/ws/.vscode/mcp.json', Buffer.from('{ "servers": [] }'));
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.calls.error.length, 1);
  assert.equal(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'), '{ "servers": [] }');
});

test('writeWorkspaceMcpJson preserves a syntactically broken existing file', async () => {
  vscode.__state.files.set('/ws/.vscode/mcp.json', Buffer.from('{ not json'));
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.calls.error.length, 1);
  // File left untouched.
  assert.equal(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'), '{ not json');
});
