const assert = require('assert');
const vscode = require('vscode');

// Verifies `wcli0: Write .vscode/mcp.json` does not drop any supported setting:
// every Limits & Safety / logging / restriction / path / shell setting must be
// represented in the generated stdio entry's args. Runs end-to-end in a real
// Extension Host against the workspace fixture configured in .vscode-test.mjs.

const EXT_ID = 's2005.wcli0-vscode';

// Every wcli0.* setting this suite touches, so afterEach can fully reset state.
const ALL_KEYS = [
  'launch.method',
  'configFile',
  'shell',
  'shells',
  'allowedDirectories',
  'initialDir',
  'commandTimeout',
  'maxCommandLength',
  'wslMountPoint',
  'blockedCommands',
  'blockedArguments',
  'blockedOperators',
  'maxOutputLines',
  'enableTruncation',
  'enableLogResources',
  'maxReturnLines',
  'logDirectory',
  'allowAllDirs',
  'safetyMode',
  'debug',
  'transport.mode',
  'transport.host',
  'transport.port',
];

function folder() {
  return vscode.workspace.workspaceFolders[0];
}

function mcpUri() {
  return vscode.Uri.joinPath(folder().uri, '.vscode', 'mcp.json');
}

async function setAll(values) {
  const cfg = vscode.workspace.getConfiguration('wcli0');
  for (const [k, v] of Object.entries(values)) {
    await cfg.update(k, v, vscode.ConfigurationTarget.Global);
  }
}

async function resetAll() {
  const cfg = vscode.workspace.getConfiguration('wcli0');
  for (const k of ALL_KEYS) {
    await cfg.update(k, undefined, vscode.ConfigurationTarget.Global);
  }
  try {
    await vscode.workspace.fs.delete(mcpUri());
  } catch {
    // not present — fine
  }
}

async function readServerEntry() {
  const raw = await vscode.workspace.fs.readFile(mcpUri());
  const parsed = JSON.parse(Buffer.from(raw).toString('utf8'));
  return parsed.servers.wcli0;
}

/** Index of `flag` in args where it is immediately followed by `value`. */
function pairIndex(args, flag, value) {
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === flag && args[i + 1] === value) return i;
  }
  return -1;
}

describe('wcli0: Write .vscode/mcp.json', function () {
  before(async function () {
    const ext = vscode.extensions.getExtension(EXT_ID);
    await ext.activate();
  });

  beforeEach(resetAll);
  afterEach(resetAll);

  it('writes every supported stdio setting into the args (none lost)', async function () {
    await setAll({
      shell: 'cmd',
      allowedDirectories: ['${workspaceFolder}'],
      initialDir: '${workspaceFolder}/start',
      commandTimeout: 45,
      maxCommandLength: 8000,
      wslMountPoint: '/mnt/',
      blockedCommands: ['foo'],
      blockedArguments: ['--bar'], // dash-prefixed -> --opt=value form
      blockedOperators: ['|'],
      maxOutputLines: 100,
      enableTruncation: 'disabled',
      enableLogResources: 'enabled',
      maxReturnLines: 250,
      logDirectory: '${workspaceFolder}/logs',
      debug: true,
    });

    await vscode.commands.executeCommand('wcli0.writeWorkspaceMcpJson');
    const entry = await readServerEntry();
    const args = entry.args;

    assert.equal(entry.type, 'stdio');
    assert.equal(entry.command, 'npx');

    // Each setting must be represented — this is the regression guard.
    const expectedPairs = [
      ['--shell', 'cmd'],
      ['--allowedDir', '${workspaceFolder}'],
      ['--initialDir', '${workspaceFolder}/start'],
      ['--commandTimeout', '45'],
      ['--maxCommandLength', '8000'],
      ['--wslMountPoint', '/mnt/'],
      ['--blockedCommand', 'foo'],
      ['--blockedOperator', '|'],
      ['--maxOutputLines', '100'],
      ['--maxReturnLines', '250'],
      ['--logDirectory', '${workspaceFolder}/logs'],
    ];
    for (const [flag, value] of expectedPairs) {
      assert.ok(
        pairIndex(args, flag, value) >= 0,
        `expected "${flag} ${value}" in args: ${JSON.stringify(args)}`,
      );
    }
    // Dash-prefixed values use the --opt=value form (separate argv would be
    // mis-parsed by yargs as a new option).
    assert.ok(args.includes('--blockedArgument=--bar'), JSON.stringify(args));
    // Tri-state and boolean flags.
    assert.ok(args.includes('--no-enableTruncation'), JSON.stringify(args));
    assert.ok(args.includes('--enableLogResources'), JSON.stringify(args));
    assert.ok(args.includes('--debug'), JSON.stringify(args));
  });

  it('reflects safetyMode yolo and unsafe', async function () {
    await setAll({ safetyMode: 'yolo' });
    await vscode.commands.executeCommand('wcli0.writeWorkspaceMcpJson');
    let args = (await readServerEntry()).args;
    assert.ok(args.includes('--yolo'), JSON.stringify(args));
    assert.ok(!args.includes('--unsafe'));

    await setAll({ safetyMode: 'unsafe' });
    await vscode.commands.executeCommand('wcli0.writeWorkspaceMcpJson');
    args = (await readServerEntry()).args;
    assert.ok(args.includes('--unsafe'), JSON.stringify(args));
  });

  it('emits --allowAllDirs only when no directories are configured', async function () {
    await setAll({ allowAllDirs: true });
    await vscode.commands.executeCommand('wcli0.writeWorkspaceMcpJson');
    let args = (await readServerEntry()).args;
    assert.ok(args.includes('--allowAllDirs'), JSON.stringify(args));

    // With a directory configured, --allowAllDirs is intentionally suppressed.
    await setAll({ allowedDirectories: ['${workspaceFolder}'] });
    await vscode.commands.executeCommand('wcli0.writeWorkspaceMcpJson');
    args = (await readServerEntry()).args;
    assert.ok(!args.includes('--allowAllDirs'), JSON.stringify(args));
    assert.ok(pairIndex(args, '--allowedDir', '${workspaceFolder}') >= 0);
  });

  it('writes an http url entry (no launch args) when transport is http', async function () {
    await setAll({ 'transport.mode': 'http', 'transport.port': 8080 });
    await vscode.commands.executeCommand('wcli0.writeWorkspaceMcpJson');
    const entry = await readServerEntry();
    assert.equal(entry.type, 'http');
    assert.equal(entry.url, 'http://127.0.0.1:8080/mcp');
    assert.equal(entry.args, undefined);
  });

  // The file-source "Save to file" path and this command share
  // writeMcpJsonFromSettings, whose merge must preserve any other server entries in
  // an existing .vscode/mcp.json. Verify that end-to-end against a real file.
  it('preserves other servers when merging the wcli0 entry into an existing file', async function () {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder().uri, '.vscode'));
    const existing = {
      servers: {
        other: { type: 'stdio', command: 'echo', args: ['hi'] },
        wcli0: { type: 'stdio', command: 'stale' },
      },
    };
    await vscode.workspace.fs.writeFile(mcpUri(), Buffer.from(JSON.stringify(existing), 'utf8'));

    await setAll({ shell: 'cmd' });
    await vscode.commands.executeCommand('wcli0.writeWorkspaceMcpJson');

    const raw = await vscode.workspace.fs.readFile(mcpUri());
    const parsed = JSON.parse(Buffer.from(raw).toString('utf8'));
    assert.ok(parsed.servers.other, 'unrelated server preserved');
    assert.equal(parsed.servers.other.command, 'echo');
    assert.deepEqual(parsed.servers.other.args, ['hi']);
    assert.equal(parsed.servers.wcli0.command, 'npx', 'wcli0 entry rewritten from settings');
    assert.ok(parsed.servers.wcli0.args.includes('--shell'), JSON.stringify(parsed.servers.wcli0.args));
  });
});
