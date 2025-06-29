# validation/pathValidation

- **normalizes Windows paths correctly** – tests that Windows-style paths are normalized for comparison.
- **normalizes Unix paths correctly** – ensures Unix paths remain consistent when normalized.
- **normalizes GitBash paths correctly** – converts `/c/` style paths to a Windows format for validation.
- **validates Windows paths with Windows shell** – allowed directories pass and disallowed ones throw errors.
- **validates WSL paths with WSL shell** – confirms that `/mnt/<drive>` paths are checked against allowed entries.
- **validates GitBash paths with GitBash shell** – ensures GitBash-specific paths are accepted when within allowed paths.
- **allows any path when restriction is disabled** – verifies disabling restrictWorkingDirectory bypasses checks.
- **handles empty allowed paths** – when no paths are configured validation should fail with a helpful message.
