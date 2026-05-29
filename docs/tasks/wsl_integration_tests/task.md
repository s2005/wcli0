# WSL2 Real-Environment Integration Tests (bash shell)

## Goal

Create a test suite that runs the same scenarios as `tests/wsl.test.ts` (emulator-based) but targets **real `bash` shell** inside WSL2 instead of the `wsl-emulator.js` mock. This allows side-by-side comparison of emulator vs real bash behavior.

## Context

- `tests/wsl.test.ts` runs all commands through `scripts/wsl-emulator.js` — a Node.js script that simulates a Linux-like shell on Windows.
- The `bash` shell config uses `bash -c` as the executable (`src/utils/config.ts:105`). When the MCP server runs inside WSL2, `bash` resolves to the native Linux bash — no nesting or emulation.
- The `wsl` shell type uses `wsl.exe -e`, which is designed for Windows-to-WSL bridging. Inside WSL2, calling `wsl.exe` would nest WSL — the `bash` shell is the correct choice for in-WSL testing.
- These tests are the logical counterpart to `tests/windows/shellExecution.test.ts` (which tests cmd/powershell/gitbash on native Windows).

## Why bash, not wsl

Inside WSL2 the Node process is already running on Linux. The available shells differ:

| Shell | Executable | Works inside WSL2? |
|-------|-----------|-------------------|
| bash | `bash -c` | Yes — native Linux bash |
| wsl | `wsl.exe -e` | Redundant — nests WSL inside WSL |
| cmd | `cmd.exe /c` | Available via `/mnt/c/Windows/...`interop |
| powershell | `powershell.exe ...` | Available via interop |
| gitbash | `bash.exe -c` | Windows binary, available via interop |

Testing `bash` exercises the primary use case: an MCP server running natively inside WSL2, executing commands through the native Linux shell.

## File Location

`tests/wsl/bashExecution.test.ts`

## Guard

Tests must only run when inside WSL2. Detect WSL2 by checking for `/proc/version` containing `microsoft`:

```ts
import fs from 'fs';

function isRunningInWsl2(): boolean {
  if (process.platform !== 'linux') return false;
  try {
    const version = fs.readFileSync('/proc/version', 'utf8');
    return version.toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
}

const describeBash = isRunningInWsl2() ? describe : describe.skip;
```

This avoids the need to shell out to `wsl.exe` and correctly identifies the WSL2 Linux environment.

## Test Matrix

Mirror every test from `tests/wsl.test.ts`. Each test uses the **bash shell** (`bash -c`) instead of the emulator.

### Group 1: Basic Command Execution

| Test ID | Emulator Test | Real Bash Test | Description |
|---------|---------------|---------------|-------------|
| R1 | Test 1: echo | `echo hello bash in wsl2` | Basic command execution, check stdout, exit code 0 |
| R2 | Test 2: exit code | `exit 42` | Non-zero exit code reported correctly |
| R3 | Test 3: stderr | `ls /nonexistent_directory_for_bash_test_xyz` | stderr captured in output, non-zero exit code |
| R4 | Test 4: injection | `echo bad ; ls` | Semicolon blocked by injection protection |

### Group 2: Extended Command Execution

| Test ID | Emulator Test | Real Bash Test | Description |
|---------|---------------|---------------|-------------|
| R4.1 | Test 4.1: uname | `uname -a` | Verify output contains `Linux` (not `Msys` like the emulator) |
| R4.2 | Test 4.2: ls args | `ls -la /tmp` | Multi-argument command, check `total N` and `.`/`..` entries |
| R4.3 | Test 4.3: bad path | `ls /no/such/path/at/all` | Non-existent path, `No such file or directory` in output |

### Group 3: Working Directory Validation

| Test ID | Emulator Test | Real Bash Test | Description |
|---------|---------------|---------------|-------------|
| R5.1 | Test 5.1: valid cwd (sub) | `pwd` in `/tmp/bash-test-<rand>/sub` | Create temp dir under `/tmp`, verify `pwd` matches |
| R5.1.1 | Test 5.1.1: valid cwd (/tmp) | `pwd` in `/tmp` | Standard Linux path works as working directory |
| R5.2 | Test 5.2: invalid cwd | `pwd` in `/opt/forbidden_dir` | Rejected — not in allowedPaths |
| R5.3 | Test 5.3: invalid cwd (prefix) | `pwd` in `/tmp/bash-test-suffix` | Rejected — prefix match is not containment |
| R5.4 | Test 5.4: invalid cwd (pure Linux) | `pwd` in `/usr/local` | Rejected — not in allowedPaths |

## Configuration

Each test configures the bash shell with native `bash -c`, not the emulator:

```ts
testConfig.shells.bash = {
  type: 'bash',
  enabled: true,
  executable: {
    command: 'bash',
    args: ['-c']
  },
  overrides: {
    restrictions: {
      blockedOperators: ['&', '|', ';', '`']
    }
  }
};
```

All other shells (cmd, powershell, gitbash, wsl) are disabled.

## Key Differences from Emulator Tests

1. **uname output**: Emulator returns `Msys`; real bash in WSL2 returns `Linux` — test must match `Linux` only.
2. **Path handling**: Native Linux paths (`/tmp`, `/home/...`) work directly. No `/mnt/` conversion involved since `bash` is not a Windows `.exe` — the spawn cwd guard in `src/index.ts` leaves paths unchanged.
3. **Temp directories**: Use `/tmp/bash-test-<random>` inside the Linux filesystem. No Windows `os.tmpdir()` needed.
4. **Timing**: Real bash spawning is slower than the emulator (but faster than `wsl.exe` since there is no VM boundary). Increase timeouts if needed.
5. **Cleanup**: Temp directories created in `/tmp` must be removed in `afterEach`.
6. **Shell type**: Tests use `shell: 'bash'` in arguments, not `shell: 'wsl'`. The `validatePath` function for bash accepts `/` and relative paths — no `/mnt/` prefix required.

## Implementation Steps

1. Create `tests/wsl/bashExecution.test.ts` with the WSL2 detection guard.
2. Implement Group 1 (R1-R4) — basic execution and injection protection.
3. Implement Group 2 (R4.1-R4.3) — extended commands with real Linux output.
4. Implement Group 3 (R5.1-R5.4) — working directory validation with real Linux paths.
5. Verify all tests pass inside WSL2.
6. Verify all tests are skipped on native Linux, macOS, and Windows.

## Acceptance Criteria

- [x] Test file exists at `tests/wsl/bashExecution.test.ts`
- [x] Every test from `tests/wsl.test.ts` has a corresponding real-bash test
- [x] Tests are skipped outside WSL2 (checked via `/proc/version`)
- [x] Tests pass inside WSL2 with `bash -c`
- [x] No modification to existing emulator tests
- [x] Test naming follows the R1, R2, ... convention for easy cross-reference
