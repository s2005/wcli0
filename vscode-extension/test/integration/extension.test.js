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
});
