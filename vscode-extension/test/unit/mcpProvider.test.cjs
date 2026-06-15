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
  // No home config present (injected false), so the plain CLI-flag launch is used.
  const defs = new Wcli0McpProvider(
    undefined,
    '/priv/storage',
    undefined,
    () => false,
  ).provideMcpServerDefinitions();
  assert.equal(defs.length, 1);
  assert.ok(defs[0] instanceof vscode.McpStdioServerDefinition);
  assert.equal(defs[0].command, 'npx');
  assert.deepEqual(defs[0].args, ['-y', 'wcli0@latest']);
  // A private extension-owned dir avoids auto-loading <workspace>/config.json.
  assert.equal(defs[0].cwd.fsPath, '/priv/storage');
});

test('P9: falls back to a uniquely-created private temp dir, not the shared root', () => {
  const path = require('path');
  const defs = new Wcli0McpProvider().provideMcpServerDefinitions();
  const cwd = defs[0].cwd.fsPath;
  // Not the shared os.tmpdir() root (the server reads config.json from its cwd,
  // so a world-writable dir would let another user plant one) — a unique subdir.
  assert.notEqual(cwd, os.tmpdir());
  assert.equal(path.dirname(cwd), os.tmpdir());
  assert.ok(path.basename(cwd).startsWith('wcli0-'));
});

test('P19: refuses to launch (no server) when no private dir can be created', () => {
  const fs = require('node:fs');
  const realMkdtemp = fs.mkdtempSync;
  fs.mkdtempSync = () => {
    throw new Error('EACCES: permission denied');
  };
  try {
    const logs = [];
    // No safeCwd injected and no launch.cwd set: privateDir() fails, so the
    // provider must register no server rather than launch from the shared root.
    // No home config (injected false) so the plain CLI-flag path is exercised.
    const defs = new Wcli0McpProvider(
      (m) => logs.push(m),
      undefined,
      undefined,
      () => false,
    ).provideMcpServerDefinitions();
    assert.deepEqual(defs, []);
    assert.ok(logs.some((m) => /shared temp root/i.test(m)));
  } finally {
    fs.mkdtempSync = realMkdtemp;
  }
});

test('P25: a whitespace-only bind host falls back to loopback', () => {
  assert.equal(clientHost('   '), '127.0.0.1');
  assert.equal(clientHost(''), '127.0.0.1');
  // An http definition built from a whitespace host yields a usable URL.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.mode', 'http');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.host', '   ');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.port', 9444);
  const defs = new Wcli0McpProvider().provideMcpServerDefinitions();
  assert.equal(defs[0].uri.toString(), 'http://127.0.0.1:9444/mcp');
});

test('sets cwd only when launch.cwd is configured', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.cwd', '${workspaceFolder}');
  const defs = new Wcli0McpProvider().provideMcpServerDefinitions();
  assert.equal(defs[0].cwd.fsPath, '/ws');
});

test('logs non-blocking safety notes from the provider', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.allowedDirectories', ['/ws']);
  const logged = [];
  // No home config (injected false): the launch uses CLI --allowedDir flags, which
  // is what triggers the injection-protection note (a pinned config would not).
  new Wcli0McpProvider((m) => logged.push(m), undefined, undefined, () => false).provideMcpServerDefinitions();
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
  // No home config (injected false), so no pinning: the global CLI flags are used.
  const defs = new Wcli0McpProvider(
    undefined,
    '/priv',
    managedDir(),
    () => false,
  ).provideMcpServerDefinitions();
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

test('P31: managed config fallback is per-window unique, not the shared safeCwd', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shells', { cmd: { enabled: true } });
  // safeCwd is the shared global storage; managedConfigDir (workspace storage) is
  // unavailable. The managed config must NOT land in the shared safeCwd, where
  // every window would clobber the fixed managed-config.json filename.
  const defs = new Wcli0McpProvider(() => {}, '/priv/global', undefined).provideMcpServerDefinitions();
  assert.equal(defs.length, 1);
  const args = defs[0].args;
  const configPath = args[args.indexOf('--config') + 1];
  const configDir = path.dirname(configPath);
  assert.notEqual(configDir, '/priv/global');
  // A unique mkdtemp subdir of the temp root.
  assert.equal(path.dirname(configDir), os.tmpdir());
  assert.ok(path.basename(configDir).startsWith('wcli0-'));
  // The server cwd still uses the shared safeCwd (safe — it is only a neutral cwd).
  assert.equal(defs[0].cwd.fsPath, '/priv/global');
  const written = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(written.shells.cmd.enabled, true);
  fs.rmSync(configDir, { recursive: true, force: true });
});

// --- P66: pin settings against the implicit home config ---------------------

test('P66: a plain launch is pinned to a generated config when the home config exists', () => {
  // No per-shell config and no wcli0.configFile, but the server would fall back to
  // ~/.win-cli-mcp/config.json (injected present), so the provider must launch with
  // a generated --config to bypass it rather than the bare CLI flags.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shell', 'cmd');
  const dir = managedDir();
  const defs = new Wcli0McpProvider(
    undefined,
    '/priv',
    dir,
    () => true,
  ).provideMcpServerDefinitions();
  assert.equal(defs.length, 1);
  const args = defs[0].args;
  const ci = args.indexOf('--config');
  assert.ok(ci >= 0, '--config present so the home config is bypassed');
  assert.equal(args[ci + 1], path.join(dir, 'managed-config.json'));
  assert.ok(args.includes('--transport') && args[args.indexOf('--transport') + 1] === 'stdio');
  // Global CLI flags are not emitted; the shell selection lives in the file instead.
  assert.ok(!args.includes('--shell'), 'no --shell flag in the pinned launch');
  const written = JSON.parse(fs.readFileSync(path.join(dir, 'managed-config.json'), 'utf8'));
  assert.equal(written.shells.cmd.enabled, true);
  assert.equal(written.shells.powershell.enabled, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('P66: pinning is skipped when wcli0.configFile is set (its --config bypasses the home config)', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.configFile', '/ws/wcli0.json');
  const defs = new Wcli0McpProvider(
    undefined,
    '/priv',
    managedDir(),
    () => true,
  ).provideMcpServerDefinitions();
  // The user's own --config already overrides the implicit home config, so the
  // CLI-flag path is used with that referenced file (no generated managed config).
  const args = defs[0].args;
  assert.equal(args.filter((a) => a === '--config').length, 1);
  assert.equal(args[args.indexOf('--config') + 1], '/ws/wcli0.json');
});

test('P66: no pinning when the home config is absent (plain CLI flags)', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shell', 'cmd');
  const defs = new Wcli0McpProvider(
    undefined,
    '/priv',
    managedDir(),
    () => false,
  ).provideMcpServerDefinitions();
  assert.deepEqual(defs[0].args, ['-y', 'wcli0@latest', '--shell', 'cmd']);
});

// --- P74: pin settings against a config.json in the configured launch cwd -----

test('P74: a configured launch.cwd containing a config.json pins the launch', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.cwd', '${workspaceFolder}');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shell', 'cmd');
  const dir = managedDir();
  const seen = [];
  const defs = new Wcli0McpProvider(
    undefined,
    '/priv',
    dir,
    () => false, // no home config: only the cwd config.json triggers pinning
    (cwd) => {
      seen.push(cwd);
      return true; // a config.json sits in the configured launch cwd
    },
  ).provideMcpServerDefinitions();
  assert.equal(defs.length, 1);
  const args = defs[0].args;
  const ci = args.indexOf('--config');
  assert.ok(ci >= 0, '--config present so <cwd>/config.json is bypassed');
  assert.equal(args[ci + 1], path.join(dir, 'managed-config.json'));
  assert.ok(!args.includes('--shell'), 'global flags replaced by the generated file');
  // The check used the resolved configured cwd, and the launch still runs there.
  assert.ok(seen.includes('/ws'));
  assert.equal(defs[0].cwd.fsPath, '/ws');
  const written = JSON.parse(fs.readFileSync(path.join(dir, 'managed-config.json'), 'utf8'));
  assert.equal(written.shells.cmd.enabled, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('P74: a configured launch.cwd with no config.json is not pinned (plain CLI flags)', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.cwd', '${workspaceFolder}');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shell', 'cmd');
  const defs = new Wcli0McpProvider(
    undefined,
    '/priv',
    managedDir(),
    () => false,
    () => false, // no config.json in the cwd
  ).provideMcpServerDefinitions();
  assert.deepEqual(defs[0].args, ['-y', 'wcli0@latest', '--shell', 'cmd']);
  assert.equal(defs[0].cwd.fsPath, '/ws');
});

test('P74: no cwd-config check fires when launch.cwd is unset', () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shell', 'cmd');
  let called = 0;
  const defs = new Wcli0McpProvider(
    undefined,
    '/priv',
    managedDir(),
    () => false,
    () => {
      called += 1;
      return true;
    },
  ).provideMcpServerDefinitions();
  // No configured cwd -> the private-dir fallback has no config.json, so the check
  // is skipped entirely and the plain CLI-flag launch is used.
  assert.equal(called, 0);
  assert.deepEqual(defs[0].args, ['-y', 'wcli0@latest', '--shell', 'cmd']);
});
