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
      debug: true,
    }),
  );
  assert.deepEqual(args, [
    '--config', '/ws/cfg.json',
    '--initialDir', '/start',
    '--wslMountPoint', '/wsl/',
    // Dash-prefixed blocked values use --opt=value so yargs keeps them as the value.
    '--blockedArgument=-e',
    '--maxOutputLines', '50',
    '--no-enableLogResources',
    '--maxReturnLines', '200',
    '--logDirectory', '/ws/logs',
    '--debug',
    // configFile present + stdio -> force stdio so the file can't select http/sse.
    '--transport', 'stdio',
  ]);
});

test('--allowAllDirs is emitted only when no dirs/initialDir are configured', () => {
  assert.deepEqual(buildServerArgs(defaults({ allowAllDirs: true })), ['--allowAllDirs']);
  assert.deepEqual(buildServerArgs(defaults({ allowAllDirs: true, initialDir: '/x' })), [
    '--initialDir', '/x',
  ]);
  assert.deepEqual(
    buildServerArgs(defaults({ allowAllDirs: true, allowedDirectories: ['/srv'] })),
    ['--allowedDir', '/srv'],
  );
});

test('an unresolved config file path is blocking', () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  const s = defaults({ configFile: '${workspaceFolder}/c.json' });
  assert.equal(buildServerArgs(s).includes('--config'), false);
  assert.ok(validateLaunchSpec(s).some((p) => /configFile/.test(p.message) && p.blocking));
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

test('dash-prefixed blocked commands and operators use --opt=value form', () => {
  assert.deepEqual(buildServerArgs(defaults({ blockedCommands: ['-rf', 'del'] })), [
    '--blockedCommand=-rf',
    '--blockedCommand', 'del',
  ]);
  assert.deepEqual(buildServerArgs(defaults({ blockedOperators: ['-x', '|'] })), [
    '--blockedOperator=-x',
    '--blockedOperator', '|',
  ]);
});

test('an unresolved node script path is blocking', () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  const s = defaults({ launchMethod: 'node', nodeScriptPath: '${workspaceFolder}/dist/index.js' });
  assert.ok(
    validateLaunchSpec(s).some((p) => /nodeScriptPath/.test(p.message) && p.blocking),
  );
});

test('unresolved custom command, cwd, and initialDir are blocking', () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  assert.ok(
    validateLaunchSpec(defaults({ launchMethod: 'custom', customCommand: '${workspaceFolder}/bin/x' }))
      .some((p) => /customCommand/.test(p.message) && p.blocking),
  );
  assert.ok(
    validateLaunchSpec(defaults({ cwd: '${workspaceFolder}/sub' }))
      .some((p) => /launch\.cwd/.test(p.message) && p.blocking),
  );
  assert.ok(
    validateLaunchSpec(defaults({ initialDir: '${workspaceFolder}/sub' }))
      .some((p) => /initialDir/.test(p.message) && p.blocking),
  );
});

test('a relative config file is resolved against the workspace folder', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const args = buildServerArgs(defaults({ configFile: 'wcli0.config.json' }));
  const i = args.indexOf('--config');
  assert.ok(i >= 0);
  // Resolved against the workspace so it does not depend on the process cwd.
  assert.equal(require('path').isAbsolute(args[i + 1]), true);
  assert.match(args[i + 1], /wcli0\.config\.json$/);
});

test('the injection-protection warning fires even when a config file is set', () => {
  const problems = validateLaunchSpec(
    defaults({ allowedDirectories: ['/ws'], configFile: '/ws/c.json' }),
  );
  assert.ok(problems.some((p) => /injection protection/i.test(p.message) && !p.blocking));
});

test('non-positive security limits are blocking and omitted from args', () => {
  const s = defaults({ commandTimeout: 0, maxCommandLength: -5 });
  const problems = validateLaunchSpec(s);
  assert.ok(problems.some((p) => /commandTimeout/.test(p.message) && p.blocking));
  assert.ok(problems.some((p) => /maxCommandLength/.test(p.message) && p.blocking));
  const args = buildServerArgs(s);
  assert.equal(args.includes('--commandTimeout'), false);
  assert.equal(args.includes('--maxCommandLength'), false);
  // A fractional positive timeout is still emitted (server accepts > 0).
  assert.deepEqual(buildServerArgs(defaults({ commandTimeout: 1.5 })), [
    '--commandTimeout', '1.5',
  ]);
});

test('out-of-range log limits are blocking and omitted from args', () => {
  const s = defaults({ maxOutputLines: 20000, maxReturnLines: 0 });
  const problems = validateLaunchSpec(s);
  assert.ok(problems.some((p) => /maxOutputLines/.test(p.message) && p.blocking));
  assert.ok(problems.some((p) => /maxReturnLines/.test(p.message) && p.blocking));
  const args = buildServerArgs(s);
  assert.equal(args.includes('--maxOutputLines'), false);
  assert.equal(args.includes('--maxReturnLines'), false);
  // In-range values are still emitted.
  assert.deepEqual(buildServerArgs(defaults({ maxOutputLines: 10000 })), [
    '--maxOutputLines', '10000',
  ]);
});

test('resolvePaths:false preserves portable tokens in args and spec', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const s = defaults({
    allowedDirectories: ['${workspaceFolder}/src'],
    configFile: '${workspaceFolder}/c.json',
    cwd: '${workspaceFolder}',
  });
  const args = buildServerArgs(s, { resolvePaths: false });
  assert.ok(args.includes('${workspaceFolder}/src'));
  assert.ok(args.includes('${workspaceFolder}/c.json'));
  const spec = buildLaunchSpec(s, { resolvePaths: false });
  assert.equal(spec.cwd, '${workspaceFolder}');
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
