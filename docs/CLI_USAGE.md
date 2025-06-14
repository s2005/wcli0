# CLI Usage Guide

This guide covers how to use the Windows CLI MCP Server with different shells and provides practical examples.

## Working with Different Shells

The server supports multiple shells, each with their own characteristics and path format requirements.

### Path Formats

Each shell expects paths in specific formats:

#### CMD and PowerShell Path Formats

```bash
# Correct - Windows format
"workingDir": "C:\\Users\\Me\\Projects"
"workingDir": "D:\\Data"

# Incorrect - Unix format
"workingDir": "/c/Users/Me/Projects"
```

#### WSL Path Formats

```bash
# Correct - Unix format
"workingDir": "/home/user"
"workingDir": "/mnt/c/Projects"

# Incorrect - Windows format
"workingDir": "C:\\Projects"
```

#### Git Bash (Accepts Both)

```bash
# Both formats work
"workingDir": "C:\\Projects\\MyApp"
"workingDir": "/c/Projects/MyApp"
```

## Shell Usage Examples

### CMD Examples

Execute basic commands in Command Prompt:

```json
{
  "tool": "execute_command",
  "arguments": {
    "shell": "cmd",
    "command": "dir /b *.txt",
    "workingDir": "C:\\Documents"
  }
}
```

```json
{
  "tool": "execute_command",
  "arguments": {
    "shell": "cmd",
    "command": "echo Hello World > output.txt",
    "workingDir": "C:\\Temp"
  }
}
```

### PowerShell Examples

Execute PowerShell commands and scripts:

```json
{
  "tool": "execute_command",
  "arguments": {
    "shell": "powershell",
    "command": "Get-ChildItem -Filter *.log | Select-Object -First 10",
    "workingDir": "C:\\Logs"
  }
}
```

```json
{
  "tool": "execute_command",
  "arguments": {
    "shell": "powershell",
    "command": "Get-Process | Where-Object {$_.CPU -gt 100}",
    "workingDir": "C:\\Scripts"
  }
}
```

### WSL Examples

Execute Linux commands through WSL:

```json
{
  "tool": "execute_command",
  "arguments": {
    "shell": "wsl",
    "command": "find /home/user -name '*.py' -type f",
    "workingDir": "/home/user"
  }
}
```

```json
{
  "tool": "execute_command",
  "arguments": {
    "shell": "wsl",
    "command": "ls -la | grep '^d'",
    "workingDir": "/home/user/projects"
  }
}
```

### Git Bash Examples

Execute commands in Git Bash environment:

```json
{
  "tool": "execute_command",
  "arguments": {
    "shell": "gitbash",
    "command": "git log --oneline -10",
    "workingDir": "/c/Projects/MyRepo"
  }
}
```

```json
{
  "tool": "execute_command",
  "arguments": {
    "shell": "gitbash",
    "command": "find . -name '*.js' | head -20",
    "workingDir": "C:\\Projects\\WebApp"
  }
}
```

## Configuration Management

### View Current Configuration

Check the server's current configuration settings:

```json
{
  "tool": "get_config",
  "arguments": {}
}
```

### Validate Directories

#### Global Directory Validation

Check if directories are allowed globally:

```json
{
  "tool": "validate_directories",
  "arguments": {
    "directories": ["C:\\Test", "D:\\Projects"]
  }
}
```

#### Shell-Specific Directory Validation

Check if directories are allowed for a specific shell:

```json
{
  "tool": "validate_directories",
  "arguments": {
    "directories": ["/home/user", "/tmp"],
    "shell": "wsl"
  }
}
```

## Working Directory Management

### Check Current Directory

```json
{
  "tool": "get_current_directory",
  "arguments": {}
}
```

### Set Working Directory

```json
{
  "tool": "set_current_directory",
  "arguments": {
    "path": "C:\\Projects\\MyApp"
  }
}
```

### Execute Without Specifying Directory

When workingDir is omitted, the command uses the server's current directory:

```json
{
  "tool": "execute_command",
  "arguments": {
    "shell": "cmd",
    "command": "dir"
  }
}
```

## Common Usage Patterns

### File Operations

#### List Files (Cross-Shell)

```json
// CMD
{"shell": "cmd", "command": "dir *.txt"}

// PowerShell  
{"shell": "powershell", "command": "Get-ChildItem *.txt"}

// WSL/Git Bash
{"shell": "wsl", "command": "ls *.txt"}
```

#### Read File Content

```json
// CMD
{"shell": "cmd", "command": "type file.txt"}

// PowerShell
{"shell": "powershell", "command": "Get-Content file.txt"}

// WSL/Git Bash
{"shell": "wsl", "command": "cat file.txt"}
```

#### Search File Content

```json
// CMD
{"shell": "cmd", "command": "findstr \"pattern\" *.txt"}

// PowerShell
{"shell": "powershell", "command": "Select-String -Pattern \"pattern\" *.txt"}

// WSL/Git Bash
{"shell": "wsl", "command": "grep \"pattern\" *.txt"}
```

### Script Execution

#### Windows Batch Script

```json
{
  "shell": "cmd",
  "command": "script.bat param1 param2",
  "workingDir": "C:\\Scripts"
}
```

#### PowerShell Script

```json
{
  "shell": "powershell", 
  "command": ".\\script.ps1 -Param1 value1",
  "workingDir": "C:\\Scripts"
}
```

#### Bash Script in WSL

```json
{
  "shell": "wsl",
  "command": "./script.sh --option value", 
  "workingDir": "/home/user/scripts"
}
```

#### Bash Script in Git Bash

```json
{
  "shell": "gitbash",
  "command": "./build.sh --env production",
  "workingDir": "/c/Projects/webapp"
}
```

### Development Workflows

#### Node.js Development

```json
// Install dependencies
{"shell": "cmd", "command": "npm install", "workingDir": "C:\\Projects\\myapp"}

// Run tests
{"shell": "powershell", "command": "npm test", "workingDir": "C:\\Projects\\myapp"}

// Start development server
{"shell": "gitbash", "command": "npm run dev", "workingDir": "/c/Projects/myapp"}
```

#### Git Operations

```json
// Check status
{"shell": "gitbash", "command": "git status", "workingDir": "/c/Projects/repo"}

// View recent commits
{"shell": "gitbash", "command": "git log --oneline -10", "workingDir": "/c/Projects/repo"}

// Create and switch branch
{"shell": "gitbash", "command": "git checkout -b feature/new-feature", "workingDir": "/c/Projects/repo"}
```

#### Python Development

```json
// Using WSL for Python
{"shell": "wsl", "command": "python --version", "workingDir": "/home/user/python-project"}

// Run Python script
{"shell": "wsl", "command": "python script.py --input data.txt", "workingDir": "/home/user/python-project"}

// Install packages
{"shell": "wsl", "command": "pip install -r requirements.txt", "workingDir": "/home/user/python-project"}
```

## Troubleshooting

### Command Blocked

**Problem**: Command execution is blocked

**Solutions**:
1. Check global and shell-specific blocked commands with `get_config`
2. Verify the command isn't in the `blockedCommands` array
3. Check if the command contains blocked arguments or operators
4. Consider using alternative commands or modify configuration

### Path Not Allowed

**Problem**: Directory access denied

**Solutions**:
1. Use `validate_directories` to check path permissions
2. Verify path format matches shell type (Windows vs Unix paths)
3. Check `allowedPaths` in configuration
4. For WSL, ensure paths use Unix format (`/home/user` not `C:\\Users\\user`)

### Timeout Errors

**Problem**: Commands taking too long to execute

**Solutions**:
1. Check timeout settings with `get_config`
2. Consider shell-specific timeout overrides for long-running operations
3. Break down complex operations into smaller commands
4. Use background processes for long-running tasks

### Working Directory Issues

**Problem**: Commands failing due to directory problems

**Solutions**:
1. Use `get_current_directory` to check current location
2. Use `set_current_directory` to change to allowed directory
3. Always specify `workingDir` in commands when possible
4. Verify directory exists and is accessible

### Shell Not Available

**Problem**: Specified shell not found or disabled

**Solutions**:
1. Check shell configuration with `get_config`
2. Verify shell is enabled in configuration
3. Check executable path is correct
4. Install required shell if missing (Git Bash, WSL, etc.)

## Best Practices

### Security
- Always use the minimum required permissions
- Regularly review allowed paths and blocked commands
- Test commands in safe environments first
- Monitor command execution logs

### Performance
- Use appropriate shell for each task
- Specify working directories to avoid path resolution overhead  
- Break complex operations into smaller commands
- Consider command timeout implications

### Portability
- Use relative paths when possible
- Account for different path formats between shells
- Test commands across different shell environments
- Document shell-specific requirements

### Error Handling
- Always check command output for errors
- Use `validate_directories` before executing commands
- Handle timeout scenarios gracefully
- Provide fallback commands for critical operations
