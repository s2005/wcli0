const assert = require('assert');
const vscode = require('vscode');
// The built extension settings model — exercised here against the REAL VS Code
// configuration API so the deep-merge semantics the unit stub cannot model
// (object settings merge across scopes) are covered end-to-end.
const { readSettings, hasPerShellConfig, hasProfilesConfig } = require('../../dist/settings.js');

const EXT_ID = 's2005.wcli0-vscode';

describe('wcli0 extension', function () {
  it('is present and activates', async function () {
    const ext = vscode.extensions.getExtension(EXT_ID);
    assert.ok(ext, `extension ${EXT_ID} not found`);
    await ext.activate();
    assert.equal(ext.isActive, true);
  });

  it('registers its commands', async function () {
    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      'wcli0.configure',
      'wcli0.generateConfigFile',
      'wcli0.writeWorkspaceMcpJson',
      'wcli0.restartServer',
      'wcli0.showLaunchCommand',
    ]) {
      assert.ok(commands.includes(id), `missing command ${id}`);
    }
  });

  it('contributes settings with expected defaults', function () {
    const cfg = vscode.workspace.getConfiguration('wcli0');
    assert.equal(cfg.get('launch.method'), 'npx');
    assert.equal(cfg.get('launch.packageSpec'), 'wcli0@latest');
    assert.equal(cfg.get('shell'), 'all');
    assert.equal(cfg.get('safetyMode'), 'safe');
    assert.equal(cfg.get('transport.mode'), 'stdio');
    assert.deepEqual(cfg.get('shells'), {});
    assert.equal(cfg.get('ignoreInheritedShells'), false);
    assert.deepEqual(cfg.get('profiles'), {});
  });

  it('round-trips an environment profile and gates the managed launch', async function () {
    const profiles = {
      ora19: {
        description: 'Oracle 19c',
        allowedShells: ['cmd', 'powershell'],
        env: { ORACLE_HOME: 'C:/oracle/19', PATH: 'C:/oracle/19/bin;${PATH}' },
      },
    };
    await vscode.workspace
      .getConfiguration('wcli0')
      .update('profiles', profiles, vscode.ConfigurationTarget.Global);
    try {
      const updated = vscode.workspace.getConfiguration('wcli0').get('profiles');
      assert.deepEqual(updated, profiles);
      // A configured profile flips the effective gate to the managed --config path.
      assert.equal(hasProfilesConfig(readSettings()), true, 'profiles select managed mode');
      // showLaunchCommand should reflect managed mode without throwing.
      await vscode.commands.executeCommand('wcli0.showLaunchCommand');
    } finally {
      await vscode.workspace
        .getConfiguration('wcli0')
        .update('profiles', undefined, vscode.ConfigurationTarget.Global);
    }
    assert.equal(hasProfilesConfig(readSettings()), false, 'cleared -> CLI-flag path');
  });

  it('ignoreInheritedShells opts a workspace out of inherited per-shell mode (deep-merge)', async function () {
    const cfg = () => vscode.workspace.getConfiguration('wcli0');
    // A User-scope per-shell config is deep-merged into the workspace's effective
    // value; the workspace cannot remove it by clearing wcli0.shells.
    await cfg().update('shells', { cmd: { enabled: true } }, vscode.ConfigurationTarget.Global);
    try {
      assert.equal(hasPerShellConfig(readSettings()), true, 'inherits managed per-shell mode');
      // The separate boolean survives the deep-merge and flips the effective gate.
      await cfg().update('ignoreInheritedShells', true, vscode.ConfigurationTarget.Workspace);
      assert.equal(hasPerShellConfig(readSettings()), false, 'masked -> CLI-flag path');
      // Unsetting the flag restores managed (inherited) per-shell mode.
      await cfg().update('ignoreInheritedShells', undefined, vscode.ConfigurationTarget.Workspace);
      assert.equal(hasPerShellConfig(readSettings()), true, 'restored managed mode');
    } finally {
      await cfg().update('shells', undefined, vscode.ConfigurationTarget.Global);
      await cfg().update('ignoreInheritedShells', undefined, vscode.ConfigurationTarget.Workspace);
    }
  });

  it('ignoreInheritedProfiles opts a workspace out of inherited profiles (deep-merge)', async function () {
    const cfg = () => vscode.workspace.getConfiguration('wcli0');
    // A User-scope profile is deep-merged into the workspace's effective value; the
    // workspace cannot remove it by clearing wcli0.profiles.
    await cfg().update(
      'profiles',
      { ora19: { env: { ORACLE_HOME: 'C:/oracle/19' } } },
      vscode.ConfigurationTarget.Global,
    );
    try {
      assert.equal(hasProfilesConfig(readSettings()), true, 'inherits managed profiles mode');
      // The separate boolean survives the deep-merge and flips the effective gate.
      await cfg().update('ignoreInheritedProfiles', true, vscode.ConfigurationTarget.Workspace);
      assert.equal(hasProfilesConfig(readSettings()), false, 'masked -> CLI-flag path');
      // Unsetting the flag restores managed (inherited) profiles mode.
      await cfg().update('ignoreInheritedProfiles', undefined, vscode.ConfigurationTarget.Workspace);
      assert.equal(hasProfilesConfig(readSettings()), true, 'restored managed mode');
    } finally {
      await cfg().update('profiles', undefined, vscode.ConfigurationTarget.Global);
      await cfg().update('ignoreInheritedProfiles', undefined, vscode.ConfigurationTarget.Workspace);
    }
  });

  it('round-trips a per-shell configuration at the global scope', async function () {
    const shells = {
      cmd: { enabled: true },
      gitbash: { enabled: false, executable: { command: 'C:/Git/bin/bash.exe', args: ['-c'] } },
    };
    await vscode.workspace
      .getConfiguration('wcli0')
      .update('shells', shells, vscode.ConfigurationTarget.Global);
    const updated = vscode.workspace.getConfiguration('wcli0').get('shells');
    assert.deepEqual(updated, shells);
    // showLaunchCommand should now reflect managed mode without throwing.
    await vscode.commands.executeCommand('wcli0.showLaunchCommand');
    await vscode.workspace
      .getConfiguration('wcli0')
      .update('shells', undefined, vscode.ConfigurationTarget.Global);
  });

  it('round-trips a setting update at the global scope', async function () {
    const cfg = vscode.workspace.getConfiguration('wcli0');
    await cfg.update('commandTimeout', 123, vscode.ConfigurationTarget.Global);
    const updated = vscode.workspace.getConfiguration('wcli0').get('commandTimeout');
    assert.equal(updated, 123);
    // Restore default to avoid leaking state into the user profile.
    await vscode.workspace
      .getConfiguration('wcli0')
      .update('commandTimeout', undefined, vscode.ConfigurationTarget.Global);
  });

  it('runs showLaunchCommand without throwing', async function () {
    await vscode.commands.executeCommand('wcli0.showLaunchCommand');
  });

  it('contributes the activity bar configuration view', function () {
    const ext = vscode.extensions.getExtension(EXT_ID);
    assert.ok(ext, `extension ${EXT_ID} not found`);
    const contributes = ext.packageJSON.contributes;

    const container = (contributes.viewsContainers.activitybar || []).find(
      (c) => c.id === 'wcli0-activitybar',
    );
    assert.ok(container, 'missing wcli0-activitybar view container');
    assert.ok(container.icon, 'view container has no icon');

    const view = (contributes.views['wcli0-activitybar'] || []).find(
      (v) => v.id === 'wcli0.configView',
    );
    assert.ok(view, 'missing wcli0.configView view');
    assert.equal(view.type, 'webview');
  });

  it('can focus the configuration view without throwing', async function () {
    // The webview view provider is resolved lazily; focusing it exercises
    // registration end-to-end in a real Extension Host.
    await vscode.commands.executeCommand('wcli0.configView.focus');
  });
});
