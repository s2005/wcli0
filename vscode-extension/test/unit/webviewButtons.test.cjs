const test = require('node:test');
const assert = require('node:assert/strict');

const vscode = require('../stubs/vscode.cjs');
const { Wcli0ConfigViewProvider } = require('../../dist/webview.js');

// Drive the webview's real browser-side <script> against a minimal DOM and assert
// what each actionable button does: the message it posts to the host and/or the DOM
// state it changes. This is the button-wiring half of the contract; the matching
// host-side handlers (save / saveToFile / revertFileRequest / export commands /
// openHomeConfig) are exercised separately in webview.test.cjs.
//
// Unlike a real Extension Host, these buttons live in a sandboxed webview whose DOM
// cannot be clicked from the test process, so the established pattern is to run the
// shipped script here and capture acquireVsCodeApi().postMessage calls.
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

  const docL = {};
  const document = {
    getElementById: (id) => els.get(id) || null,
    querySelector: (sel) => {
      if (sel === 'input[name=scope]:checked') return radios.find((r) => r.checked) || null;
      const m = sel.match(/input\[name=scope\]\[value=([^\]]+)\]/);
      if (m) return radios.find((r) => r.value === m[1]) || null;
      if (sel === '.scope-radio') return els.get('switchSourceBtn') ? { style: {} } : null;
      return null;
    },
    querySelectorAll: (sel) => (sel === 'input[name=scope]' ? radios : []),
    addEventListener: (ev, cb) => {
      (docL[ev] = docL[ev] || []).push(cb);
    },
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

  const click = (id) => {
    const el = els.get(id);
    assert.ok(el, `button #${id} exists`);
    (el._l.click || []).forEach((cb) => cb());
  };
  return {
    els,
    captured,
    click,
    dispatch: (data) => messageListener({ data }),
    fireInput: () => (docL.input || []).forEach((cb) => cb()),
    last: (type) => [...captured].reverse().find((m) => m.type === type),
  };
}

const FILE_INIT = {
  type: 'init',
  hasWorkspace: true,
  scope: 'Workspace',
  source: 'mcpJson',
  settings: {},
  detected: [{ kind: 'mcpJson', fsPath: '/ws/.vscode/mcp.json', exists: true, hasWcli0: true }],
};
const SETTINGS_INIT = {
  type: 'init',
  hasWorkspace: true,
  scope: 'Workspace',
  source: 'settings',
  settings: {},
  detected: [],
};

test('Save (settings source) posts a save with the selected scope', () => {
  const h = makeHarness();
  h.dispatch(SETTINGS_INIT);
  h.captured.length = 0;
  h.click('save');
  const msg = h.last('save');
  assert.ok(msg, 'a save message was posted');
  assert.equal(msg.target, 'Workspace');
  assert.ok(msg.values, 'carries the changed values');
});

test('Save (file source) posts saveToFile instead of save', () => {
  const h = makeHarness();
  h.dispatch(FILE_INIT);
  h.captured.length = 0;
  h.click('save');
  assert.ok(h.last('saveToFile'), 'posts saveToFile in file mode');
  assert.equal(h.last('save'), undefined, 'does not post a settings save');
});

test('Generate config.json posts generateConfig with form state', () => {
  const h = makeHarness();
  h.dispatch(SETTINGS_INIT);
  h.captured.length = 0;
  h.click('genConfig');
  const msg = h.last('generateConfig');
  assert.ok(msg, 'generateConfig posted');
  assert.equal(msg.target, 'Workspace');
});

test('Write .vscode/mcp.json posts writeMcpJson', () => {
  const h = makeHarness();
  h.dispatch(SETTINGS_INIT);
  h.captured.length = 0;
  h.click('writeMcp');
  assert.ok(h.last('writeMcpJson'), 'writeMcpJson posted');
});

test('Show launch command posts showCommand', () => {
  const h = makeHarness();
  h.dispatch(SETTINGS_INIT);
  h.captured.length = 0;
  h.click('showCommand');
  assert.ok(h.last('showCommand'), 'showCommand posted');
});

test('P1: export buttons are disabled on a file source and re-enabled on settings', () => {
  const h = makeHarness();
  h.dispatch(FILE_INIT);
  for (const id of ['showCommand', 'genConfig', 'writeMcp']) {
    assert.equal(h.els.get(id).disabled, true, `${id} disabled in file mode`);
  }
  // Switching back to the settings source restores them (a workspace is open here).
  h.dispatch(SETTINGS_INIT);
  for (const id of ['showCommand', 'genConfig', 'writeMcp']) {
    assert.equal(h.els.get(id).disabled, false, `${id} re-enabled on settings`);
  }
});

test('Load & edit mcp.json requests a switch to the file source', () => {
  const h = makeHarness();
  h.dispatch(SETTINGS_INIT);
  h.captured.length = 0;
  h.click('loadMcpJson');
  const msg = h.last('sourceChange') || h.last('sourceChangeRequest');
  assert.ok(msg, 'a source switch was requested');
  assert.equal(msg.source, 'mcpJson');
});

test('Dismiss hides the detection banner', () => {
  const h = makeHarness();
  h.dispatch(SETTINGS_INIT);
  h.click('dismissBanner');
  assert.equal(h.els.get('detectBanner').style.display, 'none');
});

test('Switch source toggles the source menu visibility', () => {
  const h = makeHarness();
  h.dispatch(SETTINGS_INIT);
  h.els.get('sourceMenu').style.display = 'none';
  h.click('switchSourceBtn');
  assert.equal(h.els.get('sourceMenu').style.display, 'block', 'opens the menu');
  h.click('switchSourceBtn');
  assert.equal(h.els.get('sourceMenu').style.display, 'none', 'closes the menu');
});

test('Revert is disabled on a clean file form and enabled after an edit', () => {
  const h = makeHarness();
  h.dispatch(FILE_INIT);
  assert.equal(h.els.get('revertFile').disabled, true, 'clean form: nothing to revert');
  // Edit a tracked field, then fire the delegated input handler.
  h.els.get('commandTimeout').value = '999';
  h.fireInput();
  assert.equal(h.els.get('revertFile').disabled, false, 'edited form: revert enabled');
});

test('Revert posts revertFileRequest only when there are unsaved edits', () => {
  const h = makeHarness();
  h.dispatch(FILE_INIT);
  h.captured.length = 0;
  // Clean form: the guard suppresses the request.
  h.click('revertFile');
  assert.equal(h.last('revertFileRequest'), undefined, 'no request on a clean form');
  // After an edit it posts the request.
  h.els.get('commandTimeout').value = '123';
  h.fireInput();
  h.click('revertFile');
  assert.ok(h.last('revertFileRequest'), 'posts revertFileRequest when dirty');
});

test('P22: the dirty indicator shows only on a dirty file form', () => {
  const h = makeHarness();
  h.dispatch(FILE_INIT);
  assert.equal(h.els.get('dirtyMsg').style.display, 'none', 'clean file form: indicator hidden');
  h.els.get('commandTimeout').value = '999';
  h.fireInput();
  assert.equal(h.els.get('dirtyMsg').style.display, '', 'dirty file form: indicator shown');
});

test('P22: the dirty indicator stays hidden on the settings source', () => {
  const h = makeHarness();
  h.dispatch(SETTINGS_INIT);
  h.els.get('commandTimeout').value = '999';
  h.fireInput();
  assert.equal(
    h.els.get('dirtyMsg').style.display,
    'none',
    'settings source has its own Save cue: indicator never shown',
  );
});

test('P25: a sourceReset switches the UI off the file source even when dirty', () => {
  const h = makeHarness();
  h.dispatch(FILE_INIT);
  h.els.get('commandTimeout').value = '999';
  h.fireInput();
  assert.equal(h.els.get('save').textContent, 'Save to file', 'starts on the file source');
  // The host reset the source because the loaded file's folder is no longer primary.
  h.dispatch({ type: 'sourceReset', source: 'settings', detected: [] });
  assert.equal(h.els.get('save').textContent, 'Save settings', 'switched to the settings source');
  assert.equal(h.els.get('revertFile').style.display, 'none', 'revert hidden off the file source');
  assert.equal(h.els.get('dirtyMsg').style.display, 'none', 'dirty indicator hidden off the file source');
});
