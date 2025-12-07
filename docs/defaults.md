# Default Configuration Values

This document lists the default settings applied when no custom configuration is provided. Values come from `DEFAULT_CONFIG` in `src/utils/config.ts` and are merged with any user-provided configuration at startup.

## Global Logging Defaults

- `maxOutputLines`: 20
- `enableTruncation`: true
- `truncationMessage`: `[Output truncated: Showing last {returnedLines} of {totalLines} lines]`
- `maxStoredLogs`: 50
- `maxLogSize`: 1,048,576 bytes (1 MB)
- `maxTotalStorageSize`: 52,428,800 bytes (50 MB in-memory buffer)
- `enableLogResources`: true
- `logRetentionMinutes`: 1,440 minutes (24 hours)
- `cleanupIntervalMinutes`: 5 minutes
- `logDirectory`: undefined (in-memory only unless set)
- `logRetentionDays`: not set by default (minutes-based retention remains active)
- `maxTotalLogSize`: 104,857,600 bytes (100 MB on-disk limit)
- `maxReturnLines`: 500
- `maxReturnBytes`: 1,048,576 bytes (1 MB retrieval cap)
- `exposeFullPath`: false

## Global Security Defaults

- `maxCommandLength`: 2000 characters
- `commandTimeout`: 30 seconds
- `enableInjectionProtection`: true
- `restrictWorkingDirectory`: true

## Global Restriction Defaults

- `blockedCommands`: `format`, `shutdown`, `restart`, `reg`, `regedit`, `net`, `netsh`, `takeown`, `icacls`
- `blockedArguments`: `--exec`, `-e`, `/c`, `-enc`, `-encodedcommand`, `-command`, `--interactive`, `-i`, `--login`, `--system`
- `blockedOperators`: `&`, `|`, `;`, `` ` ``

## Global Path Defaults

- `allowedPaths`: [] (empty list)
- `initialDir`: undefined

## Shell Defaults

- **PowerShell**
  - Enabled: true
  - Command: `powershell.exe`
  - Args: `-NoProfile`, `-NonInteractive`, `-Command`
  - Path validation: Windows drive paths (`^[a-zA-Z]:\\`)

- **CMD**
  - Enabled: true
  - Command: `cmd.exe`
  - Args: `/c`
  - Path validation: Windows drive paths (`^[a-zA-Z]:\\`)
  - Overrides: blocks `del`, `rd`, `rmdir`

- **Git Bash**
  - Enabled: true
  - Command: `C:\\Program Files\\Git\\bin\\bash.exe`
  - Args: `-c`
  - Path validation: Windows drives or `/c/` style (`^([a-zA-Z]:\\|/[a-z]/)`) paths
  - Overrides: blocks `rm`

- **Bash**
  - Enabled: true
  - Command: `bash`
  - Args: `-c`
  - Path validation: `/mnt/<drive>/` or POSIX root paths
  - WSL config: mount point `/mnt/`, inherits global allowed paths

- **WSL**
  - Enabled: true
  - Command: `wsl.exe`
  - Args: `-e`
  - Path validation: `/mnt/<drive>/` or POSIX root paths
  - WSL config: mount point `/mnt/`, inherits global allowed paths
