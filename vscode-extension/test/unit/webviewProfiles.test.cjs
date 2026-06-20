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
