# P4 - Convert WSL cwd for extensionless Windows launcher

When the server runs on native Windows and the WSL executable is configured as `wsl` instead of the default `wsl.exe`, the `.exe` suffix check at `src/index.ts:403` leaves `/mnt/c/...` working directory unchanged. Windows `spawn` receives a Linux-style `cwd` and fails before WSL starts, whereas the previous behavior converted mounted paths for all WSL launchers. The conversion should be based on the host platform or recognized Windows WSL launchers rather than only a literal `.exe` suffix.
