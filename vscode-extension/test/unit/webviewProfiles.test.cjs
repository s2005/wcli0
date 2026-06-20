const test = require('node:test');
const assert = require('node:assert/strict');

const vscode = require('../stubs/vscode.cjs');
const { Wcli0ConfigViewProvider } = require('../../dist/webview.js');

// Execute the webview's browser-side <script> against a minimal DOM so the
// profiles collect/populate/validate logic is exercised, not just present in the
// HTML string. Mirrors the harness in webviewShells.test.cjs.
function makeHarness() {
  vscode.__reset();
  vscode.__state.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const provider = new Wcli0ConfigViewProvider();
  const view = vscode.__createWebviewView();
  provider.resolveWebviewView(view);
  const html = view.webview.html;
  const script = html.match(/<script nonce="[^"]*">([\s\S]*?)<\/script>/)[1];

  const els = new Map();
  for (const m of html.matchAll(/id="([^"]+)"/g)) {
    const id = m[1];
    if (els.has(id)) continue;
    els.set(id, {
      id,
      value: '',
      checked: false,
      disabled: false,
      style: {},
      textContent: '',
      _l: {},
      addEventListener(ev, cb) {
        (this._l[ev] = this._l[ev] || []).push(cb);
      },
      reportValidity() {
        return true;
      },
      checkValidity() {
        return true;
      },
    });
  }

  const mkRadio = (value, checked) => ({
    name: 'scope',
    value,
    checked,
    disabled: false,
    _l: {},
    addEventListener(ev, cb) {
      (this._l[ev] = this._l[ev] || []).push(cb);
    },
  });
  const radios = [mkRadio('Workspace', true), mkRadio('Global', false)];

  const document = {
    getElementById: (id) => els.get(id) || null,
    querySelector: (sel) => {
      if (sel === 'input[name=scope]:checked') return radios.find((r) => r.checked) || null;
      const m = sel.match(/input\[name=scope\]\[value=([^\]]+)\]/);
      if (m) return radios.find((r) => r.value === m[1]) || null;
      return null;
    },
    querySelectorAll: (sel) => (sel === 'input[name=scope]' ? radios : []),
  };

  let messageListener;
  const window = {
    addEventListener: (ev, cb) => {
      if (ev === 'message') messageListener = cb;
    },
  };
  const captured = [];
  const acquireVsCodeApi = () => ({
    postMessage: (m) => captured.push(m),
    getState() {},
    setState() {},
  });

  const fn = new Function(
    'document',
    'window',
    'acquireVsCodeApi',
    'setTimeout',
    'clearTimeout',
    'console',
    script,
  );
  fn(document, window, acquireVsCodeApi, () => 0, () => {}, console);

  return {
    els,
    captured,
    dispatch: (data) => messageListener({ data }),
    clickSave: () => els.get('save')._l.click.forEach((cb) => cb()),
    input: (id) => els.get(id)._l.input.forEach((cb) => cb()),
  };
}

const PROFILES = {
  ora19: {
    description: 'Oracle 19c',
    allowedShells: ['cmd', 'powershell'],
    env: { ORACLE_HOME: 'C:/oracle/19', PATH: 'C:/oracle/19/bin;${PATH}' },
  },
};

test('setProfilesVal renders the profiles map as pretty JSON', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { profiles: PROFILES } });
  assert.deepEqual(JSON.parse(h.els.get('profilesJson').value), PROFILES);
});

test('an empty profiles map renders an empty textarea (not "{}")', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { profiles: {} } });
  assert.equal(h.els.get('profilesJson').value, '');
});

test('editing the profiles JSON round-trips the parsed object on save', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { profiles: {} } });
  h.els.get('profilesJson').value = JSON.stringify(PROFILES);
  h.clickSave();
  const save = h.captured.find((m) => m.type === 'save');
  assert.ok(save, 'save posted');
  assert.deepEqual(save.values.profiles, PROFILES);
});

test('invalid profiles JSON blocks the save and shows an inline error', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { profiles: {} } });
  h.els.get('profilesJson').value = '{ not valid json';
  h.input('profilesJson');
  assert.notEqual(h.els.get('profilesError').style.display, 'none', 'error shown');
  h.clickSave();
  assert.equal(h.captured.find((m) => m.type === 'save'), undefined, 'no save posted');
});

test('a profiles JSON array is rejected (must be an object map)', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { profiles: {} } });
  h.els.get('profilesJson').value = '[]';
  h.input('profilesJson');
  h.clickSave();
  assert.equal(h.captured.find((m) => m.type === 'save'), undefined, 'no save posted');
});

test('clearing the profiles textarea submits {} (clears the setting)', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { profiles: PROFILES } });
  h.els.get('profilesJson').value = '';
  h.clickSave();
  const save = h.captured.find((m) => m.type === 'save');
  assert.ok(save, 'save posted');
  assert.deepEqual(save.values.profiles, {});
});

test('a configured profile marks the launch isolated', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  assert.equal(h.els.get('isolationChip').textContent, 'Overridable');
  h.els.get('profilesJson').value = JSON.stringify(PROFILES);
  h.input('profilesJson');
  assert.equal(h.els.get('isolationChip').textContent, 'Isolated');
});

test('a profile with an empty env does not isolate the launch', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  h.els.get('profilesJson').value = JSON.stringify({ p: { env: {} } });
  h.input('profilesJson');
  assert.equal(h.els.get('isolationChip').textContent, 'Overridable');
});

test('a profile the host drops (all-invalid allowedShells) does not isolate', () => {
  // buildProfiles drops a profile whose non-empty allowedShells has no valid shell,
  // so the chip must not report Isolated for it (it would mislead about pinning).
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  h.els.get('profilesJson').value = JSON.stringify({ p: { allowedShells: ['fish'], env: { A: 'b' } } });
  h.input('profilesJson');
  assert.equal(h.els.get('isolationChip').textContent, 'Overridable');
});

test('a profile with a non-array allowedShells does not isolate', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  h.els.get('profilesJson').value = JSON.stringify({ p: { allowedShells: 'cmd', env: { A: 'b' } } });
  h.input('profilesJson');
  assert.equal(h.els.get('isolationChip').textContent, 'Overridable');
});

test('a profile whose only env value needs an unavailable ${workspaceFolder} does not isolate', () => {
  // With no workspace open the host drops the ${workspaceFolder} value (it cannot
  // resolve), leaving an empty env the server rejects — so it must not isolate.
  const h = makeHarness();
  h.dispatch({
    type: 'init',
    hasWorkspace: false,
    scope: 'Global',
    settings: { shells: {}, profiles: { p: { env: { ONLY: '${workspaceFolder}/bin' } } } },
  });
  assert.equal(h.els.get('isolationChip').textContent, 'Overridable');
  // The same profile DOES isolate once a workspace is open (the token resolves).
  h.dispatch({
    type: 'init',
    hasWorkspace: true,
    scope: 'Workspace',
    settings: { shells: {}, profiles: { p: { env: { ONLY: '${workspaceFolder}/bin' } } } },
  });
  assert.equal(h.els.get('isolationChip').textContent, 'Isolated');
});

test('a profiles round-trip through save persists into settings', async () => {
  vscode.__reset();
  vscode.__state.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const provider = new Wcli0ConfigViewProvider();
  const view = vscode.__createWebviewView();
  provider.resolveWebviewView(view);
  await view.webview._handler({ type: 'save', target: 'Workspace', values: { profiles: PROFILES } });
  const cfg = vscode.workspace.getConfiguration('wcli0');
  assert.deepEqual(cfg.get('profiles', {}), PROFILES);
});

test('an empty profiles object clears the setting rather than persisting {}', async () => {
  vscode.__reset();
  vscode.__state.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.profiles', PROFILES);
  const provider = new Wcli0ConfigViewProvider();
  const view = vscode.__createWebviewView();
  provider.resolveWebviewView(view);
  await view.webview._handler({ type: 'save', target: 'Workspace', values: { profiles: {} } });
  const cfg = vscode.workspace.getConfiguration('wcli0');
  assert.deepEqual(cfg.get('profiles', 'CLEARED'), 'CLEARED');
});

// ---- ignoreInheritedProfiles mask control (P110) ----

test('turning on the ignoreInheritedProfiles toggle persists it without touching profiles', () => {
  const h = makeHarness();
  h.dispatch({
    type: 'init',
    hasWorkspace: true,
    scope: 'Workspace',
    settings: { profiles: PROFILES },
  });
  // The control starts at Inherit; the user enables the mask.
  assert.equal(h.els.get('ignoreInheritedProfiles').value, 'default');
  h.els.get('ignoreInheritedProfiles').value = 'enabled';
  h.clickSave();
  const save = h.captured.find((m) => m.type === 'save');
  assert.ok(save, 'save posted');
  assert.equal(save.values.ignoreInheritedProfiles, true, 'mask persisted');
  // Only the changed field is submitted: the untouched profiles are NOT re-written
  // (so enabling the mask never clears the inherited profiles setting).
  assert.equal('profiles' in save.values, false, 'profiles left untouched');
});

test('an unset ignoreInheritedProfiles renders as Inherit, and switching back clears it', () => {
  const h = makeHarness();
  // Loaded with the mask explicitly enabled at this scope...
  h.dispatch({
    type: 'init',
    hasWorkspace: true,
    scope: 'Workspace',
    settings: { profiles: {}, ignoreInheritedProfiles: true },
    setSelectKeys: ['ignoreInheritedProfiles'],
  });
  assert.equal(h.els.get('ignoreInheritedProfiles').value, 'enabled');
  // ...the user switches it back to Inherit, which clears the override on save.
  h.els.get('ignoreInheritedProfiles').value = 'default';
  h.clickSave();
  const save = h.captured.find((m) => m.type === 'save');
  assert.equal(save.values.ignoreInheritedProfiles, null, 'Inherit emits null (clears the override)');
});

test('an unset ignoreInheritedProfiles is forced to the Inherit state on load', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { profiles: {} } });
  // Not in setSelectKeys -> rendered as Inherit ('default'), not an explicit value.
  assert.equal(h.els.get('ignoreInheritedProfiles').value, 'default');
});

test('enabling the mask makes a configured profile no longer isolate the launch', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  h.els.get('profilesJson').value = JSON.stringify(PROFILES);
  h.input('profilesJson');
  assert.equal(h.els.get('isolationChip').textContent, 'Isolated', 'profile isolates by default');
  // Turning on the mask flips the launch back to overridable (mirrors hasProfilesConfig).
  h.els.get('ignoreInheritedProfiles').value = 'enabled';
  h.input('profilesJson');
  assert.equal(h.els.get('isolationChip').textContent, 'Overridable');
});

test('the mask control is Workspace-only (disabled with a note at User scope)', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Global', settings: { profiles: {} } });
  assert.equal(h.els.get('ignoreInheritedProfiles').disabled, true, 'disabled at User scope');
  assert.equal(h.els.get('ignoreInheritedProfilesUserNote').style.display, '', 'note shown');
  // Reloading at Workspace scope re-enables it and hides the note.
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { profiles: {} } });
  assert.equal(h.els.get('ignoreInheritedProfiles').disabled, false, 'enabled at Workspace scope');
  assert.equal(h.els.get('ignoreInheritedProfilesUserNote').style.display, 'none', 'note hidden');
});
