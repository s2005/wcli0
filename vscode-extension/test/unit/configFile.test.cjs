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

test('P47: yolo forces a per-shell restrictWorkingDirectory override to true', () => {
  // A per-shell restrictWorkingDirectory: false would otherwise resolve OVER the
  // global true and silently let yolo run commands in any directory for that shell.
  const cfg = buildConfigFile(
    defaults({
      safetyMode: 'yolo',
      shells: { cmd: { overrides: { security: { restrictWorkingDirectory: false } } } },
    }),
  );
  assert.equal(cfg.shells.cmd.overrides.security.restrictWorkingDirectory, true);
});

test('P47: unsafe forces a per-shell restrictWorkingDirectory override to false', () => {
  // An explicit per-shell true must not survive unsafe mode (global restrict: false).
  const cfg = buildConfigFile(
    defaults({
      safetyMode: 'unsafe',
      shells: { cmd: { overrides: { security: { restrictWorkingDirectory: true } } } },
    }),
  );
  assert.equal(cfg.shells.cmd.overrides.security.restrictWorkingDirectory, false);
});

test('P47: a shell with no restrictWorkingDirectory override is left to inherit', () => {
  // Without a per-shell override the shell inherits the global value; the cleanup
  // must not inject one (only force an existing override to match the mode).
  const cfg = buildConfigFile(
    defaults({
      safetyMode: 'yolo',
      shells: { cmd: { overrides: { security: { maxCommandLength: 100 } } } },
    }),
  );
  assert.equal('restrictWorkingDirectory' in (cfg.shells.cmd.overrides.security || {}), false);
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

test('relative allowed paths and log dir are anchored to the workspace', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const cfg = buildConfigFile(defaults({ allowedDirectories: ['src'], logDirectory: 'logs' }));
  assert.deepEqual(cfg.global.paths.allowedPaths, [require('path').resolve('/ws', 'src')]);
  assert.equal(cfg.global.logging.logDirectory, require('path').resolve('/ws', 'logs'));
});

test('a fractional commandTimeout is preserved in the generated config', () => {
  const cfg = buildConfigFile(defaults({ commandTimeout: 1.5 }));
  assert.equal(cfg.global.security.commandTimeout, 1.5);
  // Below the server minimum is still dropped.
  const low = buildConfigFile(defaults({ commandTimeout: 0.5 }));
  assert.equal(low.global.security.commandTimeout, undefined);
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

test('P83: the global wsl mount point seeds both wsl and bash (bash still disables inheritance by default)', () => {
  const cfg = buildConfigFile(defaults({ wslMountPoint: '/windows' }));
  // bash defaults to inheritGlobalPaths: false (the server's merge forces it on when
  // the field is absent), but the mount point is seeded on BOTH wsl-family shells to
  // match the server's applyCliWslMountPoint — so if bash inheritance is later enabled
  // it converts inherited paths with the configured mount, not the /mnt/ default.
  assert.equal(cfg.shells.bash.wslConfig.inheritGlobalPaths, false);
  assert.equal(cfg.shells.bash.wslConfig.mountPoint, '/windows/');
  assert.equal(cfg.shells.wsl.wslConfig.mountPoint, '/windows/');
});

// --- per-shell configuration (wcli0.shells) -------------------------------

test('per-shell enabled flags override the single-shell selector', () => {
  const cfg = buildConfigFile(
    defaults({ shell: 'powershell', shells: { cmd: { enabled: true }, gitbash: { enabled: false } } }),
  );
  // cmd/gitbash come from wcli0.shells; powershell still follows the selector,
  // wsl/bash fall back to the selector (disabled) since not set per-shell.
  assert.equal(cfg.shells.cmd.enabled, true);
  assert.equal(cfg.shells.gitbash.enabled, false);
  assert.equal(cfg.shells.powershell.enabled, true);
  assert.equal(cfg.shells.wsl.enabled, false);
});

test('per-shell executable command and args replace the defaults', () => {
  const cfg = buildConfigFile(
    defaults({ shells: { gitbash: { executable: { command: 'D:/git/bash.exe', args: ['-lc'] } } } }),
  );
  assert.equal(cfg.shells.gitbash.executable.command, 'D:/git/bash.exe');
  assert.deepEqual(cfg.shells.gitbash.executable.args, ['-lc']);
  // Untouched shells keep their defaults.
  assert.equal(cfg.shells.cmd.executable.command, 'cmd.exe');
});

test('per-shell security overrides are sanitized like the global section', () => {
  const cfg = buildConfigFile(
    defaults({
      shells: {
        powershell: {
          overrides: {
            security: {
              maxCommandLength: 5000,
              commandTimeout: 0, // non-positive -> dropped
              enableInjectionProtection: false,
              restrictWorkingDirectory: true,
            },
          },
        },
      },
    }),
  );
  const sec = cfg.shells.powershell.overrides.security;
  assert.equal(sec.maxCommandLength, 5000);
  assert.equal(sec.commandTimeout, undefined);
  assert.equal(sec.enableInjectionProtection, false);
  assert.equal(sec.restrictWorkingDirectory, true);
});

test('per-shell restrictions replace the default blocklist (empties filtered)', () => {
  const cfg = buildConfigFile(
    defaults({ shells: { cmd: { overrides: { restrictions: { blockedCommands: ['format', ''] } } } } }),
  );
  // Replaces the cmd default ['del','rd','rmdir'].
  assert.deepEqual(cfg.shells.cmd.overrides.restrictions.blockedCommands, ['format']);
});

test('per-shell allowed paths resolve and unresolved entries drop', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const cfg = buildConfigFile(
    defaults({
      shells: {
        cmd: { overrides: { paths: { allowedPaths: ['${workspaceFolder}/a', '${workspaceFolder:nope}/b'] } } },
      },
    }),
  );
  const paths = cfg.shells.cmd.overrides.paths;
  assert.deepEqual(paths.allowedPaths, ['/ws/a']);
});

test('P68: a per-shell initialDir is never emitted (server ignores it)', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  // The server only chdir's to the GLOBAL initialDir; a per-shell initialDir has no
  // effect, so the extension must not write it (even when passed in raw settings).
  const cfg = buildConfigFile(
    defaults({
      shells: {
        cmd: { overrides: { paths: { allowedPaths: ['${workspaceFolder}/a'], initialDir: '${workspaceFolder}/a' } } },
      },
    }),
  );
  assert.equal(cfg.shells.cmd.overrides.paths.initialDir, undefined);
  assert.deepEqual(cfg.shells.cmd.overrides.paths.allowedPaths, ['/ws/a']);
});

test('per-shell wsl mount point overrides the global wslMountPoint', () => {
  const cfg = buildConfigFile(
    defaults({ wslMountPoint: '/global', shells: { wsl: { wslConfig: { mountPoint: '/perShell', inheritGlobalPaths: false } } } }),
  );
  assert.equal(cfg.shells.wsl.wslConfig.mountPoint, '/perShell/');
  assert.equal(cfg.shells.wsl.wslConfig.inheritGlobalPaths, false);
});

test('yolo clears per-shell restrictions too', () => {
  const cfg = buildConfigFile(
    defaults({ safetyMode: 'yolo', shells: { cmd: { overrides: { restrictions: { blockedCommands: ['format'] } } } } }),
  );
  assert.deepEqual(cfg.shells.cmd.overrides.restrictions.blockedCommands, []);
});

test('P7: a fractional maxOutputLines is preserved in the generated config', () => {
  // The server's validateLoggingConfig only range-checks maxOutputLines (no
  // integer requirement), so 1.5 must be carried into the config (and managed mode).
  const cfg = buildConfigFile(defaults({ maxOutputLines: 1.5 }));
  assert.equal(cfg.global.logging.maxOutputLines, 1.5);
  // maxReturnLines still requires an integer, so a fractional value is dropped.
  const r = buildConfigFile(defaults({ maxReturnLines: 1.5 }));
  assert.equal(r.global.logging?.maxReturnLines, undefined);
});

test('P11: an explicit empty per-shell executable args list replaces the default', () => {
  const cfg = buildConfigFile(
    defaults({ shells: { cmd: { executable: { command: 'cmd.exe', args: [] } } } }),
  );
  // [] must replace cmd's default ['/c'], not be treated as "unset".
  assert.deepEqual(cfg.shells.cmd.executable.args, []);
});

test('P21: relative paths with no workspace are dropped from the generated config', () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  const cfg = buildConfigFile(
    defaults({ allowedDirectories: ['src'], logDirectory: 'logs', initialDir: 'work' }),
  );
  // No base to anchor against: the server would C-root these, so drop them.
  assert.deepEqual(cfg.global.paths.allowedPaths, []);
  assert.equal(cfg.global.paths.initialDir, undefined);
  assert.equal(cfg.global.logging, undefined);
});

test('P22: per-shell allowed paths keep restrictWorkingDirectory on under allowAllDirs', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const cfg = buildConfigFile(
    defaults({ allowAllDirs: true, shells: { cmd: { overrides: { paths: { allowedPaths: ['/srv'] } } } } }),
  );
  // No global paths, but a per-shell allowlist exists -> must not lift the global
  // restriction, or the shell inherits restrictWorkingDirectory:false and the
  // allowlist is never enforced.
  assert.equal(cfg.global.security.restrictWorkingDirectory, true);
  // Without any configured paths at all, allowAllDirs still lifts the restriction.
  assert.equal(
    buildConfigFile(defaults({ allowAllDirs: true })).global.security.restrictWorkingDirectory,
    false,
  );
});

test('P13: yolo/unsafe force per-shell injection protection off', () => {
  for (const mode of ['yolo', 'unsafe']) {
    const cfg = buildConfigFile(
      defaults({
        safetyMode: mode,
        shells: { cmd: { overrides: { security: { enableInjectionProtection: true } } } },
      }),
    );
    // Matches applyCliUnsafeMode, which clears shell-specific injection overrides;
    // otherwise the server deep-merges true over the global false.
    assert.equal(cfg.shells.cmd.overrides.security.enableInjectionProtection, false);
  }
});

test('P27: a disabled shell\'s allowed paths do not keep restrictWorkingDirectory under allowAllDirs', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  // cmd is disabled (shell selector picks powershell) but carries an allowlist.
  const viaSelector = buildConfigFile(
    defaults({
      allowAllDirs: true,
      shell: 'powershell',
      shells: { cmd: { overrides: { paths: { allowedPaths: ['/srv'] } } } },
    }),
  );
  // The disabled cmd shell can't be constrained, so allowAllDirs still lifts the
  // global restriction (else the enabled powershell inherits an empty allowlist).
  assert.equal(viaSelector.global.security.restrictWorkingDirectory, false);

  // Same via an explicit enabled:false.
  const viaFlag = buildConfigFile(
    defaults({
      allowAllDirs: true,
      shells: { cmd: { enabled: false, overrides: { paths: { allowedPaths: ['/srv'] } } } },
    }),
  );
  assert.equal(viaFlag.global.security.restrictWorkingDirectory, false);
});

test('P27: an enabled shell\'s allowed paths still keep the restriction under allowAllDirs', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const cfg = buildConfigFile(
    defaults({
      allowAllDirs: true,
      shells: { cmd: { enabled: true, overrides: { paths: { allowedPaths: ['/srv'] } } } },
    }),
  );
  assert.equal(cfg.global.security.restrictWorkingDirectory, true);
});

test('P82: paths on a shell with restrictWorkingDirectory disabled do not block the allowAllDirs lift', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  // cmd is enabled and has an allowlist, but explicitly disables its own working-dir
  // restriction, so those paths can never constrain it. They must not keep the global
  // restriction on (which would leave every OTHER enabled shell with an empty global
  // allowlist and reject commands with "No allowed paths configured").
  const cfg = buildConfigFile(
    defaults({
      allowAllDirs: true,
      shells: {
        cmd: {
          enabled: true,
          overrides: {
            security: { restrictWorkingDirectory: false },
            paths: { allowedPaths: ['/srv'] },
          },
        },
      },
    }),
  );
  assert.equal(cfg.global.security.restrictWorkingDirectory, false);
  // A shell that keeps the restriction (no override) still blocks the lift.
  const kept = buildConfigFile(
    defaults({
      allowAllDirs: true,
      shells: { cmd: { enabled: true, overrides: { paths: { allowedPaths: ['/srv'] } } } },
    }),
  );
  assert.equal(kept.global.security.restrictWorkingDirectory, true);
});

test('P28: a server-invalid log directory is dropped from the generated config', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  if (process.platform === 'win32') {
    const cfg = buildConfigFile(defaults({ logDirectory: 'C:/logs/a?b' }));
    // validateLoggingConfig rejects Windows-invalid characters; don't emit it.
    assert.equal(cfg.global.logging?.logDirectory, undefined);
  }
  // A clean absolute log dir is still emitted.
  const ok = buildConfigFile(defaults({ logDirectory: '/var/log/wcli0' }));
  assert.equal(ok.global.logging.logDirectory, '/var/log/wcli0');
});

test('P36: per-shell executable command/args resolve extension variables', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const cfg = buildConfigFile(
    defaults({
      shells: {
        gitbash: {
          executable: { command: '${workspaceFolder}/bin/sh', args: ['${workspaceFolder}/x', '-c'] },
        },
      },
    }),
  );
  // The server passes executable.command/args to spawn without expanding VS Code
  // variables, so they must be resolved into the generated config.
  assert.equal(cfg.shells.gitbash.executable.command, '/ws/bin/sh');
  assert.deepEqual(cfg.shells.gitbash.executable.args, ['/ws/x', '-c']);
});

test('P50: per-shell WSL allowed paths convert Windows paths to the mount form', () => {
  const cfg = buildConfigFile(
    defaults({
      shells: {
        wsl: {
          overrides: { paths: { allowedPaths: ['C:/repo', '/home/user'] } },
        },
      },
    }),
  );
  const paths = cfg.shells.wsl.overrides.paths;
  // The server adds per-shell WSL allowedPaths verbatim (only global paths are
  // converted), so a Windows path must be written in /mnt/<drive> form to match a
  // /mnt/c/... working directory. An already-Unix path is left untouched.
  assert.deepEqual(paths.allowedPaths, ['/mnt/c/repo', '/home/user']);
});

test('P50: a per-shell WSL mount point override is honored when converting paths', () => {
  const cfg = buildConfigFile(
    defaults({
      shells: {
        wsl: {
          wslConfig: { mountPoint: '/drives' },
          overrides: { paths: { allowedPaths: ['D:/data'] } },
        },
      },
    }),
  );
  assert.deepEqual(cfg.shells.wsl.overrides.paths.allowedPaths, ['/drives/d/data']);
});

test('P50: non-WSL shells keep Windows allowed paths unchanged', () => {
  const cfg = buildConfigFile(
    defaults({ shells: { cmd: { overrides: { paths: { allowedPaths: ['C:/repo'] } } } } }),
  );
  // cmd is validated as a Windows shell, so its allowlist stays in Windows form.
  assert.deepEqual(cfg.shells.cmd.overrides.paths.allowedPaths, ['C:/repo']);
});

test('P51: a relative path-like per-shell command is anchored to the workspace', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const cfg = buildConfigFile(
    defaults({ shells: { gitbash: { executable: { command: './tools/bash' } } } }),
  );
  // Anchored so a managed launch from the private extension dir still finds it.
  assert.equal(cfg.shells.gitbash.executable.command, require('path').resolve('/ws', './tools/bash'));
});

test('P67: a configured cwd anchors a relative per-shell command to that cwd', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const cfg = buildConfigFile(
    defaults({ cwd: '/repo', shells: { gitbash: { executable: { command: './tools/bash' } } } }),
  );
  // The server spawns executable.command with cwd set to the command's requested
  // working directory, not the launch cwd, so a relative command must be resolved to
  // an absolute path against the configured launch cwd before being written.
  assert.equal(cfg.shells.gitbash.executable.command, require('path').resolve('/repo', './tools/bash'));
});

test('P51: a bare PATH per-shell command is not anchored', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const cfg = buildConfigFile(
    defaults({ shells: { gitbash: { executable: { command: 'bash' } } } }),
  );
  assert.equal(cfg.shells.gitbash.executable.command, 'bash');
});

test('P54: an enabled per-shell config without allowedPaths does not keep restrictWorkingDirectory on under allowAllDirs', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const cfg = buildConfigFile(
    defaults({
      allowAllDirs: true,
      shells: { cmd: { enabled: true, overrides: { security: { maxCommandLength: 100 } } } },
    }),
  );
  // Only resolved per-shell allowedPaths can satisfy the working-directory
  // restriction, so with none configured allowAllDirs must lift it rather than leave
  // the shell restricted with an empty allowlist.
  assert.equal(cfg.global.security.restrictWorkingDirectory, false);
});

test('P54: a per-shell allowedPaths entry still blocks the allowAllDirs lift', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const cfg = buildConfigFile(
    defaults({
      allowAllDirs: true,
      shells: { cmd: { enabled: true, overrides: { paths: { allowedPaths: ['${workspaceFolder}/sub'] } } } },
    }),
  );
  assert.equal(cfg.global.security.restrictWorkingDirectory, true);
});

test('P95: ignoreInheritedShells strips per-shell overrides from a pinned/generated config', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  // A workspace opts out of inherited per-shell config but a home/cwd config.json still
  // forces the provider to pin via buildConfigFile. The inherited shell executable and
  // security override must NOT leak into the pinned config; only the legacy single-shell
  // selector and global settings apply.
  const cfg = buildConfigFile(
    defaults({
      shell: 'cmd',
      ignoreInheritedShells: true,
      shells: {
        cmd: {
          executable: { command: 'C:/evil/cmd.exe', args: ['/k'] },
          overrides: { security: { restrictWorkingDirectory: false } },
        },
        gitbash: { enabled: true },
      },
    }),
  );
  // The inherited cmd executable override is dropped (defaults restored).
  assert.equal(cfg.shells.cmd.executable.command, 'cmd.exe');
  assert.deepEqual(cfg.shells.cmd.executable.args, ['/c']);
  // No inherited per-shell security override survives.
  assert.equal(cfg.shells.cmd.overrides?.security?.restrictWorkingDirectory, undefined);
  // enabled follows the legacy single-shell selector (shell: 'cmd'), not the inherited
  // gitbash enable.
  assert.equal(cfg.shells.cmd.enabled, true);
  assert.equal(cfg.shells.gitbash.enabled, false);
});

test('P95: without ignoreInheritedShells the per-shell overrides are still applied', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const cfg = buildConfigFile(
    defaults({
      shell: 'cmd',
      ignoreInheritedShells: false,
      shells: { cmd: { executable: { command: 'C:/custom/cmd.exe', args: ['/k'] } } },
    }),
  );
  assert.equal(cfg.shells.cmd.executable.command, 'C:/custom/cmd.exe');
  assert.deepEqual(cfg.shells.cmd.executable.args, ['/k']);
});

test('profiles: no profiles key emitted when none configured', () => {
  const cfg = buildConfigFile(defaults());
  assert.equal('profiles' in cfg, false);
});

test('profiles: a valid profile is emitted with env, description and allowedShells', () => {
  const cfg = buildConfigFile(
    defaults({
      profiles: {
        ora19: {
          description: 'Oracle 19c',
          allowedShells: ['cmd', 'powershell'],
          env: { ORACLE_HOME: 'C:/oracle/19', PATH: 'C:/oracle/19/bin;${PATH}' },
        },
      },
    }),
  );
  assert.deepEqual(cfg.profiles, {
    ora19: {
      env: { ORACLE_HOME: 'C:/oracle/19', PATH: 'C:/oracle/19/bin;${PATH}' },
      description: 'Oracle 19c',
      allowedShells: ['cmd', 'powershell'],
    },
  });
});

test('profiles: a profile with an empty env is dropped (server rejects it)', () => {
  const cfg = buildConfigFile(
    defaults({ profiles: { empty: { env: {} }, ok: { env: { A: 'b' } } } }),
  );
  assert.equal('empty' in cfg.profiles, false);
  assert.deepEqual(cfg.profiles.ok, { env: { A: 'b' } });
});

test('profiles: when every profile is dropped no profiles key is emitted', () => {
  const cfg = buildConfigFile(defaults({ profiles: { empty: { env: {} } } }));
  assert.equal('profiles' in cfg, false);
});

test('profiles: ${workspaceFolder} is resolved but ${PATH} is left for the server', () => {
  vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' }, name: 'ws', index: 0 }];
  const cfg = buildConfigFile(
    defaults({
      profiles: { p: { env: { HOME_DIR: '${workspaceFolder}/bin', PATH: 'x;${PATH}' } } },
    }),
  );
  assert.equal(cfg.profiles.p.env.HOME_DIR, '/ws/bin');
  assert.equal(cfg.profiles.p.env.PATH, 'x;${PATH}');
});

test('profiles: blank env keys and non-string values are dropped', () => {
  const cfg = buildConfigFile(
    defaults({ profiles: { p: { env: { '  ': 'x', N: 5, OK: 'v' } } } }),
  );
  assert.deepEqual(cfg.profiles.p.env, { OK: 'v' });
});

test('profiles: an unknown shell in allowedShells is filtered out', () => {
  const cfg = buildConfigFile(
    defaults({ profiles: { p: { allowedShells: ['cmd', 'fish'], env: { A: 'b' } } } }),
  );
  assert.deepEqual(cfg.profiles.p.allowedShells, ['cmd']);
});

test('profiles: an all-invalid allowedShells is omitted (treated as all shells)', () => {
  const cfg = buildConfigFile(
    defaults({ profiles: { p: { allowedShells: ['fish'], env: { A: 'b' } } } }),
  );
  assert.equal('allowedShells' in cfg.profiles.p, false);
});

test('profiles: a blank profile name is skipped', () => {
  const cfg = buildConfigFile(
    defaults({ profiles: { '   ': { env: { A: 'b' } }, real: { env: { C: 'd' } } } }),
  );
  assert.deepEqual(Object.keys(cfg.profiles), ['real']);
});
