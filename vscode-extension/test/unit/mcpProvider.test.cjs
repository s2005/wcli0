const test = require('node:test');
const assert = require('node:assert/strict');

const vscode = require('../stubs/vscode.cjs');
const { Wcli0McpProvider, clientHost } = require('../../dist/mcpProvider.js');

test.beforeEach(() => {
  vscode.__reset();
  vscode.__state.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
});

test('provides a stdio definition that defaults cwd to the workspace', () => {
  const defs = new Wcli0McpProvider().provideMcpServerDefinitions();
  assert.equal(defs.length, 1);
  assert.ok(defs[0] instanceof vscode.McpStdioServerDefinition);
  assert.equal(defs[0].command, 'npx');
  assert.deepEqual(defs[0].args, ['-y', 'wcli0@latest']);
  assert.equal(defs[0].cwd.fsPath, '/ws');
});

test('sets cwd when launch.cwd is configured', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.cwd', '${workspaceFolder}');
  const defs = new Wcli0McpProvider().provideMcpServerDefinitions();
  assert.equal(defs[0].cwd.fsPath, '/ws');
});

test('http definition maps a wildcard bind host to loopback', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.mode', 'http');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.host', '0.0.0.0');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.port', 8080);
  const defs = new Wcli0McpProvider().provideMcpServerDefinitions();
  assert.ok(defs[0] instanceof vscode.McpHttpServerDefinition);
  assert.equal(defs[0].uri.toString(), 'http://127.0.0.1:8080/mcp');
});

test('sse mode does not auto-register (warns instead)', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.mode', 'sse');
  const defs = new Wcli0McpProvider().provideMcpServerDefinitions();
  assert.deepEqual(defs, []);
  assert.equal(vscode.__state.calls.warn.length, 1);
});

test('clientHost translates wildcard and brackets IPv6', () => {
  assert.equal(clientHost('0.0.0.0'), '127.0.0.1');
  assert.equal(clientHost('::'), '[::1]');
  assert.equal(clientHost('::1'), '[::1]');
  assert.equal(clientHost('127.0.0.1'), '127.0.0.1');
  assert.equal(clientHost(''), '127.0.0.1');
});

test('returns no definition and warns on a broken launch config', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.method', 'node');
  // nodeScriptPath is empty -> blocking problem
  const defs = new Wcli0McpProvider().provideMcpServerDefinitions();
  assert.deepEqual(defs, []);
  assert.equal(vscode.__state.calls.warn.length, 1);
  assert.match(vscode.__state.calls.warn[0], /nodeScriptPath/);
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
