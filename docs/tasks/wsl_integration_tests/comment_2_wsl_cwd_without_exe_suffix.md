# P2 - Convert WSL cwd for Windows commands without .exe suffix

When the server is running on Windows and the WSL shell executable is configured as `wsl` (or a wrapper such as `.cmd`) instead of the default `wsl.exe`, the check at `src/index.ts:403` leaves `/mnt/c/...` as the process `cwd`; Windows `spawn` cannot use that Linux-style cwd, so commands with a mounted-drive workingDir fail before reaching WSL. The conversion should be based on the host/platform or all Windows-resolved WSL launchers, not only a literal `.exe` suffix.
