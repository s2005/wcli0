# Frequently Asked Questions (FAQ)

## General Questions

### Q: What is the Windows CLI MCP Server?

A: The Windows CLI MCP Server is a Model Context Protocol (MCP) server that provides secure command-line access for Windows systems. It allows MCP clients like Claude Desktop to execute commands in various shells (PowerShell, CMD, Git Bash, WSL) with configurable security controls.

### Q: How does the inheritance-based configuration work?

A: The configuration uses a two-level system:
1. **Global settings** define defaults for all shells
2. **Shell-specific overrides** modify or extend global settings

Array values (like `blockedCommands`) are merged, while object values are deep-merged, and primitive values are replaced.

### Q: Which shells are supported?

A: The server supports:
- **PowerShell** (`powershell`) - Windows PowerShell or PowerShell Core
- **Command Prompt** (`cmd`) - Windows CMD
- **Git Bash** (`gitbash`) - Git for Windows Bash
- **WSL** (`wsl`) - Windows Subsystem for Linux

## Configuration Questions

### Q: Where should I place my configuration file?

A: The server looks for configuration files in this order:
1. Path specified with `--config` argument
2. `win-cli-mcp.config.json` in current directory
3. `~/.win-cli-mcp/config.json` in user home directory

### Q: How do I start with a basic configuration?

A: Copy one of the provided example configurations:
- `config.examples/minimal.json` - Basic setup with minimal restrictions
- `config.examples/development.json` - Development-friendly settings
- `config.examples/production.json` - High-security production settings

### Q: What happens if I don't provide a configuration file?

A: The server uses a secure default configuration with:
- Restricted working directory access
- Common dangerous commands blocked
- 30-second command timeout
- All major shells enabled with safe defaults

### Q: How do I enable/disable specific shells?

A: Set the `enabled` property in the shell configuration:

```json
{
  "shells": {
    "powershell": { "enabled": true },
    "cmd": { "enabled": false },
    "wsl": { "enabled": true }
  }
}
```

### Q: Can I have different security settings for different shells?

A: Yes! Use the `overrides` section in shell configuration:

```json
{
  "shells": {
    "powershell": {
      "enabled": true,
      "overrides": {
        "security": {
          "commandTimeout": 60,
          "maxCommandLength": 3000
        }
      }
    }
  }
}
```

## Security Questions

### Q: Is it safe to use this server?

A: The server is designed with security in mind, but it does provide command-line access to your system. Safety depends on proper configuration:

- **Default configuration** is restrictive and generally safe
- **Always review** allowed paths and blocked commands
- **Test thoroughly** in safe environments
- **Monitor usage** and review logs regularly

### Q: What security features are built-in?

A: Built-in security features include:
- **Path restrictions** - Limit command execution to specific directories
- **Command blocking** - Block dangerous commands and arguments
- **Injection protection** - Block common shell injection characters
- **Timeouts** - Prevent runaway processes
- **Input validation** - Validate all user inputs

### Q: How do I make the configuration more secure?

A: Follow these practices:
1. **Minimize allowed paths** - Only include necessary directories
2. **Block dangerous commands** - Add system-critical commands to blocklists
3. **Enable all protections** - Use `restrictWorkingDirectory` and `enableInjectionProtection`
4. **Use short timeouts** - Prevent long-running malicious processes
5. **Regular audits** - Review and update configuration periodically

### Q: What commands are blocked by default?

A: The default configuration blocks commands like:
- System modification: `format`, `shutdown`, `restart`
- File deletion: `rm`, `del`, `rmdir`
- Registry access: `reg`, `regedit`
- Network tools: `net`, `netsh`
- Administrative tools: `takeown`, `icacls`

## Path and Directory Questions

### Q: Why do different shells use different path formats?

A: Each shell has its own conventions:
- **CMD/PowerShell**: Windows format (`C:\\Users\\Name`)
- **WSL**: Unix format (`/home/user`, `/mnt/c/...`)
- **Git Bash**: Both formats (`C:\\Projects` or `/c/Projects`)

### Q: What does "restrictWorkingDirectory" do?

A: When enabled, it limits command execution to directories listed in `allowedPaths`. This prevents accessing sensitive system directories and provides an important security boundary.

### Q: How does WSL path mapping work?

A: WSL configuration includes special options:
- `inheritGlobalPaths`: Convert Windows paths to WSL format
- `mountPoint`: Where Windows drives are mounted (default: `/mnt/`)
- `pathMapping`: Enable automatic path conversion

Example:
```json
{
  "wsl": {
    "wslConfig": {
      "mountPoint": "/mnt/",
      "inheritGlobalPaths": true,
      "pathMapping": {
        "enabled": true,
        "windowsToWsl": true
      }
    }
  }
}
```

## Usage Questions

### Q: How do I execute a command?

A: Use the `execute_command` tool:

```json
{
  "tool": "execute_command",
  "arguments": {
    "shell": "powershell",
    "command": "Get-ChildItem *.txt",
    "workingDir": "C:\\MyFolder"
  }
}
```

### Q: What happens if I don't specify a workingDir?

A: The command runs in the server's current working directory. If not set, you'll get an error. Use `set_current_directory` to set it first, or always specify `workingDir`.

### Q: How do I check my current configuration?

A: Use the `get_config` tool to see the effective configuration:

```json
{
  "tool": "get_config",
  "arguments": {}
}
```

### Q: Can I validate directories before using them?

A: Yes, use the `validate_directories` tool:

```json
{
  "tool": "validate_directories", 
  "arguments": {
    "directories": ["C:\\Test", "D:\\Projects"],
    "shell": "powershell"
  }
}
```

## Troubleshooting

### Q: My command is being blocked, why?

A: Commands can be blocked for several reasons:
1. **Command name** is in `blockedCommands` list
2. **Arguments** contain blocked patterns
3. **Operators** like `&`, `|`, `;` are blocked
4. **Path restrictions** prevent access to the directory

Check your configuration with `get_config` to see effective restrictions.

### Q: I'm getting "directory not allowed" errors

A: This happens when:
1. `restrictWorkingDirectory` is enabled (recommended)
2. The directory isn't in `allowedPaths`
3. Path format doesn't match shell type (Windows vs Unix)

Use `validate_directories` to check if paths are allowed.

### Q: Commands are timing out, what should I do?

A: Command timeouts can be adjusted:
1. **Global timeout**: Set `global.security.commandTimeout`
2. **Shell-specific**: Use `shells.SHELL.overrides.security.commandTimeout`
3. **Break down operations**: Split complex commands into smaller parts

### Q: WSL commands aren't working

A: Common WSL issues:
1. **WSL not installed** - Install WSL from Microsoft Store
2. **Wrong path format** - Use Unix paths (`/home/user` not `C:\\Users\\user`)
3. **Distribution not running** - Start your WSL distribution first
4. **Path mapping disabled** - Enable `inheritGlobalPaths` if needed

### Q: Git Bash isn't found

A: Ensure Git for Windows is installed and update the executable path:

```json
{
  "shells": {
    "gitbash": {
      "executable": {
        "command": "C:\\Program Files\\Git\\bin\\bash.exe",
        "args": ["-c"]
      }
    }
  }
}
```

## Performance Questions

### Q: Which shell should I use for different tasks?

A: Choose based on your needs:
- **PowerShell**: Windows administration, .NET operations, object-based commands
- **CMD**: Simple Windows commands, batch files, legacy scripts
- **Git Bash**: Git operations, Unix-like commands, cross-platform scripts
- **WSL**: Linux development, Python/Node.js development, Unix tools

### Q: How can I optimize performance?

A: Best practices for performance:
1. **Use appropriate shell** for each task
2. **Specify working directories** to avoid path resolution
3. **Keep commands focused** - avoid complex chained operations
4. **Use shorter timeouts** for simple operations
5. **Cache results** when possible in your MCP client

## Development Questions

### Q: How do I test my configuration?

A: Testing approaches:
1. **Start simple** - Use minimal configuration first
2. **Test incrementally** - Add restrictions gradually
3. **Use safe directories** - Test in isolated folders
4. **Validate examples** - Ensure all example configs load correctly
5. **Run test suite** - Use `npm test` to verify functionality

### Q: Can I contribute new features?

A: Yes! The project welcomes contributions:
1. **Check issues** - Look for open issues or feature requests
2. **Follow guidelines** - See `CONTRIBUTING.md` for standards
3. **Write tests** - Include tests for new features
4. **Update documentation** - Keep docs current with changes

### Q: How do I report bugs or request features?

A: Use the project's issue tracker:
1. **Search existing issues** - Check if already reported
2. **Provide details** - Include configuration, error messages, steps to reproduce
3. **Include examples** - Minimal reproduction cases help
4. **Follow templates** - Use provided issue templates

## Advanced Questions

### Q: Can I create custom shell configurations?

A: Yes, you can add custom shells by specifying the executable and arguments:

```json
{
  "shells": {
    "custom-bash": {
      "enabled": true,
      "executable": {
        "command": "/usr/bin/bash",
        "args": ["-c"]
      }
    }
  }
}
```

### Q: How do I handle special characters in commands?

A: Different shells handle escaping differently:
- **PowerShell**: Use backticks or single quotes
- **CMD**: Use carets (^) or double quotes
- **Bash**: Use backslashes or single quotes

Test escaping in your target shell environment.

### Q: Can I run background processes?

A: The server is designed for command execution, not process management. Long-running processes will be terminated when they reach the timeout limit. For persistent services, consider:
1. Starting services through system tools
2. Using shell-specific background operators (where allowed)
3. Breaking operations into smaller, manageable chunks
