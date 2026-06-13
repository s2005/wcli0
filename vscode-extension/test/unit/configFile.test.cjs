const test = require('node:test');
const assert = require('node:assert/strict');

const vscodeStub = require('../stubs/vscode.cjs');
const { buildConfigFile } = require('../../dist/configFile.js');

function defaults(overrides = {}) {
  return {
    launchMethod: 'npx',
    packageSpec: 'wcli0@latest',
    nodeScriptPath: '',
    customCommand: '',
    customArgs: [],
    cwd: '',
    env: {},
    configFile: '',
    shell: 'all',
    allowedDirectories: [],
    initialDir: '',
    commandTimeout: null,
    maxCommandLength: null,
    wslMountPoint: '',
    blockedCommands: [],
    blockedArguments: [],
    blockedOperators: [],
    maxOutputLines: null,
    enableTruncation: 'default',
    enableLogResources: 'default',
    maxReturnLines: null,
    logDirectory: '',
    allowAllDirs: false,
    safetyMode: 'safe',
    debug: false,
    transportMode: 'stdio',
    transportHost: '127.0.0.1',
    transportPort: 9444,
    transportAllowedOrigins: [],
    extraArgs: [],
    ...overrides,
  };
}

test.beforeEach(() => {
  vscodeStub.workspace.workspaceFolders = [
    { uri: { fsPath: '/ws' }, name: 'ws', index: 0 },
  ];
});

test('default config enables safety and all five shells', () => {
  const cfg = buildConfigFile(defaults());
  assert.equal(cfg.global.security.enableInjectionProtection, true);
  assert.equal(cfg.global.security.restrictWorkingDirectory, true);
  assert.deepEqual(
    Object.keys(cfg.shells).sort(),
    ['bash', 'cmd', 'gitbash', 'powershell', 'wsl'],
  );
  assert.ok(Object.values(cfg.shells).every((s) => s.enabled === true));
  assert.deepEqual(cfg.global.paths.allowedPaths, []);
});

test('single shell selection disables the others (not omits them)', () => {
  const cfg = buildConfigFile(defaults({ shell: 'powershell' }));
  assert.deepEqual(
    Object.keys(cfg.shells).sort(),
    ['bash', 'cmd', 'gitbash', 'powershell', 'wsl'],
  );
  assert.equal(cfg.shells.powershell.enabled, true);
  assert.equal(cfg.shells.cmd.enabled, false);
  assert.equal(cfg.shells.wsl.enabled, false);
});

test('safe config preserves per-shell default restrictions', () => {
  const cfg = buildConfigFile(defaults());
  assert.deepEqual(cfg.shells.cmd.overrides.restrictions.blockedCommands, ['del', 'rd', 'rmdir']);
  assert.deepEqual(cfg.shells.gitbash.overrides.restrictions.blockedCommands, ['rm']);
});

test('yolo/unsafe clear global and per-shell restrictions', () => {
  for (const mode of ['yolo', 'unsafe']) {
    const cfg = buildConfigFile(defaults({ safetyMode: mode }));
    assert.deepEqual(cfg.global.restrictions.blockedCommands, []);
    assert.deepEqual(cfg.shells.cmd.overrides.restrictions.blockedCommands, []);
    assert.deepEqual(cfg.shells.gitbash.overrides.restrictions.blockedCommands, []);
  }
});

test('allowAllDirs keeps restriction when paths are configured', () => {
  const withPaths = buildConfigFile(defaults({ allowAllDirs: true, allowedDirectories: ['/srv'] }));
  assert.equal(withPaths.global.security.restrictWorkingDirectory, true);
  const noPaths = buildConfigFile(defaults({ allowAllDirs: true }));
  assert.equal(noPaths.global.security.restrictWorkingDirectory, false);
});

test('non-positive numeric limits are omitted from the config', () => {
  const cfg = buildConfigFile(defaults({ commandTimeout: 0, maxCommandLength: -1, maxOutputLines: 0 }));
  assert.equal('commandTimeout' in cfg.global.security, false);
  assert.equal('maxCommandLength' in cfg.global.security, false);
  assert.equal(cfg.global.logging?.maxOutputLines, undefined);
});

test('yolo keeps restrictWorkingDirectory even with allowAllDirs', () => {
  const cfg = buildConfigFile(defaults({ safetyMode: 'yolo', allowAllDirs: true }));
  assert.equal(cfg.global.security.restrictWorkingDirectory, true);
});

test('whitespace-only and unresolved allowed dirs are dropped', () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  const cfg = buildConfigFile(
    defaults({ allowedDirectories: ['   ', '${workspaceFolder}', '/real'] }),
  );
  assert.deepEqual(cfg.global.paths.allowedPaths, ['/real']);
});

test('wsl mount point gets a trailing slash', () => {
  const cfg = buildConfigFile(defaults({ wslMountPoint: '/windows' }));
  assert.equal(cfg.shells.wsl.wslConfig.mountPoint, '/windows/');
});

test('empty transport host is omitted and blank origins filtered', () => {
  const cfg = buildConfigFile(
    defaults({
      transportMode: 'http',
      transportHost: '',
      transportAllowedOrigins: ['  ', 'https://a.example'],
    }),
  );
  assert.equal('httpHost' in cfg.transport, false);
  assert.equal('sseHost' in cfg.transport, false);
  assert.deepEqual(cfg.transport.httpAllowedOrigins, ['https://a.example']);
});

test('allowed directories are resolved into paths.allowedPaths', () => {
  const cfg = buildConfigFile(defaults({ allowedDirectories: ['${workspaceFolder}', '/data'] }));
  assert.deepEqual(cfg.global.paths.allowedPaths, ['/ws', '/data']);
});

test('blocked lists populate restrictions (empty strings filtered)', () => {
  const cfg = buildConfigFile(
    defaults({ blockedCommands: ['rm', ''], blockedArguments: ['-e'] }),
  );
  assert.deepEqual(cfg.global.restrictions.blockedCommands, ['rm']);
  assert.deepEqual(cfg.global.restrictions.blockedArguments, ['-e']);
});

test('unsafe mode disables protection and directory restriction', () => {
  const cfg = buildConfigFile(defaults({ safetyMode: 'unsafe' }));
  assert.equal(cfg.global.security.enableInjectionProtection, false);
  assert.equal(cfg.global.security.restrictWorkingDirectory, false);
});

test('allowAllDirs disables restrictWorkingDirectory', () => {
  const cfg = buildConfigFile(defaults({ allowAllDirs: true }));
  assert.equal(cfg.global.security.restrictWorkingDirectory, false);
});

test('numeric limits land in security/logging sections', () => {
  const cfg = buildConfigFile(defaults({ commandTimeout: 60, maxOutputLines: 100 }));
  assert.equal(cfg.global.security.commandTimeout, 60);
  assert.equal(cfg.global.logging.maxOutputLines, 100);
});

test('wsl mount point overrides the default mount point', () => {
  const cfg = buildConfigFile(defaults({ wslMountPoint: '/wsl/' }));
  assert.equal(cfg.shells.wsl.wslConfig.mountPoint, '/wsl/');
});

test('http transport block is emitted', () => {
  const cfg = buildConfigFile(
    defaults({ transportMode: 'http', transportHost: '0.0.0.0', transportPort: 8080 }),
  );
  assert.equal(cfg.transport.mode, 'http');
  assert.equal(cfg.transport.httpHost, '0.0.0.0');
  assert.equal(cfg.transport.httpPort, 8080);
});

test('stdio transport omits the transport block', () => {
  const cfg = buildConfigFile(defaults());
  assert.equal('transport' in cfg, false);
});

test('logging fields and initialDir/maxCommandLength are emitted', () => {
  const cfg = buildConfigFile(
    defaults({
      maxCommandLength: 4000,
      initialDir: '${workspaceFolder}/start',
      enableTruncation: 'disabled',
      enableLogResources: 'enabled',
      maxReturnLines: 300,
      logDirectory: '/var/log/wcli0',
      blockedOperators: ['|', '&'],
    }),
  );
  assert.equal(cfg.global.security.maxCommandLength, 4000);
  assert.equal(cfg.global.paths.initialDir, '/ws/start');
  assert.equal(cfg.global.logging.enableTruncation, false);
  assert.equal(cfg.global.logging.enableLogResources, true);
  assert.equal(cfg.global.logging.maxReturnLines, 300);
  assert.equal(cfg.global.logging.logDirectory, '/var/log/wcli0');
  assert.deepEqual(cfg.global.restrictions.blockedOperators, ['|', '&']);
});

test('sse transport emits sse origins', () => {
  const cfg = buildConfigFile(
    defaults({
      transportMode: 'sse',
      transportAllowedOrigins: ['https://a.example'],
    }),
  );
  assert.equal(cfg.transport.mode, 'sse');
  assert.deepEqual(cfg.transport.sseAllowedOrigins, ['https://a.example']);
});

test('http transport carries allowed origins', () => {
  const cfg = buildConfigFile(
    defaults({ transportMode: 'http', transportAllowedOrigins: ['https://b.example'] }),
  );
  assert.deepEqual(cfg.transport.httpAllowedOrigins, ['https://b.example']);
});

test('logging limits above the server maximum are omitted', () => {
  const cfg = buildConfigFile(defaults({ maxOutputLines: 20000, maxReturnLines: 99999 }));
  assert.equal(cfg.global.logging, undefined);
  const ok = buildConfigFile(defaults({ maxOutputLines: 10000, maxReturnLines: 500 }));
  assert.equal(ok.global.logging.maxOutputLines, 10000);
  assert.equal(ok.global.logging.maxReturnLines, 500);
});

test('an out-of-range transport port is omitted from the generated config', () => {
  const cfg = buildConfigFile(defaults({ transportMode: 'http', transportPort: 70000 }));
  assert.equal(cfg.transport.ssePort, undefined);
  assert.equal(cfg.transport.httpPort, undefined);
  assert.equal(cfg.transport.mode, 'http');
});

test('an unresolved log directory is dropped from the generated config', () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  const cfg = buildConfigFile(defaults({ logDirectory: '${workspaceFolder}/logs' }));
  assert.equal(cfg.global.logging, undefined);
});

test('allowAllDirs is honored when configured paths all fail to resolve', () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  // The only allowed dir is an unresolved token -> dropped -> no paths emitted,
  // so allowAllDirs must lift the restriction (decision uses resolved paths).
  const cfg = buildConfigFile(
    defaults({ allowAllDirs: true, allowedDirectories: ['${workspaceFolder}/src'] }),
  );
  assert.deepEqual(cfg.global.paths.allowedPaths, []);
  assert.equal(cfg.global.security.restrictWorkingDirectory, false);
});

test('native bash disables WSL path inheritance and ignores the wsl mount point', () => {
  const cfg = buildConfigFile(defaults({ wslMountPoint: '/windows' }));
  // bash must explicitly disable inheritance (the server's merge forces it on
  // when the field is absent), and the mount point applies only to the wsl shell.
  assert.equal(cfg.shells.bash.wslConfig.inheritGlobalPaths, false);
  assert.equal(cfg.shells.bash.wslConfig.mountPoint, undefined);
  assert.equal(cfg.shells.wsl.wslConfig.mountPoint, '/windows/');
});
