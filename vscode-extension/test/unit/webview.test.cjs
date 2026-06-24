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

test('P28: a save flagged from a file-source reset is confirmed before writing settings', async () => {
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  // Decline the confirmation modal: the file-derived edits must not reach settings.
  vscode.__state.calls.warnReturn = undefined;
  await panel.webview._handler({
    type: 'save',
    target: 'Workspace',
    values: { commandTimeout: 99 },
    fromResetFileSource: true,
  });
  assert.equal(
    vscode.workspace.getConfiguration('wcli0').get('commandTimeout', null),
    null,
    'declining the confirm leaves settings unwritten',
  );
  assert.ok(
    vscode.__state.calls.warn.some((w) => /no longer active/.test(w.message)),
    'a confirmation modal was shown',
  );
});

test('P28: confirming a file-source-reset save writes the values to settings', async () => {
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  vscode.__state.calls.warnReturn = 'Save to settings';
  await panel.webview._handler({
    type: 'save',
    target: 'Workspace',
    values: { commandTimeout: 99 },
    fromResetFileSource: true,
  });
  assert.equal(
    vscode.workspace.getConfiguration('wcli0').get('commandTimeout', null),
    99,
    'the confirmed save persists',
  );
});

test('P28: an export flagged from a file-source reset is confirmed before writing settings', async () => {
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  // Decline the confirmation modal: the file-derived edits must not reach settings,
  // and the export command must not run on the stale/unwritten state.
  vscode.__state.calls.warnReturn = undefined;
  vscode.__state.calls.executedCommands = [];
  await panel.webview._handler({
    type: 'generateConfig',
    target: 'Workspace',
    values: { commandTimeout: 99 },
    fromResetFileSource: true,
  });
  assert.equal(
    vscode.workspace.getConfiguration('wcli0').get('commandTimeout', null),
    null,
    'declining the confirm leaves settings unwritten',
  );
  assert.ok(
    vscode.__state.calls.warn.some((w) => /no longer active/.test(w.message)),
    'a confirmation modal was shown',
  );
  assert.ok(
    !vscode.__state.calls.executedCommands.some((c) => c.id === 'wcli0.generateConfigFile'),
    'the export command does not run after declining',
  );
});

test('P28: confirming a file-source-reset export writes settings then exports', async () => {
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  vscode.__state.calls.warnReturn = 'Save to settings';
  vscode.__state.calls.executedCommands = [];
  await panel.webview._handler({
    type: 'generateConfig',
    target: 'Workspace',
    values: { commandTimeout: 99 },
    fromResetFileSource: true,
  });
  assert.equal(
    vscode.workspace.getConfiguration('wcli0').get('commandTimeout', null),
    99,
    'the confirmed export persists the values first',
  );
  assert.ok(
    vscode.__state.calls.executedCommands.some((c) => c.id === 'wcli0.generateConfigFile'),
    'the export command runs after confirming',
  );
});

test('P28: an ordinary settings save is not gated by the reset confirm', async () => {
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  vscode.__state.calls.warnReturn = undefined; // no modal expected for an unflagged save
  await panel.webview._handler({
    type: 'save',
    target: 'Workspace',
    values: { commandTimeout: 77 },
  });
  assert.equal(
    vscode.workspace.getConfiguration('wcli0').get('commandTimeout', null),
    77,
    'an unflagged save persists without a prompt',
  );
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

test('P96: a Workspace save realigns the host scope after folder removal/re-add', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Global, 'wcli0.shell', 'powershell');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shell', 'cmd');
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' }); // currentScope = Workspace

  // Remove the only folder: wsSub forces the host currentScope to Global while the
  // (simulated) dirty Workspace form keeps its scope on the webview side (P89), then
  // reopen the folder so a Workspace save is allowed again.
  vscode.__state.workspaceFolders = undefined;
  for (const cb of vscode.__state.workspaceFoldersChangeListeners) cb();
  vscode.__state.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  for (const cb of vscode.__state.workspaceFoldersChangeListeners) cb();

  panel.webview.posted = [];
  vscode.__state.calls.executedCommands = [];
  // The retained dirty form still targets Workspace; saving must realign the host
  // scope so the follow-up post() reloads Workspace values, not the forced Global.
  await panel.webview._handler({
    type: 'save',
    target: 'Workspace',
    values: { commandTimeout: 99 },
  });
  const init = panel.webview.posted.find((m) => m.type === 'init');
  assert.ok(init, 'settings re-posted after save');
  assert.equal(init.scope, 'Workspace', 'host scope realigned to the saved Workspace scope');
  assert.equal(init.settings.shell, 'cmd', 'reloads Workspace values, not Global');

  // A follow-up export now runs against the realigned Workspace scope too.
  await panel.webview._handler({
    type: 'generateConfig',
    target: 'Workspace',
    values: { commandTimeout: 99 },
  });
  const exec = vscode.__state.calls.executedCommands.find(
    (c) => c.id === 'wcli0.generateConfigFile',
  );
  assert.ok(exec, 'export command executed');
  assert.equal(exec.args[0], 'Workspace', 'export uses the realigned Workspace scope');
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

test('saving ignoreInheritedShells persists the boolean without clearing wcli0.shells', async () => {
  // A User-scope per-shell config exists; the workspace opts out via the flag.
  vscode.__setConfig(vscode.ConfigurationTarget.Global, 'wcli0.shells', { cmd: { enabled: true } });
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({
    type: 'save',
    target: 'Workspace',
    values: { ignoreInheritedShells: true },
  });
  // The flag is persisted as a real boolean at the Workspace scope...
  assert.equal(vscode.__state.configWorkspace.get('wcli0.ignoreInheritedShells'), true);
  // ...and the inherited per-shell config is untouched (the flag, not a cleared
  // shells object, is what escapes managed mode).
  assert.deepEqual(vscode.__state.configGlobal.get('wcli0.shells'), { cmd: { enabled: true } });
  assert.equal(vscode.__state.configWorkspace.has('wcli0.shells'), false);
});

test('selecting Inherit (null) for ignoreInheritedShells clears the scope override', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.ignoreInheritedShells', true);
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({
    type: 'save',
    target: 'Workspace',
    values: { ignoreInheritedShells: null }, // Inherit
  });
  assert.equal(vscode.__state.configWorkspace.has('wcli0.ignoreInheritedShells'), false);
});

test('P45: the logging tri-state selects offer an Inherit option', () => {
  openConfigPanel(makeContext());
  const html = vscode.__state.lastWebviewPanel.webview.html;
  const trunc = html.match(/<select id="enableTruncation">[\s\S]*?<\/select>/)[0];
  const logres = html.match(/<select id="enableLogResources">[\s\S]*?<\/select>/)[0];
  assert.match(trunc, /<option value="">Inherit<\/option>/);
  assert.match(logres, /<option value="">Inherit<\/option>/);
});

test('P100: maxOutputLines input carries the server max so HTML validity matches', () => {
  openConfigPanel(makeContext());
  const html = vscode.__state.lastWebviewPanel.webview.html;
  const input = html.match(/<input type="number" id="maxOutputLines"[^>]*>/)[0];
  // min=1 and max=10000 mirror the server's validateLoggingConfig bound so a value
  // such as 10001 fails checkValidity() before being posted.
  assert.match(input, /min="1"/);
  assert.match(input, /max="10000"/);
});

test('P103: fraction-accepting numeric inputs set step=any so valid 1.5 values are not blocked', () => {
  openConfigPanel(makeContext());
  const html = vscode.__state.lastWebviewPanel.webview.html;
  // commandTimeout/maxCommandLength/maxOutputLines accept fractional values host-side
  // (validateLaunchSpec / isValidMaxOutputLines), so without step="any" Chromium's
  // default step of 1 makes checkValidity() reject e.g. 1.5 and block save/export.
  for (const id of ['commandTimeout', 'maxCommandLength', 'maxOutputLines']) {
    const input = html.match(new RegExp(`<input type="number" id="${id}"[^>]*>`))[0];
    assert.match(input, /step="any"/, `${id} should allow fractions`);
  }
  // The per-shell equivalents accept fractions too (built once per shell via a template).
  for (const suffix of ['sec-timeout', 'sec-maxlen']) {
    const input = html.match(new RegExp(`<input type="number" id="sh-[^"]*-${suffix}"[^>]*>`))[0];
    assert.match(input, /step="any"/, `per-shell ${suffix} should allow fractions`);
  }
  // The transport port must stay integer-only (isValidPort enforces Number.isInteger).
  const port = html.match(/<input type="number" id="transport\.port"[^>]*>/)[0];
  assert.match(port, /step="1"/, 'port stays integer');
});

test('P58: commandTimeout/maxCommandLength inputs use min="0" so a loaded sub-1s value can save', () => {
  openConfigPanel(makeContext());
  const html = vscode.__state.lastWebviewPanel.webview.html;
  // The server accepts any CLI commandTimeout/maxCommandLength > 0 (the >= 1 bound is the
  // managed/config-file one). A hand-authored file-source entry can carry e.g.
  // --commandTimeout 0.5, which the typed field must be able to re-submit; min="1" would make
  // validateNumbers reject the untouched value and strand every save. The host's
  // validateLaunchSpec still rejects an actually-invalid value with a precise message.
  for (const id of ['commandTimeout', 'maxCommandLength']) {
    const input = html.match(new RegExp(`<input type="number" id="${id}"[^>]*>`))[0];
    assert.match(input, /min="0"/, `${id} should allow sub-1s values`);
    assert.doesNotMatch(input, /min="1"/, `${id} must not carry the managed >= 1 client bound`);
  }
});

test('P100: save and export validate all numeric inputs before posting', () => {
  openConfigPanel(makeContext());
  const html = vscode.__state.lastWebviewPanel.webview.html;
  // The form script defines a shared numeric guard (checkValidity over every number
  // input) and gates both the save handler and the export actions on it, so an
  // invalid timeout/length/maxOutputLines/port can no longer be persisted or exported.
  assert.match(html, /function validateNumbers\(\)/);
  assert.match(html, /querySelectorAll\('input\[type=number\]'\)/);
  assert.match(html, /\$\('save'\)\.addEventListener\('click', \(\) => \{\s*if \(!validateNumbers\(\) \|\| !validateProfiles\(\)\) return;/);
  assert.match(html, /function exportAction\(type\) \{\s*if \(!validateNumbers\(\) \|\| !validateProfiles\(\)\) return;/);
});

// ---- Configuration source switcher (auto-detect / load / save) ----

function seedWorkspaceMcpJson(obj) {
  vscode.__state.files.set('/ws/.vscode/mcp.json', Buffer.from(JSON.stringify(obj)));
}

test('init reports the settings source and detects a workspace mcp.json wcli0 entry', async () => {
  seedWorkspaceMcpJson({ servers: { wcli0: { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest'] } } });
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  const init = panel.webview.posted.find((m) => m.type === 'init');
  assert.equal(init.source, 'settings');
  const detected = (init.detected || []).find((d) => d.kind === 'mcpJson');
  assert.ok(detected, 'workspace mcp.json detected');
  assert.equal(detected.hasWcli0, true);
});

test('switching to the mcp.json source loads the entry into the form', async () => {
  seedWorkspaceMcpJson({
    servers: { wcli0: { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@9.9.9', '--shell', 'cmd'] } },
  });
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  panel.webview.posted = [];
  await panel.webview._handler({ type: 'sourceChange', source: 'mcpJson' });
  const init = panel.webview.posted.find((m) => m.type === 'init');
  assert.equal(init.source, 'mcpJson');
  assert.equal(init.settings.packageSpec, 'wcli0@9.9.9');
  assert.equal(init.settings.shell, 'cmd');
});

test('switching to the mcp.json source errors when no wcli0 entry exists', async () => {
  seedWorkspaceMcpJson({ servers: { other: { type: 'stdio' } } });
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  panel.webview.posted = [];
  await panel.webview._handler({ type: 'sourceChange', source: 'mcpJson' });
  assert.equal(panel.webview.posted.find((m) => m.type === 'init'), undefined);
  assert.ok(vscode.__state.calls.error.some((m) => /no wcli0 server entry/.test(m)));
});

test('saving the mcp.json source writes the file and never touches settings', async () => {
  seedWorkspaceMcpJson({
    servers: {
      wcli0: { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest', '--shell', 'cmd'] },
      other: { type: 'stdio' },
    },
  });
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  await panel.webview._handler({ type: 'sourceChange', source: 'mcpJson' });
  await panel.webview._handler({ type: 'saveToFile', values: { commandTimeout: 50 } });

  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.ok(parsed.servers.other, 'other server preserved');
  assert.ok(parsed.servers.wcli0.args.includes('--commandTimeout'), 'edit written to the file');
  assert.ok(parsed.servers.wcli0.args.includes('50'));
  // The edit went to the file only — no wcli0.* setting was written.
  assert.equal(vscode.__state.configWorkspace.has('wcli0.commandTimeout'), false);
  assert.equal(vscode.__state.configGlobal.has('wcli0.commandTimeout'), false);
  assert.ok(panel.webview.posted.some((m) => m.type === 'saved'));
});

test('the read-only home config is never accepted as a source target', async () => {
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  panel.webview.posted = [];
  await panel.webview._handler({ type: 'sourceChange', source: 'homeConfig' });
  // Unknown/read-only source target is ignored: no reload, no error.
  assert.equal(panel.webview.posted.find((m) => m.type === 'init'), undefined);
});

test('a dirty source switch requests confirmation before discarding edits', async () => {
  seedWorkspaceMcpJson({ servers: { wcli0: { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest'] } } });
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  panel.webview.posted = [];
  // Decline the discard prompt: the source must not switch.
  vscode.__state.calls.warnReturn = undefined;
  await panel.webview._handler({ type: 'sourceChangeRequest', source: 'mcpJson' });
  assert.equal(panel.webview.posted.find((m) => m.type === 'init'), undefined);
  assert.equal(vscode.__state.calls.warn.length, 1);
});

test('a confirmed revert reloads the file entry and signals reverted', async () => {
  seedWorkspaceMcpJson({ servers: { wcli0: { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest'] } } });
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  // Load the file source so a revert has an entry to reload.
  await panel.webview._handler({ type: 'sourceChange', source: 'mcpJson' });
  panel.webview.posted = [];
  vscode.__state.calls.warnReturn = 'Discard changes';
  await panel.webview._handler({ type: 'revertFileRequest' });
  const init = panel.webview.posted.find((m) => m.type === 'init');
  assert.ok(init, 'the file entry is re-posted on revert');
  assert.equal(init.source, 'mcpJson');
  assert.ok(panel.webview.posted.find((m) => m.type === 'reverted'), 'reverted signal sent');
  assert.equal(vscode.__state.calls.warn.length, 1, 'revert confirms before discarding');
});

test('a declined revert neither reloads nor signals reverted', async () => {
  seedWorkspaceMcpJson({ servers: { wcli0: { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest'] } } });
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  await panel.webview._handler({ type: 'sourceChange', source: 'mcpJson' });
  panel.webview.posted = [];
  vscode.__state.calls.warnReturn = undefined; // dismiss the modal
  await panel.webview._handler({ type: 'revertFileRequest' });
  assert.equal(panel.webview.posted.find((m) => m.type === 'init'), undefined, 'no reload on cancel');
  assert.equal(panel.webview.posted.find((m) => m.type === 'reverted'), undefined, 'no reverted signal on cancel');
});

test('Save to file writes the wcli0 entry to .vscode/mcp.json and confirms', async () => {
  seedWorkspaceMcpJson({ servers: { wcli0: { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest'] } } });
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  await panel.webview._handler({ type: 'sourceChange', source: 'mcpJson' });
  panel.webview.posted = [];
  // The Save button in file mode posts saveToFile with only the changed fields.
  await panel.webview._handler({ type: 'saveToFile', values: { shell: 'cmd' } });
  const raw = await vscode.workspace.fs.readFile(
    vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, '.vscode', 'mcp.json'),
  );
  const parsed = JSON.parse(Buffer.from(raw).toString('utf8'));
  assert.ok(parsed.servers.wcli0.args.includes('--shell'), JSON.stringify(parsed.servers.wcli0.args));
  assert.ok(parsed.servers.wcli0.args.includes('cmd'));
  assert.ok(panel.webview.posted.find((m) => m.type === 'saved'), 'saved confirmation sent');
});

test('Save to file with no workspace folder is refused (no write)', async () => {
  vscode.__state.workspaceFolders = undefined;
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  panel.webview.posted = [];
  await panel.webview._handler({ type: 'saveToFile', values: { shell: 'cmd' } });
  assert.equal(panel.webview.posted.find((m) => m.type === 'saved'), undefined, 'no save confirmation');
  assert.ok(vscode.__state.calls.error.length >= 1, 'an error was surfaced');
});

test('P1: export actions are refused while editing a file source', async () => {
  seedWorkspaceMcpJson({
    servers: { wcli0: { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest'] } },
  });
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  await panel.webview._handler({ type: 'sourceChange', source: 'mcpJson' });
  vscode.__state.calls.executedCommands.length = 0;
  vscode.__state.calls.error.length = 0;
  // An export carrying form values must NOT persist them to wcli0.* settings nor run
  // the export command while a file source is active.
  await panel.webview._handler({
    type: 'writeMcpJson',
    target: 'Workspace',
    values: { shell: 'cmd' },
  });
  assert.equal(vscode.__state.calls.executedCommands.length, 0, 'no export command ran');
  assert.equal(vscode.__state.configWorkspace.has('wcli0.shell'), false, 'no setting written');
  assert.ok(
    vscode.__state.calls.error.some((m) => /export actions are unavailable/.test(m)),
    'refusal surfaced',
  );
});

test('P2: changing the primary workspace folder resets a loaded file source', async () => {
  seedWorkspaceMcpJson({
    servers: { wcli0: { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest'] } },
  });
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  await panel.webview._handler({ type: 'sourceChange', source: 'mcpJson' });
  // The primary folder changes to a different folder (multi-root removal/reorder),
  // still returning a folder but no longer the one the file source was loaded from.
  vscode.__state.workspaceFolders = [{ uri: { fsPath: '/other' }, name: 'other', index: 0 }];
  panel.webview.posted = [];
  for (const cb of vscode.__state.workspaceFoldersChangeListeners) cb();
  const init = panel.webview.posted.find((m) => m.type === 'init');
  assert.ok(init, 're-posted after the folder change');
  assert.equal(init.source, 'settings', 'stale file source reset to settings');
});

test('P25: a folder change pushes a source-reset so a dirty file form leaves the file source', async () => {
  seedWorkspaceMcpJson({
    servers: { wcli0: { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest'] } },
  });
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  await panel.webview._handler({ type: 'sourceChange', source: 'mcpJson' });
  vscode.__state.workspaceFolders = [{ uri: { fsPath: '/other' }, name: 'other', index: 0 }];
  panel.webview.posted = [];
  for (const cb of vscode.__state.workspaceFoldersChangeListeners) cb();
  // The external init is ignored by a dirty webview, so a dedicated source-reset message
  // carries the switch off the now-gone file source (P25).
  const reset = panel.webview.posted.find((m) => m.type === 'sourceReset');
  assert.ok(reset, 'a sourceReset message is posted on the folder change');
  assert.equal(reset.source, 'settings', 'the reset targets the settings source');
});

test('P25: no source-reset is pushed when the file source was not active', async () => {
  seedWorkspaceMcpJson({
    servers: { wcli0: { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest'] } },
  });
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  // Stay on the settings source; a folder change must not emit a source reset.
  vscode.__state.workspaceFolders = [{ uri: { fsPath: '/other' }, name: 'other', index: 0 }];
  panel.webview.posted = [];
  for (const cb of vscode.__state.workspaceFoldersChangeListeners) cb();
  assert.equal(
    panel.webview.posted.find((m) => m.type === 'sourceReset'),
    undefined,
    'no sourceReset when settings was the active source',
  );
});

test('P4: omitting env on save clears it from the file-source baseline', async () => {
  seedWorkspaceMcpJson({
    servers: {
      wcli0: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'wcli0@latest', '--shell', 'cmd'],
        env: { SECRET: 'x' },
      },
    },
  });
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  await panel.webview._handler({ type: 'sourceChange', source: 'mcpJson' });
  const envWarns = () =>
    vscode.__state.calls.warn.filter((w) => /launch\.env/.test(w.message)).length;
  // First save: choose to omit the env inherited from the loaded entry.
  vscode.__state.calls.warnReturn = 'Omit environment';
  await panel.webview._handler({ type: 'saveToFile', values: { commandTimeout: 30 } });
  let parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.equal(parsed.servers.wcli0.env, undefined, 'env omitted from the written entry');
  const afterFirst = envWarns();
  assert.equal(afterFirst, 1, 'env prompt shown once');
  // A later unrelated save must neither resurrect the omitted env nor prompt again,
  // because the baseline was re-read from the env-less file on disk.
  await panel.webview._handler({ type: 'saveToFile', values: { maxCommandLength: 100 } });
  parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.equal(parsed.servers.wcli0.env, undefined, 'env stays omitted on the next save');
  assert.equal(envWarns(), afterFirst, 'no second env prompt — baseline cleared');
});

test('P23: a file save preserves env added on disk after the panel loaded', async () => {
  seedWorkspaceMcpJson({
    servers: {
      wcli0: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'wcli0@latest', '--shell', 'cmd'],
        env: { SECRET: 'x' },
      },
    },
  });
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  await panel.webview._handler({ type: 'sourceChange', source: 'mcpJson' });
  // Another process adds a variable (a non-string value VS Code allows) to the on-disk
  // entry AFTER the panel loaded its snapshot.
  seedWorkspaceMcpJson({
    servers: {
      wcli0: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'wcli0@latest', '--shell', 'cmd'],
        env: { SECRET: 'x', PORT: 3000 },
      },
    },
  });
  // An unrelated save keeps the env: it must come from the CURRENT on-disk entry, not the
  // stale panel snapshot, so the newly added PORT is not silently dropped (P23).
  vscode.__state.calls.warnReturn = 'Include environment';
  await panel.webview._handler({ type: 'saveToFile', values: { commandTimeout: 30 } });
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.deepEqual(
    parsed.servers.wcli0.env,
    { SECRET: 'x', PORT: 3000 },
    'the env added on disk survives the unrelated save',
  );
});

test('P6: a stale file-source save after the primary folder changes is rejected', async () => {
  seedWorkspaceMcpJson({
    servers: { wcli0: { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest'] } },
  });
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  await panel.webview._handler({ type: 'sourceChange', source: 'mcpJson' });
  // The primary folder changes to a different folder (multi-root removal/reorder); the
  // host resets the file source, but a dirty webview still posts saveToFile.
  vscode.__state.workspaceFolders = [{ uri: { fsPath: '/other' }, name: 'other', index: 0 }];
  for (const cb of vscode.__state.workspaceFoldersChangeListeners) cb();
  vscode.__state.calls.error.length = 0;
  panel.webview.posted = [];
  await panel.webview._handler({ type: 'saveToFile', values: { commandTimeout: 50 } });
  assert.equal(panel.webview.posted.find((m) => m.type === 'saved'), undefined, 'no save confirmation');
  assert.ok(
    vscode.__state.calls.error.some((m) => /workspace folder changed/.test(m)),
    'the stale save is refused with an explanation',
  );
  assert.equal(
    vscode.__state.files.has('/other/.vscode/mcp.json'),
    false,
    'nothing is written to the new folder',
  );
});

test('P11: file-source init carries notes and a clean reload clears stale ones', async () => {
  // A socket URL the host/port fields cannot model produces a parse note.
  seedWorkspaceMcpJson({ servers: { wcli0: { type: 'http', url: 'unix:///tmp/s.sock#/mcp' } } });
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  panel.webview.posted = [];
  await panel.webview._handler({ type: 'sourceChange', source: 'mcpJson' });
  let init = panel.webview.posted.find((m) => m.type === 'init');
  assert.ok(Array.isArray(init.notes) && init.notes.length > 0, 'notes sent for the un-modeled URL');
  // Replace the file with a canonical entry that yields no notes, then reload (revert).
  seedWorkspaceMcpJson({ servers: { wcli0: { type: 'http', url: 'http://127.0.0.1:9444/mcp' } } });
  panel.webview.posted = [];
  vscode.__state.calls.warnReturn = 'Discard changes';
  await panel.webview._handler({ type: 'revertFileRequest' });
  init = panel.webview.posted.find((m) => m.type === 'init');
  assert.ok(init, 're-posted on revert');
  assert.deepEqual(init.notes, [], 'stale notes cleared on the clean reload');
});

test('P7: saving a file source preserves unmodeled http headers on disk', async () => {
  seedWorkspaceMcpJson({
    servers: {
      wcli0: {
        type: 'http',
        url: 'http://127.0.0.1:9444/mcp',
        headers: { Authorization: 'Bearer x' },
      },
    },
  });
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  await panel.webview._handler({ type: 'sourceChange', source: 'mcpJson' });
  await panel.webview._handler({ type: 'saveToFile', values: {} });
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.deepEqual(parsed.servers.wcli0.headers, { Authorization: 'Bearer x' }, 'headers survive the save');
  assert.equal(parsed.servers.wcli0.url, 'http://127.0.0.1:9444/mcp', 'url round-trips unchanged');
});

test('P55: a network file save refuses a stale non-transport edit', async () => {
  // The form disables the non-transport tabs for an http entry, but a value edited while the
  // entry was still stdio is still submitted by collectChanged(). The network save would write
  // only {type,url} and report "Saved" while silently dropping the edit, so it must be refused.
  seedWorkspaceMcpJson({ servers: { wcli0: { type: 'http', url: 'http://127.0.0.1:9444/mcp' } } });
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  await panel.webview._handler({ type: 'sourceChange', source: 'mcpJson' });
  vscode.__state.calls.error.length = 0;
  panel.webview.posted = [];
  await panel.webview._handler({ type: 'saveToFile', values: { safetyMode: 'yolo' } });
  assert.equal(panel.webview.posted.find((m) => m.type === 'saved'), undefined, 'no false Saved');
  assert.ok(
    vscode.__state.calls.error.some((m) => /stores only the transport type and URL/.test(m)),
    'explains a network entry cannot store the non-transport edit',
  );
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.equal(parsed.servers.wcli0.url, 'http://127.0.0.1:9444/mcp', 'the entry is unchanged');
  assert.equal(parsed.servers.wcli0.safetyMode, undefined, 'the stale edit was not written');
});

test('P55: a network file save allows a pure transport edit', async () => {
  // Only transport.mode/host/port are storable in a network entry, so a host change alone is a
  // legitimate save and must not be refused by the stale-edit guard.
  seedWorkspaceMcpJson({ servers: { wcli0: { type: 'http', url: 'http://127.0.0.1:9444/mcp' } } });
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  await panel.webview._handler({ type: 'sourceChange', source: 'mcpJson' });
  vscode.__state.calls.error.length = 0;
  panel.webview.posted = [];
  await panel.webview._handler({ type: 'saveToFile', values: { 'transport.host': '10.0.0.5' } });
  assert.ok(panel.webview.posted.find((m) => m.type === 'saved'), 'a transport-only edit saves');
  assert.equal(vscode.__state.calls.error.length, 0, 'no refusal for a transport-only edit');
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.match(parsed.servers.wcli0.url, /10\.0\.0\.5/, 'the new host is written');
});

test('P55: a stdio->http switch refuses a non-transport edit but allows the pure switch', async () => {
  // Switching transport is storable, but a non-transport field changed in the same save is not,
  // so the guard refuses the mixed save and accepts the pure switch.
  seedWorkspaceMcpJson({
    servers: { wcli0: { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest'] } },
  });
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  await panel.webview._handler({ type: 'sourceChange', source: 'mcpJson' });
  // Mixed save: switch to http AND change safety -> refused.
  vscode.__state.calls.error.length = 0;
  panel.webview.posted = [];
  await panel.webview._handler({
    type: 'saveToFile',
    values: { 'transport.mode': 'http', 'transport.host': '127.0.0.1', 'transport.port': 9000, safetyMode: 'yolo' },
  });
  assert.equal(panel.webview.posted.find((m) => m.type === 'saved'), undefined, 'mixed save refused');
  assert.ok(vscode.__state.calls.error.some((m) => /stores only the transport type and URL/.test(m)));
  // Pure switch: transport fields only -> written as an http entry.
  vscode.__state.calls.error.length = 0;
  panel.webview.posted = [];
  await panel.webview._handler({
    type: 'saveToFile',
    values: { 'transport.mode': 'http', 'transport.host': '127.0.0.1', 'transport.port': 9000 },
  });
  assert.ok(panel.webview.posted.find((m) => m.type === 'saved'), 'the pure switch saves');
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.equal(parsed.servers.wcli0.type, 'http', 'the entry is now http');
});

test('P16: a folder change pushes a detection update so the banner can appear', async () => {
  // Start with no workspace folder open.
  vscode.__state.workspaceFolders = undefined;
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  // A folder that already has a wcli0 .vscode/mcp.json entry is opened.
  vscode.__state.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  seedWorkspaceMcpJson({
    servers: { wcli0: { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest'] } },
  });
  panel.webview.posted = [];
  for (const cb of vscode.__state.workspaceFoldersChangeListeners) cb();
  // The detection refresh is async; flush microtasks so the follow-up push lands.
  await new Promise((r) => setTimeout(r, 0));
  const detected = panel.webview.posted.find((m) => m.type === 'detected');
  assert.ok(detected, 'a detection update is pushed after the folder change');
  const entry = (detected.detected || []).find((d) => d.kind === 'mcpJson');
  assert.ok(entry && entry.hasWcli0, 'the workspace mcp.json wcli0 entry is detected');
});

test('the home config row opens the file read-only', async () => {
  openConfigPanel(makeContext());
  const panel = vscode.__state.lastWebviewPanel;
  await panel.webview._handler({ type: 'ready' });
  await panel.webview._handler({ type: 'openHomeConfig' });
  // Opens a document, shows it, and marks the editor read-only in-session.
  assert.equal(vscode.__state.calls.openedDocs.length, 1, 'opened the home config document');
  assert.ok(/\.win-cli-mcp[\\/]config\.json$/.test(vscode.__state.calls.openedDocs[0].fsPath));
  assert.equal(vscode.__state.calls.shownDocs.length, 1, 'showed the document');
  assert.ok(
    vscode.__state.calls.executedCommands.some(
      (c) => c.id === 'workbench.action.files.setActiveEditorReadonlyInSession',
    ),
    'marked the editor read-only in session',
  );
});
