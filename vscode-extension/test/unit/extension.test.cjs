const test = require('node:test');
const assert = require('node:assert/strict');

const vscode = require('../stubs/vscode.cjs');
const { activate, deactivate } = require('../../dist/extension.js');

function makeContext() {
  // globalStorageUri.fsPath is used as the private "safe cwd"; point it at the
  // OS temp dir so the best-effort mkdir in activate() succeeds during tests.
  return { subscriptions: [], globalStorageUri: { fsPath: require('os').tmpdir() } };
}

test.beforeEach(() => {
  vscode.__reset();
  vscode.__state.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
});

test('activate registers all commands and the MCP provider', () => {
  const ctx = makeContext();
  activate(ctx);

  for (const id of [
    'wcli0.configure',
    'wcli0.generateConfigFile',
    'wcli0.writeWorkspaceMcpJson',
    'wcli0.restartServer',
    'wcli0.showLaunchCommand',
  ]) {
    assert.ok(vscode.__state.calls.registeredCommands.has(id), `registered ${id}`);
  }
  assert.equal(vscode.__state.registeredMcpProviders.length, 1);
  assert.equal(vscode.__state.registeredMcpProviders[0].id, 'wcli0.serverProvider');
  assert.ok(
    vscode.__state.registeredViewProviders.has('wcli0.configView'),
    'registered the configuration view provider',
  );
  assert.ok(ctx.subscriptions.length > 0);
});

test('configuration changes trigger a provider refresh', () => {
  activate(makeContext());
  const { provider } = vscode.__state.registeredMcpProviders[0];
  let fired = 0;
  provider.onDidChangeMcpServerDefinitions(() => (fired += 1));
  for (const cb of vscode.__state.configChangeListeners) {
    cb({ affectsConfiguration: (s) => s === 'wcli0' });
  }
  assert.ok(fired >= 1);
});

test('unrelated configuration changes do not refresh the provider', () => {
  activate(makeContext());
  const { provider } = vscode.__state.registeredMcpProviders[0];
  let fired = 0;
  provider.onDidChangeMcpServerDefinitions(() => (fired += 1));
  for (const cb of vscode.__state.configChangeListeners) {
    cb({ affectsConfiguration: () => false });
  }
  assert.equal(fired, 0);
});

test('the restartServer command refreshes the provider', async () => {
  activate(makeContext());
  const { provider } = vscode.__state.registeredMcpProviders[0];
  let fired = 0;
  provider.onDidChangeMcpServerDefinitions(() => (fired += 1));
  await vscode.__state.calls.registeredCommands.get('wcli0.restartServer')();
  assert.equal(fired, 1);
});

test('each registered command callback runs without throwing', async () => {
  activate(makeContext());
  const cmds = vscode.__state.calls.registeredCommands;
  // generateConfigFile: cancel the save dialog so it is a no-op.
  vscode.__state.calls.saveDialog = undefined;
  for (const id of [
    'wcli0.configure',
    'wcli0.generateConfigFile',
    'wcli0.writeWorkspaceMcpJson',
    'wcli0.showLaunchCommand',
    'wcli0.restartServer',
  ]) {
    await cmds.get(id)();
  }
  // configure opened a webview panel; dispose it to avoid leaking the singleton.
  const panel = vscode.__state.lastWebviewPanel;
  if (panel && !panel.disposed) {
    panel.dispose();
  }
});

test('deactivate is callable', () => {
  assert.doesNotThrow(() => deactivate());
});
