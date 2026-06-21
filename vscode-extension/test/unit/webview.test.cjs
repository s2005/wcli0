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
