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

test('P60: init reports which inheritable enum/boolean keys are set at the scope', async () => {
  // safetyMode set only at User scope; allowAllDirs set at Workspace.
  vscode.__setConfig(vscode.ConfigurationTarget.Global, 'wcli0.safetyMode', 'unsafe');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.allowAllDirs', true);
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' }); // default scope is Workspace
  const init = panel.webview.posted.find((m) => m.type === 'init');
  assert.ok(Array.isArray(init.setSelectKeys), 'setSelectKeys present');
  assert.ok(init.setSelectKeys.includes('allowAllDirs'), 'workspace allowAllDirs reported set');
  // safetyMode is a User override, unset at Workspace -> not reported, so the form
  // shows Inherit instead of the schema default "safe".
  assert.ok(!init.setSelectKeys.includes('safetyMode'), 'unset workspace safetyMode not reported');
});

test('P69: init reports which optional-array keys are explicitly set at the scope', async () => {
  // An explicit empty allowedDirectories at Workspace is a meaningful override.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.allowedDirectories', []);
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  const init = panel.webview.posted.find((m) => m.type === 'init');
  assert.ok(Array.isArray(init.setArrayKeys), 'setArrayKeys present');
  assert.ok(init.setArrayKeys.includes('allowedDirectories'), 'explicit empty array reported set');
});

test('P69: an unset allowedDirectories is not reported as set', async () => {
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  const init = panel.webview.posted.find((m) => m.type === 'init');
  assert.ok(!init.setArrayKeys.includes('allowedDirectories'), 'unset array not reported');
});

test('P70: a confirmed scope-change request reloads the requested scope', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Global, 'wcli0.safetyMode', 'unsafe');
  vscode.__state.calls.warnReturn = 'Discard changes';
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' }); // default Workspace
  panel.webview.posted.length = 0;
  await panel.webview._handler({ type: 'scopeChangeRequest', target: 'Global' });
  const init = panel.webview.posted.find((m) => m.type === 'init');
  assert.ok(init, 'a fresh init was posted after confirmation');
  assert.equal(init.scope, 'Global', 'reloads the requested scope');
});

test('P70: a cancelled scope-change request keeps the current scope (no reload)', async () => {
  vscode.__state.calls.warnReturn = undefined; // user dismissed the modal
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' }); // default Workspace
  panel.webview.posted.length = 0;
  await panel.webview._handler({ type: 'scopeChangeRequest', target: 'Global' });
  assert.equal(panel.webview.posted.find((m) => m.type === 'init'), undefined, 'no reload on cancel');
});

test('P61: saving re-posts settings so a deferred external change is reconciled', async () => {
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  panel.webview.posted = [];
  // An external change lands in the Workspace scope while the form is open.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.safetyMode', 'unsafe');
  // The user saves an unrelated field.
  await panel.webview._handler({
    type: 'save',
    target: 'Workspace',
    values: { commandTimeout: 30 },
  });
  const init = panel.webview.posted.find((m) => m.type === 'init');
  assert.ok(init, 'settings re-posted after save');
  // The post-save refresh reflects the external safetyMode change for the untouched
  // field, instead of leaving the form showing the stale value.
  assert.equal(init.settings.safetyMode, 'unsafe');
  assert.ok(panel.webview.posted.some((m) => m.type === 'saved'), 'saved indicator still sent');
});

test('P89: a Workspace save with no workspace folder open is refused, not retargeted', async () => {
  // No workspace folder: a Workspace-targeted save must error and write nothing,
  // rather than silently persisting the values into User scope.
  vscode.__state.workspaceFolders = undefined;
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  panel.webview.posted = [];
  await panel.webview._handler({
    type: 'save',
    target: 'Workspace',
    values: { safetyMode: 'unsafe' },
  });
  // Nothing written to either scope, an error was surfaced, and no saved/info sent.
  assert.equal(vscode.__state.configWorkspace.has('wcli0.safetyMode'), false);
  assert.equal(vscode.__state.configGlobal.has('wcli0.safetyMode'), false);
  assert.equal(vscode.__state.calls.error.length, 1);
  assert.equal(vscode.__state.calls.info.length, 0);
  assert.equal(panel.webview.posted.some((m) => m.type === 'saved'), false);
});

test('P45: the logging tri-state selects offer an Inherit option', () => {
  openConfigPanel(makeContext());
  const html = vscode.__state.lastWebviewPanel.webview.html;
  const trunc = html.match(/<select id="enableTruncation">[\s\S]*?<\/select>/)[0];
  const logres = html.match(/<select id="enableLogResources">[\s\S]*?<\/select>/)[0];
  assert.match(trunc, /<option value="">Inherit<\/option>/);
  assert.match(logres, /<option value="">Inherit<\/option>/);
});
