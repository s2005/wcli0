# pathValidation.edge

- **WSL converts Windows paths before validation** – ensures Windows style paths are converted to `/mnt/` form for checking.
- **WSL rejects paths outside allowed list after conversion** – disallowed paths remain blocked even after conversion.
- **GitBash accepts Windows and Unix style paths** – verifies both `C:\\` and `/c/` formats are permitted when allowed.
- **handles lowercase drive letters for Windows paths** – ensures Git Bash accepts `d:\\foo` when the allowed list contains `D:\\foo`.
- **throws when allowedPaths empty** – validation fails if no allowed paths are configured.
