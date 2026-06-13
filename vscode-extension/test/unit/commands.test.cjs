const test = require('node:test');
const assert = require('node:assert/strict');

const vscode = require('../stubs/vscode.cjs');
const {
  generateConfigFile,
  writeWorkspaceMcpJson,
  showLaunchCommand,
  refreshServerDefinition,
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
  // configFile setting now points at the saved file.
  assert.equal(
    vscode.workspace.getConfiguration('wcli0').get('configFile', ''),
    '/ws/wcli0.config.json',
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
  assert.match(text, /env: .*FOO/);
});

test('refreshServerDefinition refreshes the provider', async () => {
  let refreshed = 0;
  await refreshServerDefinition({ refresh: () => (refreshed += 1) });
  assert.equal(refreshed, 1);
});

test('writeWorkspaceMcpJson includes a configured cwd', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.cwd', '${workspaceFolder}/sub');
  await writeWorkspaceMcpJson();
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.equal(parsed.servers.wcli0.cwd, '/ws/sub');
});

test('writeWorkspaceMcpJson refuses a broken launch config', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.method', 'node');
  // nodeScriptPath empty -> blocking
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.calls.error.length, 1);
  assert.equal(vscode.__state.files.has('/ws/.vscode/mcp.json'), false);
});

test('writeWorkspaceMcpJson preserves a syntactically broken existing file', async () => {
  vscode.__state.files.set('/ws/.vscode/mcp.json', Buffer.from('{ not json'));
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.calls.error.length, 1);
  // File left untouched.
  assert.equal(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'), '{ not json');
});
