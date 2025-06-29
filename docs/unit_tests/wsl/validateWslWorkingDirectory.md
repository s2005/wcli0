# wsl/validateWslWorkingDirectory

- **accepts valid WSL directories from global or shell-specific lists** – directories under resolved allowed paths are permitted.
- **rejects directories outside the allowed set or with invalid format** – errors are thrown for disallowed roots, relative paths or Windows-style paths.
- **supports custom mount points and ignores unsupported global UNC paths** – validation uses the configured mount prefix and logs warnings for skipped UNC paths.
