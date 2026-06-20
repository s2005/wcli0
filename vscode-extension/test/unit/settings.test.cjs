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
  hasProfilesConfig,
  explicitlySetSelectKeys,
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
  // P76: ${userHome} resolves via the platform home (os.homedir()), matching VS
  // Code's own resolution, not whatever HOME happens to be set to.
  assert.equal(resolveVariables('${userHome}/z'), require('os').homedir() + '/z');
});

test('P76: userHome ignores a Unix-style HOME on Windows in favor of the platform home', () => {
  const os = require('os');
  // Even with HOME pointed at a Unix-style path (as Git/Cygwin set it on Windows),
  // resolution uses os.homedir() so the token never resolves to the wrong directory.
  const savedHome = process.env.HOME;
  process.env.HOME = '/home/cygwin-style';
  try {
    if (process.platform === 'win32') {
      assert.equal(/^\/home\/cygwin-style/.test(resolveVariables('${userHome}/z')), false);
    }
    assert.equal(resolveVariables('${userHome}/z'), os.homedir() + '/z');
  } finally {
    if (savedHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = savedHome;
    }
  }
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

test('P60: explicitlySetSelectKeys reports only enum/boolean keys set at the scope', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Global, 'wcli0.safetyMode', 'unsafe');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.allowAllDirs', true);
  // Workspace: only allowAllDirs is set there; safetyMode is a User-scope override.
  const ws = explicitlySetSelectKeys('Workspace');
  assert.ok(ws.includes('allowAllDirs'), 'allowAllDirs reported set at workspace');
  assert.ok(!ws.includes('safetyMode'), 'User safetyMode not reported as set at workspace');
  assert.ok(!ws.includes('debug'), 'unset debug not reported');
  // Global: safetyMode is set there.
  const gl = explicitlySetSelectKeys('Global');
  assert.ok(gl.includes('safetyMode'), 'safetyMode reported set at global');
  assert.ok(!gl.includes('allowAllDirs'), 'workspace allowAllDirs not reported at global');
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

test('readSettings reads the profiles map', () => {
  assert.deepEqual(readSettings().profiles, {});
  const profiles = {
    ora19: {
      description: 'Oracle 19c',
      allowedShells: ['cmd', 'powershell'],
      env: { ORACLE_HOME: 'C:/oracle/19', PATH: 'C:/oracle/19/bin;${PATH}' },
    },
  };
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.profiles', profiles);
  assert.deepEqual(readSettings().profiles, profiles);
});

test('hasProfilesConfig is true only for a profile with a non-empty env', () => {
  assert.equal(hasProfilesConfig(readSettings()), false);

  // A profile with at least one string env var triggers managed mode.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.profiles', {
    ora19: { env: { ORACLE_HOME: 'C:/oracle/19' } },
  });
  assert.equal(hasProfilesConfig(readSettings()), true);

  // An empty env is not meaningful (the server rejects it), so it must not gate.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.profiles', {
    empty: { env: {} },
  });
  assert.equal(hasProfilesConfig(readSettings()), false);

  // A profile whose only env key is blank, or whose value is not a string, is
  // not emittable and must not gate.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.profiles', {
    bad: { env: { '  ': 'x', N: 123 } },
  });
  assert.equal(hasProfilesConfig(readSettings()), false);

  // A blank profile name with an otherwise valid env does not count.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.profiles', {
    '   ': { env: { N: 'v' } },
  });
  assert.equal(hasProfilesConfig(readSettings()), false);
});

test('P108: a profile dropped by buildProfiles does not gate managed config', () => {
  // P107 drop: a non-empty allowedShells with no valid entries removes the whole
  // profile from the generated config, so it must not force managed mode.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.profiles', {
    p: { allowedShells: ['powershel'], env: { A: 'b' } },
  });
  assert.equal(hasProfilesConfig(readSettings()), false);

  // P106 drop: an env whose only value carries an unresolvable ${workspaceFolder}
  // token (no workspace open) is dropped, leaving an empty env the server rejects.
  vscode.__state.workspaceFolders = undefined;
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.profiles', {
    p: { env: { ONLY: '${workspaceFolder}/bin' } },
  });
  assert.equal(hasProfilesConfig(readSettings()), false);

  // But a profile keeping at least one resolvable env value still gates on.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.profiles', {
    p: { env: { ONLY: '${workspaceFolder}/bin', KEEP: 'x;${PATH}' } },
  });
  assert.equal(hasProfilesConfig(readSettings()), true);
});

test('a profile with a non-array allowedShells does not gate managed config', () => {
  // buildProfiles drops a profile whose allowedShells is present but not an array
  // (e.g. a hand-edited "cmd"); the launch-mode gate must mirror that so the dropped
  // profile does not force managed --config over wcli0.configFile.
  vscode.__state.workspaceFolders = undefined;
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.profiles', {
    p: { allowedShells: 'cmd', env: { A: 'b' } },
  });
  assert.equal(hasProfilesConfig(readSettings()), false);
});

test('ignoreInheritedShells gates hasPerShellConfig off even with non-empty shells', () => {
  // A non-empty per-shell config normally selects managed mode.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shells', {
    cmd: { enabled: true },
  });
  assert.equal(hasPerShellConfig(readSettings()), true);
  // With the opt-out flag set, the scope returns to the CLI-flag path even though
  // the (deep-merged) shells value is non-empty — the workspace cannot remove the
  // inherited entry, so this separate boolean is the escape hatch.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.ignoreInheritedShells', true);
  assert.equal(hasPerShellConfig(readSettings()), false);
  // Clearing the flag restores managed mode.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.ignoreInheritedShells', false);
  assert.equal(hasPerShellConfig(readSettings()), true);
});

test('ignoreInheritedShells is an inheritable select key reported when set at a scope', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.ignoreInheritedShells', true);
  const ws = explicitlySetSelectKeys('Workspace');
  assert.ok(ws.includes('ignoreInheritedShells'), 'reported set at workspace');
  // Unset at Global -> not reported, so the form shows Inherit there.
  assert.ok(!explicitlySetSelectKeys('Global').includes('ignoreInheritedShells'));
});

test('P101: a Global-scoped ignoreInheritedShells does not mask per-shell config', () => {
  // A non-empty per-shell config selects managed mode.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shells', {
    cmd: { enabled: true },
  });
  // The mask set ONLY at User/Global scope (e.g. typed into settings.json, bypassing
  // the form which disables the control there) must NOT suppress the user's own
  // shells: the opt-out is Workspace-only.
  vscode.__setConfig(vscode.ConfigurationTarget.Global, 'wcli0.ignoreInheritedShells', true);
  assert.equal(readSettings().ignoreInheritedShells, false, 'Global value not honored');
  assert.equal(hasPerShellConfig(readSettings()), true, 'shells still active');
  // A Global-scope form read also reports it false (a Global export must not mask).
  assert.equal(readSettingsForScope('Global').ignoreInheritedShells, false);
  // Setting it at Workspace scope is the supported opt-out and IS honored.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.ignoreInheritedShells', true);
  assert.equal(readSettings().ignoreInheritedShells, true);
  assert.equal(hasPerShellConfig(readSettings()), false);
});

test('P105: a workspace-folder false overrides a workspace-true shell mask', () => {
  // A non-empty per-shell config selects managed mode.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shells', {
    cmd: { enabled: true },
  });
  // Workspace scope opts out of inherited per-shell config...
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.ignoreInheritedShells', true);
  assert.equal(readSettings().ignoreInheritedShells, true, 'workspace value honored');
  // ...but a workspace-folder value explicitly opts BACK IN. VS Code resource
  // precedence makes the folder value effective, so the mask must be off.
  vscode.__setConfig(
    vscode.ConfigurationTarget.WorkspaceFolder,
    'wcli0.ignoreInheritedShells',
    false,
  );
  assert.equal(readSettings().ignoreInheritedShells, false, 'folder value wins over workspace');
  assert.equal(hasPerShellConfig(readSettings()), true, 'per-shell config re-enabled for folder');
  // A workspace-folder true also wins over a workspace false.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.ignoreInheritedShells', false);
  vscode.__setConfig(vscode.ConfigurationTarget.WorkspaceFolder, 'wcli0.ignoreInheritedShells', true);
  assert.equal(readSettings().ignoreInheritedShells, true, 'folder true wins over workspace false');
});

// ---- ignoreInheritedProfiles (the profiles twin of the shell mask, P110) ----

test('ignoreInheritedProfiles gates hasProfilesConfig off even with non-empty profiles', () => {
  // A meaningful profile normally selects managed mode.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.profiles', {
    p: { env: { A: 'b' } },
  });
  assert.equal(hasProfilesConfig(readSettings()), true);
  // With the opt-out flag set, the scope drops out of profiles mode even though the
  // (deep-merged) profiles value is non-empty — the workspace cannot remove the
  // inherited entry, so this separate boolean is the escape hatch.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.ignoreInheritedProfiles', true);
  assert.equal(hasProfilesConfig(readSettings()), false);
  // Clearing the flag restores managed mode.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.ignoreInheritedProfiles', false);
  assert.equal(hasProfilesConfig(readSettings()), true);
});

test('ignoreInheritedProfiles is an inheritable select key reported when set at a scope', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.ignoreInheritedProfiles', true);
  const ws = explicitlySetSelectKeys('Workspace');
  assert.ok(ws.includes('ignoreInheritedProfiles'), 'reported set at workspace');
  // Unset at Global -> not reported, so the form shows Inherit there.
  assert.ok(!explicitlySetSelectKeys('Global').includes('ignoreInheritedProfiles'));
});

test('P101: a Global-scoped ignoreInheritedProfiles does not mask profiles', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.profiles', {
    p: { env: { A: 'b' } },
  });
  // The mask set ONLY at User/Global scope (e.g. typed into settings.json, bypassing
  // the form which disables the control there) must NOT suppress the user's own
  // profiles: the opt-out is Workspace-only.
  vscode.__setConfig(vscode.ConfigurationTarget.Global, 'wcli0.ignoreInheritedProfiles', true);
  assert.equal(readSettings().ignoreInheritedProfiles, false, 'Global value not honored');
  assert.equal(hasProfilesConfig(readSettings()), true, 'profiles still active');
  // A Global-scope form read also reports it false (a Global export must not mask).
  assert.equal(readSettingsForScope('Global').ignoreInheritedProfiles, false);
  // Setting it at Workspace scope is the supported opt-out and IS honored.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.ignoreInheritedProfiles', true);
  assert.equal(readSettings().ignoreInheritedProfiles, true);
  assert.equal(hasProfilesConfig(readSettings()), false);
});

test('P105: a workspace-folder false overrides a workspace-true profiles mask', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.profiles', {
    p: { env: { A: 'b' } },
  });
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.ignoreInheritedProfiles', true);
  assert.equal(readSettings().ignoreInheritedProfiles, true, 'workspace value honored');
  // A workspace-folder value explicitly opts BACK IN; resource precedence wins.
  vscode.__setConfig(
    vscode.ConfigurationTarget.WorkspaceFolder,
    'wcli0.ignoreInheritedProfiles',
    false,
  );
  assert.equal(readSettings().ignoreInheritedProfiles, false, 'folder value wins over workspace');
  assert.equal(hasProfilesConfig(readSettings()), true, 'profiles re-enabled for folder');
  // A workspace-folder true also wins over a workspace false.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.ignoreInheritedProfiles', false);
  vscode.__setConfig(vscode.ConfigurationTarget.WorkspaceFolder, 'wcli0.ignoreInheritedProfiles', true);
  assert.equal(readSettings().ignoreInheritedProfiles, true, 'folder true wins over workspace false');
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
