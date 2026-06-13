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

test('default config enables safety and all four Windows shells', () => {
  const cfg = buildConfigFile(defaults());
  assert.equal(cfg.global.security.enableInjectionProtection, true);
  assert.equal(cfg.global.security.restrictWorkingDirectory, true);
  assert.deepEqual(Object.keys(cfg.shells).sort(), ['cmd', 'gitbash', 'powershell', 'wsl']);
  assert.deepEqual(cfg.global.paths.allowedPaths, []);
});

test('single shell selection limits the shells map', () => {
  const cfg = buildConfigFile(defaults({ shell: 'powershell' }));
  assert.deepEqual(Object.keys(cfg.shells), ['powershell']);
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
