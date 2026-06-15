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
    radios,
    scope: (value) => radios.find((r) => r.value === value),
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

test('P20: an explicitly-empty per-shell allowedPaths survives an edit to another field', () => {
  const h = makeHarness();
  h.dispatch({
    type: 'init',
    hasWorkspace: true,
    scope: 'Workspace',
    settings: { shells: { cmd: { overrides: { paths: { allowedPaths: [] } } } } },
  });
  // User toggles an unrelated field on the same shell, then saves.
  h.els.get('sh-cmd-enabled').value = 'disabled';
  h.clickSave();
  const save = h.captured.find((m) => m.type === 'save');
  assert.ok(save, 'save posted');
  // The explicit [] must be preserved (dropping it would re-inherit global paths).
  assert.deepEqual(save.values.shells.cmd.overrides.paths.allowedPaths, []);
  assert.equal(save.values.shells.cmd.enabled, false);
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

test('P32: an empty positional executable arg survives an edit to another field', () => {
  const h = makeHarness();
  h.dispatch({
    type: 'init',
    hasWorkspace: true,
    scope: 'Workspace',
    settings: { shells: { cmd: { executable: { command: 'cmd.exe', args: ['--flag', ''] } } } },
  });
  // Toggle an unrelated field on the same shell, then save.
  h.els.get('sh-cmd-enabled').value = 'disabled';
  h.clickSave();
  const save = h.captured.find((m) => m.type === 'save');
  assert.ok(save, 'save posted');
  // The empty positional arg must be preserved (the server passes args to spawn).
  assert.deepEqual(save.values.shells.cmd.executable.args, ['--flag', '']);
});

test('P35: an external config change does not discard unsaved edits', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  h.els.get('initialDir').value = '/my/edit'; // unsaved edit
  h.dispatch({
    type: 'init',
    external: true,
    hasWorkspace: true,
    scope: 'Workspace',
    settings: { initialDir: '/other', shells: {} },
  });
  assert.equal(h.els.get('initialDir').value, '/my/edit');
});

test('P35: an external change applies when the form is clean', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  h.dispatch({
    type: 'init',
    external: true,
    hasWorkspace: true,
    scope: 'Workspace',
    settings: { initialDir: '/other', shells: {} },
  });
  assert.equal(h.els.get('initialDir').value, '/other');
});

test('P37: clearing a previously non-empty blockedOperators removes the override (not [])', () => {
  const h = makeHarness();
  h.dispatch({
    type: 'init',
    hasWorkspace: true,
    scope: 'Workspace',
    settings: { shells: { cmd: { overrides: { restrictions: { blockedOperators: ['&&', '||'] } } } } },
  });
  // User clears the operators textarea and toggles enabled (so a save still happens).
  h.els.get('sh-cmd-block-op').value = '';
  h.els.get('sh-cmd-enabled').value = 'disabled';
  h.clickSave();
  const save = h.captured.find((m) => m.type === 'save');
  assert.ok(save, 'save posted');
  // The override must be gone (undefined), not persisted as [] which would replace
  // the safe global operator blocklist with nothing.
  assert.equal(save.values.shells.cmd.overrides, undefined);
  assert.equal(save.values.shells.cmd.enabled, false);
});

test('P37: a previously empty blockedOperators still round-trips as []', () => {
  const h = makeHarness();
  h.dispatch({
    type: 'init',
    hasWorkspace: true,
    scope: 'Workspace',
    settings: { shells: { cmd: { overrides: { restrictions: { blockedOperators: [] } } } } },
  });
  h.els.get('sh-cmd-enabled').value = 'disabled';
  h.clickSave();
  const save = h.captured.find((m) => m.type === 'save');
  assert.ok(save, 'save posted');
  // An originally-empty [] survives (P20); only cleared non-empty lists become "unset".
  assert.deepEqual(save.values.shells.cmd.overrides.restrictions.blockedOperators, []);
});

test('P40: a new executable command with blank args saves args as []', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  // User enters a custom command and leaves args blank to request no prefix args.
  h.els.get('sh-cmd-cmd').value = 'myshell.exe';
  h.clickSave();
  const save = h.captured.find((m) => m.type === 'save');
  assert.ok(save, 'save posted');
  // args must be [] (not undefined) so the server doesn't fill in default args
  // like /c or -c that only make sense for the bundled shell binaries.
  assert.deepEqual(save.values.shells.cmd.executable.args, []);
  assert.equal(save.values.shells.cmd.executable.command, 'myshell.exe');
});

test('P40: an unset command with blank args leaves executable unset', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  // No command, args blank -> no executable override at all.
  h.els.get('sh-cmd-enabled').value = 'disabled';
  h.clickSave();
  const save = h.captured.find((m) => m.type === 'save');
  assert.ok(save, 'save posted');
  assert.equal(save.values.shells.cmd.executable, undefined);
});

test('P41: triBool Inherit submits null so the host clears the override', () => {
  const h = makeHarness();
  // Start from a non-Inherit state so the Inherit selection counts as a change.
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { debug: true } });
  // Form-side collect(): selecting 'default' (Inherit) must produce null, not a
  // boolean. The host's applySettings turns null into undefined -> clears.
  h.els.get('debug').value = 'default';
  h.clickSave();
  const save = h.captured.find((m) => m.type === 'save');
  assert.ok(save, 'save posted');
  assert.equal(save.values.debug, null);
});

test('P41: enum Inherit submits empty string so the host clears the override', () => {
  const h = makeHarness();
  h.dispatch({
    type: 'init',
    hasWorkspace: true,
    scope: 'Workspace',
    settings: { safetyMode: 'unsafe' },
  });
  // Form-side collect(): selecting '' (Inherit) on safetyMode must produce ''.
  h.els.get('safetyMode').value = '';
  h.clickSave();
  const save = h.captured.find((m) => m.type === 'save');
  assert.ok(save, 'save posted');
  assert.equal(save.values.safetyMode, '');
});

test('P43: adding a workspace folder re-enables the Workspace controls', () => {
  const h = makeHarness();
  // Open with no workspace: Workspace scope and the mcp.json export are disabled.
  h.dispatch({ type: 'init', hasWorkspace: false, scope: 'Global', settings: { shells: {} } });
  assert.equal(h.scope('Workspace').disabled, true);
  assert.equal(h.els.get('writeMcp').disabled, true);
  assert.equal(h.els.get('noWorkspace').style.display, 'block');
  // A later init with a folder must re-enable them and hide the hint.
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  assert.equal(h.scope('Workspace').disabled, false);
  assert.equal(h.els.get('writeMcp').disabled, false);
  assert.equal(h.els.get('noWorkspace').style.display, 'none');
});

test('P44: removing the folder while dirty switches scope to Global but keeps edits', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  // Unsaved edit on a non-optional field so the form is dirty.
  h.els.get('commandTimeout').value = '99';
  // Folder removed: host normalizes scope to Global and posts an external init.
  h.dispatch({
    type: 'init',
    external: true,
    hasWorkspace: false,
    scope: 'Global',
    settings: { commandTimeout: 5, shells: {} },
  });
  // Field values are preserved (external reload skipped while dirty)...
  assert.equal(h.els.get('commandTimeout').value, '99');
  // ...but the Workspace scope is disabled and Global is selected, so a Save now
  // targets a valid scope instead of a non-existent Workspace.
  assert.equal(h.scope('Workspace').disabled, true);
  assert.equal(h.scope('Global').checked, true);
});

test('P48: clearing a set optional field persists an explicit empty override', () => {
  const h = makeHarness();
  // configFile is explicitly set at this scope (Inherit unchecked).
  h.dispatch({
    type: 'init',
    hasWorkspace: true,
    scope: 'Workspace',
    settings: { configFile: '/ws/config.json', shells: {} },
    setKeys: ['configFile'],
  });
  assert.equal(h.els.get('configFile-inherit').checked, false);
  // User clears the field (does not touch Inherit) and saves.
  h.els.get('configFile').value = '';
  h.clickSave();
  const save = h.captured.find((m) => m.type === 'save');
  assert.ok(save, 'save posted');
  // Empty + Inherit unchecked => explicit empty override (not null/clear).
  assert.equal(save.values.configFile, '');
});

test('P48: an unset optional field defaults to Inherit and submits null', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  assert.equal(h.els.get('configFile-inherit').checked, true);
  h.clickSave();
  const save = h.captured.find((m) => m.type === 'save');
  // Unchanged Inherit field is not part of collectChanged, so it isn't submitted.
  assert.equal('configFile' in (save.values || {}), false);
});
