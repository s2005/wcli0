const test = require('node:test');
const assert = require('node:assert/strict');

const vscode = require('../stubs/vscode.cjs');
const { Wcli0ConfigViewProvider } = require('../../dist/webview.js');

// Execute the webview's browser-side <script> against a minimal DOM so the
// per-shell collect/populate logic (collectShells / setShellsVal) is actually
// exercised, not just present in the HTML string.
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
  };
}

test('setShellsVal populates per-shell fields from settings', () => {
  const h = makeHarness();
  h.dispatch({
    type: 'init',
    hasWorkspace: true,
    scope: 'Workspace',
    settings: {
      shells: {
        cmd: { enabled: true },
        gitbash: { executable: { command: 'C:/git/bash.exe', args: ['-c'] } },
        wsl: { wslConfig: { mountPoint: '/m/', inheritGlobalPaths: false } },
        powershell: {
          overrides: {
            security: { maxCommandLength: 1234 },
            restrictions: { blockedCommands: ['rm', 'del'] },
          },
        },
      },
    },
  });

  assert.equal(h.els.get('sh-cmd-enabled').value, 'enabled');
  assert.equal(h.els.get('sh-gitbash-cmd').value, 'C:/git/bash.exe');
  assert.equal(h.els.get('sh-gitbash-args').value, '-c');
  assert.equal(h.els.get('sh-wsl-wsl-mount').value, '/m/');
  assert.equal(h.els.get('sh-wsl-wsl-inherit').value, 'disabled');
  assert.equal(h.els.get('sh-powershell-sec-maxlen').value, 1234);
  assert.equal(h.els.get('sh-powershell-block-cmd').value, 'rm\ndel');
});

test('collectShells builds the wcli0.shells object from the form on save', () => {
  const h = makeHarness();
  // Establish an empty baseline so only the fields we set below count as changes.
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });

  h.els.get('sh-cmd-enabled').value = 'disabled';
  h.els.get('sh-gitbash-cmd').value = 'C:/g/bash.exe';
  h.els.get('sh-gitbash-args').value = '-c\n-l';
  h.els.get('sh-wsl-wsl-mount').value = '/mnt2/';
  h.els.get('sh-wsl-wsl-inherit').value = 'enabled';
  h.els.get('sh-powershell-block-cmd').value = 'rm';
  h.els.get('sh-powershell-sec-timeout').value = '15';

  h.clickSave();
  const save = h.captured.find((m) => m.type === 'save');
  assert.ok(save, 'save message posted');
  assert.deepEqual(save.values.shells, {
    cmd: { enabled: false },
    gitbash: { executable: { command: 'C:/g/bash.exe', args: ['-c', '-l'] } },
    wsl: { wslConfig: { mountPoint: '/mnt2/', inheritGlobalPaths: true } },
    powershell: { overrides: { security: { commandTimeout: 15 }, restrictions: { blockedCommands: ['rm'] } } },
  });
});

test('untouched shells produce an empty object (cleared, not persisted as {})', async () => {
  // Host-side: an empty shells object should clear the setting.
  vscode.__reset();
  vscode.__state.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shells', { cmd: { enabled: false } });
  const provider = new Wcli0ConfigViewProvider();
  const view = vscode.__createWebviewView();
  provider.resolveWebviewView(view);
  await view.webview._handler({ type: 'save', target: 'Workspace', values: { shells: {} } });
  const cfg = vscode.workspace.getConfiguration('wcli0');
  assert.deepEqual(cfg.get('shells', 'CLEARED'), 'CLEARED');
});

test('a configured shell round-trips through save into settings', async () => {
  vscode.__reset();
  vscode.__state.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const provider = new Wcli0ConfigViewProvider();
  const view = vscode.__createWebviewView();
  provider.resolveWebviewView(view);
  const shells = { cmd: { enabled: true }, gitbash: { enabled: false } };
  await view.webview._handler({ type: 'save', target: 'Workspace', values: { shells } });
  const cfg = vscode.workspace.getConfiguration('wcli0');
  assert.deepEqual(cfg.get('shells', {}), shells);
});
