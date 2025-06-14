# Windows CLI MCP Server Architecture

## Overview

The server uses an inheritance-based configuration system where global defaults can be overridden by shell-specific settings.

## Core Components

### Configuration Resolution

1. **Global Defaults**: Applied to all shells
2. **Shell Overrides**: Shell-specific settings that override globals
3. **Resolved Configuration**: Final merged configuration used for execution

### Validation Context

Each command execution creates a validation context that includes:
- Shell name and type
- Resolved configuration for that shell
- Path format expectations

### Command Execution Flow

1. **Parse Request**: Validate shell and command arguments
2. **Resolve Configuration**: Get merged configuration for the shell
3. **Create Context**: Build validation context
4. **Validate Path**: Check working directory format and permissions
5. **Validate Command**: Check against shell-specific restrictions
6. **Execute**: Run command with shell-specific timeout

## Configuration Hierarchy

```config
ServerConfig
├── global
│   ├── security (timeout, max length, etc.)
│   ├── restrictions (blocked items)
│   └── paths (allowed paths)
└── shells
    ├── cmd
    │   ├── executable
    │   └── overrides
    ├── powershell
    │   ├── executable
    │   └── overrides
    └── wsl
        ├── executable
        ├── overrides
        └── wslConfig
```

## Tool Handlers

### execute_command
- Resolves shell configuration
- Creates validation context
- Validates and executes with shell-specific settings

### get_config
- Returns both raw configuration and resolved settings
- Shows effective configuration for each shell

### validate_directories
- Supports global validation against global paths
- Supports shell-specific validation with shell parameter

### set_current_directory
- Always validates against global allowed paths
- Updates server's active working directory
