const test = require('node:test');
const assert = require('node:assert/strict');

const vscodeStub = require('../stubs/vscode.cjs');
const {
  buildServerArgs,
  buildLaunchSpec,
  validateLaunchSpec,
  renderCommandLine,
} = require('../../dist/argsBuilder.js');

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

test('defaults produce no server flags', () => {
  assert.deepEqual(buildServerArgs(defaults()), []);
});

test('npx launch wraps the package spec', () => {
  const spec = buildLaunchSpec(defaults());
  assert.equal(spec.command, 'npx');
  assert.deepEqual(spec.args, ['-y', 'wcli0@latest']);
});

test('shell other than "all" emits --shell', () => {
  assert.deepEqual(buildServerArgs(defaults({ shell: 'gitbash' })), ['--shell', 'gitbash']);
});

test('allowed directories repeat --allowedDir and resolve ${workspaceFolder}', () => {
  const args = buildServerArgs(
    defaults({ allowedDirectories: ['${workspaceFolder}', '/tmp/extra'] }),
  );
  assert.deepEqual(args, ['--allowedDir', '/ws', '--allowedDir', '/tmp/extra']);
});

test('numeric limits are stringified', () => {
  const args = buildServerArgs(defaults({ commandTimeout: 120, maxCommandLength: 5000 }));
  assert.deepEqual(args, ['--commandTimeout', '120', '--maxCommandLength', '5000']);
});

test('blocked lists expand to repeated flags', () => {
  const args = buildServerArgs(
    defaults({ blockedCommands: ['rm', 'del'], blockedOperators: ['|'] }),
  );
  assert.deepEqual(args, [
    '--blockedCommand', 'rm',
    '--blockedCommand', 'del',
    '--blockedOperator', '|',
  ]);
});

test('tri-state truncation maps enabled/disabled/default', () => {
  assert.deepEqual(buildServerArgs(defaults({ enableTruncation: 'enabled' })), [
    '--enableTruncation',
  ]);
  assert.deepEqual(buildServerArgs(defaults({ enableTruncation: 'disabled' })), [
    '--no-enableTruncation',
  ]);
  assert.deepEqual(buildServerArgs(defaults({ enableTruncation: 'default' })), []);
});

test('safety mode maps to --yolo / --unsafe', () => {
  assert.deepEqual(buildServerArgs(defaults({ safetyMode: 'yolo' })), ['--yolo']);
  assert.deepEqual(buildServerArgs(defaults({ safetyMode: 'unsafe' })), ['--unsafe']);
  assert.deepEqual(buildServerArgs(defaults({ safetyMode: 'safe' })), []);
});

test('http transport emits transport host/port/origins flags', () => {
  const args = buildServerArgs(
    defaults({
      transportMode: 'http',
      transportHost: '0.0.0.0',
      transportPort: 8080,
      transportAllowedOrigins: ['https://a.example', 'https://b.example'],
    }),
  );
  assert.deepEqual(args, [
    '--transport', 'http',
    '--http-host', '0.0.0.0',
    '--http-port', '8080',
    '--http-allowed-origins', 'https://a.example,https://b.example',
  ]);
});

test('sse transport uses sse-prefixed flags', () => {
  const args = buildServerArgs(defaults({ transportMode: 'sse', transportPort: 9444 }));
  assert.ok(args.includes('--sse-host'));
  assert.ok(args.includes('--sse-port'));
  assert.equal(args.includes('--http-host'), false);
});

test('node launch uses the script path as first arg', () => {
  const spec = buildLaunchSpec(
    defaults({ launchMethod: 'node', nodeScriptPath: '/opt/wcli0/dist/index.js', debug: true }),
  );
  assert.equal(spec.command, 'node');
  assert.deepEqual(spec.args, ['/opt/wcli0/dist/index.js', '--debug']);
});

test('custom launch prepends custom args before server flags', () => {
  const spec = buildLaunchSpec(
    defaults({
      launchMethod: 'custom',
      customCommand: 'wsl',
      customArgs: ['-e', 'wcli0'],
      shell: 'wsl',
    }),
  );
  assert.equal(spec.command, 'wsl');
  assert.deepEqual(spec.args, ['-e', 'wcli0', '--shell', 'wsl']);
});

test('cwd is variable-resolved', () => {
  const spec = buildLaunchSpec(defaults({ cwd: '${workspaceFolder}/sub' }));
  assert.equal(spec.cwd, '/ws/sub');
});

test('extraArgs are appended verbatim', () => {
  assert.deepEqual(buildServerArgs(defaults({ extraArgs: ['--foo', 'bar'] })), ['--foo', 'bar']);
});

test('validateLaunchSpec flags missing node path and unsafe mode', () => {
  assert.equal(validateLaunchSpec(defaults()).length, 0);
  assert.match(
    validateLaunchSpec(defaults({ launchMethod: 'node' }))[0],
    /nodeScriptPath is empty/,
  );
  assert.ok(validateLaunchSpec(defaults({ safetyMode: 'unsafe' })).some((p) => /unsafe/.test(p)));
});

test('renderCommandLine quotes args with spaces', () => {
  const line = renderCommandLine({
    command: 'npx',
    args: ['-y', 'wcli0@latest', '--allowedDir', '/path with space'],
    cwd: undefined,
    env: {},
  });
  assert.equal(line, 'npx -y wcli0@latest --allowedDir "/path with space"');
});
