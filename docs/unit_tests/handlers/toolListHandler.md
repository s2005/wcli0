# handlers/toolListHandler

- **lists only enabled shells in execute_command** – ensures the execute_command tool schema lists only shells that are enabled in the configuration.
- **includes shell-specific settings in description** – verifies that the tool descriptions note per-shell settings such as command timeouts.
- **indicates path format for each shell** – checks that descriptions mention the expected path style for each shell.
- **validate_directories shows shell option when shells enabled** – confirms that the directory validation tool exposes a shell parameter when relevant.
- **omits validate_directories when restrictions disabled** – ensures the tool list excludes the directory validation tool when working directory restrictions are off.
