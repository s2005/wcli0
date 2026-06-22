const test = require('node:test');
const assert = require('node:assert/strict');

const vscode = require('../stubs/vscode.cjs');
const {
  generateConfigFile,
  writeWorkspaceMcpJson,
  writeMcpJsonFromSettings,
  showLaunchCommand,
  refreshServerDefinition,
  parseJsonc,
} = require('../../dist/commands.js');
const { defaultSettings } = require('../../dist/settings.js');

const WS = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];

test.beforeEach(() => {
  vscode.__reset();
  vscode.__state.workspaceFolders = WS;
});

test('generateConfigFile writes JSON and sets configFile when chosen', async () => {
  const target = vscode.Uri.file('/ws/wcli0.config.json');
  vscode.__state.calls.saveDialog = target;
  vscode.__state.calls.infoReturn = 'Set wcli0.configFile';

  await generateConfigFile();

  const written = vscode.__state.files.get('/ws/wcli0.config.json');
  assert.ok(written, 'config file was written');
  const parsed = JSON.parse(written.toString('utf8'));
  assert.ok(parsed.global && parsed.shells, 'has global + shells');
  assert.equal(vscode.__state.calls.shownDocs.length, 1);
  // configFile setting points at the saved file as a portable workspace-relative path.
  assert.equal(
    vscode.workspace.getConfiguration('wcli0').get('configFile', ''),
    '${workspaceFolder}/wcli0.config.json',
  );
});

test('generateConfigFile is a no-op when the save dialog is cancelled', async () => {
  vscode.__state.calls.saveDialog = undefined;
  await generateConfigFile();
  assert.equal(vscode.__state.files.size, 0);
});

test('P75: generateConfigFile refuses settings the server would silently drop', async () => {
  // 0.5 is dropped by buildConfigFile (the server rejects < 1), so the generated
  // file would not match the requested timeout; generation must refuse and explain.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.commandTimeout', 0.5);
  vscode.__state.calls.saveDialog = vscode.Uri.file('/ws/wcli0.config.json');
  await generateConfigFile();
  assert.equal(vscode.__state.files.has('/ws/wcli0.config.json'), false);
  assert.ok(vscode.__state.calls.error.some((m) => /commandTimeout/i.test(m)));
});

test('P75: generateConfigFile ignores launch-method problems (the file carries no launch)', async () => {
  // A node launch with no script path is a launch-method problem, irrelevant to the
  // generated config content, so it must NOT block generation.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.method', 'node');
  vscode.__state.calls.saveDialog = vscode.Uri.file('/ws/wcli0.config.json');
  await generateConfigFile();
  assert.ok(vscode.__state.files.has('/ws/wcli0.config.json'), 'config written despite launch problem');
  assert.equal(vscode.__state.calls.error.length, 0);
});

test('P81: generateConfigFile is not blocked by a launch-only unresolved cwd', async () => {
  // No workspace open + an unresolved ${workspaceFolder} cwd and no per-shell relative
  // command that anchors to it: the cwd never reaches the file, so generation proceeds.
  vscode.__state.workspaceFolders = undefined;
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.cwd', '${workspaceFolder}/server');
  vscode.__state.calls.saveDialog = vscode.Uri.file('/tmp/wcli0.config.json');
  await generateConfigFile();
  assert.ok(vscode.__state.files.has('/tmp/wcli0.config.json'), 'config written despite launch-only cwd');
  assert.equal(vscode.__state.calls.error.length, 0);
});

test('P81: generateConfigFile still blocks when a per-shell relative command needs the cwd', async () => {
  // The relative per-shell command anchors to launch.cwd, so an unresolved cwd would
  // mis-anchor the emitted executable path — generation must refuse.
  vscode.__state.workspaceFolders = undefined;
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.cwd', '${workspaceFolder}/server');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shells', {
    cmd: { enabled: true, executable: { command: 'tools/sh' } },
  });
  vscode.__state.calls.saveDialog = vscode.Uri.file('/tmp/wcli0.config.json');
  await generateConfigFile();
  assert.equal(vscode.__state.files.has('/tmp/wcli0.config.json'), false);
  assert.ok(vscode.__state.calls.error.some((m) => /launch\.cwd/.test(m)));
});

test('P104: a masked per-shell relative command does not block config generation', async () => {
  // Same setup as the P81 blocking case, but the workspace opts out of inherited
  // per-shell config. buildConfigFile masks those shells, so the relative command never
  // reaches the file and the unresolved cwd is irrelevant — generation must proceed.
  vscode.__state.workspaceFolders = undefined;
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.cwd', '${workspaceFolder}/server');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shells', {
    cmd: { enabled: true, executable: { command: 'tools/sh' } },
  });
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.ignoreInheritedShells', true);
  vscode.__state.calls.saveDialog = vscode.Uri.file('/tmp/wcli0.config.json');
  await generateConfigFile();
  assert.ok(vscode.__state.files.has('/tmp/wcli0.config.json'), 'config written despite masked relative command');
  assert.equal(vscode.__state.calls.error.length, 0);
});

test('writeWorkspaceMcpJson creates a stdio server entry', async () => {
  await writeWorkspaceMcpJson();
  const raw = vscode.__state.files.get('/ws/.vscode/mcp.json');
  assert.ok(raw, 'mcp.json written');
  const parsed = JSON.parse(raw.toString('utf8'));
  assert.equal(parsed.servers.wcli0.type, 'stdio');
  assert.equal(parsed.servers.wcli0.command, 'npx');
});

test('P26/P73/P93: showLaunchCommand writes a separate display config, not the live managed one', async () => {
  const { Wcli0McpProvider } = require('../../dist/mcpProvider.js');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shells', { cmd: { enabled: true } });
  const output = vscode.window.createOutputChannel('t');
  const dir = path.join(
    os.tmpdir(),
    'wcli0-show-' + process.pid + '-' + Math.random().toString(36).slice(2),
  );
  const provider = new Wcli0McpProvider(() => {}, undefined, dir);
  await showLaunchCommand(output, provider);
  const text = output.lines.join('\n');
  const livePath = path.join(dir, 'managed-config.json');
  // P98: the display file name is content-derived (display-config-<hash>.json), never
  // the live managed config nor a single shared display path.
  const displayMatch = text.match(/display-config-[0-9a-f]+\.json/);
  assert.ok(displayMatch, 'shows a content-specific display config path');
  const displayPath = path.join(dir, displayMatch[0]);
  // P93: the shown command points at a display-only file, NOT the live managed
  // config the registered server launches from — so showing a scoped command
  // never overwrites the running server's config.
  assert.ok(text.includes(displayPath), 'shows the display config path');
  assert.ok(!text.includes(livePath), 'does not reference the live managed config');
  // P73: the display file is materialized so a copied command actually resolves it.
  assert.ok(fs.existsSync(displayPath), 'display config written to disk');
  // The live managed config is left untouched by a display action.
  assert.ok(!fs.existsSync(livePath), 'live managed config not written by show');
  const written = JSON.parse(fs.readFileSync(displayPath, 'utf8'));
  assert.equal(written.shells.cmd.enabled, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('showLaunchCommand notes that http mode cannot carry profiles instead of omitting them silently', async () => {
  // The auto-managed config is stdio-only, so an http command can't include profiles.
  // showLaunchCommand must say so explicitly rather than show a profile-less command.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.mode', 'http');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.profiles', {
    ora19: { env: { ORACLE_HOME: 'C:/oracle/19' } },
  });
  const output = vscode.window.createOutputChannel('t');
  await showLaunchCommand(output);
  const text = output.lines.join('\n');
  assert.match(text, /cannot be expressed in a http launch command/);
  assert.match(text, /wcli0\.profiles/);
});

test('P98: showing commands for different settings uses distinct display config files', async () => {
  const { Wcli0McpProvider } = require('../../dist/mcpProvider.js');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = path.join(
    os.tmpdir(),
    'wcli0-show98-' + process.pid + '-' + Math.random().toString(36).slice(2),
  );
  const provider = new Wcli0McpProvider(() => {}, undefined, dir);
  const displayPathFor = async () => {
    const output = vscode.window.createOutputChannel('t');
    await showLaunchCommand(output, provider);
    const m = output.lines.join('\n').match(/display-config-[0-9a-f]+\.json/);
    assert.ok(m, 'shows a content-specific display config path');
    return path.join(dir, m[0]);
  };

  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shells', { cmd: { enabled: true } });
  const first = await displayPathFor();
  const firstContent = fs.readFileSync(first, 'utf8');

  // Change settings and show again: a DIFFERENT file is written, so the first copied
  // command still resolves the config it displayed (it was not overwritten in place).
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shells', {
    cmd: { enabled: true, executable: { command: 'C:/custom/cmd.exe', args: ['/k'] } },
  });
  const second = await displayPathFor();
  assert.notEqual(first, second, 'distinct settings -> distinct display config files');
  assert.ok(fs.existsSync(first), 'first display config is still present');
  assert.equal(fs.readFileSync(first, 'utf8'), firstContent, 'first display config unchanged');

  // Re-showing the original settings reuses the same (content-derived) file name.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shells', { cmd: { enabled: true } });
  const third = await displayPathFor();
  assert.equal(third, first, 'identical settings -> identical display config file');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('P6: writeWorkspaceMcpJson refuses to export when shells are configured individually', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shells', {
    cmd: { executable: { command: 'cmd.exe', args: ['/k'] } },
  });
  await writeWorkspaceMcpJson();
  // No file written, and an explanatory error was shown (a stdio entry with only
  // CLI flags would silently drop the per-shell settings).
  assert.equal(vscode.__state.files.has('/ws/.vscode/mcp.json'), false);
  assert.ok(vscode.__state.calls.error.some((m) => /per-shell settings/i.test(m)));
});

test('writeWorkspaceMcpJson refuses to export when environment profiles are configured', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.profiles', {
    ora19: { env: { ORACLE_HOME: 'C:/oracle/19' } },
  });
  await writeWorkspaceMcpJson();
  // Profiles cannot be expressed as CLI flags, so no mcp.json is written and the
  // error explains why.
  assert.equal(vscode.__state.files.has('/ws/.vscode/mcp.json'), false);
  assert.ok(vscode.__state.calls.error.some((m) => /wcli0\.profiles/i.test(m)));
});

test('P110: ignoreInheritedProfiles unblocks the mcp.json export', async () => {
  // Inherited profiles would normally block the export, but the Workspace opt-out
  // masks them (hasProfilesConfig is false), so a plain stdio entry can be written.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.profiles', {
    ora19: { env: { ORACLE_HOME: 'C:/oracle/19' } },
  });
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.ignoreInheritedProfiles', true);
  await writeWorkspaceMcpJson();
  assert.ok(vscode.__state.files.has('/ws/.vscode/mcp.json'), 'export written with profiles masked');
  assert.equal(vscode.__state.calls.error.length, 0);
});

test('writeWorkspaceMcpJson exports profiles via a referenced loadable configFile after confirmation', async () => {
  // Profiles in settings normally block the export, but a referenced loadable
  // wcli0.configFile is pinned as --config and carries them. The export warns that the
  // file is not verified against settings, then proceeds once the user confirms.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.profiles', {
    ora19: { env: { ORACLE_HOME: 'C:/oracle/19' } },
  });
  vscode.__setConfig(
    vscode.ConfigurationTarget.Workspace,
    'wcli0.configFile',
    '${workspaceFolder}/wcli0.json',
  );
  vscode.__state.calls.warnReturn = 'Write anyway';
  // Inject a loadable check so the referenced file counts as loadable (P85).
  await writeWorkspaceMcpJson(undefined, () => true);
  assert.equal(vscode.__state.calls.error.length, 0, 'not refused');
  assert.ok(
    vscode.__state.calls.warn.some((w) => /does not verify that file matches/.test(w.message)),
    'warns the configFile is not verified against settings',
  );
  assert.ok(vscode.__state.files.has('/ws/.vscode/mcp.json'), 'entry written');
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.ok(
    parsed.servers.wcli0.args.includes('--config'),
    'entry pins --config carrying the profiles',
  );
});

test('writeWorkspaceMcpJson aborts the profiles+configFile export when the warning is dismissed', async () => {
  // Declining the stale-file warning must not write a possibly-divergent entry.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.profiles', {
    ora19: { env: { ORACLE_HOME: 'C:/oracle/19' } },
  });
  vscode.__setConfig(
    vscode.ConfigurationTarget.Workspace,
    'wcli0.configFile',
    '${workspaceFolder}/wcli0.json',
  );
  vscode.__state.calls.warnReturn = undefined; // user cancels the modal
  await writeWorkspaceMcpJson(undefined, () => true);
  assert.equal(vscode.__state.files.has('/ws/.vscode/mcp.json'), false, 'nothing written');
});

test('writeWorkspaceMcpJson still refuses profiles export when no configFile is referenced', async () => {
  // Without a config file to carry them, a plain stdio entry would drop the profiles,
  // so the export must still refuse.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.profiles', {
    ora19: { env: { ORACLE_HOME: 'C:/oracle/19' } },
  });
  await writeWorkspaceMcpJson(undefined, () => true);
  assert.equal(vscode.__state.files.has('/ws/.vscode/mcp.json'), false);
  assert.ok(vscode.__state.calls.error.some((m) => /wcli0\.profiles/i.test(m)));
});

test('P72: writeWorkspaceMcpJson warns before exporting over a workspace config.json', async () => {
  // A committed <workspace>/config.json would override the exported (configFile-less)
  // stdio entry; the export must warn and respect a cancel.
  vscode.__state.files.set('/ws/config.json', Buffer.from('{}'));
  vscode.__state.calls.warnReturn = undefined; // user cancels the modal
  await writeWorkspaceMcpJson();
  assert.ok(vscode.__state.calls.warn.some((w) => /can override the exported/i.test(w.message)));
  assert.equal(vscode.__state.files.has('/ws/.vscode/mcp.json'), false);
});

test('P72: writeWorkspaceMcpJson writes the entry when the override warning is accepted', async () => {
  vscode.__state.files.set('/ws/config.json', Buffer.from('{}'));
  vscode.__state.calls.warnReturn = 'Write anyway';
  await writeWorkspaceMcpJson();
  assert.ok(vscode.__state.files.has('/ws/.vscode/mcp.json'), 'entry written after confirmation');
});

test('P77: writeWorkspaceMcpJson warns when the configured launch.cwd has a config.json', async () => {
  // The entry launches from launch.cwd, not the workspace root, so the discovery
  // vector is <cwd>/config.json — the warning must check there, not only /ws.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.cwd', '${workspaceFolder}/sub');
  vscode.__state.files.set('/ws/sub/config.json', Buffer.from('{}'));
  vscode.__state.calls.warnReturn = undefined; // cancel
  await writeWorkspaceMcpJson();
  assert.ok(vscode.__state.calls.warn.some((w) => /\/ws\/sub\/config\.json/.test(w.message)));
  assert.equal(vscode.__state.files.has('/ws/.vscode/mcp.json'), false);
});

test('P77: a config.json only at the workspace root does not warn when launch.cwd points elsewhere', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.cwd', '${workspaceFolder}/sub');
  vscode.__state.files.set('/ws/config.json', Buffer.from('{}')); // not the launch cwd
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.calls.warn.length, 0);
  assert.ok(vscode.__state.files.has('/ws/.vscode/mcp.json'));
});

test('P72: writeWorkspaceMcpJson does not warn when wcli0.configFile pins the launch', async () => {
  // An explicit --config (from configFile) bypasses config.json discovery, so no
  // override warning is needed even with a workspace config.json present.
  vscode.__state.files.set('/ws/config.json', Buffer.from('{}'));
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.configFile', '${workspaceFolder}/wcli0.json');
  // The referenced file loads (this test is about the pin suppressing the warning,
  // not about P85 loadability); inject a loadable check so the in-memory FS suffices.
  await writeWorkspaceMcpJson(undefined, () => true);
  assert.equal(vscode.__state.calls.warn.length, 0);
  assert.ok(vscode.__state.files.has('/ws/.vscode/mcp.json'));
});

test('writeWorkspaceMcpJson merges into an existing file', async () => {
  vscode.__state.files.set(
    '/ws/.vscode/mcp.json',
    Buffer.from(JSON.stringify({ servers: { other: { type: 'stdio' } } })),
  );
  await writeWorkspaceMcpJson();
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.ok(parsed.servers.other, 'existing server preserved');
  assert.ok(parsed.servers.wcli0, 'wcli0 server added');
});

test('writeWorkspaceMcpJson emits an http url entry in http mode', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.mode', 'http');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.port', 7000);
  await writeWorkspaceMcpJson();
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.equal(parsed.servers.wcli0.type, 'http');
  assert.match(parsed.servers.wcli0.url, /:7000\/mcp$/);
});

test('writeWorkspaceMcpJson normalizes a wildcard host in the url', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.mode', 'http');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.host', '0.0.0.0');
  await writeWorkspaceMcpJson();
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.match(parsed.servers.wcli0.url, /^http:\/\/127\.0\.0\.1:/);
});

test('writeWorkspaceMcpJson aborts on a non-not-found read error', async () => {
  const err = new Error('permission denied');
  err.code = 'NoPermissions';
  vscode.__state.readError = err;
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.calls.error.length, 1);
  assert.equal(vscode.__state.files.has('/ws/.vscode/mcp.json'), false);
});

test('writeWorkspaceMcpJson errors without a workspace', async () => {
  vscode.__state.workspaceFolders = undefined;
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.calls.error.length, 1);
  assert.equal(vscode.__state.files.size, 0);
});

test('showLaunchCommand writes the command to output and can copy it', async () => {
  const output = vscode.window.createOutputChannel('test');
  vscode.__state.calls.infoReturn = 'Copy command';
  await showLaunchCommand(output);
  const text = output.lines.join('\n');
  assert.match(text, /npx -y wcli0@latest/);
  // copy happens asynchronously via the un-awaited notification.
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(vscode.__state.calls.clipboard.length, 1);
});

test('showLaunchCommand notes unsafe mode in the output', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.safetyMode', 'unsafe');
  const output = vscode.window.createOutputChannel('test');
  await showLaunchCommand(output);
  assert.match(output.lines.join('\n'), /unsafe/);
});

test('showLaunchCommand reports cwd and env when configured', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.cwd', '${workspaceFolder}');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.env', { FOO: 'bar' });
  const output = vscode.window.createOutputChannel('test');
  await showLaunchCommand(output);
  const text = output.lines.join('\n');
  assert.match(text, /cwd: \/ws/);
  // env values are redacted; only names are shown.
  assert.match(text, /env \(values hidden\): FOO/);
  assert.equal(/bar/.test(text), false);
});

test("P49: showLaunchCommand shows the provider's private fallback cwd when none is configured", async () => {
  const { Wcli0McpProvider } = require('../../dist/mcpProvider.js');
  // No wcli0.launch.cwd set, but the provider has a private safe cwd.
  const output = vscode.window.createOutputChannel('test');
  const provider = new Wcli0McpProvider(() => {}, '/private/extension/dir', undefined);
  await showLaunchCommand(output, provider);
  const text = output.lines.join('\n');
  assert.match(text, /cwd: \/private\/extension\/dir/);
  // And it explains that the directory is the provider's private launch dir.
  assert.match(text, /no wcli0\.launch\.cwd set/);
});

test('P49: a configured cwd is shown without the private-dir note', async () => {
  const { Wcli0McpProvider } = require('../../dist/mcpProvider.js');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.cwd', '${workspaceFolder}');
  const output = vscode.window.createOutputChannel('test');
  const provider = new Wcli0McpProvider(() => {}, '/private/extension/dir', undefined);
  await showLaunchCommand(output, provider);
  const text = output.lines.join('\n');
  assert.match(text, /cwd: \/ws/);
  assert.equal(/no wcli0\.launch\.cwd set/.test(text), false);
});

test('refreshServerDefinition refreshes the provider', async () => {
  let refreshed = 0;
  await refreshServerDefinition({ refresh: () => (refreshed += 1) });
  assert.equal(refreshed, 1);
});

test('writeWorkspaceMcpJson preserves a portable cwd token', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.cwd', '${workspaceFolder}/sub');
  await writeWorkspaceMcpJson();
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  // Committed mcp.json keeps the portable token rather than an absolute path.
  assert.equal(parsed.servers.wcli0.cwd, '${workspaceFolder}/sub');
});

test('writeWorkspaceMcpJson refuses a broken launch config', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.method', 'node');
  // nodeScriptPath empty -> blocking
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.calls.error.length, 1);
  assert.equal(vscode.__state.files.has('/ws/.vscode/mcp.json'), false);
});

test('writeWorkspaceMcpJson omits cwd unless launch.cwd is configured', async () => {
  await writeWorkspaceMcpJson();
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  // No default cwd: avoids the server auto-loading <workspace>/config.json.
  assert.equal(parsed.servers.wcli0.cwd, undefined);
});

test('writeWorkspaceMcpJson writes an http entry despite a broken local launch config', async () => {
  // node method with no script path would block a stdio write, but an http entry
  // only needs a URL, so the irrelevant local-launch problem must not block it.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.method', 'node');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.mode', 'http');
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.calls.error.length, 0);
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.equal(parsed.servers.wcli0.type, 'http');
});

test('writeWorkspaceMcpJson refuses an http entry with an invalid port', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.mode', 'http');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.transport.port', 70000);
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.calls.error.length, 1);
  assert.equal(vscode.__state.files.has('/ws/.vscode/mcp.json'), false);
});

test('writeWorkspaceMcpJson merges into a JSONC file with comments and trailing commas', async () => {
  vscode.__state.files.set(
    '/ws/.vscode/mcp.json',
    Buffer.from('{\n  // keep this\n  "servers": {\n    "other": { "type": "stdio", },\n  },\n}'),
  );
  // Comments present -> the command confirms before reformatting away comments.
  vscode.__state.calls.warnReturn = 'Write anyway';
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.calls.error.length, 0);
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.ok(parsed.servers.other, 'existing server preserved');
  assert.ok(parsed.servers.wcli0, 'wcli0 server added');
});

test('parseJsonc strips comments and trailing commas but preserves string contents', () => {
  const parsed = parseJsonc(`{
    // line comment
    "a": 1, /* block */
    "b": "x // y, /* z */ \\" still string",
    "c": [1, 2,],
  }`);
  assert.deepEqual(parsed, { a: 1, b: 'x // y, /* z */ " still string', c: [1, 2] });
});

test('parseJsonc throws on genuinely malformed input', () => {
  assert.throws(() => parseJsonc('{ "a": }'));
});

test('parseJsonc throws on an unterminated block comment', () => {
  assert.throws(() => parseJsonc('{"servers": {}} /* unfinished'), /Unterminated block comment/);
});

test('parseJsonc replaces a block comment with a space so tokens do not fuse', () => {
  // `1/*c*/2` must not become `12`; the space makes it invalid JSON.
  assert.throws(() => parseJsonc('{ "x": 1/*c*/2 }'));
  assert.deepEqual(parseJsonc('{ "a"/* */: 1 }'), { a: 1 });
});

test('writeWorkspaceMcpJson confirms before writing env, and can omit it', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.env', { TOKEN: 'secret' });
  // Include path
  vscode.__state.calls.warnReturn = 'Include environment';
  await writeWorkspaceMcpJson();
  let parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.deepEqual(parsed.servers.wcli0.env, { TOKEN: 'secret' });

  // Omit path
  vscode.__reset();
  vscode.__state.workspaceFolders = WS;
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.env', { TOKEN: 'secret' });
  vscode.__state.calls.warnReturn = 'Omit environment';
  await writeWorkspaceMcpJson();
  parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.equal(parsed.servers.wcli0.env, undefined);
});

test('writeWorkspaceMcpJson aborts the env write when the prompt is dismissed', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.launch.env', { TOKEN: 'secret' });
  vscode.__state.calls.warnReturn = undefined; // dismissed
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.files.has('/ws/.vscode/mcp.json'), false);
});

test('writeWorkspaceMcpJson leaves a commented file untouched when not confirmed', async () => {
  vscode.__state.files.set('/ws/.vscode/mcp.json', Buffer.from('{ /* note */ "servers": {} }'));
  vscode.__state.calls.warnReturn = undefined; // declined
  await writeWorkspaceMcpJson();
  assert.equal(
    vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'),
    '{ /* note */ "servers": {} }',
  );
});

test('writeWorkspaceMcpJson refuses a non-object root', async () => {
  vscode.__state.files.set('/ws/.vscode/mcp.json', Buffer.from('null'));
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.calls.error.length, 1);
  assert.equal(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'), 'null');
});

test('writeWorkspaceMcpJson refuses a non-object servers value', async () => {
  vscode.__state.files.set('/ws/.vscode/mcp.json', Buffer.from('{ "servers": [] }'));
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.calls.error.length, 1);
  assert.equal(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'), '{ "servers": [] }');
});

test('writeWorkspaceMcpJson preserves a syntactically broken existing file', async () => {
  vscode.__state.files.set('/ws/.vscode/mcp.json', Buffer.from('{ not json'));
  await writeWorkspaceMcpJson();
  assert.equal(vscode.__state.calls.error.length, 1);
  // File left untouched.
  assert.equal(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'), '{ not json');
});

test('P29: export honors the form scope (no hidden workspace override leaks)', async () => {
  // Workspace sets safetyMode: unsafe; the form is on the User (Global) scope.
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.safetyMode', 'unsafe');
  const target = vscode.Uri.file('/ws/wcli0.config.json');
  vscode.__state.calls.saveDialog = target;
  vscode.__state.calls.infoReturn = 'Not now';
  await generateConfigFile('Global');
  const written = JSON.parse(vscode.__state.files.get('/ws/wcli0.config.json').toString('utf8'));
  // Global scope has no safetyMode -> default 'safe'; the workspace 'unsafe' must
  // not leak into the export the form claims matches what is on screen.
  assert.equal(written.global.security.enableInjectionProtection, true);
  assert.equal(written.global.security.restrictWorkingDirectory, true);
});

test('P29: export with no form scope uses the merged effective settings', async () => {
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.safetyMode', 'unsafe');
  const target = vscode.Uri.file('/ws/wcli0.config.json');
  vscode.__state.calls.saveDialog = target;
  vscode.__state.calls.infoReturn = 'Not now';
  await generateConfigFile(); // command-palette invocation: effective settings
  const written = JSON.parse(vscode.__state.files.get('/ws/wcli0.config.json').toString('utf8'));
  assert.equal(written.global.security.enableInjectionProtection, false);
});

test('P34: showLaunchCommand reports no launch when managed storage is unavailable', async () => {
  const { Wcli0McpProvider } = require('../../dist/mcpProvider.js');
  const fs = require('node:fs');
  vscode.__setConfig(vscode.ConfigurationTarget.Workspace, 'wcli0.shells', { cmd: { enabled: true } });
  const output = vscode.window.createOutputChannel('t');
  const realMkdtemp = fs.mkdtempSync;
  fs.mkdtempSync = () => {
    throw new Error('EACCES');
  };
  try {
    // No managedConfigDir and mkdtemp fails -> managedConfigTargetDir() undefined.
    const provider = new Wcli0McpProvider(() => {}, undefined, undefined);
    await showLaunchCommand(output, provider);
  } finally {
    fs.mkdtempSync = realMkdtemp;
  }
  const text = output.lines.join('\n');
  assert.match(text, /No wcli0 launch command available/);
  // Must NOT render a global-flag command or claim a config written to undefined.
  assert.ok(!/written to undefined/.test(text));
  assert.ok(!/--config/.test(text));
});

test('P38: form scope=Global writes configFile to Global even with a workspace open', async () => {
  // Workspace is open (folder exists), but the form selected the User (Global) scope.
  // The "Set wcli0.configFile" follow-up must honor the form scope, not the folder.
  const target = vscode.Uri.file('/ws/wcli0.config.json');
  vscode.__state.calls.saveDialog = target;
  vscode.__state.calls.infoReturn = 'Set wcli0.configFile';
  await generateConfigFile('Global');
  assert.equal(
    vscode.__state.configGlobal.get('wcli0.configFile'),
    '/ws/wcli0.config.json',
  );
  assert.equal(vscode.__state.configWorkspace.has('wcli0.configFile'), false);
});

test('P38: form scope=Workspace writes a portable configFile to Workspace', async () => {
  const target = vscode.Uri.file('/ws/sub/cfg.json');
  vscode.__state.calls.saveDialog = target;
  vscode.__state.calls.infoReturn = 'Set wcli0.configFile';
  await generateConfigFile('Workspace');
  assert.equal(
    vscode.__state.configWorkspace.get('wcli0.configFile'),
    '${workspaceFolder}/sub/cfg.json',
  );
  assert.equal(vscode.__state.configGlobal.has('wcli0.configFile'), false);
});

test('P38: form scope=Workspace without a folder falls back to Global', async () => {
  vscode.__state.workspaceFolders = undefined;
  const target = vscode.Uri.file('/abs/cfg.json');
  vscode.__state.calls.saveDialog = target;
  vscode.__state.calls.infoReturn = 'Set wcli0.configFile';
  await generateConfigFile('Workspace');
  // No folder -> can't write Workspace; fall back to Global with the absolute path.
  assert.equal(vscode.__state.configGlobal.get('wcli0.configFile'), '/abs/cfg.json');
  assert.equal(vscode.__state.configWorkspace.has('wcli0.configFile'), false);
});

test('P58: a workspace child whose name starts with ".." keeps a portable configFile path', async () => {
  // "..generated" is an ordinary in-workspace directory, not a parent traversal,
  // so the committed setting must stay a ${workspaceFolder} token (portable),
  // not an absolute machine-specific path.
  const target = vscode.Uri.file('/ws/..generated/wcli0.config.json');
  vscode.__state.calls.saveDialog = target;
  vscode.__state.calls.infoReturn = 'Set wcli0.configFile';

  await generateConfigFile();

  assert.equal(
    vscode.workspace.getConfiguration('wcli0').get('configFile', ''),
    '${workspaceFolder}/..generated/wcli0.config.json',
  );
});

// ---- writeMcpJsonFromSettings (file-source "Save to file") ----

test('writeMcpJsonFromSettings writes the entry from explicit settings and returns true', async () => {
  const s = defaultSettings();
  s.shell = 'cmd';
  const ok = await writeMcpJsonFromSettings(s, WS[0]);
  assert.equal(ok, true);
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.equal(parsed.servers.wcli0.type, 'stdio');
  assert.ok(parsed.servers.wcli0.args.includes('--shell'));
  // It writes the file only — no wcli0.* setting is persisted.
  assert.equal(vscode.__state.configWorkspace.has('wcli0.shell'), false);
});

test('writeMcpJsonFromSettings preserves other servers in the file', async () => {
  vscode.__state.files.set(
    '/ws/.vscode/mcp.json',
    Buffer.from(JSON.stringify({ servers: { other: { type: 'stdio' } } })),
  );
  const ok = await writeMcpJsonFromSettings(defaultSettings(), WS[0]);
  assert.equal(ok, true);
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.ok(parsed.servers.other, 'existing server preserved');
  assert.ok(parsed.servers.wcli0, 'wcli0 server written');
});

test('P5: writeMcpJsonFromSettings preserves a loaded http url verbatim when host/port are unchanged', async () => {
  const s = defaultSettings();
  s.transportMode = 'http';
  s.transportHost = 'gateway.example';
  s.transportPort = 0; // default port — only valid because the URL is preserved
  s.transportUrl = 'https://gateway.example/custom/mcp';
  const ok = await writeMcpJsonFromSettings(s, WS[0]);
  assert.equal(ok, true);
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.equal(parsed.servers.wcli0.url, 'https://gateway.example/custom/mcp');
});

test('P5: writeMcpJsonFromSettings rebuilds the url when the host/port were edited', async () => {
  const s = defaultSettings();
  s.transportMode = 'http';
  s.transportHost = '127.0.0.1';
  s.transportPort = 8123; // edited away from the preserved URL's host/port
  s.transportUrl = 'https://gateway.example/custom/mcp';
  const ok = await writeMcpJsonFromSettings(s, WS[0]);
  assert.equal(ok, true);
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.equal(parsed.servers.wcli0.url, 'http://127.0.0.1:8123/mcp');
});

test('writeMcpJsonFromSettings returns false and does not write a malformed file', async () => {
  vscode.__state.files.set('/ws/.vscode/mcp.json', Buffer.from('not json'));
  const before = vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8');
  const ok = await writeMcpJsonFromSettings(defaultSettings(), WS[0]);
  assert.equal(ok, false);
  assert.equal(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'), before);
  assert.ok(vscode.__state.calls.error.length >= 1);
});

// ---- writeMcpJsonFromSettings file-source merge (baseEntry) ----

const wcli0Entry = () =>
  JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8')).servers.wcli0;

test('P7: a file save merges onto the loaded http entry, preserving headers/oauth', async () => {
  const base = {
    type: 'http',
    url: 'http://127.0.0.1:9444/mcp',
    headers: { Authorization: 'Bearer x' },
    oauth: { clientId: 'abc' },
  };
  const s = defaultSettings();
  s.transportMode = 'http';
  s.transportHost = '127.0.0.1';
  s.transportPort = 9444;
  s.transportUrl = 'http://127.0.0.1:9444/mcp';
  const ok = await writeMcpJsonFromSettings(s, WS[0], { baseEntry: base });
  assert.equal(ok, true);
  const e = wcli0Entry();
  assert.deepEqual(e.headers, { Authorization: 'Bearer x' }, 'headers preserved');
  assert.deepEqual(e.oauth, { clientId: 'abc' }, 'oauth preserved');
  assert.equal(e.url, 'http://127.0.0.1:9444/mcp');
});

test('P12: a file save preserves unmodeled stdio fields (envFile, dev, sandboxEnabled)', async () => {
  const base = {
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest'],
    envFile: '.env',
    dev: { watch: true },
    sandboxEnabled: false,
  };
  const s = defaultSettings();
  s.shell = 'cmd';
  const ok = await writeMcpJsonFromSettings(s, WS[0], { baseEntry: base });
  assert.equal(ok, true);
  const e = wcli0Entry();
  assert.equal(e.envFile, '.env', 'envFile preserved');
  assert.deepEqual(e.dev, { watch: true }, 'dev preserved');
  assert.equal(e.sandboxEnabled, false, 'sandboxEnabled preserved');
  assert.ok(e.args.includes('--shell'), 'the edited flag is still written');
});

test('P9: a file save round-trips non-string env values', async () => {
  vscode.__state.calls.warnReturn = 'Include environment';
  const base = {
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest'],
    env: { PORT: 3000, FLAG: null, NAME: 'x' },
  };
  const ok = await writeMcpJsonFromSettings(defaultSettings(), WS[0], { baseEntry: base });
  assert.equal(ok, true);
  assert.deepEqual(wcli0Entry().env, { PORT: 3000, FLAG: null, NAME: 'x' });
});

test('P9/P4: omitting env on a file save drops it even when the baseline had non-string values', async () => {
  vscode.__state.calls.warnReturn = 'Omit environment';
  const base = {
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest'],
    env: { PORT: 3000 },
  };
  const ok = await writeMcpJsonFromSettings(defaultSettings(), WS[0], { baseEntry: base });
  assert.equal(ok, true);
  assert.equal(wcli0Entry().env, undefined, 'env omitted from the written entry');
});

test('P10: a file save preserves a socket url it cannot decompose', async () => {
  const base = { type: 'http', url: 'unix:///tmp/server.sock#/mcp' };
  const s = defaultSettings();
  s.transportMode = 'http';
  s.transportUrl = 'unix:///tmp/server.sock#/mcp';
  // host/port stay at their defaults, as parseMcpEntry leaves them for a socket URL.
  const ok = await writeMcpJsonFromSettings(s, WS[0], { baseEntry: base });
  assert.equal(ok, true);
  assert.equal(wcli0Entry().url, 'unix:///tmp/server.sock#/mcp');
});

test('P8: a file save round-trips a default-port url without a port error', async () => {
  const base = { type: 'http', url: 'https://gateway.example/custom/mcp' };
  const s = defaultSettings();
  s.transportMode = 'http';
  s.transportHost = 'gateway.example'; // as parseMcpEntry sets for a default-port URL
  s.transportUrl = 'https://gateway.example/custom/mcp';
  const ok = await writeMcpJsonFromSettings(s, WS[0], { baseEntry: base });
  assert.equal(ok, true, 'the default port (9444) does not trip the port check');
  assert.equal(wcli0Entry().url, 'https://gateway.example/custom/mcp');
});

test('P8: editing the host of a default-port url rebuilds the canonical url', async () => {
  const base = { type: 'http', url: 'https://gateway.example/custom/mcp' };
  const s = defaultSettings();
  s.transportMode = 'http';
  s.transportHost = 'other.example'; // host edited away from the loaded URL's host
  s.transportPort = 9444;
  s.transportUrl = 'https://gateway.example/custom/mcp';
  const ok = await writeMcpJsonFromSettings(s, WS[0], { baseEntry: base });
  assert.equal(ok, true);
  assert.equal(wcli0Entry().url, 'http://other.example:9444/mcp');
});

test('P13: a file save allows a VS Code variable --config path that cannot be read locally', async () => {
  const base = { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest', '--config', '${input:cfg}'] };
  const s = defaultSettings();
  s.configFile = '${input:cfg}';
  const ok = await writeMcpJsonFromSettings(s, WS[0], { baseEntry: base });
  assert.equal(ok, true, 'the unresolved ${input:...} path is not treated as blocking');
  const e = wcli0Entry();
  assert.ok(e.args.includes('--config'), 'the --config flag is kept');
  assert.ok(e.args.includes('${input:cfg}'), 'the variable path is round-tripped verbatim');
});

test('P29: a file save refuses per-shell/profile edits that cannot be persisted to the file', async () => {
  // A loaded file source referencing a config file. parseMcpEntry never loads
  // shells/profiles back from that file, so any in the form are unsaved edits this save
  // (which only writes the entry, not the referenced file) would silently drop on the
  // post-write reparse — refuse instead of reporting a false success.
  const base = {
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest', '--config', '${workspaceFolder}/wcli0.json'],
  };
  const s = defaultSettings();
  s.configFile = '${workspaceFolder}/wcli0.json';
  s.profiles = { ora19: { env: { ORACLE_HOME: 'C:/oracle/19' } } };
  const ok = await writeMcpJsonFromSettings(s, WS[0], {
    baseEntry: base,
    configFileLoadable: () => true,
  });
  assert.equal(ok, false, 'the save is refused');
  assert.ok(
    vscode.__state.calls.error.some((m) => /cannot be saved from this form/.test(m)),
    'explains the edits cannot be saved from a file-source form',
  );
  assert.equal(vscode.__state.files.has('/ws/.vscode/mcp.json'), false, 'nothing written');
});

test('P29: a file save with no shell/profile edits is not blocked by the P29 refusal', async () => {
  // The refusal must only fire on actual shells/profiles edits, not every file save.
  const base = { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest'] };
  const s = defaultSettings();
  s.shell = 'cmd'; // a normal modeled edit, not per-shell config
  const ok = await writeMcpJsonFromSettings(s, WS[0], { baseEntry: base });
  assert.equal(ok, true, 'an ordinary file save still succeeds');
  assert.ok(wcli0Entry().args.includes('--shell'), 'the edit is written');
});

test('P27: a file save preserves a cwd-relative --config instead of re-anchoring it', async () => {
  // A loaded entry whose server resolves config.json under a non-workspace cwd.
  const base = {
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest', '--config', 'config.json'],
    cwd: '${workspaceFolder}/server',
  };
  const s = defaultSettings();
  s.configFile = 'config.json'; // as parseMcpEntry sets from the relative --config
  s.cwd = '${workspaceFolder}/server';
  // An unrelated edit triggers a regenerate; the relative --config must round-trip.
  s.shell = 'cmd';
  // The referenced config exists under the server's cwd at launch; inject loadability
  // so the test isolates the written-entry behavior from the on-disk validation check.
  const ok = await writeMcpJsonFromSettings(s, WS[0], {
    baseEntry: base,
    configFileLoadable: () => true,
  });
  assert.equal(ok, true);
  const e = wcli0Entry();
  assert.ok(e.args.includes('config.json'), 'relative --config kept verbatim');
  assert.equal(
    e.args.includes('${workspaceFolder}/config.json'),
    false,
    'not re-anchored to the workspace root (would load a different file)',
  );
  assert.equal(e.cwd, '${workspaceFolder}/server', 'cwd preserved');
});

test('P-cwdconfig: a file save checks --config loadability against the entry cwd', async () => {
  // The server resolves a relative --config against the entry's cwd, not the workspace root.
  const base = {
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest', '--config', 'config.json'],
    cwd: '${workspaceFolder}/server',
  };
  const s = defaultSettings();
  s.configFile = 'config.json';
  s.cwd = '${workspaceFolder}/server';
  let checkedPath;
  const ok = await writeMcpJsonFromSettings(s, WS[0], {
    baseEntry: base,
    configFileLoadable: (p) => {
      checkedPath = p;
      return true;
    },
  });
  assert.equal(ok, true);
  // Loadability was checked under the cwd (/ws/server), NOT the workspace root (/ws).
  assert.equal(checkedPath, '/ws/server/config.json');
});

test('P-port0: a file save rebuilds an explicit :0 url from the port field', async () => {
  const base = { type: 'http', url: 'http://host:0/mcp' };
  const s = defaultSettings();
  s.transportMode = 'http';
  s.transportHost = 'host';
  s.transportPort = 9444; // the form's default, since the :0 port cannot be held (min=1)
  const ok = await writeMcpJsonFromSettings(s, WS[0], { baseEntry: base });
  assert.equal(ok, true);
  // The invalid :0 is NOT round-tripped verbatim; the canonical URL is rebuilt from the port.
  assert.equal(wcli0Entry().url, 'http://host:9444/mcp');
});

test('P-varsyntax: a file save rejects a --config path with an unknown ${...} token', async () => {
  // `${PATH}` is a bare shell variable VS Code does not substitute, so the value is a real
  // (broken) local path and must face validation rather than be bypassed as a VS Code var.
  const base = {
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest', '--config', '${PATH}/cfg.json'],
  };
  const s = defaultSettings();
  s.configFile = '${PATH}/cfg.json';
  const ok = await writeMcpJsonFromSettings(s, WS[0], { baseEntry: base });
  assert.equal(ok, false, 'an unknown-variable config path is validated, not bypassed');
});

test('P-varsyntax: a file save still allows a recognized VS Code variable config path', async () => {
  const base = {
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest', '--config', '${input:cfg}'],
  };
  const s = defaultSettings();
  s.configFile = '${input:cfg}'; // VS Code resolves this at launch
  const ok = await writeMcpJsonFromSettings(s, WS[0], { baseEntry: base });
  assert.equal(ok, true, 'a known VS Code variable is bypassed and round-tripped');
  assert.ok(wcli0Entry().args.includes('${input:cfg}'), 'the variable is written verbatim');
});

test('P-staleargs: a file save preserves an unmodeled flag added to args on disk after load', async () => {
  // The panel loaded this stale snapshot...
  const base = { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest'] };
  // ...but another process then added an unmodeled escape-hatch flag to the on-disk entry.
  vscode.__state.files.set(
    '/ws/.vscode/mcp.json',
    Buffer.from(
      JSON.stringify({
        servers: {
          wcli0: { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest', '--futureFlag', 'x'] },
        },
      }),
    ),
  );
  const s = defaultSettings();
  s.shell = 'cmd'; // an unrelated modeled edit triggers a regenerate
  const ok = await writeMcpJsonFromSettings(s, WS[0], { baseEntry: base });
  assert.equal(ok, true);
  const e = wcli0Entry();
  assert.ok(
    e.args.includes('--futureFlag') && e.args.includes('x'),
    'the externally-added unmodeled flag survives the save',
  );
  assert.ok(e.args.includes('--shell'), 'the modeled edit is written too');
});

test('P-httpshells: a file save to an http source refuses unsavable per-shell/profile edits', async () => {
  // The stdio branch already refused these (P29); the http/sse branch must too, instead of
  // writing {type,url} and reporting a false "Saved" while the edits silently disappear.
  const base = { type: 'http', url: 'http://127.0.0.1:9444/mcp' };
  const s = defaultSettings();
  s.transportMode = 'http';
  s.profiles = { ora19: { env: { ORACLE_HOME: 'C:/oracle/19' } } };
  const ok = await writeMcpJsonFromSettings(s, WS[0], { baseEntry: base });
  assert.equal(ok, false, 'an http file source also refuses shells/profiles edits');
  assert.ok(
    vscode.__state.calls.error.some((m) => /cannot be saved from this form/.test(m)),
    'explains the edits cannot be saved from a file-source form',
  );
  assert.equal(vscode.__state.files.has('/ws/.vscode/mcp.json'), false, 'nothing written');
});

test('a file save switching http->stdio drops the stale url field', async () => {
  const base = { type: 'http', url: 'http://127.0.0.1:9444/mcp', headers: { A: '1' } };
  const s = defaultSettings(); // stdio (npx)
  const ok = await writeMcpJsonFromSettings(s, WS[0], { baseEntry: base });
  assert.equal(ok, true);
  const e = wcli0Entry();
  assert.equal(e.type, 'stdio');
  assert.equal(e.url, undefined, 'the http url is removed on a mode switch');
  assert.equal(e.command, 'npx');
});

test('P19: switching http->stdio drops the other transport unmodeled fields (headers/oauth)', async () => {
  const base = {
    type: 'http',
    url: 'http://127.0.0.1:9444/mcp',
    headers: { A: '1' },
    oauth: { id: 'x' },
  };
  const s = defaultSettings(); // stdio (npx)
  const ok = await writeMcpJsonFromSettings(s, WS[0], { baseEntry: base });
  assert.equal(ok, true);
  const e = wcli0Entry();
  assert.equal(e.type, 'stdio');
  assert.equal(e.headers, undefined, 'http headers removed on switch to stdio');
  assert.equal(e.oauth, undefined, 'http oauth removed on switch to stdio');
});

test('P19: switching stdio->http drops the other transport unmodeled fields (envFile/dev)', async () => {
  const base = {
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'wcli0@latest'],
    envFile: '.env',
    dev: { watch: true },
  };
  const s = defaultSettings();
  s.transportMode = 'http';
  s.transportHost = '127.0.0.1';
  s.transportPort = 9444;
  const ok = await writeMcpJsonFromSettings(s, WS[0], { baseEntry: base });
  assert.equal(ok, true);
  const e = wcli0Entry();
  assert.equal(e.type, 'http');
  assert.equal(e.envFile, undefined, 'stdio envFile removed on switch to http');
  assert.equal(e.dev, undefined, 'stdio dev removed on switch to http');
  assert.ok(e.url, 'an http url is written');
});

test('P18: a file save allows a VS Code variable in cwd', async () => {
  const base = { type: 'stdio', command: 'npx', args: ['-y', 'wcli0@latest'], cwd: '${env:PROJECT}' };
  const s = defaultSettings();
  s.cwd = '${env:PROJECT}';
  const ok = await writeMcpJsonFromSettings(s, WS[0], { baseEntry: base });
  assert.equal(ok, true, 'a variable cwd does not block the save');
  assert.equal(wcli0Entry().cwd, '${env:PROJECT}', 'the variable cwd round-trips verbatim');
});

test('P18: a file save allows a VS Code variable node script path', async () => {
  const base = { type: 'stdio', command: 'node', args: ['${input:script}', '--shell', 'cmd'] };
  const s = defaultSettings();
  s.launchMethod = 'node';
  s.nodeScriptPath = '${input:script}';
  s.shell = 'cmd';
  const ok = await writeMcpJsonFromSettings(s, WS[0], { baseEntry: base });
  assert.equal(ok, true, 'a variable node script does not block the save');
  assert.ok(wcli0Entry().args.includes('${input:script}'), 'the variable script round-trips');
});

test('P20: a file save merges onto the CURRENT on-disk entry, preserving external additions', async () => {
  // The panel loaded a snapshot with no headers...
  const loaded = { type: 'http', url: 'http://127.0.0.1:9444/mcp' };
  // ...but the file was edited externally afterwards to add headers to the same entry.
  vscode.__state.files.set(
    '/ws/.vscode/mcp.json',
    Buffer.from(
      JSON.stringify({
        servers: {
          wcli0: { type: 'http', url: 'http://127.0.0.1:9444/mcp', headers: { A: '1' } },
          other: { type: 'stdio' },
        },
      }),
    ),
  );
  const s = defaultSettings();
  s.transportMode = 'http';
  s.transportHost = '127.0.0.1';
  s.transportPort = 9444;
  s.transportUrl = 'http://127.0.0.1:9444/mcp';
  const ok = await writeMcpJsonFromSettings(s, WS[0], { baseEntry: loaded });
  assert.equal(ok, true);
  const parsed = JSON.parse(vscode.__state.files.get('/ws/.vscode/mcp.json').toString('utf8'));
  assert.deepEqual(
    parsed.servers.wcli0.headers,
    { A: '1' },
    'externally added headers preserved via the on-disk merge',
  );
  assert.ok(parsed.servers.other, 'other server preserved');
});
