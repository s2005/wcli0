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
    values: { shell: 'cmd', commandTimeout: 42, 'launch.packageSpec': '' },
  });
  const cfg = vscode.workspace.getConfiguration('wcli0');
  assert.equal(cfg.get('shell', 'all'), 'cmd');
  assert.equal(cfg.get('commandTimeout', null), 42);
  // A non-optional key's empty string clears back to default (undefined).
  assert.equal(cfg.get('launch.packageSpec', 'DEFAULT'), 'DEFAULT');
  assert.equal(vscode.__state.calls.info.length, 1);
});

test('scope change reloads values stored at the selected scope', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Global, 'wcli0.shell', 'powershell');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shell', 'cmd');
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  panel.webview.posted = [];
  await panel.webview._handler({ type: 'scopeChange', target: 'Global' });
  const init = panel.webview.posted.find((m) => m.type === 'init');
  assert.equal(init.scope, 'Global');
  // Global scope shows its own value, not the workspace override.
  assert.equal(init.settings.shell, 'powershell');
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

test('P39: workspace folder removal normalizes currentScope to Global and re-posts', async () => {
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  let init = panel.webview.posted.find((m) => m.type === 'init');
  assert.equal(init.scope, 'Workspace');
  assert.equal(init.hasWorkspace, true);

  panel.webview.posted = [];
  // Simulate removal of the only workspace folder while the form is open.
  vscode.__state.workspaceFolders = undefined;
  for (const cb of vscode.__state.workspaceFoldersChangeListeners) {
    cb();
  }
  init = panel.webview.posted.find((m) => m.type === 'init');
  assert.ok(init, 're-posted on workspace folder change');
  assert.equal(init.scope, 'Global', 'scope normalized to Global');
  assert.equal(init.hasWorkspace, false);
});

test('P39: workspace folder addition re-posts with hasWorkspace=true', async () => {
  // Start with no workspace: scope is Global.
  vscode.__state.workspaceFolders = undefined;
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  let init = panel.webview.posted.find((m) => m.type === 'init');
  assert.equal(init.hasWorkspace, false);

  panel.webview.posted = [];
  vscode.__state.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  for (const cb of vscode.__state.workspaceFoldersChangeListeners) {
    cb();
  }
  init = panel.webview.posted.find((m) => m.type === 'init');
  assert.ok(init, 're-posted on workspace folder addition');
  assert.equal(init.hasWorkspace, true);
});

test('P41: selecting Inherit (empty string) for an enum clears the scope override', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.safetyMode', 'unsafe');
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({
    type: 'save',
    target: 'Workspace',
    values: { safetyMode: '' }, // Inherit
  });
  // The previous Workspace override must be cleared, not overwritten with ''.
  assert.equal(vscode.__state.configWorkspace.has('wcli0.safetyMode'), false);
});

test('P41: selecting Inherit (null) for a boolean clears the scope override', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.debug', true);
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({
    type: 'save',
    target: 'Workspace',
    values: { debug: null }, // Inherit
  });
  assert.equal(vscode.__state.configWorkspace.has('wcli0.debug'), false);
});

test('P41: selecting Inherit for launch.method clears the scope override', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.method', 'node');
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({
    type: 'save',
    target: 'Workspace',
    values: { 'launch.method': '' },
  });
  assert.equal(vscode.__state.configWorkspace.has('wcli0.launch.method'), false);
});

test('P48: an explicit empty value for configFile is persisted, not cleared', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Global, 'wcli0.configFile', '/user/config.json');
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({
    type: 'save',
    target: 'Workspace',
    values: { configFile: '' }, // explicit empty override (Inherit unchecked)
  });
  // The empty override is stored so it masks the non-empty User value.
  assert.equal(vscode.__state.configWorkspace.has('wcli0.configFile'), true);
  assert.equal(vscode.__state.configWorkspace.get('wcli0.configFile'), '');
});

test('P48: Inherit (null) for configFile clears the scope override', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.configFile', '/ws/config.json');
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({
    type: 'save',
    target: 'Workspace',
    values: { configFile: null }, // Inherit checked
  });
  assert.equal(vscode.__state.configWorkspace.has('wcli0.configFile'), false);
});

test('P48: init reports which optional-string keys are explicitly set at the scope', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.configFile', '');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.initialDir', '/ws/start');
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  const init = panel.webview.posted.find((m) => m.type === 'init');
  assert.ok(init.setKeys.includes('configFile'), 'explicit empty configFile reported as set');
  assert.ok(init.setKeys.includes('initialDir'), 'initialDir reported as set');
  assert.ok(!init.setKeys.includes('logDirectory'), 'unset logDirectory not reported');
});

test('P45: the logging tri-state selects offer an Inherit option', () => {
  openConfigPanel(makeContext());
  const html = vscode.__state.lastWebviewPanel.webview.html;
  const trunc = html.match(/<select id="enableTruncation">[\s\S]*?<\/select>/)[0];
  const logres = html.match(/<select id="enableLogResources">[\s\S]*?<\/select>/)[0];
  assert.match(trunc, /<option value="">Inherit<\/option>/);
  assert.match(logres, /<option value="">Inherit<\/option>/);
});
