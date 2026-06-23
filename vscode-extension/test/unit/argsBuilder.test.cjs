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
  isAbsolutePath,
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

test('a file-source round-trip preserves --allowAllDirs even with dirs/initialDir set (P57)', () => {
  // For a file source (preserveRelativePaths) a hand-authored --allowAllDirs the form shows as
  // set must survive an unrelated save: with --initialDir, dropping it silently re-tightens the
  // server to initialDir; with --allowedDir it is server-inert but would flip the tri-select on
  // reparse. Both keep the flag here, unlike the settings-export/provider paths above.
  const opts = { resolvePaths: false, preserveRelativePaths: true };
  assert.deepEqual(buildServerArgs(defaults({ allowAllDirs: true, initialDir: '/x' }), opts), [
    '--initialDir', '/x', '--allowAllDirs',
  ]);
  assert.deepEqual(
    buildServerArgs(defaults({ allowAllDirs: true, allowedDirectories: ['/srv'] }), opts),
    ['--allowedDir', '/srv', '--allowAllDirs'],
  );
});

test('an emitted log limit drops a duplicate diverted copy from extraArgs (P59)', () => {
  // The parser diverts an out-of-range log limit into extraArgs to round-trip it verbatim.
  // When the form then supplies an in-range typed value, the builder emits that and must drop
  // the stale extraArgs copy of the same flag, or yargs would merge two into an array the
  // server applies neither of.
  assert.deepEqual(
    buildServerArgs(defaults({ maxOutputLines: 50, extraArgs: ['--maxOutputLines', '99999'] })),
    ['--maxOutputLines', '50'],
  );
  assert.deepEqual(
    buildServerArgs(defaults({ maxReturnLines: 200, extraArgs: ['--max-return-lines=50000'] })),
    ['--maxReturnLines', '200'],
  );
  // A diverted log limit with no competing typed value is preserved verbatim.
  assert.deepEqual(
    buildServerArgs(defaults({ extraArgs: ['--maxReturnLines', '50000'] })),
    ['--maxReturnLines', '50000'],
  );
});

test('an emitted modeled scalar flag drops a diverted duplicate from extraArgs (P61)', () => {
  // The parser diverts a malformed modeled value into extraArgs to round-trip it verbatim:
  // an unparseable number is kept as `['--commandTimeout', 'bad']` (P34), and a string flag
  // whose value is itself a flag (`--logDirectory --debug`) is kept as the bare `--logDirectory`
  // (the following `--debug` is parsed as the debug field, not preserved). Once the form
  // supplies a typed value the builder emits its own flag and must drop the stale diverted
  // copy, or yargs merges the two into an array the server's applyCli* helpers apply none of
  // (and the edited value is ignored / crashes startup).

  // Unparseable security-override number: the flag AND its diverted value token are removed.
  // Both spellings (camel + kebab) the parser may have produced are stripped.
  assert.deepEqual(
    buildServerArgs(defaults({ commandTimeout: 30, extraArgs: ['--commandTimeout', 'bad'] })),
    ['--commandTimeout', '30'],
  );
  assert.deepEqual(
    buildServerArgs(defaults({ commandTimeout: 30, extraArgs: ['--command-timeout=bad'] })),
    ['--commandTimeout', '30'],
  );
  assert.deepEqual(
    buildServerArgs(defaults({ maxCommandLength: 4096, extraArgs: ['--maxCommandLength', 'bad'] })),
    ['--maxCommandLength', '4096'],
  );

  // String options the parser kept as a bare diverted flag (its value was a flag): the
  // duplicate is dropped once the typed field re-emits it.
  assert.deepEqual(
    buildServerArgs(defaults({ logDirectory: '/logs', extraArgs: ['--logDirectory'] })),
    ['--logDirectory', '/logs'],
  );
  assert.deepEqual(
    buildServerArgs(defaults({ shell: 'cmd', extraArgs: ['--shell'] })),
    ['--shell', 'cmd'],
  );
  assert.deepEqual(
    buildServerArgs(defaults({ initialDir: '/start', extraArgs: ['--initial-dir'] })),
    ['--initialDir', '/start'],
  );
  assert.deepEqual(
    buildServerArgs(defaults({ wslMountPoint: '/mnt/', extraArgs: ['--wslMountPoint'] })),
    ['--wslMountPoint', '/mnt/'],
  );

  // The strip stops at the flag: an unrelated following extraArg flag is NOT swallowed.
  assert.deepEqual(
    buildServerArgs(defaults({ commandTimeout: 30, extraArgs: ['--commandTimeout', '--keepme'] })),
    ['--commandTimeout', '30', '--keepme'],
  );

  // A transport scalar (http/sse port) diverted as a bad number is dropped when the form
  // supplies a valid one.
  assert.deepEqual(
    buildServerArgs(
      defaults({
        transportMode: 'http',
        transportHost: '',
        transportPort: 8080,
        extraArgs: ['--http-port', 'abc'],
      }),
    ),
    ['--transport', 'http', '--http-port', '8080'],
  );

  // An UNSET field still round-trips its preserved malformed value verbatim (no over-strip).
  assert.deepEqual(
    buildServerArgs(defaults({ extraArgs: ['--commandTimeout', 'bad'] })),
    ['--commandTimeout', 'bad'],
  );
  assert.deepEqual(
    buildServerArgs(defaults({ extraArgs: ['--logDirectory'] })),
    ['--logDirectory'],
  );

  // Array options are exempt: the server merges repeats, so a preserved --allowedDir is kept
  // even when the form adds its own (no array-coercion hazard).
  assert.deepEqual(
    buildServerArgs(
      defaults({ allowedDirectories: ['/a'], extraArgs: ['--allowedDir', '/b'] }),
    ),
    ['--allowedDir', '/a', '--allowedDir', '/b'],
  );
});

test('an emitted scalar flag strips a preserved yargs negation of the same option (P65)', () => {
  // A loaded file may carry a scalar negation (`--no-shell`, `--no-logDirectory`,
  // `--no-commandTimeout`) in extraArgs; the parser does not model these. Once the form supplies
  // a typed value the builder must drop the negation, or yargs parses the option as an array
  // (`shell: ['cmd', false]`) the server's scalar applyCli* helpers apply none of — ignoring the
  // edit or crashing the server. The negation carries no value, so only the token is dropped.
  assert.deepEqual(
    buildServerArgs(defaults({ shell: 'cmd', extraArgs: ['--no-shell'] })),
    ['--shell', 'cmd'],
  );
  assert.deepEqual(
    buildServerArgs(defaults({ logDirectory: '/logs', extraArgs: ['--no-logDirectory'] })),
    ['--logDirectory', '/logs'],
  );
  assert.deepEqual(
    buildServerArgs(defaults({ commandTimeout: 30, extraArgs: ['--no-commandTimeout'] })),
    ['--commandTimeout', '30'],
  );
  // The kebab-case negation the parser may have kept is stripped too.
  assert.deepEqual(
    buildServerArgs(defaults({ initialDir: '/start', extraArgs: ['--no-initial-dir'] })),
    ['--initialDir', '/start'],
  );
  // A transport scalar negation is dropped once the form emits the positive flag.
  assert.deepEqual(
    buildServerArgs(
      defaults({
        transportMode: 'http',
        transportHost: '',
        transportPort: 8080,
        extraArgs: ['--no-http-port'],
      }),
    ),
    ['--transport', 'http', '--http-port', '8080'],
  );
  // The strip does not swallow a following unrelated extraArg.
  assert.deepEqual(
    buildServerArgs(defaults({ shell: 'cmd', extraArgs: ['--no-shell', '--keepme'] })),
    ['--shell', 'cmd', '--keepme'],
  );
  // An UNSET field still round-trips its preserved negation verbatim (no over-strip).
  assert.deepEqual(
    buildServerArgs(defaults({ extraArgs: ['--no-shell'] })),
    ['--no-shell'],
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

test('P27: preserveRelativePaths keeps relative path args verbatim for a file source', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const s = defaults({
    allowedDirectories: ['src', '${workspaceFolder}/lib', '/abs/dir'],
    configFile: 'config.json',
    initialDir: 'work',
    cwd: 'server',
  });
  const args = buildServerArgs(s, { resolvePaths: false, preserveRelativePaths: true });
  // A loaded entry's relative args were authored relative to its own cwd, so they
  // round-trip verbatim rather than being anchored to ${workspaceFolder} (which would
  // resolve config.json under the workspace root instead of <cwd>/config.json).
  assert.ok(args.includes('config.json'), 'relative --config kept verbatim');
  assert.ok(args.includes('src'), 'relative --allowedDir kept verbatim');
  assert.ok(args.includes('work'), 'relative --initialDir kept verbatim');
  assert.ok(args.includes('${workspaceFolder}/lib'), 'tokenized path still verbatim');
  assert.ok(args.includes('/abs/dir'), 'absolute path still verbatim');
  assert.equal(args.includes('${workspaceFolder}/config.json'), false, 'not re-anchored');
  // The relative cwd is likewise preserved (VS Code resolves it against the workspace).
  const spec = buildLaunchSpec(s, { resolvePaths: false, preserveRelativePaths: true });
  assert.equal(spec.cwd, 'server');
});

test('P27: without preserveRelativePaths a settings export still anchors to ${workspaceFolder}', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const s = defaults({ configFile: 'config.json', cwd: 'server' });
  const args = buildServerArgs(s, { resolvePaths: false });
  assert.ok(args.includes('${workspaceFolder}/config.json'), 'relative config anchored for export');
  assert.equal(args.includes('config.json'), false, 'not kept bare for a settings export');
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
          paths: { allowedPaths: ['${workspaceFolder:nope}/b'] },
        },
      },
    },
  });
  const problems = validateLaunchSpec(s, true);
  assert.ok(problems.some((p) => /shells\.cmd.*allowedPaths/.test(p.message) && p.blocking));
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

test('P42: isAbsolutePath recognizes both Windows and POSIX absolute paths', () => {
  // A Windows path is absolute even on a POSIX host (and vice versa); the
  // host-specific path.isAbsolute would miss one of these, treating a valid
  // absolute path as workspace-relative.
  assert.equal(isAbsolutePath('C:\\Users\\me'), true);
  assert.equal(isAbsolutePath('C:/Users/me'), true);
  assert.equal(isAbsolutePath('\\\\server\\share'), true);
  assert.equal(isAbsolutePath('/usr/local/bin'), true);
  assert.equal(isAbsolutePath('relative/path'), false);
  assert.equal(isAbsolutePath('./rel'), false);
  assert.equal(isAbsolutePath('bin\\server'), false);
});

test('P42: a Windows allowed dir is treated as absolute (not workspace-rewritten)', () => {
  // Even with a workspace open, a Windows-absolute path must be emitted verbatim
  // rather than anchored under the workspace folder.
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const spec = buildServerArgs(defaults({ allowedDirectories: ['C:\\Users\\me'] }));
  const idx = spec.indexOf('--allowedDir');
  assert.equal(spec[idx + 1], 'C:\\Users\\me');
});

test('P46: a relative path-like custom command is anchored to the workspace', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const spec = buildLaunchSpec(defaults({ launchMethod: 'custom', customCommand: './bin/server' }));
  // Anchored to the workspace, not left to resolve against the provider's private cwd.
  assert.equal(spec.command, path.resolve('/ws', './bin/server'));
});

test('P46: a relative custom command keeps a configured cwd as the anchor (unchanged)', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const spec = buildLaunchSpec(
    defaults({ launchMethod: 'custom', customCommand: './bin/server', cwd: '/elsewhere' }),
  );
  // With an explicit cwd the relative command resolves against it, so leave it as-is.
  assert.equal(spec.command, './bin/server');
});

test('P46: a bare PATH custom command is not anchored', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const spec = buildLaunchSpec(defaults({ launchMethod: 'custom', customCommand: 'my-server' }));
  assert.equal(spec.command, 'my-server');
});

test('P46: a relative custom command with no cwd and no workspace is blocking', () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  const problems = validateLaunchSpec(
    defaults({ launchMethod: 'custom', customCommand: './bin/server' }),
  );
  assert.ok(problems.some((p) => /customCommand/.test(p.message) && p.blocking));
});

test('P46: a relative custom command for mcp.json keeps its value (VS Code anchors cwd)', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const spec = buildLaunchSpec(
    defaults({ launchMethod: 'custom', customCommand: './bin/server' }),
    { resolvePaths: false },
  );
  assert.equal(spec.command, './bin/server');
});

test('P51: a relative path-like per-shell command with no cwd/workspace is blocking in managed mode', () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  const s = defaults({ shells: { gitbash: { executable: { command: './tools/bash' } } } });
  const problems = validateLaunchSpec(s, true);
  assert.ok(problems.some((p) => /shells\.gitbash\.executable\.command/.test(p.message) && p.blocking));
  // With a workspace open it anchors cleanly and is not flagged.
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  assert.equal(
    validateLaunchSpec(s, true).some((p) => /shells\.gitbash\.executable\.command/.test(p.message)),
    false,
  );
});

test('P51: a relative per-shell command with a configured cwd is anchorable (not blocking)', () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  const s = defaults({ cwd: '/repo', shells: { gitbash: { executable: { command: './tools/bash' } } } });
  assert.equal(
    validateLaunchSpec(s, true).some((p) => /shells\.gitbash\.executable\.command/.test(p.message)),
    false,
  );
});

test('P52: a relative node script resolves against the configured cwd, not the workspace', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/repo' }, name: 'repo', index: 0 }];
  const spec = buildLaunchSpec(
    defaults({ launchMethod: 'node', nodeScriptPath: 'dist/index.js', cwd: '/repo/server' }),
  );
  // node runs in cwd /repo/server, so the script must resolve there.
  assert.equal(spec.args[0], path.resolve('/repo/server', 'dist/index.js'));
});

test('P52: a relative node script with a configured cwd is anchorable without a workspace', () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  const s = defaults({ launchMethod: 'node', nodeScriptPath: 'dist/index.js', cwd: '/repo/server' });
  // The cwd anchors it, so validation must not block it...
  assert.equal(validateLaunchSpec(s).some((p) => /nodeScriptPath/.test(p.message)), false);
  // ...and it resolves against the cwd.
  assert.equal(buildLaunchSpec(s).args[0], path.resolve('/repo/server', 'dist/index.js'));
});

test('P52: a relative node script for mcp.json stays relative when a cwd is set', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/repo' }, name: 'repo', index: 0 }];
  const spec = buildLaunchSpec(
    defaults({ launchMethod: 'node', nodeScriptPath: 'dist/index.js', cwd: '/repo/server' }),
    { resolvePaths: false },
  );
  // A ${workspaceFolder} token would anchor to the workspace root, not the cwd, so
  // keep the relative script for node to resolve under the configured cwd.
  assert.equal(spec.args[0], 'dist/index.js');
});

test('P53: a disabled shell does not block managed validation (explicit enabled:false)', () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  const s = defaults({
    shells: {
      cmd: {
        enabled: false,
        overrides: {
          paths: { allowedPaths: ['${workspaceFolder:nope}/b'] },
          security: { commandTimeout: 0.5 },
        },
        executable: { command: '${workspaceFolder}/bin/sh' },
      },
    },
  });
  // None of the disabled shell's stale machine-specific settings should block.
  assert.equal(validateLaunchSpec(s, true).filter((p) => p.blocking).length, 0);
});

test('P53: the legacy single-shell selector disables other shells for managed validation', () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  const s = defaults({
    shell: 'gitbash',
    shells: { cmd: { overrides: { security: { commandTimeout: 0.5 } } } },
  });
  // cmd is not the selected shell -> disabled -> its invalid limit must not block.
  assert.equal(validateLaunchSpec(s, true).filter((p) => p.blocking).length, 0);
  // The selected shell IS validated.
  const sel = defaults({
    shell: 'gitbash',
    shells: { gitbash: { overrides: { security: { commandTimeout: 0.5 } } } },
  });
  assert.ok(validateLaunchSpec(sel, true).some((p) => /shells\.gitbash.*commandTimeout/.test(p.message) && p.blocking));
});

test('P56: a global limit below 1 is blocking in managed mode but allowed (>0) as a CLI flag', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const s = defaults({ commandTimeout: 0.5, maxCommandLength: 0.5 });
  // Managed: written to the config, which the server rejects below 1 -> blocking.
  const managed = validateLaunchSpec(s, true);
  assert.ok(managed.some((p) => /commandTimeout \(0.5\)/.test(p.message) && p.blocking));
  assert.ok(managed.some((p) => /maxCommandLength \(0.5\)/.test(p.message) && p.blocking));
  // Non-managed: a CLI flag value > 0 is accepted (the server takes 0.5 directly).
  assert.equal(validateLaunchSpec(s, false).filter((p) => p.blocking).length, 0);
  // Non-positive is blocking in both modes.
  assert.ok(validateLaunchSpec(defaults({ commandTimeout: 0 }), false).some((p) => /commandTimeout/.test(p.message) && p.blocking));
});

test('P57: a managed launch strips a conflicting --transport from extraArgs', () => {
  const args = buildServerArgs(
    defaults({ extraArgs: ['--transport', 'http', '--foo', 'bar'] }),
    { managedConfigPath: '/priv/managed-config.json' },
  );
  // The forced stdio must survive; only one --transport (stdio) remains.
  assert.equal(args.filter((a) => a === '--transport').length, 1);
  assert.equal(args[args.indexOf('--transport') + 1], 'stdio');
  assert.ok(!args.includes('http'));
  assert.ok(args.includes('--foo') && args.includes('bar'));
});

test('P57: forced stdio with a referenced config strips --transport from extraArgs', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const args = buildServerArgs(
    defaults({ configFile: '/ws/wcli0.json', transportMode: 'stdio', extraArgs: ['--transport=sse'] }),
  );
  assert.equal(args.filter((a) => a === '--transport').length, 1);
  assert.equal(args[args.indexOf('--transport') + 1], 'stdio');
  assert.ok(!args.some((a) => a.startsWith('--transport=')));
});

test('P65: a stdio launch strips extraArgs --transport even with no config file', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  // stdio with no configFile: the extension emits no --transport, but a provider/
  // mcp.json stdio registration must never let an extraArgs --transport turn the
  // process into a network listener the client can't reach, so it is stripped.
  const args = buildServerArgs(defaults({ transportMode: 'stdio', extraArgs: ['--transport', 'http'] }));
  assert.deepEqual(args, []);
  // A non-transport extraArg is still carried through.
  const kept = buildServerArgs(
    defaults({ transportMode: 'stdio', extraArgs: ['--transport=http', '--foo', 'bar'] }),
  );
  assert.deepEqual(kept, ['--foo', 'bar']);
});

test('P59: a managed launch strips a conflicting --config/-c from extraArgs', () => {
  const args = buildServerArgs(
    defaults({ extraArgs: ['--config', '/evil.json', '-c', '/also.json', '--foo', 'bar'] }),
    { managedConfigPath: '/priv/managed-config.json' },
  );
  // The mandatory managed --config must survive as the only one; the extra config
  // flags (which would make yargs parse args.config as an array) are dropped.
  assert.equal(args.filter((a) => a === '--config').length, 1);
  assert.equal(args[args.indexOf('--config') + 1], '/priv/managed-config.json');
  assert.ok(!args.includes('-c'));
  assert.ok(!args.includes('/evil.json') && !args.includes('/also.json'));
  assert.ok(args.includes('--foo') && args.includes('bar'));
});

test('P59: managed launch strips the --config=/-c= attached forms from extraArgs', () => {
  const args = buildServerArgs(
    defaults({ extraArgs: ['--config=/evil.json', '-c=/also.json', '--keep'] }),
    { managedConfigPath: '/priv/managed-config.json' },
  );
  assert.equal(args.filter((a) => a === '--config').length, 1);
  assert.ok(!args.some((a) => a.startsWith('--config=') || a.startsWith('-c=')));
  assert.ok(args.includes('--keep'));
});

test('P71: a managed launch strips every other yargs config-alias form from extraArgs', () => {
  const args = buildServerArgs(
    defaults({
      extraArgs: [
        '--c', '/long-alias.json', // long form of the single-char alias
        '--c=/attached-long.json', // attached long-alias form
        '-c/bundled.json', // short-option bundling
        '--no-config', // boolean negation (config === false)
        '--keep', 'value',
      ],
    }),
    { managedConfigPath: '/priv/managed-config.json' },
  );
  // Only the mandatory managed --config survives.
  assert.equal(args.filter((a) => a === '--config').length, 1);
  assert.equal(args[args.indexOf('--config') + 1], '/priv/managed-config.json');
  // None of the alias forms (or their values) leak through.
  assert.ok(!args.includes('--c') && !args.includes('--no-config'));
  assert.ok(!args.some((a) => a.startsWith('--c=') || a.startsWith('-c')));
  assert.ok(!args.some((a) => /long-alias|attached-long|bundled/.test(a)));
  // Unrelated extras are preserved.
  assert.ok(args.includes('--keep') && args.includes('value'));
});

test('P71: a referenced config strips the alias forms but keeps a -c-prefixed non-option', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const args = buildServerArgs(
    defaults({
      configFile: '/ws/wcli0.json',
      // `--config-check` is a different (hypothetical) long flag, not the config
      // alias; a `--` long flag that merely starts with "config" must be preserved.
      extraArgs: ['--c', '/evil.json', '--config-check', '--keep'],
    }),
  );
  assert.equal(args.filter((a) => a === '--config').length, 1);
  assert.equal(args[args.indexOf('--config') + 1], '/ws/wcli0.json');
  assert.ok(!args.includes('/evil.json') && !args.includes('--c'));
  assert.ok(args.includes('--config-check'), 'an unrelated --config* long flag is kept');
  assert.ok(args.includes('--keep'));
});

test('P78: a forced-stdio launch strips --no-transport from extraArgs', () => {
  // yargs parses --no-transport as transport=false, which fails the server's string
  // choice validation and exits; it must be dropped from every stdio launch.
  const args = buildServerArgs(defaults({ transportMode: 'stdio', extraArgs: ['--no-transport', '--keep'] }));
  assert.ok(!args.includes('--no-transport'));
  assert.ok(args.includes('--keep'));
});

test('P79: a managed launch strips the negated config alias --no-c from extraArgs', () => {
  const args = buildServerArgs(
    defaults({ extraArgs: ['--no-c', '--no-config', '--keep'] }),
    { managedConfigPath: '/priv/managed-config.json' },
  );
  // Both negated forms are dropped; only the mandatory managed --config remains.
  assert.equal(args.filter((a) => a === '--config').length, 1);
  assert.ok(!args.includes('--no-c') && !args.includes('--no-config'));
  assert.ok(args.includes('--keep'));
});

test('P86: a managed launch keeps an option following a value-less --config in extraArgs', () => {
  // yargs parses `--config --debug` as config="" plus the still-applied --debug, so
  // stripping must not also discard the following option.
  const args = buildServerArgs(
    defaults({ extraArgs: ['--config', '--debug', '--keep'] }),
    { managedConfigPath: '/priv/managed-config.json' },
  );
  // The mandatory managed --config survives; the conflicting --config (no value) is
  // dropped, but the following --debug and --keep are preserved.
  assert.equal(args.filter((a) => a === '--config').length, 1);
  assert.equal(args[args.indexOf('--config') + 1], '/priv/managed-config.json');
  assert.ok(args.includes('--debug'), 'a following option is not consumed as the flag value');
  assert.ok(args.includes('--keep'));
});

test('P86: a forced-stdio launch keeps an option following a value-less --transport', () => {
  // `--transport --unsafe` -> transport="" plus the applied --unsafe; only --transport
  // is stripped, --unsafe must survive.
  const args = buildServerArgs(
    defaults({ transportMode: 'stdio', extraArgs: ['--transport', '--unsafe', '--keep'] }),
  );
  // stdio with no configFile emits no --transport itself, and the conflicting extraArgs
  // --transport is stripped, so none remains; the following --unsafe/--keep survive.
  assert.ok(!args.includes('--transport'), 'the conflicting --transport is stripped');
  assert.ok(args.includes('--unsafe'), 'a following option is not consumed as the flag value');
  assert.ok(args.includes('--keep'));
});

test('P88: a managed launch strips the c alias bundled with other short options', () => {
  // yargs recognizes `c` anywhere in a single-dash bundle, e.g. `-dc /other.json`
  // (c is the trailing option and consumes the next token) and `-xc/other.json`
  // (value attached). Both must be stripped so they cannot set a second config.
  const args = buildServerArgs(
    defaults({ extraArgs: ['-dc', '/other.json', '-xc/another.json', '--keep'] }),
    { managedConfigPath: '/priv/managed-config.json' },
  );
  assert.equal(args.filter((a) => a === '--config').length, 1);
  assert.equal(args[args.indexOf('--config') + 1], '/priv/managed-config.json');
  assert.ok(!args.some((a) => /other\.json|another\.json/.test(a)), 'bundled config values dropped');
  assert.ok(!args.includes('-dc') && !args.some((a) => a.startsWith('-xc')));
  assert.ok(args.includes('--keep'));
});

test('P88: a single-dash bundle without the c alias is preserved', () => {
  // `-d` (and other non-c bundles) are unrelated to config and must survive.
  const args = buildServerArgs(
    defaults({ extraArgs: ['-d', '--keep'] }),
    { managedConfigPath: '/priv/managed-config.json' },
  );
  assert.ok(args.includes('-d'), 'a bundle without c is not stripped');
  assert.ok(args.includes('--keep'));
});

test('P85: a referenced configFile that cannot be loaded is a blocking problem', () => {
  // configFileLoadable=false models a missing/unreadable/dir/malformed file. The
  // server would ignore the broken --config pin and load an implicit config instead.
  const problems = validateLaunchSpec(
    defaults({ configFile: '/ws/wcli0.json' }),
    false, // not managed
    false, // home config absent
    false, // configFile NOT loadable
  );
  assert.ok(
    problems.some((p) => p.blocking && /configFile .* cannot be read/.test(p.message)),
    'an unloadable configFile blocks the launch',
  );
});

test('P85: a loadable configFile produces no loadability problem', () => {
  const problems = validateLaunchSpec(
    defaults({ configFile: '/ws/wcli0.json' }),
    false,
    false,
    true, // loadable
  );
  assert.ok(!problems.some((p) => /cannot be read/.test(p.message)));
});

test('P85: configFile loadability is not checked in managed mode (configFile bypassed)', () => {
  // In managed mode the user configFile is ignored, so an unloadable one must not block.
  const problems = validateLaunchSpec(
    defaults({ configFile: '/ws/wcli0.json' }),
    true, // managed
    false,
    false, // would be unloadable, but irrelevant when managed
  );
  assert.ok(!problems.some((p) => /cannot be read/.test(p.message)));
});

test('P80: a per-shell executable command with an arbitrary ${...} token is rejected', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  // ${SHELL_BIN} is not an extension token; the server spawns the command without
  // shell expansion, so the literal token would fail every spawn.
  const problems = validateLaunchSpec(
    defaults({ shells: { cmd: { enabled: true, executable: { command: '${SHELL_BIN}/sh' } } } }),
    true,
  );
  assert.ok(
    problems.some((p) => p.blocking && /executable\.command/.test(p.message) && /unresolved variable/.test(p.message)),
  );
  // A fully resolvable command (extension token + workspace open) is accepted.
  const ok = validateLaunchSpec(
    defaults({ shells: { cmd: { enabled: true, executable: { command: '${workspaceFolder}/bin/sh' } } } }),
    true,
  );
  assert.ok(!ok.some((p) => /executable\.command/.test(p.message)));
});

test('P59: a referenced config strips a conflicting --config from extraArgs', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const args = buildServerArgs(
    defaults({ configFile: '/ws/wcli0.json', extraArgs: ['--config', '/evil.json', '--foo'] }),
  );
  // Only the extension's own --config (the referenced file) remains.
  assert.equal(args.filter((a) => a === '--config').length, 1);
  assert.equal(args[args.indexOf('--config') + 1], '/ws/wcli0.json');
  assert.ok(!args.includes('/evil.json'));
  assert.ok(args.includes('--foo'));
});

test('P59: extraArgs --config is left alone when the extension emits none', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  // No configFile and not managed: the extension emits no --config, so a user
  // --config in extraArgs is a legitimate escape hatch and must be preserved.
  const args = buildServerArgs(defaults({ extraArgs: ['--config', '/user.json'] }));
  assert.deepEqual(args, ['--config', '/user.json']);
});

test('P63: safe mode with no configFile warns when the home config exists', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const s = defaults({ safetyMode: 'safe', configFile: '' });
  // Home config present -> non-blocking warning about the implicit fallback.
  const withHome = validateLaunchSpec(s, false, true);
  assert.ok(withHome.some((p) => /win-cli-mcp\/config\.json/.test(p.message) && !p.blocking));
  // Home config absent -> no warning (avoids noise on the common case).
  assert.ok(!validateLaunchSpec(s, false, false).some((p) => /win-cli-mcp/.test(p.message)));
});

test('P63: the implicit-home-config warning is suppressed in the cases it does not apply', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  // A referenced configFile passes an explicit --config, so the home fallback never
  // applies (the existing referenced-config warning covers that case instead).
  const referenced = validateLaunchSpec(
    defaults({ safetyMode: 'safe', configFile: '/ws/x.json' }), false, true);
  assert.ok(!referenced.some((p) => /win-cli-mcp/.test(p.message)));
  // Managed mode passes an explicit --config too.
  const managed = validateLaunchSpec(defaults({ safetyMode: 'safe' }), true, true);
  assert.ok(!managed.some((p) => /win-cli-mcp/.test(p.message)));
  // Not safe mode: the home config can't weaken an already-unrestricted launch.
  const unsafe = validateLaunchSpec(defaults({ safetyMode: 'unsafe' }), false, true);
  assert.ok(!unsafe.some((p) => /win-cli-mcp/.test(p.message)));
});

test('P99: ignoreInheritedShells skips per-shell managed validation of masked shells', () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  // An inherited per-shell entry with stale machine-specific values that would
  // normally block managed validation (unanchorable path, sub-1 limit, unresolved
  // executable command).
  const shells = {
    cmd: {
      enabled: true,
      overrides: {
        paths: { allowedPaths: ['${workspaceFolder:nope}/b'] },
        security: { commandTimeout: 0.5 },
      },
      executable: { command: '${workspaceFolder}/bin/sh' },
    },
  };
  // Without the opt-out, the entry blocks managed validation.
  assert.ok(
    validateLaunchSpec(defaults({ shells }), true).some((p) => p.blocking),
  );
  // With ignoreInheritedShells the masked shell is never emitted (buildConfigFile
  // drops it), so it must not block — matching the generated masked config.
  assert.equal(
    validateLaunchSpec(defaults({ shells, ignoreInheritedShells: true }), true)
      .filter((p) => p.blocking).length,
    0,
  );
});

test('P102: custom args repeating a reserved --config/--transport is blocking when the extension emits its own', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const base = { launchMethod: 'custom', customCommand: 'wcli0' };
  // Managed mode always emits --config <managed> and --transport stdio, so a custom
  // --config / --transport collides and defeats the managed config / forced stdio.
  const managedConfig = validateLaunchSpec(
    defaults({ ...base, customArgs: ['--config', 'other.json'] }), true);
  assert.ok(managedConfig.some((p) => /customArgs.*--config/.test(p.message) && p.blocking));
  const managedTransport = validateLaunchSpec(
    defaults({ ...base, customArgs: ['--transport', 'http'] }), true);
  assert.ok(managedTransport.some((p) => /customArgs.*--transport/.test(p.message) && p.blocking));
  // A pinned configFile (non-managed) also emits its own --config (+ --transport stdio).
  const pinned = validateLaunchSpec(
    defaults({ ...base, configFile: '/ws/x.json', customArgs: ['-c', 'other.json'] }), false);
  assert.ok(pinned.some((p) => /customArgs.*--config/.test(p.message) && p.blocking));
  // http/sse transport emits its own --transport, so a custom --transport collides.
  const http = validateLaunchSpec(
    defaults({ ...base, transportMode: 'http', customArgs: ['--transport', 'stdio'] }), false);
  assert.ok(http.some((p) => /customArgs.*--transport/.test(p.message) && p.blocking));
});

test('P102: custom args keep --config/--transport as an escape hatch on a plain launch', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  // Plain stdio launch, no managed config and no configFile: the extension emits no
  // --config and no --transport, so a custom flag is the user's own escape hatch.
  const s = defaults({
    launchMethod: 'custom',
    customCommand: 'my-wrapper',
    customArgs: ['--config', 'mine.json', '--transport', 'http'],
  });
  assert.equal(
    validateLaunchSpec(s, false).filter((p) => /customArgs.*--(config|transport)/.test(p.message)).length,
    0,
  );
});
