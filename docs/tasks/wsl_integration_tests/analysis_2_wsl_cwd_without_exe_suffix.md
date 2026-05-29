# Analysis 2 - WSL cwd without .exe suffix

## Decision: Rejected — theoretical edge case, intentional design

The `.exe` suffix check at `src/index.ts:403` is intentionally designed to differentiate between two runtime scenarios: (1) Windows-native Node.js spawning `wsl.exe` where `spawn` needs a Windows cwd, and (2) WSL2 Linux Node.js spawning `wsl.exe` via Windows interop where `spawn` needs a Linux cwd. Switching to `process.platform` would break scenario (2) because WSL2 reports `process.platform === 'linux'` despite having access to `wsl.exe`. The default configuration uses `wsl.exe`, and alternative executables (`wsl` without `.exe`, `.cmd` wrappers) are not standard WSL launchers.

**Why:** The `.exe` suffix is the correct heuristic for distinguishing Windows-native spawn from Linux spawn in the dual-platform WSL scenario. Users who change the executable away from the documented default of `wsl.exe` accept responsibility for the configuration. Using `process.platform` would cause real regressions for the WSL2-from-WSL use case.
