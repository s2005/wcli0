const test = require('node:test');
const assert = require('node:assert/strict');

const vscode = require('../stubs/vscode.cjs');
const { openConfigPanel } = require('../../dist/webview.js');

function makeContext() {
  return { subscriptions: [] };
}

test.beforeEach(() => {
  vscode.__reset();
  vscode.__state.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
});

// openConfigPanel keeps a module-level singleton; dispose it so each test starts
// from a clean slate (disposing fires the module's onDidDispose -> clears it).
test.afterEach(() => {
  const p = vscode.__state.lastWebviewPanel;
  if (p && !p.disposed) {
    p.dispose();
  }
});

test('opens a panel and renders the configuration form', () => {
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  assert.ok(panel, 'panel created');
  assert.match(panel.webview.html, /wcli0 Configuration|Launch method/);
  assert.match(panel.webview.html, /Save to:/);
});

test('ready message posts the current settings to the webview', async () => {
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  const init = panel.webview.posted.find((m) => m.type === 'init');
  assert.ok(init, 'init posted');
  assert.equal(init.hasWorkspace, true);
  assert.equal(init.settings.launchMethod, 'npx');
});

test('save message persists values to the chosen scope', async () => {
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({
    type: 'save',
    target: 'Workspace',
    values: { shell: 'cmd', commandTimeout: 42, configFile: '' },
  });
  const cfg = vscode.workspace.getConfiguration('wcli0');
  assert.equal(cfg.get('shell', 'all'), 'cmd');
  assert.equal(cfg.get('commandTimeout', null), 42);
  // empty string clears back to default (undefined).
  assert.equal(cfg.get('configFile', 'DEFAULT'), 'DEFAULT');
  assert.equal(vscode.__state.calls.info.length, 1);
});

test('save to User scope targets global configuration', async () => {
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'save', target: 'Global', values: { debug: true } });
  assert.equal(vscode.__state.configGlobal.get('wcli0.debug'), true);
});

test('action messages delegate to the corresponding commands', async () => {
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  for (const [type, id] of [
    ['generateConfig', 'wcli0.generateConfigFile'],
    ['writeMcpJson', 'wcli0.writeWorkspaceMcpJson'],
    ['showCommand', 'wcli0.showLaunchCommand'],
  ]) {
    await panel.webview._handler({ type });
    assert.ok(
      vscode.__state.calls.executedCommands.some((c) => c.id === id),
      `executed ${id}`,
    );
  }
});

test('reopening reveals the existing panel instead of creating a new one', () => {
  const ctx = makeContext();
  openConfigPanel(ctx);
  const first = vscode.__state.lastWebviewPanel;
  openConfigPanel(ctx);
  assert.equal(vscode.__state.lastWebviewPanel, first);
  assert.equal(first.revealed, true);
});

test('config changes re-post settings, and dispose clears the panel', async () => {
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  panel.webview.posted = [];
  // Simulate an external configuration change.
  for (const cb of vscode.__state.configChangeListeners) {
    cb({ affectsConfiguration: (s) => s === 'wcli0' });
  }
  assert.ok(panel.webview.posted.some((m) => m.type === 'init'));

  // Dispose should allow a fresh panel to be created next time.
  panel.dispose();
  openConfigPanel(makeContext());
  assert.notEqual(vscode.__state.lastWebviewPanel, panel);
});
