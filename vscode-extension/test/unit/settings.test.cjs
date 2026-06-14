const test = require('node:test');
const assert = require('node:assert/strict');

const vscode = require('../stubs/vscode.cjs');
const {
  readSettings,
  readSettingsForScope,
  resolveVariables,
  hasUnresolvedVariables,
  primaryWorkspaceFolder,
  hasPerShellConfig,
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

test('hasPerShellConfig detects any meaningful per-shell field', () => {
  assert.equal(hasPerShellConfig(readSettings()), false);
  // Each kind of meaningful field independently triggers managed mode.
  const cases = [
    { cmd: { enabled: false } },
    { cmd: { executable: { command: 'cmd.exe' } } },
    { cmd: { executable: { args: ['/c'] } } },
    { cmd: { overrides: { security: { maxCommandLength: 10 } } } },
    { cmd: { overrides: { security: { enableInjectionProtection: false } } } },
    { cmd: { overrides: { restrictions: { blockedCommands: ['x'] } } } },
    { cmd: { overrides: { paths: { allowedPaths: ['/a'] } } } },
    { cmd: { overrides: { paths: { initialDir: '/a' } } } },
    { wsl: { wslConfig: { mountPoint: '/mnt/' } } },
    { wsl: { wslConfig: { inheritGlobalPaths: false } } },
    // P12: an explicit (even empty) array is meaningful — [] replaces inherited
    // args / clears blocked operators / replaces inherited allowed paths.
    { cmd: { executable: { args: [] } } },
    { cmd: { overrides: { restrictions: { blockedOperators: [] } } } },
    { cmd: { overrides: { paths: { allowedPaths: [] } } } },
  ];
  for (const shells of cases) {
    vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shells', shells);
    assert.equal(hasPerShellConfig(readSettings()), true, JSON.stringify(shells));
  }
  // A whitespace-only command with no other fields is not meaningful.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shells', {
    cmd: { executable: { command: '   ' } },
  });
  assert.equal(hasPerShellConfig(readSettings()), false);
});

test('P23: the LICENSE retains the MIT copyright notice', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const license = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'LICENSE'), 'utf8');
  // The MIT license's own terms require the copyright notice be retained.
  assert.match(license, /Copyright \(c\) 2024 Simon Benedict/);
});

test('P18: the wcli0.shells schema restricts keys to the known shell names', () => {
  const manifest = require('../../package.json');
  const schema = manifest.contributes.configuration.properties['wcli0.shells'];
  // propertyNames.enum makes VS Code flag typos like "powerhsell" instead of
  // silently accepting (and then ignoring) an unknown shell key.
  assert.deepEqual(
    [...schema.propertyNames.enum].sort(),
    ['bash', 'cmd', 'gitbash', 'powershell', 'wsl'],
  );
});
