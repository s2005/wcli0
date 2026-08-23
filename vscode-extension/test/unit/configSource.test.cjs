const test = require('node:test');
const assert = require('node:assert/strict');

const vscode = require('../stubs/vscode.cjs');
const {
  detectWorkspaceMcpJson,
  readWcli0Entry,
  parseServerArgs,
  parseMcpEntry,
  parseHttpUrl,
  mcpJsonUri,
} = require('../../dist/configSource.js');
const { buildLaunchSpec } = require('../../dist/argsBuilder.js');

const FOLDER = { uri: vscode.Uri.file('/ws'), name: 'ws', index: 0 };
const MCP_PATH = '/ws/.vscode/mcp.json';

function seedMcpJson(obj) {
  vscode.__state.files.set(MCP_PATH, Buffer.from(JSON.stringify(obj)));
}

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
    shells: {},
    profiles: {},
    ignoreInheritedShells: false,
    ignoreInheritedProfiles: false,
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
  vscode.__reset();
  vscode.__state.workspaceFolders = [FOLDER];
});

// ---- detection -----------------------------------------------------------

test('detectWorkspaceMcpJson finds a wcli0 server entry', async () => {
  seedMcpJson({ servers: { wcli0: { type: 'stdio', command: 'npx' }, other: {} } });
  const d = await detectWorkspaceMcpJson(FOLDER);
  assert.equal(d.exists, true);
  assert.equal(d.hasWcli0, true);
  assert.equal(d.fsPath, MCP_PATH);
});

test('detectWorkspaceMcpJson reports no entry when wcli0 absent', async () => {
  seedMcpJson({ servers: { other: { type: 'stdio' } } });
  const d = await detectWorkspaceMcpJson(FOLDER);
  assert.equal(d.exists, true);
  assert.equal(d.hasWcli0, false);
});

test('detectWorkspaceMcpJson reports absent when the file is missing', async () => {
  const d = await detectWorkspaceMcpJson(FOLDER);
  assert.equal(d.exists, false);
  assert.equal(d.hasWcli0, false);
});

test('detectWorkspaceMcpJson tolerates JSONC comments', async () => {
  vscode.__state.files.set(
    MCP_PATH,
    Buffer.from('{\n  // wcli0 entry\n  "servers": { "wcli0": { "type": "stdio" } },\n}'),
  );
  const d = await detectWorkspaceMcpJson(FOLDER);
  assert.equal(d.hasWcli0, true);
});

test('detectWorkspaceMcpJson reports existing-but-no-entry on malformed JSON', async () => {
  vscode.__state.files.set(MCP_PATH, Buffer.from('{ not valid'));
  const d = await detectWorkspaceMcpJson(FOLDER);
  assert.equal(d.exists, true);
  assert.equal(d.hasWcli0, false);
});

test('detectWorkspaceMcpJson does not throw on a non-not-found read error', async () => {
  const err = new Error('permission denied');
  err.code = 'NoPermissions';
  vscode.__state.readError = err;
  const d = await detectWorkspaceMcpJson(FOLDER);
  assert.equal(d.exists, false);
});

test('readWcli0Entry returns the entry object or undefined', async () => {
  seedMcpJson({ servers: { wcli0: { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest'] } } });
  const entry = await readWcli0Entry(FOLDER);
  assert.equal(entry.command, 'npx');
  vscode.__reset();
  vscode.__state.workspaceFolders = [FOLDER];
  assert.equal(await readWcli0Entry(FOLDER), undefined);
});

test('mcpJsonUri points at .vscode/mcp.json', () => {
  assert.equal(mcpJsonUri(FOLDER).fsPath, MCP_PATH);
});

// ---- parseServerArgs -----------------------------------------------------

test('parseServerArgs maps recognized value flags', () => {
  const { settings } = parseServerArgs([
    '--shell', 'powershell',
    '--commandTimeout', '30',
    '--maxCommandLength', '8000',
    '--initialDir', '/work',
    '--logDirectory', '/logs',
  ]);
  assert.equal(settings.shell, 'powershell');
  assert.equal(settings.commandTimeout, 30);
  assert.equal(settings.maxCommandLength, 8000);
  assert.equal(settings.initialDir, '/work');
  assert.equal(settings.logDirectory, '/logs');
});

test('parseServerArgs collects repeated flags into arrays', () => {
  const { settings } = parseServerArgs([
    '--allowedDir', '/a',
    '--allowedDir', '/b',
    '--blockedCommand', 'rm',
    '--blockedCommand', 'del',
  ]);
  assert.deepEqual(settings.allowedDirectories, ['/a', '/b']);
  assert.deepEqual(settings.blockedCommands, ['rm', 'del']);
});

test('parseServerArgs accepts the --opt=value form', () => {
  const { settings } = parseServerArgs(['--blockedArgument=-rf', '--shell=cmd']);
  assert.deepEqual(settings.blockedArguments, ['-rf']);
  assert.equal(settings.shell, 'cmd');
});

test('parseServerArgs handles boolean, safety and tri-state flags', () => {
  const a = parseServerArgs(['--allowAllDirs', '--debug', '--unsafe', '--no-enableTruncation']);
  assert.equal(a.settings.allowAllDirs, true);
  assert.equal(a.settings.debug, true);
  assert.equal(a.settings.safetyMode, 'unsafe');
  assert.equal(a.settings.enableTruncation, 'disabled');
  const b = parseServerArgs(['--yolo', '--enableLogResources']);
  assert.equal(b.settings.safetyMode, 'yolo');
  assert.equal(b.settings.enableLogResources, 'enabled');
});

test('P63: parseServerArgs consumes negated boolean flags instead of preserving them in extraArgs', () => {
  // A loaded entry may carry yargs negations for the server's boolean options. They must be
  // modeled (and removed from extraArgs), or a preserved `--no-debug` survives a save and
  // yargs parses `--debug --no-debug` as debug=false, silently dropping the user's form edit.
  const a = parseServerArgs([
    '--no-allowAllDirs',
    '--no-debug',
    '--no-yolo',
    '--shell',
    'cmd',
  ]);
  assert.equal(a.settings.allowAllDirs, false);
  assert.equal(a.settings.debug, false);
  // parseServerArgs returns a partial: with no positive safety flag it leaves safetyMode unset,
  // so parseMcpEntry overlays the default 'safe'. A single-family negation must not leak into
  // extraArgs. (A negation from BOTH families together defines both keys and conflicts — the
  // server rejects it and it round-trips verbatim instead; see the P71 test.)
  assert.equal(a.settings.safetyMode, undefined);
  assert.equal(a.settings.shell, 'cmd');
  assert.deepEqual(a.extraArgs, [], 'no negated boolean leaks into extraArgs');

  // The kebab-case alias of the multi-word boolean is recognized too.
  const b = parseServerArgs(['--no-allow-all-dirs']);
  assert.equal(b.settings.allowAllDirs, false);
  assert.deepEqual(b.extraArgs, []);

  // `--unsafe --no-yolo` DEFINES both safety keys (yargs sets yolo=false for --no-yolo), so the
  // server's .conflicts check rejects it. It is treated as a conflict and round-trips verbatim
  // rather than collapsing to a valid `--unsafe` launch — see the dedicated P71 test. (P63 still
  // consumes single-family negations, as the cases above and below show.)
  const c = parseServerArgs(['--unsafe', '--no-yolo']);
  assert.equal(c.settings.safetyMode, undefined);
  assert.deepEqual(c.extraArgs, ['--unsafe', '--no-yolo']);

  // Mirrors yargs last-wins for a contradictory SAME-family pair (not a conflict): `--yolo
  // --no-yolo` resolves to safe and is consumed.
  const d = parseServerArgs(['--yolo', '--no-yolo']);
  assert.equal(d.settings.safetyMode, 'safe');
  assert.deepEqual(d.extraArgs, []);
});

test('P68: parseServerArgs honors explicit true/false values for boolean flags', () => {
  // yargs declares these options type:'boolean' and consumes a following bare true/false as the
  // value (e.g. `--debug false` => debug=false). The parser must model that explicit value
  // instead of recording the flag as true and stranding `false` in extraArgs, which would show
  // the opposite of what the server runs.
  const a = parseServerArgs(['--debug', 'false', '--allowAllDirs', 'true', '--shell', 'bash']);
  assert.equal(a.settings.debug, false);
  assert.equal(a.settings.allowAllDirs, true);
  assert.equal(a.settings.shell, 'bash');
  assert.deepEqual(a.extraArgs, [], 'the consumed true/false do not leak into extraArgs');

  // The kebab-case and tri-state spellings honor explicit values too.
  const b = parseServerArgs(['--enable-truncation', 'false', '--enableLogResources', 'true']);
  assert.equal(b.settings.enableTruncation, 'disabled');
  assert.equal(b.settings.enableLogResources, 'enabled');
  assert.deepEqual(b.extraArgs, []);

  // `--yolo false` is not a positive: it leaves the default safety mode and consumes its value.
  const c = parseServerArgs(['--yolo', 'false']);
  assert.equal(c.settings.safetyMode, undefined);
  assert.deepEqual(c.extraArgs, []);

  // Only an exact true/false is consumed; any other following token stays a positional and the
  // flag reads true, matching yargs (`--debug notabool` => debug=true, 'notabool' preserved).
  const d = parseServerArgs(['--debug', 'notabool']);
  assert.equal(d.settings.debug, true);
  assert.deepEqual(d.extraArgs, ['notabool']);
});

test('P70: parseServerArgs preserves a conflicting --yolo/--unsafe pair verbatim', () => {
  // The server declares yolo/unsafe mutually exclusive (.conflicts), so an entry with both is
  // rejected. Collapsing the pair to one would let a no-op save turn that rejected entry into a
  // valid launch, so both are preserved verbatim in extraArgs and safetyMode is left at default.
  const a = parseServerArgs(['--shell', 'cmd', '--yolo', '--unsafe']);
  assert.equal(a.settings.safetyMode, undefined, 'neither flag is modeled into safetyMode');
  assert.equal(a.settings.shell, 'cmd');
  assert.deepEqual(a.extraArgs, ['--yolo', '--unsafe'], 'both flags round-trip verbatim');

  // Explicit-true positives also conflict; the true values round-trip alongside their flags.
  const b = parseServerArgs(['--yolo', 'true', '--unsafe', 'true']);
  assert.equal(b.settings.safetyMode, undefined);
  assert.deepEqual(b.extraArgs, ['--yolo', 'true', '--unsafe', 'true']);

  // A trailing negation does NOT remove the conflict: yargs still defines both keys (yolo=false
  // via --no-yolo, unsafe=true), so .conflicts rejects it. All three tokens round-trip verbatim
  // rather than collapsing to a valid `--unsafe` launch (P71).
  const c = parseServerArgs(['--yolo', '--unsafe', '--no-yolo']);
  assert.equal(c.settings.safetyMode, undefined);
  assert.deepEqual(c.extraArgs, ['--yolo', '--unsafe', '--no-yolo']);
});

test('P71: parseServerArgs preserves false/negated safety flags that still conflict', () => {
  // yargs' .conflicts('unsafe','yolo') fails whenever BOTH keys are DEFINED, and yargs-parser
  // defines the key for `--yolo false`, `--no-yolo`, and `--yolo=false` just as for `--yolo`.
  // So pairing --unsafe with any of these is server-rejected; the parser must round-trip every
  // safety token verbatim rather than model the entry as a valid single-mode launch.

  // Explicit `--yolo false` alongside --unsafe: both keys defined => conflict.
  const a = parseServerArgs(['--yolo', 'false', '--unsafe']);
  assert.equal(a.settings.safetyMode, undefined, 'neither flag is modeled into safetyMode');
  assert.deepEqual(a.extraArgs, ['--yolo', 'false', '--unsafe']);

  // Negated `--no-yolo` alongside --unsafe: yolo=false is still defined => conflict.
  const b = parseServerArgs(['--no-yolo', '--unsafe']);
  assert.equal(b.settings.safetyMode, undefined);
  assert.deepEqual(b.extraArgs, ['--no-yolo', '--unsafe']);

  // Attached `--unsafe=false` alongside --yolo: both keys defined => conflict.
  const c = parseServerArgs(['--unsafe=false', '--yolo']);
  assert.equal(c.settings.safetyMode, undefined);
  assert.deepEqual(c.extraArgs, ['--unsafe=false', '--yolo']);

  // Without the other family it is NOT a conflict: `--no-yolo` alone is consumed (resolves to
  // safe), not preserved — only the cross-family combination round-trips verbatim.
  const d = parseServerArgs(['--no-yolo', '--shell', 'cmd']);
  assert.equal(d.settings.safetyMode, undefined);
  assert.equal(d.settings.shell, 'cmd');
  assert.deepEqual(d.extraArgs, []);

  // Even two negations conflict: `--no-yolo --no-unsafe` defines both keys (both false), which
  // .conflicts still rejects (verified against yargs), so both round-trip verbatim.
  const e = parseServerArgs(['--no-yolo', '--no-unsafe']);
  assert.equal(e.settings.safetyMode, undefined);
  assert.deepEqual(e.extraArgs, ['--no-yolo', '--no-unsafe']);
});

test('P72: parseServerArgs models attached boolean assignments', () => {
  // yargs declares these type:'boolean', so `--debug=true` / `--enableTruncation=false` set the
  // option value. The parser must model them (not dump to extraArgs), or the form shows the
  // default and a later edit is defeated by the stale attached value surviving in argv.
  const a = parseServerArgs([
    '--debug=true',
    '--enableTruncation=false',
    '--enableLogResources=true',
    '--allowAllDirs=false',
  ]);
  assert.equal(a.settings.debug, true);
  assert.equal(a.settings.enableTruncation, 'disabled');
  assert.equal(a.settings.enableLogResources, 'enabled');
  assert.equal(a.settings.allowAllDirs, false);
  assert.deepEqual(a.extraArgs, [], 'no attached boolean leaks into extraArgs');

  // Kebab-case aliases are modeled identically.
  const b = parseServerArgs(['--enable-truncation=true', '--allow-all-dirs=true']);
  assert.equal(b.settings.enableTruncation, 'enabled');
  assert.equal(b.settings.allowAllDirs, true);
  assert.deepEqual(b.extraArgs, []);

  // Attached safety positives are modeled when there is no conflict; `--yolo=false` leaves the
  // default safe mode and is consumed.
  const c = parseServerArgs(['--unsafe=true']);
  assert.equal(c.settings.safetyMode, 'unsafe');
  assert.deepEqual(c.extraArgs, []);
  const d = parseServerArgs(['--yolo=false']);
  assert.equal(d.settings.safetyMode, undefined);
  assert.deepEqual(d.extraArgs, []);

  // P87: any attached value other than the literal `true` is FALSE to yargs (processValue
  // coerces a declared boolean with `val === 'true'`), so it is modeled as false rather than
  // preserved.
  const e = parseServerArgs(['--debug=verbose']);
  assert.equal(e.settings.debug, false);
  assert.deepEqual(e.extraArgs, []);
});

test('P87: every attached boolean value follows yargs coercion', () => {
  // yargs-parser: `val === 'true'` -- so 0/1/yes/FALSE all mean false for a declared boolean.
  for (const value of ['0', '1', 'yes', 'FALSE', '']) {
    const { settings, extraArgs } = parseServerArgs([`--debug=${value}`]);
    assert.equal(settings.debug, false, `--debug=${value} is false`);
    assert.deepEqual(extraArgs, [], `--debug=${value} is modeled, not preserved`);
  }
  const truncation = parseServerArgs(['--enableTruncation=0', '--enableLogResources=0']);
  assert.equal(truncation.settings.enableTruncation, 'disabled');
  assert.equal(truncation.settings.enableLogResources, 'disabled');
  assert.deepEqual(truncation.extraArgs, []);
});

test('P87: a preserved attached value can no longer defeat a later edit', () => {
  // Before: `--debug=0` stayed in extraArgs, so enabling Debug emitted `--debug --debug=0`,
  // which yargs resolves last-wins back to false -- the edit silently did nothing.
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest', '--debug=0'],
  });
  assert.equal(settings.debug, false, 'the loaded entry reads as Debug off');
  const enabled = { ...settings, debug: true };
  const args = buildLaunchSpec(enabled, { resolvePaths: false, preserveRelativePaths: true }).args;
  assert.ok(args.includes('--debug'), 'the edit is emitted');
  assert.equal(
    args.filter((a) => a.startsWith('--debug')).length,
    1,
    'no stale attached value survives to override it',
  );
});

test('parseServerArgs parses transport flags', () => {
  const { settings } = parseServerArgs([
    '--transport', 'http',
    '--http-host', '0.0.0.0',
    '--http-port', '7000',
    '--http-allowed-origins', 'https://a.test,https://b.test',
  ]);
  assert.equal(settings.transportMode, 'http');
  assert.equal(settings.transportHost, '0.0.0.0');
  assert.equal(settings.transportPort, 7000);
  assert.deepEqual(settings.transportAllowedOrigins, ['https://a.test', 'https://b.test']);
});

test('parseServerArgs preserves unrecognized flags in extraArgs', () => {
  const { settings, extraArgs } = parseServerArgs(['--shell', 'cmd', '--futureFlag', 'x', '--bare']);
  assert.equal(settings.shell, 'cmd');
  assert.deepEqual(extraArgs, ['--futureFlag', 'x', '--bare']);
});

// ---- parseMcpEntry -------------------------------------------------------

test('parseMcpEntry parses an npx stdio entry', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@1.2.3', '--shell', 'cmd', '--allowedDir', '/ws'],
    cwd: '/ws',
    env: { FOO: 'bar' },
  });
  assert.equal(settings.launchMethod, 'npx');
  assert.equal(settings.packageSpec, 'wcli0@1.2.3');
  assert.equal(settings.shell, 'cmd');
  assert.deepEqual(settings.allowedDirectories, ['/ws']);
  assert.equal(settings.cwd, '/ws');
  assert.deepEqual(settings.env, { FOO: 'bar' });
});

test('parseMcpEntry parses a node stdio entry', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'node',
    args: ['/srv/dist/index.js', '--debug'],
  });
  assert.equal(settings.launchMethod, 'node');
  assert.equal(settings.nodeScriptPath, '/srv/dist/index.js');
  assert.equal(settings.debug, true);
});

test('parseMcpEntry splits custom command args from server flags', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'my-wrapper',
    args: ['run', 'wcli0', '--shell', 'gitbash'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.equal(settings.customCommand, 'my-wrapper');
  assert.deepEqual(settings.customArgs, ['run', 'wcli0']);
  assert.equal(settings.shell, 'gitbash');
});

test('P3: parseMcpEntry keeps dash-prefixed custom launcher args before wcli0 flags', () => {
  const { settings, notes } = parseMcpEntry({
    type: 'stdio',
    command: 'uvx',
    args: ['--from', 'git+https://example/repo', 'wcli0', '--shell', 'cmd'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.equal(settings.customCommand, 'uvx');
  // The launcher's own --from option stays in customArgs; only the recognized wcli0
  // flag (--shell) starts the server flags. Nothing leaks into extraArgs.
  assert.deepEqual(settings.customArgs, ['--from', 'git+https://example/repo', 'wcli0']);
  assert.equal(settings.shell, 'cmd');
  assert.deepEqual(settings.extraArgs, []);
  assert.equal(notes.length, 0);
});

test('P3: buildLaunchSpec -> parseMcpEntry round-trips custom launcher args in order', () => {
  const s = defaults({
    launchMethod: 'custom',
    customCommand: 'uvx',
    customArgs: ['--from', 'repo', 'wcli0'],
    shell: 'cmd',
  });
  const spec = buildLaunchSpec(s, { resolvePaths: false });
  const { settings } = parseMcpEntry({ type: 'stdio', command: spec.command, args: spec.args });
  assert.equal(settings.customCommand, 'uvx');
  assert.deepEqual(settings.customArgs, ['--from', 'repo', 'wcli0']);
  assert.equal(settings.shell, 'cmd');
});

test('P14: parseMcpEntry treats node launcher options as custom args, not a script', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'node',
    args: ['--inspect', 'dist/index.js', '--shell', 'cmd'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.equal(settings.customCommand, 'node');
  assert.deepEqual(settings.customArgs, ['--inspect', 'dist/index.js']);
  assert.equal(settings.shell, 'cmd');
});

test('P14: a plain node entry is still parsed as node', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'node',
    args: ['dist/index.js', '--shell', 'cmd'],
  });
  assert.equal(settings.launchMethod, 'node');
  assert.equal(settings.nodeScriptPath, 'dist/index.js');
  assert.equal(settings.shell, 'cmd');
});

test('P17: parseMcpEntry treats npx launcher options as custom, preserving them', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['--package=wcli0', '--', 'wcli0', '--shell', 'cmd'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.equal(settings.customCommand, 'npx');
  assert.deepEqual(settings.customArgs, ['--package=wcli0', '--', 'wcli0']);
  assert.equal(settings.shell, 'cmd');
});

test('P17: a plain `npx -y <pkg>` entry is parsed as the npx launch method', () => {
  const withY = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@9.9.9', '--shell', 'cmd'],
  }).settings;
  assert.equal(withY.launchMethod, 'npx');
  assert.equal(withY.packageSpec, 'wcli0@9.9.9');
  assert.equal(withY.shell, 'cmd');
});

test('P82: `npx <pkg>` without -y is custom, so a save does not add -y', () => {
  // npx prompts before installing a missing package; -y accepts it automatically. The npx
  // launch method always emits -y, so an entry that deliberately omitted it must not be
  // modeled as npx -- an unrelated save would silently suppress the confirmation.
  const { settings, notes } = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['wcli0@1.2.3', '--shell', 'cmd'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.equal(settings.customCommand, 'npx');
  assert.deepEqual(settings.customArgs, ['wcli0@1.2.3']);
  assert.equal(settings.shell, 'cmd', 'the server flags after it are still modeled');
  assert.ok(
    notes.some((n) => /WITHOUT -y/i.test(n)),
    'the note explains why it is shown as a custom command',
  );
  // A no-op save round-trips the launcher verbatim: still no -y.
  const spec = buildLaunchSpec(settings, { resolvePaths: false, preserveRelativePaths: true });
  assert.equal(spec.command, 'npx');
  assert.deepEqual(spec.args, ['wcli0@1.2.3', '--shell', 'cmd']);
});

test('P82: an npx entry with no args at all is preserved as a custom command', () => {
  const { settings } = parseMcpEntry({ type: 'stdio', command: 'npx' });
  assert.equal(settings.launchMethod, 'custom');
  assert.equal(settings.customCommand, 'npx');
  assert.deepEqual(settings.customArgs, []);
  const spec = buildLaunchSpec(settings, { resolvePaths: false, preserveRelativePaths: true });
  assert.equal(spec.command, 'npx');
  assert.deepEqual(spec.args, [], 'no package spec is invented for it');
});

test('P83: a generic custom launch does not scan past its `--` separator', () => {
  // `node --inspect dist/index.js -- --debug` hands `--` and `--debug` to the script, where
  // yargs leaves them positional. Modeling --debug as an active flag misreported the launch and
  // appended newly saved flags behind the separator, where the server never reads them.
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'node',
    args: ['--inspect', 'dist/index.js', '--', '--debug'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.equal(settings.debug, false, 'the positional --debug is not modeled as enabled');
  assert.deepEqual(settings.customArgs, ['--inspect', 'dist/index.js', '--', '--debug']);
  assert.deepEqual(settings.extraArgs, []);
  const spec = buildLaunchSpec(settings, { resolvePaths: false, preserveRelativePaths: true });
  assert.deepEqual(spec.args, ['--inspect', 'dist/index.js', '--', '--debug'], 'round-trips');
});

test('P83: a wrapper `--` followed by the wcli0 binary is still a pass-through', () => {
  // The one separator shape that PROVES a pass-through: the wrapped binary is wcli0 itself, so
  // the flags after it really are server flags and stay editable (P17).
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['--package=wcli0', '--', 'wcli0', '--shell', 'cmd'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.deepEqual(settings.customArgs, ['--package=wcli0', '--', 'wcli0']);
  assert.equal(settings.shell, 'cmd');
});

test("P83: the wrapped wcli0 binary's OWN `--` stops the scan again", () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['--package=wcli0', '--', 'wcli0', '--', '--debug'],
  });
  assert.equal(settings.debug, false, 'a positional after the binary is not modeled');
  assert.deepEqual(settings.customArgs, ['--package=wcli0', '--', 'wcli0', '--', '--debug']);
});

test('P85: an npx entry with no package token is a custom launch', () => {
  // buildLaunchSpec substitutes an empty packageSpec with wcli0@latest, so modeling `npx -y`
  // would turn an incomplete invocation into an automatic install-and-run on an unrelated save.
  for (const args of [['-y'], ['-y', '']]) {
    const { settings } = parseMcpEntry({ type: 'stdio', command: 'npx', args });
    assert.equal(settings.launchMethod, 'custom', `npx ${JSON.stringify(args)} is custom`);
    assert.equal(settings.customCommand, 'npx');
    assert.deepEqual(settings.customArgs, args);
    const spec = buildLaunchSpec(settings, { resolvePaths: false, preserveRelativePaths: true });
    assert.equal(spec.command, 'npx');
    assert.deepEqual(spec.args, args, 'no package spec is invented');
  }
});

test('P86: a UTF-8 BOM does not hide the wcli0 entry', async () => {
  // VS Code can save .vscode/mcp.json as "UTF-8 with BOM"; JSON.parse throws on the leading
  // U+FEFF, which made detection and loading report the file as absent/malformed.
  const json = JSON.stringify({
    servers: { wcli0: { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest'] } },
  });
  vscode.__state.files.set(MCP_PATH, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(json)]));
  const d = await detectWorkspaceMcpJson(FOLDER);
  assert.equal(d.exists, true);
  assert.equal(d.hasWcli0, true, 'the entry is detected through the BOM');
  const entry = await readWcli0Entry(FOLDER);
  assert.equal(entry.command, 'npx', 'the entry loads through the BOM');
});

test('P98: a valueless scalar flag counts as a duplicate occurrence', () => {
  // Verified against yargs-parser: `--shell --debug --shell bash` => shell: ['', 'bash'], which is
  // not a usable shell name, so the entry enables NO shell. Modeling only `bash` let the builder
  // strip the preserved valueless copy and a no-op save enabled command execution through Bash.
  const { settings, extraArgs } = parseServerArgs(['--shell', '--debug', '--shell', 'bash']);
  assert.equal(settings.shell, undefined, 'neither occurrence is modeled');
  assert.equal(settings.debug, true, 'the flag between them is still modeled, as yargs does');
  assert.deepEqual(extraArgs, ['--shell', '--shell', 'bash']);
});

test('P98: the valueless duplicate survives a no-op save', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest', '--shell', '--debug', '--shell', 'bash'],
  });
  const args = buildLaunchSpec(settings, { resolvePaths: false, preserveRelativePaths: true }).args;
  assert.deepEqual(
    args.filter((a) => a === '--shell' || a === 'bash'),
    ['--shell', '--shell', 'bash'],
    'both occurrences round-trip, so the entry still enables no shell',
  );
});

test('P98: a valueless --config bundle counts too', () => {
  const { settings, extraArgs } = parseServerArgs(['-c', '--debug', '--config', '/x.json']);
  assert.equal(settings.configFile, undefined, 'the repeated config is not modeled');
  assert.deepEqual(extraArgs, ['-c', '--config', '/x.json']);
});

test('P98: a single valueless scalar flag is unchanged', () => {
  const { settings, extraArgs } = parseServerArgs(['--shell', '--debug']);
  assert.equal(settings.shell, undefined);
  assert.equal(settings.debug, true);
  assert.deepEqual(extraArgs, ['--shell'], 'still preserved verbatim, as before (P44)');
});

test('P93: a negative numeric value counts as a scalar occurrence', () => {
  // Verified against yargs-parser: `--commandTimeout -1 --commandTimeout 5` => [-1, 5], which the
  // server ignores (not a number). Reading `-1` as a flag hid the repeat, so the pair was modeled
  // as a plain `--commandTimeout 5` and the save changed the launch.
  const { settings, extraArgs } = parseServerArgs([
    '--commandTimeout', '-1', '--commandTimeout', '5',
  ]);
  assert.equal(settings.commandTimeout, undefined, 'neither value is modeled');
  assert.deepEqual(extraArgs, ['--commandTimeout', '-1', '--commandTimeout', '5']);
});

test('P93: a single negative numeric value is consumed as the value, not a flag', () => {
  // A non-positive timeout is diverted (the server ignores it, P64), so both tokens round-trip.
  const { settings, extraArgs } = parseServerArgs(['--commandTimeout', '-1']);
  assert.equal(settings.commandTimeout, undefined);
  assert.deepEqual(extraArgs, ['--commandTimeout', '-1']);
  // A dash token that is NOT a number is still a separate flag, as yargs treats it.
  const other = parseServerArgs(['--shell', '-x']);
  assert.equal(other.settings.shell, undefined);
  assert.deepEqual(other.extraArgs, ['--shell', '-x']);
});

test('P93: a stripped option takes its negative value with it', () => {
  const spec = buildLaunchSpec(
    { ...defaults(), commandTimeout: 30, extraArgs: ['--commandTimeout', '-1'] },
    { resolvePaths: false },
  );
  assert.equal(spec.args.includes('-1'), false, 'no orphan value is left behind');
  assert.equal(spec.args[spec.args.indexOf('--commandTimeout') + 1], '30');
});

test('P94: a wrapper suffix is detected by any attached boolean value', () => {
  // yargs coerces every attached value other than `true` to false, so `--enableTruncation=0`
  // really disables truncation; the suffix detector must see it as a modeled wcli0 flag or the
  // form shows the server default while the entry says otherwise.
  for (const token of ['--enableTruncation=0', '--enableTruncation=yes', '--debug=0']) {
    const { settings } = parseMcpEntry({
      type: 'stdio',
      command: 'wrapper',
      args: ['target', token],
    });
    assert.deepEqual(settings.customArgs, ['target'], `${token} is a server-flag suffix`);
    assert.deepEqual(settings.extraArgs, [], `${token} is modeled, not preserved`);
  }
  const truncation = parseMcpEntry({
    type: 'stdio',
    command: 'wrapper',
    args: ['target', '--enableTruncation=0'],
  }).settings;
  assert.equal(truncation.enableTruncation, 'disabled', 'the real setting is shown');
});

test('P96: an explicit --shell all is preserved, not read as the omit sentinel', () => {
  // The form's `all` means "emit no --shell" (so the server loads its default shells), but the
  // server's `--shell all` loads only a shell module named "all", which does not exist -- the
  // entry has NO usable shells. Modeling it as the sentinel let a no-op save enable them all.
  for (const args of [
    ['-y', 'wcli0@latest', '--shell', 'all'],
    ['-y', 'wcli0@latest', '--shell=all'],
  ]) {
    const { settings } = parseMcpEntry({ type: 'stdio', command: 'npx', args });
    const emitted = buildLaunchSpec(settings, {
      resolvePaths: false,
      preserveRelativePaths: true,
    }).args;
    assert.deepEqual(
      emitted.filter((a) => a.startsWith('--shell') || a === 'all'),
      args.slice(2),
      'the explicit value round-trips verbatim',
    );
  }
});

test('P96: choosing a real shell replaces the preserved --shell all', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest', '--shell', 'all'],
  });
  const edited = { ...settings, shell: 'cmd' };
  const args = buildLaunchSpec(edited, { resolvePaths: false, preserveRelativePaths: true }).args;
  assert.equal(args[args.indexOf('--shell') + 1], 'cmd');
  assert.equal(args.filter((a) => a === '--shell').length, 1, 'the preserved copy is stripped');
  assert.equal(args.includes('all'), false);
});

test('P97: a stripper never touches tokens after the `--` separator', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest', '--shell', 'cmd', '--', '--shell', 'bash'],
  });
  assert.equal(settings.shell, 'cmd', 'the option before the separator is modeled');
  assert.deepEqual(settings.extraArgs, ['--', '--shell', 'bash']);
  const args = buildLaunchSpec(settings, { resolvePaths: false, preserveRelativePaths: true }).args;
  assert.deepEqual(
    args.slice(args.indexOf('--')),
    ['--', '--shell', 'bash'],
    'the positional region survives the emitted --shell',
  );
});

test('P97: the config and transport strippers also stop at the separator', () => {
  const s = {
    ...defaults(),
    configFile: '/ws/cfg.json',
    transportMode: 'http',
    transportHost: '127.0.0.1',
    transportPort: 9444,
    extraArgs: ['--', '--config', '/other.json', '--transport', 'stdio'],
  };
  const args = buildLaunchSpec(s, { resolvePaths: false }).args;
  assert.deepEqual(
    args.slice(args.indexOf('--')),
    ['--', '--config', '/other.json', '--transport', 'stdio'],
    'positionals are copied verbatim by both strippers',
  );
});

test('P89: a later false value clears a safety mode an earlier flag set', () => {
  // Verified against the installed yargs-parser: repeated booleans are last-wins, so
  // `--unsafe --unsafe=false` and `--unsafe --unsafe false` both mean unsafe:false. Modeling
  // them as the positive mode let a no-op save drop the false and disable every protection.
  for (const args of [
    ['--unsafe', '--unsafe=false'],
    ['--unsafe', '--unsafe', 'false'],
    ['--yolo', '--yolo=false'],
  ]) {
    const { settings } = parseServerArgs(args);
    assert.equal(settings.safetyMode, 'safe', `${args.join(' ')} is safe`);
  }
  // The reverse order is still the positive mode (last-wins the other way).
  assert.equal(parseServerArgs(['--unsafe=false', '--unsafe']).settings.safetyMode, 'unsafe');
});

test('P89: a re-emitted safety mode matches what the entry really did', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest', '--unsafe', '--unsafe=false'],
  });
  const args = buildLaunchSpec(settings, { resolvePaths: false, preserveRelativePaths: true }).args;
  assert.equal(args.includes('--unsafe'), false, 'a no-op save does not enable unsafe mode');
  assert.equal(args.includes('--yolo'), false);
});

test('P90: a diverted numeric occurrence still counts as a duplicate', () => {
  // yargs makes `--commandTimeout bad --commandTimeout 5` the array ['bad', 5], which the
  // server ignores (not a number). Counting only the representable occurrence modeled it as a
  // plain `--commandTimeout 5`, and the builder then stripped the preserved malformed copy --
  // changing a launch that ran on the default timeout into one that applies 5.
  const { settings, extraArgs } = parseServerArgs(['--commandTimeout', 'bad', '--commandTimeout', '5']);
  assert.equal(settings.commandTimeout, undefined, 'neither value is modeled');
  assert.deepEqual(extraArgs, ['--commandTimeout', 'bad', '--commandTimeout', '5']);
});

test('P90: the duplicate pair survives a no-op save intact', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest', '--commandTimeout', 'bad', '--commandTimeout', '5'],
  });
  const args = buildLaunchSpec(settings, { resolvePaths: false, preserveRelativePaths: true }).args;
  assert.deepEqual(
    args.filter((a) => a === '--commandTimeout' || a === 'bad' || a === '5'),
    ['--commandTimeout', 'bad', '--commandTimeout', '5'],
    'both occurrences round-trip in order',
  );
});

test('P90: a single diverted numeric value is still preserved, not flagged', () => {
  const { settings, extraArgs } = parseServerArgs(['--commandTimeout', 'bad']);
  assert.equal(settings.commandTimeout, undefined);
  assert.deepEqual(extraArgs, ['--commandTimeout', 'bad'], 'unchanged single-occurrence behavior');
});

test('P91: a url with surrounding whitespace is decomposed like the save path does', () => {
  const { settings } = parseMcpEntry({ type: 'http', url: '  http://gateway.example:8443/mcp ' });
  assert.equal(settings.transportHost, 'gateway.example', 'the host is modeled, not the default');
  assert.equal(settings.transportPort, 8443);
  assert.equal(settings.transportUrl, 'http://gateway.example:8443/mcp', 'stored trimmed');
});

test('P92: a url with a VS Code variable in its authority is not decomposed', () => {
  // The colon inside `${input:...}` is not the host/port delimiter, and the real values are
  // unknown until launch. Splitting it produced host `${input` and let a save rewrite the URL
  // as `http://${input:9444/mcp`, destroying both the variable and the endpoint.
  for (const url of ['http://${input:host}:8080/mcp', 'http://host:${input:port}/mcp']) {
    assert.equal(parseHttpUrl(url), undefined, `${url} is undecomposable`);
    const { settings, notes } = parseMcpEntry({ type: 'http', url });
    assert.equal(settings.transportUrl, url, 'the URL is retained verbatim');
    assert.equal(settings.transportHost, defaults().transportHost, 'host stays at the default');
    assert.ok(
      notes.some((n) => /cannot be represented by the host and port fields/.test(n)),
      'the preserve-as-is note is shown',
    );
  }
  // A plain URL is still decomposed normally.
  assert.deepEqual(parseHttpUrl('http://host:8080/mcp'), { host: 'host', port: 8080 });
});

test('P88: a network entry with no usable url gets a keep-as-is note', () => {
  const { settings, notes } = parseMcpEntry({ type: 'http' });
  assert.equal(settings.transportMode, 'http');
  assert.ok(
    notes.some((n) => /no usable url/.test(n)),
    'the note explains the entry is kept as-is',
  );
});

test('P79: a safety flag after `--` is positional and is not a conflict', () => {
  // yargs runs ['--unsafe','--','--yolo'] in unsafe mode: the token after the separator is a
  // positional and never defines `yolo`. Treating it as a conflict left the form on `safe`
  // while the server ran unsafe.
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest', '--unsafe', '--', '--yolo'],
  });
  assert.equal(settings.safetyMode, 'unsafe', 'the real safety mode is modeled');
  assert.deepEqual(settings.extraArgs, ['--', '--yolo'], 'the positionals round-trip verbatim');
});

test('P79: both safety flags BEFORE `--` are still a preserved conflict', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest', '--unsafe', '--yolo', '--', 'x'],
  });
  assert.equal(settings.safetyMode, 'safe', 'a server-rejected pair is not collapsed to one mode');
  assert.deepEqual(settings.extraArgs, ['--unsafe', '--yolo', '--', 'x']);
});

test('P15: parseMcpEntry keeps a custom wrapper option that collides with a wcli0 flag', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'mywrapper',
    args: ['--config', 'wrapper.json', 'wcli0', '--shell', 'cmd'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.equal(settings.customCommand, 'mywrapper');
  // The wrapper's own --config stays in customArgs; only --shell is a wcli0 flag.
  assert.deepEqual(settings.customArgs, ['--config', 'wrapper.json', 'wcli0']);
  assert.equal(settings.configFile, '');
  assert.equal(settings.shell, 'cmd');
});

test('P15: a custom suffix with a trailing extra arg still splits at the wcli0 flags', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'mywrapper',
    args: ['wcli0', '--shell', 'cmd', '--unknownFlag'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.deepEqual(settings.customArgs, ['wcli0']);
  assert.equal(settings.shell, 'cmd');
  assert.deepEqual(settings.extraArgs, ['--unknownFlag']);
});

test('P24: a custom suffix ending in a valued extraArg still parses the modeled flags', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'mywrapper',
    args: ['wcli0', '--shell', 'cmd', '--futureFlag', 'x'],
  });
  assert.equal(settings.launchMethod, 'custom');
  // The trailing `--futureFlag x` is a valued extraArg, not a launcher positional, so the
  // split stays at --shell: the launcher keeps only `wcli0`, --shell is modeled, and the
  // unrecognized flag and its value round-trip verbatim in extraArgs.
  assert.deepEqual(settings.customArgs, ['wcli0']);
  assert.equal(settings.shell, 'cmd');
  assert.deepEqual(settings.extraArgs, ['--futureFlag', 'x']);
});

test('P24: a non-trailing bare token still keeps a launcher positional out of the flags', () => {
  // `repo` follows the unrecognized --from but is NOT the last token, so it is a launcher
  // positional (uvx's package) and must stay in customArgs, not be eaten as --from's value.
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'uvx',
    args: ['--from', 'repo', 'wcli0', '--shell', 'cmd'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.deepEqual(settings.customArgs, ['--from', 'repo', 'wcli0']);
  assert.equal(settings.shell, 'cmd');
  assert.deepEqual(settings.extraArgs, []);
});

test('parseMcpEntry parses an http entry url', () => {
  const { settings } = parseMcpEntry({ type: 'http', url: 'http://127.0.0.1:9444/mcp' });
  assert.equal(settings.transportMode, 'http');
  assert.equal(settings.transportHost, '127.0.0.1');
  assert.equal(settings.transportPort, 9444);
});

test('parseMcpEntry parses an sse entry with a bracketed IPv6 host', () => {
  const { settings } = parseMcpEntry({ type: 'sse', url: 'http://[::1]:8080/sse' });
  assert.equal(settings.transportMode, 'sse');
  assert.equal(settings.transportHost, '[::1]');
  assert.equal(settings.transportPort, 8080);
});

test('P8: parseMcpEntry keeps a valid default port and preserves a default-port url', () => {
  const { settings, notes } = parseMcpEntry({
    type: 'http',
    url: 'https://gateway.example/custom/mcp',
  });
  assert.equal(settings.transportMode, 'http');
  assert.equal(settings.transportHost, 'gateway.example');
  // The URL omits an explicit port; the form keeps its default port (a valid min=1
  // value) rather than rendering an invalid 0 that would block Save (P8).
  assert.equal(settings.transportPort, 9444);
  // The verbatim URL is retained so a save round-trips the custom scheme/path and the
  // default port instead of downgrading to http://host:9444/mcp.
  assert.equal(settings.transportUrl, 'https://gateway.example/custom/mcp');
  assert.ok(notes.some((n) => /does not specify a port/.test(n)));
});

test('P21: parseMcpEntry reads host/port past URL userinfo credentials', () => {
  const { settings } = parseMcpEntry({
    type: 'http',
    url: 'https://user:pass@example.com:9444/mcp',
  });
  // The userinfo (user:pass@) is skipped, so the real host and explicit port are read.
  assert.equal(settings.transportHost, 'example.com');
  assert.equal(settings.transportPort, 9444);
  assert.equal(settings.transportUrl, 'https://user:pass@example.com:9444/mcp');
});

test('P-port0: parseHttpUrl distinguishes an omitted port from an explicit :0', () => {
  // An omitted port is reported as undefined (scheme default); an explicit :0 is a real
  // (unusable) port, so the two must not collapse to the same sentinel.
  assert.equal(parseHttpUrl('https://gateway.example/custom/mcp').port, undefined);
  assert.equal(parseHttpUrl('http://host:0/mcp').port, 0);
  assert.equal(parseHttpUrl('http://host:9444/mcp').port, 9444);
});

test('P66: parseHttpUrl reports an explicit non-numeric port as NaN, not omitted', () => {
  // An explicit but malformed port (`:abc`, `:-1`) must NOT collapse to the omitted-port
  // sentinel (undefined). Reporting it as NaN keeps the host modeled while marking the port
  // unusable, so the save path rebuilds the canonical URL from the port field instead of
  // preserving the malformed URL as if it were a default-port one a port edit cannot fix.
  assert.ok(Number.isNaN(parseHttpUrl('http://host:abc/mcp').port));
  assert.ok(Number.isNaN(parseHttpUrl('http://host:-1/mcp').port));
  assert.equal(parseHttpUrl('http://host:abc/mcp').host, 'host');
  // An omitted port is still undefined, and a valid numeric port is unaffected.
  assert.equal(parseHttpUrl('http://host/mcp').port, undefined);
  assert.equal(parseHttpUrl('http://host:8080/mcp').port, 8080);
});

test('P-port0: parseMcpEntry does not preserve an explicit :0 url as a default-port url', () => {
  const { settings, notes } = parseMcpEntry({ type: 'http', url: 'http://host:0/mcp' });
  assert.equal(settings.transportMode, 'http');
  // The host is modeled, but the port field cannot hold 0 (min=1), so it keeps the default.
  assert.equal(settings.transportHost, 'host');
  assert.equal(settings.transportPort, 9444);
  // A note explains the unusable port is rebuilt on save, not preserved verbatim.
  assert.ok(notes.some((n) => /not a usable port/.test(n)));
});

test('P-portmax: parseMcpEntry keeps the default port for an out-of-range url port (>65535)', () => {
  // A port above 65535 cannot be held by the form's number input (max=65535); loading it
  // verbatim would strand the form in an invalid state and block unrelated saves. It is
  // treated like the unusable :0 case: the host is modeled, the port keeps the form default,
  // and a note explains the canonical URL is rebuilt on save.
  const { settings, notes } = parseMcpEntry({ type: 'http', url: 'http://localhost:70000/mcp' });
  assert.equal(settings.transportMode, 'http');
  assert.equal(settings.transportHost, 'localhost');
  assert.equal(settings.transportPort, 9444, 'keeps the form default rather than the unusable 70000');
  assert.ok(notes.some((n) => /not a usable port/.test(n)));
});

test('P66: parseMcpEntry treats a non-numeric url port as unusable, not omitted', () => {
  // A non-numeric port (`:abc`) must be handled like the unusable :0/:70000 cases: model the
  // host, keep the form default port, and note that the canonical URL is rebuilt on save — not
  // classified as a default-port URL preserved verbatim (which a port edit could never fix).
  const { settings, notes } = parseMcpEntry({ type: 'http', url: 'http://host:abc/mcp' });
  assert.equal(settings.transportMode, 'http');
  assert.equal(settings.transportHost, 'host');
  assert.equal(settings.transportPort, 9444, 'keeps the form default rather than the malformed port');
  assert.ok(notes.some((n) => /not a usable port/.test(n)));
  // The note distinguishes the malformed port from an out-of-range numeric one.
  assert.ok(notes.some((n) => /non-numeric port/.test(n)));
});

test('P-wrapperflags: a wrapper command keeps flag-only args in the launcher portion', () => {
  // `mywrapper --transport fast` is the wrapper's own option, not a wcli0 flag; with no
  // launcher positional before it there is no unambiguous server-flag boundary, so it must
  // stay in customArgs rather than be misread as wcli0's transport setting.
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'mywrapper',
    args: ['--transport', 'fast'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.equal(settings.customCommand, 'mywrapper');
  assert.deepEqual(settings.customArgs, ['--transport', 'fast']);
  // None of it leaked into wcli0 settings.
  assert.equal(settings.transportMode, 'stdio');
});

test('P-wrapperflags: a wrapper --config option is not parsed as wcli0.configFile', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'mywrapper',
    args: ['--config', 'wrapper.json'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.deepEqual(settings.customArgs, ['--config', 'wrapper.json']);
  assert.equal(settings.configFile, '');
});

test('P-wrapperflags: an index-0 server-flag run IS trusted when the command is wcli0', () => {
  // Running the wcli0 binary directly: its args really are server flags, so they are modeled.
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: '/usr/local/bin/wcli0',
    args: ['--shell', 'cmd'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.deepEqual(settings.customArgs, []);
  assert.equal(settings.shell, 'cmd');
});

test('P10: parseMcpEntry preserves a socket url it cannot decompose', () => {
  const { settings, notes } = parseMcpEntry({
    type: 'http',
    url: 'unix:///tmp/server.sock#/mcp',
  });
  assert.equal(settings.transportMode, 'http');
  // The host/port fields cannot model a socket URL, so they stay at their defaults...
  assert.equal(settings.transportHost, '127.0.0.1');
  assert.equal(settings.transportPort, 9444);
  // ...but the verbatim URL is retained so an unrelated save does not rewrite it.
  assert.equal(settings.transportUrl, 'unix:///tmp/server.sock#/mcp');
  assert.ok(notes.some((n) => /cannot be represented/.test(n)));
});

test('P5: parseMcpEntry does not note a canonical http url but still preserves it', () => {
  const { settings, notes } = parseMcpEntry({ type: 'http', url: 'http://127.0.0.1:9444/mcp' });
  assert.equal(settings.transportUrl, 'http://127.0.0.1:9444/mcp');
  assert.equal(notes.length, 0);
});

test('parseMcpEntry notes a referenced --config file', () => {
  const { settings, notes } = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest', '--config', '/ws/wcli0.config.json'],
  });
  assert.equal(settings.configFile, '/ws/wcli0.config.json');
  assert.ok(notes.some((n) => /--config/.test(n)));
});

// ---- round trip ----------------------------------------------------------

test('buildLaunchSpec -> parseMcpEntry round-trips modeled stdio fields', () => {
  const s = defaults({
    packageSpec: 'wcli0@2.0.0',
    shell: 'powershell',
    allowedDirectories: ['/abs/one', '/abs/two'],
    commandTimeout: 45,
    maxCommandLength: 9000,
    safetyMode: 'yolo',
    debug: true,
  });
  const spec = buildLaunchSpec(s, { resolvePaths: false });
  const entry = { type: 'stdio', command: spec.command, args: spec.args };
  const { settings } = parseMcpEntry(entry);
  assert.equal(settings.launchMethod, 'npx');
  assert.equal(settings.packageSpec, 'wcli0@2.0.0');
  assert.equal(settings.shell, 'powershell');
  assert.deepEqual(settings.allowedDirectories, ['/abs/one', '/abs/two']);
  assert.equal(settings.commandTimeout, 45);
  assert.equal(settings.maxCommandLength, 9000);
  assert.equal(settings.safetyMode, 'yolo');
  assert.equal(settings.debug, true);
});

test('buildLaunchSpec -> parseMcpEntry round-trips an http endpoint via its url', () => {
  // A real http server in mcp.json is { type, url }, not a stdio entry carrying transport
  // flags. Round-trip the URL representation (host/port are recovered from it).
  const { settings } = parseMcpEntry({ type: 'http', url: 'http://127.0.0.1:7777/mcp' });
  assert.equal(settings.transportMode, 'http');
  assert.equal(settings.transportHost, '127.0.0.1');
  assert.equal(settings.transportPort, 7777);
});

// ---- P30: transport flags must not override a stdio entry's type ------------------

test('P30: a stdio entry with --transport http keeps stdio and preserves the flag', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest', '--transport', 'http', '--http-port', '7777'],
  });
  // The authoritative `type` wins: transportMode stays stdio, and the transport flags
  // round-trip verbatim in extraArgs instead of flipping the type / dropping the launcher.
  assert.equal(settings.transportMode, 'stdio');
  assert.equal(settings.launchMethod, 'npx');
  assert.deepEqual(settings.extraArgs, ['--transport', 'http', '--http-port', '7777']);
});

// ---- P31: unrecognized transport type ---------------------------------------------

test('P31: an uppercase HTTP type is modeled as http, not coerced to stdio', () => {
  const { settings } = parseMcpEntry({ type: 'HTTP', url: 'http://127.0.0.1:9444/mcp' });
  assert.equal(settings.transportMode, 'http');
  assert.equal(settings.transportHost, '127.0.0.1');
});

test('P31: an unrecognized type is noted and parsed as stdio', () => {
  const { settings, notes } = parseMcpEntry({
    type: 'websocket',
    command: 'npx',
    args: ['-y', 'wcli0@latest', '--shell', 'cmd'],
  });
  assert.equal(settings.transportMode, 'stdio');
  assert.equal(settings.shell, 'cmd');
  assert.ok(notes.some((n) => /websocket/.test(n)), 'notes the unmodeled type');
});

// ---- P32: short-form config alias -------------------------------------------------

test('P32: the -c short alias is recognized like --config', () => {
  const { settings, notes } = parseMcpEntry({
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest', '-c', '/ws/wcli0.config.json', '--shell', 'cmd'],
  });
  assert.equal(settings.configFile, '/ws/wcli0.config.json');
  assert.ok(notes.some((n) => /--config/.test(n)), 'still emits the config-file note');
  assert.equal(settings.shell, 'cmd');
});

test('P32: the attached -c=value and --c=value forms are recognized', () => {
  const a = parseMcpEntry({ type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest', '-c=/ws/a.json'] });
  const b = parseMcpEntry({ type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest', '--c=/ws/b.json'] });
  assert.equal(a.settings.configFile, '/ws/a.json');
  assert.equal(b.settings.configFile, '/ws/b.json');
});

// ---- P33: non-string args are stringified, not dropped ----------------------------

test('P33: a numeric arg is stringified rather than coerced to empty', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'node',
    args: ['--inspect', 9229, 'dist/index.js'],
  });
  // node-with-options parses as custom; 9229 round-trips as "9229", not "".
  assert.equal(settings.launchMethod, 'custom');
  assert.deepEqual(settings.customArgs, ['--inspect', '9229', 'dist/index.js']);
});

// ---- P34: an unparseable numeric flag round-trips via extraArgs -------------------

test('P34: an invalid numeric value falls through to extraArgs instead of blocking saves', () => {
  const { settings, extraArgs } = parseServerArgs(['--commandTimeout', 'abc', '--shell', 'cmd']);
  // The unparseable value is not stored in the typed field; both tokens survive verbatim.
  assert.equal(settings.commandTimeout, undefined);
  assert.deepEqual(extraArgs, ['--commandTimeout', 'abc']);
  assert.equal(settings.shell, 'cmd');
});

// ---- P59: an out-of-range log limit round-trips via extraArgs ----------------------

test('P59: a finite out-of-range maxReturnLines falls through to extraArgs', () => {
  // The server applies any CLI maxReturnLines > 0 (applyCliLogging, no re-validation), but the
  // typed field's bound (1..10000, integer) cannot hold 50000 and validateLaunchSpec would
  // refuse it. maxReturnLines has no form control, so modeling it would strand every save;
  // preserve it verbatim instead. Both the space-separated and attached forms divert.
  const a = parseServerArgs(['--maxReturnLines', '50000', '--shell', 'cmd']);
  assert.equal(a.settings.maxReturnLines, undefined);
  assert.deepEqual(a.extraArgs, ['--maxReturnLines', '50000']);
  assert.equal(a.settings.shell, 'cmd');

  const b = parseServerArgs(['--max-return-lines=0']);
  assert.equal(b.settings.maxReturnLines, undefined);
  assert.deepEqual(b.extraArgs, ['--max-return-lines=0']);

  // An in-range value is still modeled into the typed field so the form stays editable.
  const c = parseServerArgs(['--maxReturnLines', '200']);
  assert.equal(c.settings.maxReturnLines, 200);
  assert.deepEqual(c.extraArgs, []);
});

test('P59: a finite out-of-range maxOutputLines falls through to extraArgs', () => {
  const a = parseServerArgs(['--maxOutputLines', '50000']);
  assert.equal(a.settings.maxOutputLines, undefined);
  assert.deepEqual(a.extraArgs, ['--maxOutputLines', '50000']);

  // A fractional value in range is accepted by the field (validateLoggingConfig allows it).
  const b = parseServerArgs(['--maxOutputLines', '1.5']);
  assert.equal(b.settings.maxOutputLines, 1.5);
  assert.deepEqual(b.extraArgs, []);
});

// ---- P64: a non-positive security limit round-trips via extraArgs ------------------

test('P64: a non-positive commandTimeout/maxCommandLength falls through to extraArgs', () => {
  // The server ignores a non-positive commandTimeout/maxCommandLength and runs on its default,
  // but the form's number input rejects negatives and validateLaunchSpec blocks any value <= 0.
  // Modeling it would strand every save; preserve it verbatim so an unrelated edit round-trips
  // the existing entry. Both the space-separated and attached forms divert.
  const a = parseServerArgs(['--commandTimeout', '0', '--shell', 'cmd']);
  assert.equal(a.settings.commandTimeout, undefined);
  assert.deepEqual(a.extraArgs, ['--commandTimeout', '0']);
  assert.equal(a.settings.shell, 'cmd');

  const b = parseServerArgs(['--maxCommandLength=-1']);
  assert.equal(b.settings.maxCommandLength, undefined);
  assert.deepEqual(b.extraArgs, ['--maxCommandLength=-1']);

  // A positive value is still modeled into the typed field so the form stays editable.
  const c = parseServerArgs(['--commandTimeout', '30']);
  assert.equal(c.settings.commandTimeout, 30);
  assert.deepEqual(c.extraArgs, []);
});

// ---- P42: multiple unknown value-bearing extras in the suffix ---------------------

test('P42: a suffix with several valued extras still recovers the modeled flags', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'wcli0',
    args: ['--shell', 'cmd', '--future', 'x', '--another', 'y'],
  });
  // The modeled --shell is recovered (not stranded in customArgs), and every unknown
  // flag/value pair round-trips in extraArgs.
  assert.equal(settings.launchMethod, 'custom');
  assert.deepEqual(settings.customArgs, []);
  assert.equal(settings.shell, 'cmd');
  assert.deepEqual(settings.extraArgs, ['--future', 'x', '--another', 'y']);
});

// ---- P43: keep scanning past an ambiguous leading wrapper flag --------------------

test('P43: a wrapper flag before the modeled flags still recovers the server suffix', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'wrapper',
    args: ['--no-cache', '--shell', 'bash'],
  });
  assert.equal(settings.launchMethod, 'custom');
  // The index-0 run is ambiguous for a non-wcli0 command, but instead of stranding the whole
  // argv in the launcher the scan continues and splits at --shell: --no-cache stays in
  // customArgs and --shell is modeled (so a shell edit replaces it, not appends a second).
  assert.deepEqual(settings.customArgs, ['--no-cache']);
  assert.equal(settings.shell, 'bash');
  assert.deepEqual(settings.extraArgs, []);
});

test('P43: a leading colliding wrapper flag still keeps a later modeled flag editable', () => {
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'wrapper',
    args: ['--config', 'wrapper.json', '--shell', 'cmd'],
  });
  // The wrapper's own --config stays in customArgs (not misread as wcli0.configFile), while
  // the later --shell is modeled.
  assert.deepEqual(settings.customArgs, ['--config', 'wrapper.json']);
  assert.equal(settings.configFile, '');
  assert.equal(settings.shell, 'cmd');
});

// ---- P56: an unknown-only wrapper suffix stays with the launcher ------------------

test('P56: an unknown-only wrapper suffix after a positional stays in customArgs', () => {
  // `wrapper target --verbose`: --verbose is the wrapper's own option and the suffix carries no
  // modeled wcli0 flag, so it must stay in customArgs. Moving it into extraArgs would reorder it
  // after the generated server flags on a later save (target --shell cmd --verbose), changing
  // the wrapper invocation.
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'wrapper',
    args: ['target', '--verbose'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.deepEqual(settings.customArgs, ['target', '--verbose']);
  assert.deepEqual(settings.extraArgs, []);
});

test('P56: a wrapper suffix with a modeled flag among unknown flags still splits', () => {
  // Evidence of a modeled flag (--shell) means the suffix IS wcli0's, so it is still recovered
  // even when an unknown flag precedes it; only the truly unknown-only suffix stays put.
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'wrapper',
    args: ['target', '--verbose', '--shell', 'cmd'],
  });
  assert.deepEqual(settings.customArgs, ['target']);
  assert.equal(settings.shell, 'cmd');
  assert.deepEqual(settings.extraArgs, ['--verbose']);
});

test('P56: the wcli0 binary still models an unknown-only arg run as extraArgs', () => {
  // For the wcli0 binary the index-0 run is genuinely wcli0's, so an unknown-only flag is a
  // legitimate extraArg, not a launcher positional — requireModeled does not apply.
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: '/usr/local/bin/wcli0',
    args: ['--verbose'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.deepEqual(settings.customArgs, []);
  assert.deepEqual(settings.extraArgs, ['--verbose']);
});

// ---- P44: a value option followed by another flag must not swallow it -------------

test('P44: a value option followed by another flag preserves both', () => {
  const { settings, extraArgs } = parseServerArgs(['--blockedCommand', '--debug']);
  // --blockedCommand has no value (next token is a flag): it round-trips verbatim and --debug
  // is still applied, instead of modeling blockedCommands=['--debug'] and dropping debug.
  assert.equal(settings.debug, true);
  assert.equal(settings.blockedCommands, undefined);
  assert.deepEqual(extraArgs, ['--blockedCommand']);
});

// ---- P45: bundled -c config alias forms ------------------------------------------

test('P45: bundled short config aliases are modeled as configFile', () => {
  // -c with an attached value, and the c alias bundled with other letters (value attached
  // or as the next token) — all set the server's config, mirroring stripConfigArgs.
  assert.equal(parseServerArgs(['-c/ws/a.json']).settings.configFile, '/ws/a.json');
  assert.equal(parseServerArgs(['-xc', '/ws/b.json']).settings.configFile, '/ws/b.json');
  assert.equal(parseServerArgs(['-xc/ws/c.json']).settings.configFile, '/ws/c.json');
});

test('P62: a short bundle yargs would NOT read as config is preserved, not fabricated', () => {
  // yargs (config alias `c`, default parser) only attaches a single-dash bundle remainder as
  // the config string when it is fully numeric or starts with a non-word, non-dot path char.
  // A word-character start parses as separate short boolean flags (`-cfoo` => -c -f -o -o,
  // config=""), and a leading `.` as a dot-notation object — never as the literal remainder.
  // Modeling those as configFile would fabricate a path the server never used and let a no-op
  // save emit a spurious `--config <value>`, so they must round-trip verbatim in extraArgs.
  for (const bundle of ['-cfoo', '-cX', '-cfoo.json', '-cC:/x.json', '-c.foo', '-c.config.json']) {
    const { settings, extraArgs } = parseServerArgs([bundle]);
    assert.equal(settings.configFile, undefined, `${bundle} must not set configFile`);
    assert.deepEqual(extraArgs, [bundle], `${bundle} must round-trip verbatim`);
  }

  // The shapes yargs DOES read as config still resolve (path separator start, or numeric).
  assert.equal(parseServerArgs(['-c/etc/x.json']).settings.configFile, '/etc/x.json');
  assert.equal(parseServerArgs(['-c~/x.json']).settings.configFile, '~/x.json');
  assert.equal(parseServerArgs(['-c123']).settings.configFile, '123');
});

// ---- P47: yargs kebab-case option aliases ----------------------------------------

test('P47: kebab-case option aliases are modeled like their camelCase forms', () => {
  const { settings } = parseServerArgs([
    '--max-command-length', '1000',
    '--blocked-command', 'rm',
    '--allow-all-dirs',
    '--no-enable-truncation',
  ]);
  assert.equal(settings.maxCommandLength, 1000);
  assert.deepEqual(settings.blockedCommands, ['rm']);
  assert.equal(settings.allowAllDirs, true);
  assert.equal(settings.enableTruncation, 'disabled');
});

// ---- P74-P78: the `--` separator, attached/transport suffix evidence, duplicate scalars ----

test('P74: parseServerArgs preserves the `--` separator and the remainder verbatim', () => {
  // yargs treats every token after `--` as a positional, not an option, so `-- --shell cmd` must
  // NOT be modeled as shell=cmd. The parser preserves `--` and everything after it in extraArgs.
  const a = parseServerArgs(['--', '--shell', 'cmd']);
  assert.equal(a.settings.shell, undefined, '--shell after -- is a positional, not modeled');
  assert.deepEqual(a.extraArgs, ['--', '--shell', 'cmd']);

  // Flags BEFORE the separator are still modeled; only the post-`--` remainder is preserved.
  const b = parseServerArgs(['--debug', '--', '--shell', 'cmd', '--maxCommandLength', '10']);
  assert.equal(b.settings.debug, true);
  assert.equal(b.settings.shell, undefined);
  assert.equal(b.settings.maxCommandLength, undefined);
  assert.deepEqual(b.extraArgs, ['--', '--shell', 'cmd', '--maxCommandLength', '10']);
});

test('P74: a plain node entry does not model server flags after a `--` separator', () => {
  // `node dist/index.js -- --shell cmd`: yargs leaves `--shell`/`cmd` positional, so a no-op save
  // must not re-emit an active `--shell cmd` that changes the launch behavior.
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'node',
    args: ['dist/index.js', '--', '--shell', 'cmd'],
  });
  assert.equal(settings.launchMethod, 'node');
  assert.equal(settings.nodeScriptPath, 'dist/index.js');
  assert.equal(settings.shell, 'all', 'shell stays at its default, not cmd');
  assert.deepEqual(settings.extraArgs, ['--', '--shell', 'cmd']);
});

test('P75: a `--` separator keeps the remainder with the launcher, not a server suffix', () => {
  // `command: "wcli0", args: ["--", "--debug"]`: yargs treats `--debug` as a positional after the
  // separator, so the suffix scan must not split it out and let a no-op save enable debug.
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'wcli0',
    args: ['--', '--debug'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.equal(settings.customCommand, 'wcli0');
  assert.deepEqual(settings.customArgs, ['--', '--debug']);
  assert.equal(settings.debug, false, 'debug stays default; --debug after -- is positional');
  assert.deepEqual(settings.extraArgs, []);
});

test('P76: an attached boolean flag proves a wcli0 server suffix for a wrapper', () => {
  // For a wrapper command, the suffix detector must recognize an attached boolean assignment
  // (`--debug=true`, `--enableTruncation=false`) as a modeled wcli0 flag; otherwise it stays in
  // customArgs, the form shows the default, and a save cannot edit it.
  const a = parseMcpEntry({
    type: 'stdio',
    command: 'wrapper',
    args: ['target', '--debug=true'],
  }).settings;
  assert.equal(a.launchMethod, 'custom');
  assert.deepEqual(a.customArgs, ['target']);
  assert.equal(a.debug, true);
  assert.deepEqual(a.extraArgs, []);

  const b = parseMcpEntry({
    type: 'stdio',
    command: 'wrapper',
    args: ['target', '--enableTruncation=false'],
  }).settings;
  assert.deepEqual(b.customArgs, ['target']);
  assert.equal(b.enableTruncation, 'disabled');
});

test('P77: a stdio transport flag does not prove a wcli0 server suffix', () => {
  // In a stdio entry the transport flags are not modeled (the entry's `type` is authoritative), so
  // a wrapper's trailing `--transport fast` must not be split out as a server suffix and reordered
  // before the wrapper's options on save. With no modeled wcli0 flag present it stays in customArgs.
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'wrapper',
    args: ['target', '--transport', 'fast'],
  });
  assert.equal(settings.launchMethod, 'custom');
  assert.deepEqual(settings.customArgs, ['target', '--transport', 'fast']);
  assert.equal(settings.transportMode, 'stdio');
  assert.deepEqual(settings.extraArgs, []);
});

test('P77: a real wcli0 flag still splits a wrapper suffix that also carries a transport flag', () => {
  // When the suffix DOES contain a modeled wcli0 flag (--shell), the split is legitimate; the
  // transport flag rides along in extraArgs verbatim rather than flipping the stdio transport.
  const { settings } = parseMcpEntry({
    type: 'stdio',
    command: 'wrapper',
    args: ['target', '--shell', 'cmd', '--transport', 'fast'],
  });
  assert.deepEqual(settings.customArgs, ['target']);
  assert.equal(settings.shell, 'cmd');
  assert.equal(settings.transportMode, 'stdio');
  assert.deepEqual(settings.extraArgs, ['--transport', 'fast']);
});

test('P78: a repeated scalar option is preserved verbatim, not collapsed last-wins', () => {
  // yargs parses `--config a --config b` as config=['a','b'] and `--shell cmd --shell bash` as an
  // array too, which the single-value fields cannot represent. Collapsing to the last value on a
  // no-op save would silently change the launch, so every occurrence round-trips in extraArgs.
  const a = parseServerArgs(['--config', 'a', '--config', 'b']);
  assert.equal(a.settings.configFile, undefined, 'duplicate --config is not modeled');
  assert.deepEqual(a.extraArgs, ['--config', 'a', '--config', 'b']);

  const b = parseServerArgs(['--shell', 'cmd', '--shell', 'bash']);
  assert.equal(b.settings.shell, undefined);
  assert.deepEqual(b.extraArgs, ['--shell', 'cmd', '--shell', 'bash']);

  // Mixed forms and yargs kebab/camel aliases that resolve to the same key are also duplicates.
  const c = parseServerArgs(['--config', 'a', '--config=b']);
  assert.equal(c.settings.configFile, undefined);
  assert.deepEqual(c.extraArgs, ['--config', 'a', '--config=b']);

  const d = parseServerArgs(['--maxCommandLength', '100', '--max-command-length', '200']);
  assert.equal(d.settings.maxCommandLength, undefined);
  assert.deepEqual(d.extraArgs, ['--maxCommandLength', '100', '--max-command-length', '200']);
});

test('P78: a single scalar occurrence is still modeled, and array options still accumulate', () => {
  // The duplicate guard must not regress the normal single-value case...
  const a = parseServerArgs(['--config', 'a', '--shell', 'bash']);
  assert.equal(a.settings.configFile, 'a');
  assert.equal(a.settings.shell, 'bash');
  assert.deepEqual(a.extraArgs, []);

  // ...nor the array-kind options, which legitimately repeat and accumulate into a list.
  const b = parseServerArgs(['--allowedDir', '/a', '--allowedDir', '/b']);
  assert.deepEqual(b.settings.allowedDirectories, ['/a', '/b']);
  assert.deepEqual(b.extraArgs, []);
});
