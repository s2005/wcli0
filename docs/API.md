# API Reference

## Tools

### execute_command Tool

Execute a command in the specified shell with shell-specific validation and settings.

**Arguments:**

- `shell` (string, required): Shell to use (must be enabled in config)
- `command` (string, required): Command to execute
- `workingDir` (string, optional): Working directory
- `maxOutputLines` (number, optional): Maximum number of output lines to return (overrides global setting)

**Validation:**

- Path format must match shell expectations
- Command/arguments checked against shell-specific blocked lists
- Working directory validated against shell-specific allowed paths

**Example:**

```json
{
  "name": "execute_command",
  "arguments": {
    "shell": "wsl",
    "command": "ls -la",
    "workingDir": "/home/user"
  }
}
```

### get_config Tool

Return the current server configuration.

**Returns:**

- `global`: The default configuration applied to all shells
- `shells`: Enabled shells with any security, restriction or path overrides

### validate_directories Tool

Check if directories are valid for global or shell-specific contexts.

**Arguments:**

- `directories` (string[], required): List of directories to validate
- `shell` (string, optional): Specific shell to validate against

**Without shell parameter:** Validates against global allowed paths
**With shell parameter:** Validates against shell-specific allowed paths
