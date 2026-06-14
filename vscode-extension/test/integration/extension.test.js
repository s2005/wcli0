const assert = require('assert');
const vscode = require('vscode');

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
