# Dedicated Bash Shell Tests

These tests verify the dedicated Bash shell integration, which is distinct from the generic WSL shell.

## Tests Summary

- **`Basic Execution`**:
    - Verifies simple command execution (e.g., `echo`) using the `bash` type.
- **`Working Directory Validation`**:
    - Confirms that the `bash` shell correctly enforces working directory restrictions.
    - Verifies that valid paths (matching the bash path validator) are accepted and invalid paths are rejected.
    - Ensures that the active working directory is correctly reported in the command metadata.
