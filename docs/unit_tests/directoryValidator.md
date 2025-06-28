# directoryValidator

- **should return valid for directories within allowed paths** – validates that directories contained in the allowed list are accepted.
- **should return invalid for directories outside allowed paths** – checks that directories outside the whitelist are reported as invalid.
- **should handle a mix of valid and invalid directories** – ensures that only the directories outside the allowed paths are listed as invalid.
- **should handle GitBash style paths** – confirms that Unix-style paths like `/c/Users/...` are normalized and validated correctly.
- **should consider invalid paths that throw during normalization** – tests that paths causing normalization errors are treated as invalid.
- **should not throw for valid directories** – verifies that the throwing validator passes silently when all directories are allowed.
- **should throw McpError for invalid directories** – checks that a custom error is thrown when invalid directories are found.
- **should include invalid directories in error message** – ensures the thrown error lists each offending directory and allowed paths for clarity.
- **should use singular wording for a single invalid directory** – tests that the error message uses singular phrasing when only one directory is invalid.
- **should handle empty directories array** – confirms that validating an empty list of directories succeeds.
- **should handle empty allowed paths array** – ensures that an empty allowed path configuration results in an error when validating directories.
