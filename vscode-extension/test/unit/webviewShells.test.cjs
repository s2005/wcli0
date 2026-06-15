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
  // debug is set at this scope, so it is reported in setSelectKeys (otherwise the
  // form would render it as Inherit, per P60).
  h.dispatch({
    type: 'init',
    hasWorkspace: true,
    scope: 'Workspace',
    settings: { debug: true },
    setSelectKeys: ['debug'],
  });
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
    setSelectKeys: ['safetyMode'],
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

test('P44/P89: removing the folder while dirty keeps edits AND keeps the loaded scope', () => {
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
  // ...the Workspace radio is disabled (no folder) but stays SELECTED, and Global is
  // NOT auto-checked: a dirty form must keep its loaded scope so Save does not silently
  // persist Workspace values into User scope (P89). The host refuses a Workspace save
  // with no folder open.
  assert.equal(h.scope('Workspace').disabled, true);
  assert.equal(h.scope('Workspace').checked, true, 'loaded scope stays selected while dirty');
  assert.equal(h.scope('Global').checked, false, 'Global is not auto-targeted');
});

test('P89: a dirty Workspace form whose folder is removed still Saves to Workspace', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  h.els.get('safetyMode').value = 'unsafe'; // project-specific edit -> dirty
  h.dispatch({
    type: 'init',
    external: true,
    hasWorkspace: false,
    scope: 'Global',
    settings: { shells: {} },
  });
  h.clickSave();
  const save = h.captured.find((m) => m.type === 'save');
  assert.ok(save, 'save posted');
  assert.equal(save.target, 'Workspace', 'save targets the loaded scope, not User');
});

test('P44: removing the folder while CLEAN switches scope to Global', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  // No edits: the form is clean, so there is nothing to mis-save and the only valid
  // scope (Global) is selected.
  h.dispatch({
    type: 'init',
    external: true,
    hasWorkspace: false,
    scope: 'Global',
    settings: { shells: {} },
  });
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

test('P55: per-shell executable args preserve leading/trailing and whitespace-only entries', () => {
  const h = makeHarness();
  // Baseline: a shell with whitespace-significant args already configured.
  h.dispatch({
    type: 'init',
    hasWorkspace: true,
    scope: 'Workspace',
    settings: { shells: { gitbash: { executable: { command: 'bash', args: ['--flag', '  spaced  '] } } } },
  });
  // The textarea round-trips the args verbatim.
  assert.equal(h.els.get('sh-gitbash-args').value, '--flag\n  spaced  ');
  // Editing an unrelated field and saving must NOT trim the args: they are passed
  // straight to spawn, so the whitespace is meaningful and would otherwise be lost.
  h.els.get('sh-gitbash-enabled').value = 'disabled';
  h.clickSave();
  const save = h.captured.find((m) => m.type === 'save');
  assert.ok(save, 'save posted');
  assert.deepEqual(save.values.shells.gitbash.executable.args, ['--flag', '  spaced  ']);
});

test('P69: an unset allowedDirectories shows Inherit and persists an explicit empty override', () => {
  const h = makeHarness();
  // Unset at the scope (not in setArrayKeys), default []: the Inherit box is checked.
  h.dispatch({
    type: 'init',
    hasWorkspace: true,
    scope: 'Workspace',
    settings: { allowedDirectories: [], shells: {} },
    setArrayKeys: [],
  });
  assert.equal(h.els.get('allowedDirectories-inherit').checked, true, 'unset -> Inherit checked');
  // User unchecks Inherit and leaves the textarea empty -> explicit empty override.
  h.els.get('allowedDirectories-inherit').checked = false;
  h.clickSave();
  const save = h.captured.find((m) => m.type === 'save');
  assert.ok(save, 'save posted');
  assert.deepEqual(save.values.allowedDirectories, [], 'explicit [] override masks the other scope');
});

test('P69: checking Inherit for allowedDirectories clears the scope override (null)', () => {
  const h = makeHarness();
  h.dispatch({
    type: 'init',
    hasWorkspace: true,
    scope: 'Workspace',
    settings: { allowedDirectories: ['/a'], shells: {} },
    setArrayKeys: ['allowedDirectories'],
  });
  assert.equal(h.els.get('allowedDirectories-inherit').checked, false, 'set -> Inherit unchecked');
  assert.equal(h.els.get('allowedDirectories').value, '/a');
  // User checks Inherit: the change handler clears the textarea, and collect emits
  // null so applySettings removes the override.
  const cb = h.els.get('allowedDirectories-inherit');
  cb.checked = true;
  cb._l.change.forEach((fn) => fn());
  h.clickSave();
  const save = h.captured.find((m) => m.type === 'save');
  assert.equal(save.values.allowedDirectories, null, 'Inherit -> null clears the override');
});

test('P70: switching scope with unsaved edits requests confirmation and reverts the radio', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  h.els.get('initialDir').value = '/my/edit'; // dirty
  const g = h.scope('Global');
  g.checked = true;
  g._l.change.forEach((fn) => fn());
  const req = h.captured.find((m) => m.type === 'scopeChangeRequest');
  assert.ok(req && req.target === 'Global', 'a scopeChangeRequest is posted');
  assert.ok(!h.captured.some((m) => m.type === 'scopeChange'), 'no immediate scopeChange');
  // The radio reverts to the loaded scope until the user confirms.
  assert.equal(h.scope('Workspace').checked, true, 'radio reverted to the loaded scope');
});

test('P70: switching scope with a clean form changes scope immediately', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  const g = h.scope('Global');
  g.checked = true;
  g._l.change.forEach((fn) => fn());
  const sc = h.captured.find((m) => m.type === 'scopeChange');
  assert.ok(sc && sc.target === 'Global', 'a clean form switches immediately');
  assert.ok(!h.captured.some((m) => m.type === 'scopeChangeRequest'), 'no confirmation needed');
});

test('Design 5: segmented enable buttons drive the hidden select, summary chip and isolation status', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  // No per-shell config and no config file -> the launch is overridable.
  assert.equal(h.els.get('isolationChip').textContent, 'Overridable');
  // Clicking the cmd "On" segment sets the hidden enable select the collector reads.
  h.els.get('seg-cmd-on')._l.click.forEach((cb) => cb());
  assert.equal(h.els.get('sh-cmd-enabled').value, 'enabled');
  // The summary chip and the header isolation status reflect the change.
  assert.equal(h.els.get('sum-cmd').textContent, 'cmd: on');
  assert.equal(h.els.get('isolationChip').textContent, 'Isolated');
  // A save persists the enabled flag the segmented button drove onto the select.
  h.clickSave();
  const save = h.captured.find((m) => m.type === 'save');
  assert.equal(save.values.shells.cmd.enabled, true);
});

test('Design 5: a referenced config file marks the launch isolated', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {}, configFile: '${workspaceFolder}/wcli0.json' } });
  assert.equal(h.els.get('isolationChip').textContent, 'Isolated');
});

test('P84: an override-only per-shell setting marks the launch isolated and refreshes on input', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  assert.equal(h.els.get('isolationChip').textContent, 'Overridable');
  // A security override alone (no enabled/command change) still switches the provider
  // to an isolated managed-config launch, and typing it must refresh the chip.
  const el = h.els.get('sh-cmd-sec-timeout');
  el.value = '30';
  el._l.input.forEach((cb) => cb());
  assert.equal(h.els.get('isolationChip').textContent, 'Isolated');
});

test('P84: typing an executable command refreshes the isolation status', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  const el = h.els.get('sh-gitbash-cmd');
  el.value = 'C:/git/bash.exe';
  el._l.input.forEach((cb) => cb());
  assert.equal(h.els.get('isolationChip').textContent, 'Isolated');
});

test('P84: an allowed-paths override alone marks the launch isolated', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  const el = h.els.get('sh-cmd-paths');
  el.value = 'C:/work';
  el._l.input.forEach((cb) => cb());
  assert.equal(h.els.get('isolationChip').textContent, 'Isolated');
});

test('Shells mode: defaults to Simple when no shell is configured', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  assert.equal(h.els.get('simplePane').style.display, '', 'simple pane shown');
  assert.equal(h.els.get('perShellSection').style.display, 'none', 'per-shell section hidden');
  assert.ok(h.els.get('mode-simple').className.includes('sel'), 'Simple button selected');
  assert.ok(!h.els.get('mode-per').className.includes('sel'), 'Per-shell button not selected');
});

test('Shells mode: defaults to Per-shell when a shell is configured', () => {
  const h = makeHarness();
  h.dispatch({
    type: 'init',
    hasWorkspace: true,
    scope: 'Workspace',
    settings: { shells: { cmd: { enabled: true } } },
  });
  assert.equal(h.els.get('simplePane').style.display, 'none', 'simple pane hidden');
  assert.equal(h.els.get('perShellSection').style.display, '', 'per-shell section shown');
  assert.ok(h.els.get('mode-per').className.includes('sel'), 'Per-shell button selected');
});

test('Shells mode: the mode buttons toggle which editor is visible', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  h.els.get('mode-per')._l.click.forEach((cb) => cb());
  assert.equal(h.els.get('simplePane').style.display, 'none');
  assert.equal(h.els.get('perShellSection').style.display, '');
  h.els.get('mode-simple')._l.click.forEach((cb) => cb());
  assert.equal(h.els.get('simplePane').style.display, '');
  assert.equal(h.els.get('perShellSection').style.display, 'none');
});

test('Shells mode: switching to Simple warns when per-shell overrides exist', () => {
  const h = makeHarness();
  h.dispatch({
    type: 'init',
    hasWorkspace: true,
    scope: 'Workspace',
    settings: { shells: { cmd: { enabled: true } } },
  });
  // Loaded in Per-shell mode: the warning is hidden.
  assert.equal(h.els.get('shellModeWarn').style.display, 'none');
  // Switching to Simple while a per-shell override is configured surfaces the warning
  // that wcli0.shells still overrides the simple selection.
  h.els.get('mode-simple')._l.click.forEach((cb) => cb());
  assert.equal(h.els.get('shellModeWarn').style.display, '');
});

test('Shells mode: switching to Simple shows no warning when no per-shell config exists', () => {
  const h = makeHarness();
  h.dispatch({ type: 'init', hasWorkspace: true, scope: 'Workspace', settings: { shells: {} } });
  h.els.get('mode-simple')._l.click.forEach((cb) => cb());
  assert.equal(h.els.get('shellModeWarn').style.display, 'none');
});

test('ignoreInheritedShells: populates from init and is collected on save', () => {
  const h = makeHarness();
  // Loaded with the flag set at this scope (setSelectKeys marks it explicit, so the
  // form keeps the loaded value instead of forcing Inherit).
  h.dispatch({
    type: 'init',
    hasWorkspace: true,
    scope: 'Workspace',
    settings: { shells: {}, ignoreInheritedShells: true },
    setSelectKeys: ['ignoreInheritedShells'],
  });
  assert.equal(h.els.get('ignoreInheritedShells').value, 'enabled');

  // Flip to "Do not ignore" and save -> collected as an explicit boolean false.
  h.els.get('ignoreInheritedShells').value = 'disabled';
  h.clickSave();
  const save = h.captured.find((m) => m.type === 'save');
  assert.ok(save, 'save message posted');
  assert.equal(save.values.ignoreInheritedShells, false);
});

test('ignoreInheritedShells: an unset value renders as Inherit (default)', () => {
  const h = makeHarness();
  // Not in setSelectKeys -> the form forces the Inherit state even though the
  // settings default reads false (mirrors INHERITABLE_SELECT_KEYS handling).
  h.dispatch({
    type: 'init',
    hasWorkspace: true,
    scope: 'Workspace',
    settings: { shells: {}, ignoreInheritedShells: false },
    setSelectKeys: [],
  });
  assert.equal(h.els.get('ignoreInheritedShells').value, 'default');
});

test('P97: ignoreInheritedShells is disabled when editing User (Global) scope', () => {
  const h = makeHarness();
  h.dispatch({
    type: 'init',
    hasWorkspace: true,
    scope: 'Global',
    settings: { shells: {}, ignoreInheritedShells: false },
    setSelectKeys: [],
  });
  // The Workspace-only opt-out must not be settable at User scope, where it would
  // suppress the User scope's own per-shell config everywhere.
  assert.equal(h.els.get('ignoreInheritedShells').disabled, true);
  assert.equal(h.els.get('ignoreInheritedShellsUserNote').style.display, '');
});

test('P97: ignoreInheritedShells is enabled at Workspace scope', () => {
  const h = makeHarness();
  h.dispatch({
    type: 'init',
    hasWorkspace: true,
    scope: 'Workspace',
    settings: { shells: {}, ignoreInheritedShells: false },
    setSelectKeys: [],
  });
  assert.equal(h.els.get('ignoreInheritedShells').disabled, false);
  assert.equal(h.els.get('ignoreInheritedShellsUserNote').style.display, 'none');
});

test('ignoreInheritedShells: enabling it marks the launch as Overridable despite per-shell config', () => {
  const h = makeHarness();
  // A per-shell config would normally isolate the launch (Isolated chip).
  h.dispatch({
    type: 'init',
    hasWorkspace: true,
    scope: 'Workspace',
    settings: { shells: { cmd: { enabled: true } }, ignoreInheritedShells: false },
    setSelectKeys: [],
  });
  assert.equal(h.els.get('isolationChip').textContent, 'Isolated');
  // Enabling the opt-out flips the host to the CLI-flag path, so the chip reflects
  // that an implicit config.json could override the launch again.
  const ign = h.els.get('ignoreInheritedShells');
  ign.value = 'enabled';
  ign._l.change.forEach((cb) => cb());
  assert.equal(h.els.get('isolationChip').textContent, 'Overridable');
});
