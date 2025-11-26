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

### get_command_output Tool

Retrieve the full output from a previous command execution. Use this when command output was truncated and you need to see the complete result.

**Arguments:**

- `executionId` (string, required): The execution ID from the truncation message
- `startLine` (number, optional): 1-based start line (default: 1)
- `endLine` (number, optional): 1-based end line (default: last line)
- `search` (string, optional): Regex pattern (case-insensitive) to filter lines
- `maxLines` (number, optional): Maximum lines to return (default: config value)

**Example:**

```json
{
  "name": "get_command_output",
  "arguments": {
    "executionId": "20251126-abc123"
  }
}
```

**With line range:**

```json
{
  "name": "get_command_output",
  "arguments": {
    "executionId": "20251126-abc123",
    "startLine": 100,
    "endLine": 150
  }
}
```

**With search filter:**

```json
{
  "name": "get_command_output",
  "arguments": {
    "executionId": "20251126-abc123",
    "search": "error|failed|exception"
  }
}
```

### validate_directories Tool

Check if directories are valid for global or shell-specific contexts.

**Arguments:**

- `directories` (string[], required): List of directories to validate
- `shell` (string, optional): Specific shell to validate against

**Without shell parameter:** Validates against global allowed paths
**With shell parameter:** Validates against shell-specific allowed paths
