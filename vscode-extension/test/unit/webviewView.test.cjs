const test = require('node:test');
const assert = require('node:assert/strict');

const vscode = require('../stubs/vscode.cjs');
const { Wcli0ConfigViewProvider } = require('../../dist/webview.js');

test.beforeEach(() => {
  vscode.__reset();
  vscode.__state.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
});

test('resolveWebviewView renders the configuration form', () => {
  const provider = new Wcli0ConfigViewProvider();
  const view = vscode.__createWebviewView();
  provider.resolveWebviewView(view);
  assert.match(view.webview.html, /wcli0 Configuration|Launch method/);
  assert.match(view.webview.html, /Save to:/);
  assert.deepEqual(view.webview.options, { enableScripts: true });
});

test('transport host/port are wired to the transport mode', () => {
  const provider = new Wcli0ConfigViewProvider();
  const view = vscode.__createWebviewView();
  provider.resolveWebviewView(view);
  // Host/Port must toggle with the mode (disabled under stdio) and the form
  // must apply that state on load, not just on change.
  assert.match(view.webview.html, /function updateTransportRows/);
  assert.match(view.webview.html, /transport\.mode'\)\.addEventListener\('change', updateTransportRows\)/);
  assert.match(view.webview.html, /updateTransportRows\(\);/);
  assert.match(view.webview.html, /Host and Port apply to http\/sse transport only/);
});

test('ready message posts the current settings to the view', async () => {
  const provider = new Wcli0ConfigViewProvider();
  const view = vscode.__createWebviewView();
  provider.resolveWebviewView(view);
  await view.webview._handler({ type: 'ready' });
  const init = view.webview.posted.find((m) => m.type === 'init');
  assert.ok(init, 'init posted');
  assert.equal(init.hasWorkspace, true);
  assert.equal(init.settings.launchMethod, 'npx');
});

test('save message persists values to the chosen scope', async () => {
  const provider = new Wcli0ConfigViewProvider();
  const view = vscode.__createWebviewView();
  provider.resolveWebviewView(view);
  await view.webview._handler({
    type: 'save',
    target: 'Workspace',
    values: { shell: 'cmd', commandTimeout: 42, configFile: '' },
  });
  const cfg = vscode.workspace.getConfiguration('wcli0');
  assert.equal(cfg.get('shell', 'all'), 'cmd');
  assert.equal(cfg.get('commandTimeout', null), 42);
  assert.equal(cfg.get('configFile', 'DEFAULT'), 'DEFAULT');
  assert.equal(vscode.__state.calls.info.length, 1);
});

test('scope change reloads values stored at the selected scope', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Global, 'wcli0.shell', 'powershell');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shell', 'cmd');
  const provider = new Wcli0ConfigViewProvider();
  const view = vscode.__createWebviewView();
  provider.resolveWebviewView(view);
  view.webview.posted = [];
  await view.webview._handler({ type: 'scopeChange', target: 'Global' });
  const init = view.webview.posted.find((m) => m.type === 'init');
  assert.equal(init.scope, 'Global');
  assert.equal(init.settings.shell, 'powershell');
});

test('action messages delegate to the corresponding commands', async () => {
  const provider = new Wcli0ConfigViewProvider();
  const view = vscode.__createWebviewView();
  provider.resolveWebviewView(view);
  for (const [type, id] of [
    ['generateConfig', 'wcli0.generateConfigFile'],
    ['writeMcpJson', 'wcli0.writeWorkspaceMcpJson'],
    ['showCommand', 'wcli0.showLaunchCommand'],
  ]) {
    await view.webview._handler({ type });
    assert.ok(
      vscode.__state.calls.executedCommands.some((c) => c.id === id),
      `executed ${id}`,
    );
  }
});

test('export actions persist current form edits before running the command', async () => {
  const provider = new Wcli0ConfigViewProvider();
  const view = vscode.__createWebviewView();
  provider.resolveWebviewView(view);
  // Simulate clicking "Write .vscode/mcp.json" with unsaved Limits & Safety edits.
  await view.webview._handler({
    type: 'writeMcpJson',
    target: 'Workspace',
    values: { commandTimeout: 77, safetyMode: 'yolo' },
  });
  const cfg = vscode.workspace.getConfiguration('wcli0');
  // The edits must be persisted (so the command sees them), then the command runs.
  assert.equal(cfg.get('commandTimeout', null), 77);
  assert.equal(cfg.get('safetyMode', 'safe'), 'yolo');
  const order = vscode.__state.calls.executedCommands.map((c) => c.id);
  assert.ok(order.includes('wcli0.writeWorkspaceMcpJson'), 'command executed');
  // The view is told it saved so the form re-baselines its "changed" tracking.
  assert.ok(view.webview.posted.some((m) => m.type === 'saved'));
});

test('export actions with no edits do not write settings but still run', async () => {
  const provider = new Wcli0ConfigViewProvider();
  const view = vscode.__createWebviewView();
  provider.resolveWebviewView(view);
  await view.webview._handler({ type: 'showCommand', target: 'Workspace', values: {} });
  // Nothing persisted, but the command still runs.
  assert.equal(vscode.workspace.getConfiguration('wcli0').get('commandTimeout', 'UNSET'), 'UNSET');
  assert.ok(
    vscode.__state.calls.executedCommands.some((c) => c.id === 'wcli0.showLaunchCommand'),
  );
});

test('config changes re-post settings to the view', async () => {
  const provider = new Wcli0ConfigViewProvider();
  const view = vscode.__createWebviewView();
  provider.resolveWebviewView(view);
  view.webview.posted = [];
  for (const cb of vscode.__state.configChangeListeners) {
    cb({ affectsConfiguration: (s) => s === 'wcli0' });
  }
  assert.ok(view.webview.posted.some((m) => m.type === 'init'));
});

test('view dispose cleans up subscriptions and a fresh view re-renders', () => {
  const provider = new Wcli0ConfigViewProvider();
  const view = vscode.__createWebviewView();
  provider.resolveWebviewView(view);
  view.dispose();
  // After disposal, resolving a new view should still work (no shared state leak).
  const view2 = vscode.__createWebviewView();
  provider.resolveWebviewView(view2);
  assert.match(view2.webview.html, /Launch method/);
});
