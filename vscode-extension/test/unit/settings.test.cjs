const test = require('node:test');
const assert = require('node:assert/strict');

const vscode = require('../stubs/vscode.cjs');
const {
  readSettings,
  readSettingsForScope,
  resolveVariables,
  hasUnresolvedVariables,
  primaryWorkspaceFolder,
  CONFIG_SECTION,
} = require('../../dist/settings.js');

test.beforeEach(() => {
  vscode.__reset();
  vscode.__state.workspaceFolders = [
    { uri: { fsPath: '/ws' }, name: 'ws', index: 0 },
    { uri: { fsPath: '/other' }, name: 'other', index: 1 },
  ];
});

test('CONFIG_SECTION is wcli0', () => {
  assert.equal(CONFIG_SECTION, 'wcli0');
});

test('readSettings returns documented defaults on an empty config', () => {
  const s = readSettings();
  assert.equal(s.launchMethod, 'npx');
  assert.equal(s.packageSpec, 'wcli0@latest');
  assert.equal(s.shell, 'all');
  assert.equal(s.safetyMode, 'safe');
  assert.equal(s.transportMode, 'stdio');
  assert.equal(s.commandTimeout, null);
  assert.deepEqual(s.allowedDirectories, []);
  assert.deepEqual(s.env, {});
});

test('readSettings reflects stored workspace values', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shell', 'gitbash');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.commandTimeout', 99);
  const s = readSettings();
  assert.equal(s.shell, 'gitbash');
  assert.equal(s.commandTimeout, 99);
});

test('non-finite numeric settings normalize to null', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.commandTimeout', 'oops');
  assert.equal(readSettings().commandTimeout, null);
});

test('resolveVariables expands workspaceFolder, named folder and userHome', () => {
  assert.equal(resolveVariables('${workspaceFolder}/x'), '/ws/x');
  assert.equal(resolveVariables('${workspaceFolder:other}/y'), '/other/y');
  process.env.HOME = '/home/me';
  assert.equal(resolveVariables('${userHome}/z'), '/home/me/z');
});

test('resolveVariables passes through empty and plain strings', () => {
  assert.equal(resolveVariables(''), '');
  assert.equal(resolveVariables('/plain/path'), '/plain/path');
});

test('readSettingsForScope reads only the targeted scope (no inheritance)', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Global, 'wcli0.shell', 'powershell');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shell', 'cmd');

  // Merged view: workspace wins.
  assert.equal(readSettings().shell, 'cmd');
  // Scoped views show each scope's own stored value, not the inherited one.
  assert.equal(readSettingsForScope('Global').shell, 'powershell');
  assert.equal(readSettingsForScope('Workspace').shell, 'cmd');
});

test('readSettingsForScope falls back to defaults when unset at that scope', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shell', 'cmd');
  // Global has no value -> default, not the workspace value.
  assert.equal(readSettingsForScope('Global').shell, 'all');
});

test('resolveVariables leaves the token intact when no workspace is open', () => {
  vscode.__state.workspaceFolders = undefined;
  // Must NOT collapse to "/x" — that could widen an allowed path to a root dir.
  assert.equal(resolveVariables('${workspaceFolder}/x'), '${workspaceFolder}/x');
});

test('hasUnresolvedVariables detects leftover tokens', () => {
  assert.equal(hasUnresolvedVariables('${workspaceFolder}/x'), true);
  assert.equal(hasUnresolvedVariables('/plain/path'), false);
});

test('primaryWorkspaceFolder returns the first folder or undefined', () => {
  assert.equal(primaryWorkspaceFolder().name, 'ws');
  vscode.__state.workspaceFolders = undefined;
  assert.equal(primaryWorkspaceFolder(), undefined);
});
