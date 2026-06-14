const test = require('node:test');
const assert = require('node:assert/strict');

const os = require('os');
const vscode = require('../stubs/vscode.cjs');
const { Wcli0McpProvider, clientHost } = require('../../dist/mcpProvider.js');

test.beforeEach(() => {
  vscode.__reset();
  vscode.__state.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
});

test('uses the injected private cwd, not the workspace, by default', () => {
  const defs = new Wcli0McpProvider(undefined, '/priv/storage').provideMcpServerDefinitions();
  assert.equal(defs.length, 1);
  assert.ok(defs[0] instanceof vscode.McpStdioServerDefinition);
  assert.equal(defs[0].command, 'npx');
  assert.deepEqual(defs[0].args, ['-y', 'wcli0@latest']);
  // A private extension-owned dir avoids auto-loading <workspace>/config.json.
  assert.equal(defs[0].cwd.fsPath, '/priv/storage');
});

test('falls back to a temp dir when no private cwd is injected', () => {
  const defs = new Wcli0McpProvider().provideMcpServerDefinitions();
  assert.equal(defs[0].cwd.fsPath, os.tmpdir());
});

test('sets cwd only when launch.cwd is configured', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.cwd', '${workspaceFolder}');
  const defs = new Wcli0McpProvider().provideMcpServerDefinitions();
  assert.equal(defs[0].cwd.fsPath, '/ws');
});

test('logs non-blocking safety notes from the provider', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.allowedDirectories', ['/ws']);
  const logged = [];
  new Wcli0McpProvider((m) => logged.push(m)).provideMcpServerDefinitions();
  assert.ok(logged.some((m) => /injection protection/i.test(m)));
});

test('http definition maps a wildcard bind host to loopback', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.mode', 'http');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.host', '0.0.0.0');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.port', 8080);
  const defs = new Wcli0McpProvider().provideMcpServerDefinitions();
  assert.ok(defs[0] instanceof vscode.McpHttpServerDefinition);
  assert.equal(defs[0].uri.toString(), 'http://127.0.0.1:8080/mcp');
});

test('sse mode does not auto-register (logs instead)', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.mode', 'sse');
  const logs = [];
  const defs = new Wcli0McpProvider((m) => logs.push(m)).provideMcpServerDefinitions();
  assert.deepEqual(defs, []);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /sse/);
});

test('http mode ignores irrelevant local-launch problems', () => {
  // node method without a script path would block stdio, but http only connects
  // to an external endpoint, so it should still register.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.mode', 'http');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.method', 'node');
  const defs = new Wcli0McpProvider().provideMcpServerDefinitions();
  assert.equal(defs.length, 1);
  assert.ok(defs[0] instanceof vscode.McpHttpServerDefinition);
});

test('http mode rejects an invalid port', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.mode', 'http');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.port', 0);
  const logs = [];
  const defs = new Wcli0McpProvider((m) => logs.push(m)).provideMcpServerDefinitions();
  assert.deepEqual(defs, []);
  assert.equal(logs.length, 1);
});

test('clientHost translates wildcard and brackets IPv6', () => {
  assert.equal(clientHost('0.0.0.0'), '127.0.0.1');
  assert.equal(clientHost('::'), '[::1]');
  assert.equal(clientHost('::1'), '[::1]');
  assert.equal(clientHost('127.0.0.1'), '127.0.0.1');
  assert.equal(clientHost(''), '127.0.0.1');
});

test('returns no definition and logs on a broken launch config', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.method', 'node');
  // nodeScriptPath is empty -> blocking problem
  const logs = [];
  const defs = new Wcli0McpProvider((m) => logs.push(m)).provideMcpServerDefinitions();
  assert.deepEqual(defs, []);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /nodeScriptPath/);
});

test('refresh fires the change event', () => {
  const provider = new Wcli0McpProvider();
  let fired = 0;
  provider.onDidChangeMcpServerDefinitions(() => {
    fired += 1;
  });
  provider.refresh();
  assert.equal(fired, 1);
  provider.dispose();
});

// --- auto-managed per-shell launch ----------------------------------------

const fs = require('fs');
const path = require('path');

function managedDir() {
  return path.join(
    os.tmpdir(),
    'wcli0-test-managed-' + process.pid + '-' + Math.random().toString(36).slice(2),
  );
}

test('per-shell config launches via an auto-managed --config file', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shells', {
    cmd: { enabled: true },
    gitbash: { enabled: false },
  });
  const dir = managedDir();
  const defs = new Wcli0McpProvider(undefined, '/priv', dir).provideMcpServerDefinitions();
  assert.equal(defs.length, 1);
  const args = defs[0].args;
  // npx launcher + managed config; no global per-shell-conflicting flags.
  assert.deepEqual(args.slice(0, 2), ['-y', 'wcli0@latest']);
  const ci = args.indexOf('--config');
  assert.ok(ci >= 0, '--config present');
  assert.equal(args[ci + 1], path.join(dir, 'managed-config.json'));
  assert.ok(args.includes('--transport') && args[args.indexOf('--transport') + 1] === 'stdio');
  assert.ok(!args.includes('--shell'), 'no --shell in managed mode');
  assert.ok(!args.includes('--allowedDir'), 'no --allowedDir in managed mode');

  const written = JSON.parse(fs.readFileSync(path.join(dir, 'managed-config.json'), 'utf8'));
  assert.equal(written.shells.cmd.enabled, true);
  assert.equal(written.shells.gitbash.enabled, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('without per-shell config the normal CLI-flag launch is unchanged', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shell', 'cmd');
  const defs = new Wcli0McpProvider(undefined, '/priv', managedDir()).provideMcpServerDefinitions();
  assert.deepEqual(defs[0].args, ['-y', 'wcli0@latest', '--shell', 'cmd']);
});

test('managed mode notes that wcli0.configFile is ignored', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shells', { cmd: { enabled: true } });
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.configFile', '/ws/wcli0.json');
  const dir = managedDir();
  const logs = [];
  new Wcli0McpProvider((m) => logs.push(m), '/priv', dir).provideMcpServerDefinitions();
  assert.ok(logs.some((m) => /configFile is ignored/i.test(m)));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('managed mode does not emit the --allowedDir injection-protection warning', () => {
  // allowedDirectories would normally warn in safe mode; in managed mode the
  // value lives in the config file, so the warning is suppressed.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shells', { cmd: { enabled: true } });
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.allowedDirectories', ['/ws']);
  const dir = managedDir();
  const logs = [];
  new Wcli0McpProvider((m) => logs.push(m), '/priv', dir).provideMcpServerDefinitions();
  assert.ok(!logs.some((m) => /injection protection/i.test(m)));
  fs.rmSync(dir, { recursive: true, force: true });
});
