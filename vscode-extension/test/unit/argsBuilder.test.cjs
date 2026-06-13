const test = require('node:test');
const assert = require('node:assert/strict');

const vscodeStub = require('../stubs/vscode.cjs');
const {
  buildServerArgs,
  buildLaunchSpec,
  validateLaunchSpec,
  renderCommandLine,
  isValidPort,
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
  const nodeProblems = validateLaunchSpec(defaults({ launchMethod: 'node' }));
  assert.match(nodeProblems[0].message, /nodeScriptPath is empty/);
  assert.equal(nodeProblems[0].blocking, true);
  assert.ok(
    validateLaunchSpec(defaults({ safetyMode: 'unsafe' })).some(
      (p) => /unsafe/.test(p.message) && !p.blocking,
    ),
  );
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

test('every remaining flag is emitted when set', () => {
  const args = buildServerArgs(
    defaults({
      configFile: '${workspaceFolder}/cfg.json',
      initialDir: '/start',
      wslMountPoint: '/wsl/',
      blockedArguments: ['-e'],
      maxOutputLines: 50,
      enableLogResources: 'disabled',
      maxReturnLines: 200,
      logDirectory: '${workspaceFolder}/logs',
      allowAllDirs: true,
      debug: true,
    }),
  );
  assert.deepEqual(args, [
    '--config', '/ws/cfg.json',
    '--initialDir', '/start',
    '--wslMountPoint', '/wsl/',
    '--blockedArgument', '-e',
    '--maxOutputLines', '50',
    '--no-enableLogResources',
    '--maxReturnLines', '200',
    '--logDirectory', '/ws/logs',
    '--allowAllDirs',
    '--debug',
    // configFile present + stdio -> force stdio so the file can't select http/sse.
    '--transport', 'stdio',
  ]);
});

test('enableLogResources enabled emits the bare flag', () => {
  assert.deepEqual(buildServerArgs(defaults({ enableLogResources: 'enabled' })), [
    '--enableLogResources',
  ]);
});

test('launch spec carries env through unchanged', () => {
  const spec = buildLaunchSpec(defaults({ env: { FOO: 'bar' } }));
  assert.deepEqual(spec.env, { FOO: 'bar' });
});

test('empty package spec falls back to wcli0@latest', () => {
  const spec = buildLaunchSpec(defaults({ packageSpec: '' }));
  assert.deepEqual(spec.args, ['-y', 'wcli0@latest']);
});

test('validateLaunchSpec flags missing custom command', () => {
  assert.match(
    validateLaunchSpec(defaults({ launchMethod: 'custom' }))[0].message,
    /customCommand is empty/,
  );
});

test('allowed dirs that do not resolve are dropped and blocked', () => {
  // No workspace open: ${workspaceFolder} stays unresolved.
  vscodeStub.workspace.workspaceFolders = undefined;
  const s = defaults({ allowedDirectories: ['${workspaceFolder}', '${workspaceFolder}/sub'] });
  assert.deepEqual(buildServerArgs(s), []); // nothing emitted
  const problems = validateLaunchSpec(s);
  assert.equal(problems.filter((p) => p.blocking).length, 2);
});

test('configFile + safe mode emits a non-blocking warning', () => {
  const problems = validateLaunchSpec(defaults({ configFile: '/c.json' }));
  assert.ok(problems.some((p) => /config file is referenced/i.test(p.message) && !p.blocking));
});

test('allowedDir in safe mode warns about injection protection', () => {
  const problems = validateLaunchSpec(defaults({ allowedDirectories: ['/srv'] }));
  assert.ok(problems.some((p) => /injection protection/i.test(p.message) && !p.blocking));
});

test('invalid transport port is blocking and not emitted', () => {
  const s = defaults({ transportMode: 'http', transportPort: 70000 });
  assert.equal(buildServerArgs(s).includes('--http-port'), false);
  assert.ok(validateLaunchSpec(s).some((p) => /transport\.port/.test(p.message) && p.blocking));
});

test('isValidPort accepts 1..65535 integers only', () => {
  assert.equal(isValidPort(9444), true);
  assert.equal(isValidPort(0), false);
  assert.equal(isValidPort(65536), false);
  assert.equal(isValidPort(80.5), false);
});

test('renderCommandLine keeps backslashes and quotes metacharacters', () => {
  const line = renderCommandLine({
    command: 'npx',
    args: ['-y', 'wcli0', '--blockedOperator', '|', '--allowedDir', 'C:\\safe path'],
    cwd: undefined,
    env: {},
  });
  assert.match(line, /--blockedOperator "\|"/);
  assert.match(line, /"C:\\safe path"/); // backslash not doubled
});
