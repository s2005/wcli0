const test = require('node:test');
const assert = require('node:assert/strict');

const path = require('node:path');
const vscodeStub = require('../stubs/vscode.cjs');
const {
  buildServerArgs,
  buildLaunchSpec,
  validateLaunchSpec,
  renderCommandLine,
  isValidPort,
  isServerInvalidLogPath,
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

test('P1: resolvePaths:false converts plain relative paths to ${workspaceFolder} tokens', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const s = defaults({
    allowedDirectories: ['src', '${workspaceFolder}/lib', '/abs/dir'],
    configFile: 'cfg/wcli0.json',
    initialDir: 'work',
    cwd: 'sub/dir',
  });
  const args = buildServerArgs(s, { resolvePaths: false });
  // Bare relative values become workspace-relative tokens (server would otherwise
  // C-root them); tokenized and absolute values are kept verbatim.
  assert.ok(args.includes('${workspaceFolder}/src'));
  assert.ok(args.includes('${workspaceFolder}/lib'));
  assert.ok(args.includes('/abs/dir'));
  assert.ok(args.includes('${workspaceFolder}/cfg/wcli0.json'));
  assert.ok(args.includes('${workspaceFolder}/work'));
  assert.equal(args.includes('src'), false); // not emitted bare
  const spec = buildLaunchSpec(s, { resolvePaths: false });
  assert.equal(spec.cwd, '${workspaceFolder}/sub/dir');
});

test('P1: resolvePaths:false normalizes backslash relative paths to forward-slash tokens', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const args = buildServerArgs(defaults({ allowedDirectories: ['src\\nested'] }), {
    resolvePaths: false,
  });
  assert.ok(args.includes('${workspaceFolder}/src/nested'));
});

test('P2: a fractional maxOutputLines is accepted (server only range-checks it)', () => {
  // Server's validateLoggingConfig enforces 1..10000 but not integer-ness.
  assert.deepEqual(buildServerArgs(defaults({ maxOutputLines: 1.5 })), [
    '--maxOutputLines', '1.5',
  ]);
  assert.equal(validateLaunchSpec(defaults({ maxOutputLines: 1.5 })).length, 0);
  // Still range-checked: out-of-range fractional values are blocking and omitted.
  const s = defaults({ maxOutputLines: 0.5 });
  assert.ok(validateLaunchSpec(s).some((p) => /maxOutputLines/.test(p.message) && p.blocking));
  assert.equal(buildServerArgs(s).includes('--maxOutputLines'), false);
});

test('P2: a fractional maxReturnLines is still blocking (server requires an integer)', () => {
  const s = defaults({ maxReturnLines: 1.5 });
  assert.ok(
    validateLaunchSpec(s).some(
      (p) => /maxReturnLines/.test(p.message) && /integer/.test(p.message) && p.blocking,
    ),
  );
  assert.equal(buildServerArgs(s).includes('--maxReturnLines'), false);
});

test('P2: an unresolved custom arg is blocking', () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  const s = defaults({
    launchMethod: 'custom',
    customCommand: 'node',
    customArgs: ['--inspect', '${workspaceFolder}/server.js'],
  });
  assert.ok(
    validateLaunchSpec(s).some((p) => /customArgs/.test(p.message) && p.blocking),
  );
  // A fully resolvable arg (no tokens) is fine.
  const ok = defaults({ launchMethod: 'custom', customCommand: 'node', customArgs: ['--inspect'] });
  assert.equal(validateLaunchSpec(ok).filter((p) => p.blocking).length, 0);
});

test('managedConfigPath produces a minimal config-only arg list', () => {
  const args = buildServerArgs(
    defaults({
      shell: 'cmd',
      allowedDirectories: ['/ws'],
      blockedCommands: ['rm'],
      commandTimeout: 99,
      debug: true,
      extraArgs: ['--foo'],
    }),
    { managedConfigPath: '/priv/managed-config.json' },
  );
  // Only --config, forced stdio, --debug and extraArgs; no global flags that
  // would conflict with the config file's per-shell settings.
  assert.deepEqual(args, [
    '--config',
    '/priv/managed-config.json',
    '--transport',
    'stdio',
    '--debug',
    '--foo',
  ]);
});

test('P15: a relative allowed dir with no workspace to anchor it is blocking and dropped', () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  const s = defaults({ allowedDirectories: ['src'] });
  // Not emitted: the server would C-root "src" to C:\src (an unrelated directory).
  assert.deepEqual(buildServerArgs(s), []);
  assert.ok(validateLaunchSpec(s).some((p) => /allowedDirectories/.test(p.message) && p.blocking));
  // With a workspace open it anchors cleanly and is not blocking.
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  assert.equal(
    validateLaunchSpec(defaults({ allowedDirectories: ['src'] })).filter((p) => p.blocking).length,
    0,
  );
});

test('P16: an unresolved log directory is blocking and omitted', () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  const s = defaults({ logDirectory: '${workspaceFolder}/logs' });
  assert.equal(buildServerArgs(s).includes('--logDirectory'), false);
  assert.ok(validateLaunchSpec(s).some((p) => /logDirectory/.test(p.message) && p.blocking));
});

test('P17: custom args may carry literal shell variables but not unresolved VS Code variables', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const s = defaults({ launchMethod: 'custom', customCommand: 'sh', customArgs: ['-c', 'echo ${FOO}'] });
  // ${FOO} is a shell template, not an extension variable -> allowed.
  assert.equal(validateLaunchSpec(s).filter((p) => p.blocking).length, 0);
  assert.ok(buildLaunchSpec(s).args.includes('echo ${FOO}')); // passed through verbatim
  // An unresolved extension variable still blocks.
  vscodeStub.workspace.workspaceFolders = undefined;
  const bad = defaults({ launchMethod: 'custom', customCommand: 'node', customArgs: ['${workspaceFolder}/s.js'] });
  assert.ok(validateLaunchSpec(bad).some((p) => /customArgs/.test(p.message) && p.blocking));
});

test('P24: a log directory with server-invalid characters is blocking', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const s = defaults({ logDirectory: 'C:/logs/a?b' });
  if (process.platform === 'win32') {
    // Mirrors the server's validateLoggingConfig (rejects <>"|?* on Windows).
    assert.ok(validateLaunchSpec(s).some((p) => /logDirectory/.test(p.message) && p.blocking));
  } else {
    // The server only rejects these characters on Windows.
    assert.equal(validateLaunchSpec(s).filter((p) => p.blocking).length, 0);
  }
  // A traversal path is rejected on any platform.
  const t = defaults({ logDirectory: '../../etc' });
  vscodeStub.workspace.workspaceFolders = undefined;
  // (no workspace -> unanchorable -> blocking via the P16 branch)
  assert.ok(validateLaunchSpec(t).some((p) => /logDirectory/.test(p.message) && p.blocking));
});

test('P10: unresolved per-shell paths are blocking only in managed mode', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const s = defaults({
    shells: {
      cmd: {
        overrides: {
          paths: { allowedPaths: ['${workspaceFolder:nope}/b'], initialDir: '${workspaceFolder:nope}/c' },
        },
      },
    },
  });
  const problems = validateLaunchSpec(s, true);
  assert.ok(problems.some((p) => /shells\.cmd.*allowedPaths/.test(p.message) && p.blocking));
  assert.ok(problems.some((p) => /shells\.cmd.*initialDir/.test(p.message) && p.blocking));
  // Per-shell config only applies in managed mode, so non-managed skips the check.
  assert.equal(validateLaunchSpec(s, false).some((p) => /shells\.cmd/.test(p.message)), false);
});

test('P14: invalid per-shell security limits are blocking in managed mode', () => {
  const s = defaults({
    shells: { powershell: { overrides: { security: { commandTimeout: 0, maxCommandLength: 0.5 } } } },
  });
  const problems = validateLaunchSpec(s, true);
  assert.ok(problems.some((p) => /shells\.powershell.*commandTimeout/.test(p.message) && p.blocking));
  assert.ok(problems.some((p) => /shells\.powershell.*maxCommandLength/.test(p.message) && p.blocking));
  // A valid fractional timeout >= 1 is accepted (the server only rejects < 1).
  const ok = defaults({ shells: { powershell: { overrides: { security: { commandTimeout: 1.5 } } } } });
  assert.equal(validateLaunchSpec(ok, true).filter((p) => p.blocking).length, 0);
});

test('managed validateLaunchSpec suppresses CLI-flag-only safe-mode notes', () => {
  const s = defaults({ safetyMode: 'safe', allowedDirectories: ['/ws'], configFile: '/ws/x.json' });
  const normal = validateLaunchSpec(s).map((p) => p.message);
  const managed = validateLaunchSpec(s, true).map((p) => p.message);
  assert.ok(normal.some((m) => /injection protection/i.test(m)));
  assert.ok(!managed.some((m) => /injection protection/i.test(m)));
  assert.ok(!managed.some((m) => /config file is referenced/i.test(m)));
});

test('P30: a relative node script path is anchored to the workspace', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const spec = buildLaunchSpec(defaults({ launchMethod: 'node', nodeScriptPath: 'dist/index.js' }));
  // Anchored to the workspace, not left relative to the provider's private cwd.
  assert.equal(spec.command, 'node');
  assert.equal(spec.args[0], path.resolve('/ws', 'dist/index.js'));
});

test('P30: a relative node script path keeps a portable token for mcp.json', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const spec = buildLaunchSpec(
    defaults({ launchMethod: 'node', nodeScriptPath: 'dist/index.js' }),
    { resolvePaths: false },
  );
  assert.equal(spec.args[0], '${workspaceFolder}/dist/index.js');
});

test('P30: a relative node script path with no workspace is blocking', () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  const problems = validateLaunchSpec(defaults({ launchMethod: 'node', nodeScriptPath: 'dist/index.js' }));
  assert.ok(problems.some((p) => /nodeScriptPath/.test(p.message) && p.blocking));
});

test('P30: an absolute node script path is unchanged', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const spec = buildLaunchSpec(defaults({ launchMethod: 'node', nodeScriptPath: '/opt/wcli0/dist/index.js' }));
  assert.equal(spec.args[0], '/opt/wcli0/dist/index.js');
});

test('P28: isServerInvalidLogPath mirrors the server log-dir rules', () => {
  // A `..` segment that survives normalization (escapes the root) is rejected.
  assert.equal(isServerInvalidLogPath('../up'), true);
  if (process.platform === 'win32') {
    assert.equal(isServerInvalidLogPath('C:/logs/a?b'), true);
    assert.equal(isServerInvalidLogPath('C:/logs/ok'), false);
  } else {
    assert.equal(isServerInvalidLogPath('/var/log/ok'), false);
  }
});

test('P36: an unresolved per-shell executable command is blocking in managed mode', () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  const s = defaults({ shells: { cmd: { executable: { command: '${workspaceFolder}/bin/sh' } } } });
  const problems = validateLaunchSpec(s, true);
  assert.ok(problems.some((p) => /shells\.cmd\.executable\.command/.test(p.message) && p.blocking));
});

test('P36: an unresolved per-shell executable arg is blocking in managed mode', () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  const s = defaults({ shells: { cmd: { executable: { command: 'sh', args: ['${workspaceFolder}/x'] } } } });
  const problems = validateLaunchSpec(s, true);
  assert.ok(problems.some((p) => /shells\.cmd\.executable\.args/.test(p.message) && p.blocking));
});

test('P36: a bare PATH executable command is not flagged', () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  const s = defaults({ shells: { cmd: { executable: { command: 'cmd.exe', args: ['/c'] } } } });
  const problems = validateLaunchSpec(s, true);
  assert.ok(!problems.some((p) => /executable\.command|executable\.args/.test(p.message)));
});
