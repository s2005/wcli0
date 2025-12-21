# Windows CLI MCP Server (Enhanced)

[![NPM Downloads](https://img.shields.io/npm/dt/wcli0.svg?style=flat)](https://www.npmjs.com/package/wcli0)
[![NPM Version](https://img.shields.io/npm/v/wcli0.svg?style=flat)](https://www.npmjs.com/package/wcli0?activeTab=versions)

[MCP server](https://modelcontextprotocol.io/introduction) for secure command-line interactions on Windows systems, enabling controlled access to PowerShell, CMD, Git Bash, and Bash shells.
It allows MCP clients (like [Claude Desktop](https://claude.ai/download)) to perform operations on your system, similar to [Open Interpreter](https://github.com/OpenInterpreter/open-interpreter).

This enhanced version includes advanced configuration management, improved security features, and comprehensive testing capabilities.

>[!IMPORTANT]
> This MCP server provides direct access to your system's command line interface. When enabled, it grants access to your files, environment variables, and command execution capabilities.
>
> - Review and restrict allowed paths
> - Enable directory restrictions
> - Configure command blocks
> - Consider security implications
>
> See [Configuration](#configuration) for more details.

- [Windows CLI MCP Server (Enhanced)](#windows-cli-mcp-server-enhanced)
  - [Features](#features)
  - [Usage with Claude Desktop](#usage-with-claude-desktop)
    - [Configuration Setup](#configuration-setup)
  - [Configuration](#configuration)
    - [Configuration Structure](#configuration-structure)
    - [Configuration Locations](#configuration-locations)
    - [Default Configuration](#default-configuration)
    - [Configuration Settings](#configuration-settings)
      - [Global Settings](#global-settings)
        - [Security Settings](#security-settings)
        - [Restriction Settings](#restriction-settings)
        - [Path Settings](#path-settings)
      - [Shell Configuration](#shell-configuration)
        - [Basic Shell Configuration](#basic-shell-configuration)
        - [Shell-Specific Overrides](#shell-specific-overrides)
        - [WSL Configuration](#wsl-configuration)
    - [Configuration Inheritance](#configuration-inheritance)
  - [API](#api)
    - [Tools](#tools)
    - [Resources](#resources)
  - [Security Considerations](#security-considerations)
    - [Built-in Security Features](#built-in-security-features)
    - [Configurable Security Features (Active by Default)](#configurable-security-features-active-by-default)
    - [Best Practices](#best-practices)
  - [Using the MCP Inspector for Testing](#using-the-mcp-inspector-for-testing)
  - [Development and Testing](#development-and-testing)
    - [Running Tests](#running-tests)
    - [Cross-Platform Testing](#cross-platform-testing)
  - [Acknowledgments](#acknowledgments)
  - [Development Environment using Dev Containers](#development-environment-using-dev-containers)
    - [Prerequisites](#prerequisites)
    - [Getting Started](#getting-started)
    - [Running Tests in the Dev Container](#running-tests-in-the-dev-container)
  - [License](#license)

## Features

- **Multi-Shell Support**: Execute commands in PowerShell, Command Prompt (CMD), Git Bash, Bash, and WSL
- **Modular Architecture**: Build only the shells you need for smaller bundle sizes (30-65% reduction)
- **Inheritance-Based Configuration**: Global defaults with shell-specific overrides
- **Shell-Specific Validation**: Each shell can have its own security settings and path formats
- **Flexible Path Management**: Different shells support different path formats (Windows/Unix/Mixed)
- **Resource Exposure**: View configuration and security settings as MCP resources
- **Explicit Working Directory State**: The server maintains an active working directory used when `execute_command` omits `workingDir`. If the launch directory isn't allowed, this state starts unset and must be set via `set_current_directory`.
- **Optional Initial Directory**: Configure `initialDir` to start the server in a specific directory.
- **Security Controls**:
  - Command blocking (full paths, case variations)
  - Working directory validation
  - Maximum command length limits
  - Smart argument validation
  - Shell-specific timeout settings
- **Configurable**:
  - Inheritance-based configuration system
  - Shell-specific security overrides
  - Dynamic tool descriptions based on enabled shells

See the [API](#api) section for more details on the tools and resources the server provides to MCP clients.

**Note**: The server will only allow operations within configured directories, with allowed commands.

## Modular Shell Architecture

WCLI0 now supports a modular architecture that allows you to build specialized versions containing only the shells you need. This results in significantly smaller bundle sizes and faster startup times.

### Build Options

Choose from several pre-configured builds:

```bash
# Full build (all shells) - default
npm run build

# Windows-only shells (PowerShell, CMD, Git Bash)
npm run build:windows

# Git Bash only (smallest Windows build)
npm run build:gitbash

# CMD only
npm run build:cmd

# Unix/Linux only (Bash)
npm run build:unix

# Custom combination
INCLUDED_SHELLS=gitbash,powershell npm run build:custom
```

### Bundle Size Comparison

| Build | Size Reduction | Shells Included |
|-------|---------------|-----------------|
| Full | Baseline | All 5 shells |
| Windows | ~40% smaller | PowerShell, CMD, Git Bash |
| Git Bash Only | ~60% smaller | Git Bash |
| CMD Only | ~65% smaller | CMD |
| Unix | ~60% smaller | Bash |

### Documentation

For detailed information about the modular architecture:

- **[Architecture Overview](docs/tasks/modular_shells/ARCHITECTURE.md)** - System design and module structure
- **[User Guide](docs/tasks/modular_shells/USER_GUIDE.md)** - How to build and use specialized versions
- **[API Documentation](docs/tasks/modular_shells/API.md)** - Complete API reference for shell plugins
- **[Migration Guide](docs/tasks/modular_shells/MIGRATION_GUIDE.md)** - Upgrading from previous versions
- **[Testing Guide](docs/tasks/modular_shells/TESTING_GUIDE.md)** - Testing strategies for modular shells

### Quick Start with Specialized Builds

If you only need Git Bash:

```bash
# Build
npm run build:gitbash

# Use in Claude Desktop config
{
  "mcpServers": {
    "windows-cli": {
      "command": "node",
      "args": ["/path/to/wcli0/dist/index.gitbash-only.js"]
    }
  }
}
```

## Log Management

wcli0 automatically stores command execution logs and provides MCP resources for querying historical output with advanced filtering capabilities.

### Output Truncation

By default, command responses show only the last 20 lines to prevent overwhelming long outputs. Full output is always stored and accessible via:

- **File-based storage**: When `logDirectory` is configured, logs are saved to files for persistent storage
- **In-memory storage**: Default behavior using MCP log resources (e.g., `cli://logs/commands/{id}`)
- The `get_command_output` tool (fallback for hosts that cannot read resources)

Configure truncation settings:

```json
{
  "global": {
    "logging": {
      "maxOutputLines": 20,
      "enableTruncation": true
    }
  }
}
```

### File-Based Log Storage

For persistent logging, configure a log directory:

```json
{
  "global": {
    "logging": {
      "logDirectory": "./logs",
      "exposeFullPath": false
    }
  }
}
```

Or via CLI:

```bash
npx wcli0 --shell gitbash --logDirectory ./logs
```

When file-based logging is enabled:

- Truncation messages show the file path directly (simpler output)
- Logs persist across server restarts
- No in-memory storage limits apply
- Starting the server with `--debug` automatically enables file-based logging to your OS temp directory (`<temp>/wcli0-debug-logs`) when no `logDirectory` is set, so every command and its output are persisted during debugging sessions.

> **Security Note**: Log files may contain sensitive command output. Ensure the log directory has appropriate permissions.

### Log Resources

Access stored command output via MCP resources (in-memory mode):

- `cli://logs/list` - List all stored command execution logs
- `cli://logs/recent?n=10` - Get the N most recent logs
- `cli://logs/commands/{id}` - Access full output from a specific command
- `cli://logs/commands/{id}/range?start=1&end=100` - Query specific line ranges
- `cli://logs/commands/{id}/search?q=error&context=3` - Search logs with context

See [API Documentation](docs/API.md) for detailed resource specifications and query parameters.

### Example Configuration

```json
{
  "global": {
    "logging": {
      "maxOutputLines": 20,
      "enableTruncation": true,
      "maxStoredLogs": 50,
      "maxLogSize": 1048576,
      "enableLogResources": true,
      "logRetentionMinutes": 1440,
      "logDirectory": "./logs"
    }
  }
}
```

## Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "windows-cli": {
      "command": "npx",
      "args": ["-y", "wcli0"]
    }
  }
}
```

For use with a specific config file, add the `--config` flag:

```json
{
  "mcpServers": {
    "windows-cli": {
      "command": "npx",
      "args": [
        "-y",
        "wcli0",
        "--config",
        "path/to/your/config.json"
      ]
    }
  }
}
```

### Configuration Setup

To get started with configuration:

1. **Use a sample configuration**:
   - Copy `config.examples/config.sample.json` for basic setup
   - Copy `config.examples/config.development.json` for development environments
   - Copy `config.examples/config.secure.json` for high-security environments
   - Copy `config.examples/emptyRestrictions.json` to remove all default restrictions

2. **Create your own configuration**:

   ```bash
   # Copy and customize a sample
   cp config.examples/config.sample.json my-config.json

   # Or generate a default config
   npx wcli0 --init-config ./my-config.json
   ```

   The server also accepts an `--initialDir` flag to override the initial
   working directory defined in your configuration file:

    ```bash
    npx wcli0 --config ./my-config.json --initialDir /path/to/start
    ```

   You can override global command limits directly from the CLI:

    ```bash
    npx wcli0 --config ./my-config.json \
      --maxCommandLength 5000 --commandTimeout 60
    ```

   You can configure output truncation and logging via CLI:

    ```bash
    npx wcli0 --shell gitbash \
      --maxOutputLines 50 \
      --enableTruncation \
      --enableLogResources \
      --maxReturnLines 1000 \
      --logDirectory ./logs
    ```

   | Option | Type | Default | Description |
   |--------|------|---------|-------------|
   | `--maxOutputLines` | number | 20 | Maximum output lines before truncation |
   | `--enableTruncation` | boolean | true | Enable output truncation |
   | `--enableLogResources` | boolean | true | Enable log resources for `get_command_output` |
   | `--maxReturnLines` | number | 500 | Maximum lines returned by `get_command_output` |
   | `--logDirectory` | string | - | Directory for file-based log storage (instead of in-memory) |

   When `--logDirectory` is configured, command output logs are saved to files instead of in-memory storage.
   Truncation messages will show the file path for easy access to full output.

   > **Security Note**: Log files may contain sensitive data from command output. Ensure the log directory
   > has appropriate permissions and consider implementing log rotation.

   You can override blocked restrictions directly from the CLI. Pass the option with
   an empty string to clear defaults:

    ```bash
    npx wcli0 --blockedCommand "" --blockedArgument "" --blockedOperator ""
    ```

   Provide the flag multiple times to specify values:

    ```bash
    npx wcli0 --blockedCommand rm --blockedCommand del
    ```

   You can also start the server with a specific shell and allowed directories
   without a configuration file:

   ```bash
   npx wcli0 --shell powershell \
     --allowedDir C:\safe --allowedDir D:\projects
   ```

   For WSL shells, you can specify a custom mount location:

  ```bash
  npx wcli0 --shell wsl \
    --wslMountPoint /windows/
  ```

  To disable directory restrictions entirely when no allowed paths are
  configured, start the server with:

  ```bash
  npx wcli0 --allowAllDirs
  ```

  When started this way, `restrictWorkingDirectory` is forced on and
  `enableInjectionProtection` is disabled to ensure the allowed paths apply
  without shell injection checks.

  If you need to disable safety checks that block command execution for
  experimentation, you can start the server in **unsafe** or **YOLO** modes
  (not recommended for production):

  ```bash
  # YOLO disables all safety checks except allowed working directories
  npx wcli0 --yolo

  # Fully unsafe removes all safety checks, including directory limits
  npx wcli0 --unsafe
  ```

  Both modes clear blocked commands/arguments/operators and turn off injection
  protection. YOLO mode leaves working directory restrictions active, while
  fully unsafe mode disables those restrictions as well. These two flags are
  mutually exclusive; using both at once will fail.

1. **Update your Claude Desktop configuration** to use your config file:

   ```json
   {
     "mcpServers": {
       "windows-cli": {
         "command": "npx",
         "args": [
           "-y",
           "wcli0",
           "--config",
           "./my-config.json"
         ]
       }
     }
   }
   ```

After configuring, you can:

- Execute commands directly using the available tools
- View server configuration and security settings in the Resources section
- Access shell-specific configurations and capabilities

## Configuration

The server uses an inheritance-based configuration system where global defaults can be overridden by shell-specific settings.

### Configuration Structure

```json
{
  "global": {
    "security": {
      "maxCommandLength": 2000,
      "commandTimeout": 30,
      "enableInjectionProtection": true,
      "restrictWorkingDirectory": true
    },
    "restrictions": {
      "blockedCommands": ["format", "shutdown"],
      "blockedArguments": ["--exec", "-e"],
      "blockedOperators": ["&", "|", ";", "`"]
    },
    "paths": {
      "allowedPaths": ["/home/user", "/tmp"],
      "initialDir": "/home/user"
    }
  },
  "shells": {
    "powershell": {
      "type": "powershell",
      "enabled": true,
      "executable": {
        "command": "powershell.exe",
        "args": ["-NoProfile", "-NonInteractive", "-Command"]
      },
      "overrides": {
        "security": {
          "commandTimeout": 45
        },
        "restrictions": {
          "blockedCommands": ["Remove-Item", "Format-Volume"]
        }
      }
    },
    "wsl": {
      "type": "wsl",
      "enabled": true,
      "executable": {
        "command": "wsl.exe",
        "args": ["-e"]
      },
      "wslConfig": {
        "mountPoint": "/mnt/",
        "inheritGlobalPaths": true
      }
    }
  }
}
```

### Configuration Locations

The server looks for configuration files in the following order:

1. Path specified via `--config` command line argument
2. `win-cli-mcp.config.json` in the current working directory
3. `~/.win-cli-mcp/config.json` in user's home directory

If no configuration file is found, the server will use a default (restricted) configuration.

### Default Configuration

**Note**: The default configuration is designed to be restrictive and secure. Find more details on each setting in the [Configuration Settings](#configuration-settings) section.

For a complete reference of all default values, see [docs/defaults.md](docs/defaults.md).

```json
{
  "global": {
    "security": {
      "maxCommandLength": 2000,
      "commandTimeout": 30,
      "enableInjectionProtection": true,
      "restrictWorkingDirectory": true
    },
    "restrictions": {
      "blockedCommands": [
        "rm", "del", "rmdir", "format", "shutdown", "restart",
        "reg", "regedit", "net", "netsh", "takeown", "icacls"
      ],
      "blockedArguments": [
        "--exec", "-e", "/c", "-enc", "-encodedcommand",
        "-command", "--interactive", "-i", "--login", "--system"
      ],
      "blockedOperators": ["&", "|", ";", "`"]
    },
    "paths": {
      "initialDir": null
    }
  },
  "shells": {
    "powershell": {
      "type": "powershell",
      "enabled": true,
      "executable": {
        "command": "powershell.exe",
        "args": ["-NoProfile", "-NonInteractive", "-Command"]
      }
    },
    "cmd": {
      "type": "cmd",
      "enabled": true,
      "executable": {
        "command": "cmd.exe",
        "args": ["/c"]
      }
    },
    "gitbash": {
      "type": "gitbash",
      "enabled": true,
      "executable": {
        "command": "C:\\Program Files\\Git\\bin\\bash.exe",
        "args": ["-c"]
      }
    }
  }
}
```

### Configuration Settings

The configuration file uses an inheritance system with two main sections: `global` and `shells`.

#### Global Settings

Global settings provide defaults that apply to all shells unless overridden.

##### Security Settings

```json
{
  "global": {
    "security": {
      // Maximum allowed length for any command
      "maxCommandLength": 2000,

      // Command execution timeout in seconds
      "commandTimeout": 30,

      // Enable protection against command injection
      "enableInjectionProtection": true,

      // Restrict commands to allowed working directories
      "restrictWorkingDirectory": true
    }
  }
}
```

##### Restriction Settings

```json
{
  "global": {
    "restrictions": {
      // Commands to block - blocks both direct use and full paths
      "blockedCommands": ["rm", "format", "shutdown"],

      // Arguments to block across all commands
      "blockedArguments": ["--exec", "-e", "/c"],

      // Operators to block in commands
      "blockedOperators": ["&", "|", ";", "`"]
    }
  }
}
```

##### Path Settings

```json
{
  "global": {
    "paths": {
      // Directories where commands can be executed
      "allowedPaths": ["/home/user", "/tmp", "C:\\Users\\username"],

      // Initial working directory (null = use launch directory)
      "initialDir": "/home/user",

      // Whether to restrict working directories
      "restrictWorkingDirectory": true
    }
  }
}
```

If the `allowedPaths` array is omitted from your configuration file, no default
directories are automatically allowed. When `restrictWorkingDirectory` is
enabled, only the `initialDir` (if specified) will be added to the allowed paths
list.
Use the `--allowAllDirs` flag when launching the server to automatically
disable `restrictWorkingDirectory` if no allowed paths or `initialDir` are set.

#### Shell Configuration

Each shell can be individually configured and can override global settings.
Each shell entry must include a `type` field indicating the shell. Valid values are `powershell`, `cmd`, `gitbash`, `bash`, and `wsl`.

##### Basic Shell Configuration

```json
{
  "shells": {
    "powershell": {
      "type": "powershell",
      "enabled": true,
      "executable": {
        "command": "powershell.exe",
        "args": ["-NoProfile", "-NonInteractive", "-Command"]
      }
    }
  }
}
```

##### Shell-Specific Overrides

```json
{
  "shells": {
    "powershell": {
      "type": "powershell",
      "enabled": true,
      "executable": {
        "command": "powershell.exe",
        "args": ["-NoProfile", "-NonInteractive", "-Command"]
      },
      "overrides": {
        "security": {
          "commandTimeout": 45,
          "maxCommandLength": 3000
        },
        "restrictions": {
          "blockedCommands": ["Remove-Item", "Format-Volume"],
          "blockedOperators": ["|", "&"]
        }
      }
    }
  }
}
```

##### WSL Configuration

WSL shells have additional configuration options for path mapping:

```json
{
  "shells": {
    "wsl": {
      "type": "wsl",
      "enabled": true,
      "executable": {
        "command": "wsl.exe",
        "args": ["-e"]
      },
      "wslConfig": {
        "mountPoint": "/mnt/",
        "inheritGlobalPaths": true
      }
    }
  }
}
```

You can override the mount point at startup using the `--wslMountPoint` CLI flag.

### Configuration Inheritance

The inheritance system works as follows:

1. **Global defaults** are applied to all shells
2. **Shell-specific overrides** replace or extend global settings
3. **Array settings** (like `blockedCommands`) override defaults when provided.
   Specifying an empty array removes all default entries for that setting.
4. **Object settings** are deep-merged
5. **Primitive settings** are replaced

Example of inheritance in action:

```json
{
  "global": {
    "security": { "commandTimeout": 30 },
    "restrictions": { "blockedCommands": ["rm", "format"] }
  },
  "shells": {
    "powershell": {
      "type": "powershell",
      "overrides": {
        "security": { "commandTimeout": 45 },
        "restrictions": { "blockedCommands": ["Remove-Item"] }
      }
    }
  }
}
```

Results in PowerShell having:

- `commandTimeout`: 45 (overridden)
- `blockedCommands`: ["Remove-Item"] (overrides defaults)

To completely remove defaults for a given restriction, provide an empty array:

```json
{
  "global": {
    "restrictions": {
      "blockedCommands": [],
      "blockedArguments": [],
      "blockedOperators": []
    }
  },
  "shells": {
    "powershell": {
      "type": "powershell",
      "overrides": {
        "restrictions": { "blockedCommands": [] }
      }
    }
  }
}
```

## API

### Tools

- **execute_command**

  - Execute a command in the specified shell
  - Inputs:
    - `shell` (string): Shell to use ("powershell", "cmd", "gitbash", "bash", or "wsl")
    - `command` (string): Command to execute
    - `workingDir` (optional string): Working directory
  - Returns command output as text, or error message if execution fails
  - If `workingDir` is omitted, the command runs in the server's active working directory. If this has not been set, the tool returns an error.

- **get_current_directory**
  - Get the server's active working directory
  - If the directory is not set, returns a message explaining how to set it

- **set_current_directory**
  - Set the server's active working directory
  - Inputs:
    - `path` (string): Path to set as current working directory
  - Returns confirmation message with the new directory path, or error message if the change fails

- **get_config**
  - Get the windows CLI server configuration
  - Returns the server configuration as a JSON string (excluding sensitive data)

- **validate_directories**
  - Check if specified directories are within allowed paths
  - Only available when `restrictWorkingDirectory` is enabled in configuration
  - Inputs:
    - `directories` (array of strings): List of directory paths to validate
  - Returns success message if all directories are valid, or error message detailing which directories are outside allowed paths

### Resources

- **cli://config**
  - Returns the main CLI server configuration (excluding sensitive data like blocked command details if security requires it).

- **cli://logs/list**
  - List all stored command execution logs with metadata

- **cli://logs/recent?n={count}**
  - Get the N most recent command logs (default: 5)

- **cli://logs/commands/{id}**
  - Access full output from a specific command execution

- **cli://logs/commands/{id}/range?start={n}&end={m}**
  - Query specific line ranges from a log (supports negative indices)

- **cli://logs/commands/{id}/search?q={pattern}&context={n}&occurrence={n}**
  - Search logs with regex patterns and context lines

## Security Considerations

This server allows external tools to execute commands on your system. Exercise extreme caution when configuring and using it.

### Built-in Security Features

- **Path Restrictions**: Commands can only be executed in specified directories (`allowedPaths`) if `restrictWorkingDirectory` is true.
- **Command Blocking**: Defined commands and arguments are blocked to prevent potentially dangerous operations (`blockedCommands`, `blockedArguments`).
- **Injection Protection**: Common shell injection characters (`;`, `&`, `|`, `` ` ``) are blocked in command strings if `enableInjectionProtection` is true.
- **Timeout**: Commands are terminated if they exceed the configured timeout (`commandTimeout`).
- **Input validation**: All user inputs are validated before execution
- **Shell process management**: Processes are properly terminated after execution or timeout

### Configurable Security Features (Active by Default)

- **Working Directory Restriction (`restrictWorkingDirectory`)**: HIGHLY RECOMMENDED. Limits command execution to safe directories.
- **Injection Protection (`enableInjectionProtection`)**: Recommended to prevent bypassing security rules.

### Best Practices

- **Minimal Allowed Paths**: Only allow execution in necessary directories.
- **Restrictive Blocklists**: Block any potentially harmful commands or arguments.
- **Regularly Review Logs**: Check the command history for suspicious activity.
- **Keep Software Updated**: Ensure Node.js, npm, and the server itself are up-to-date.

## Using the MCP Inspector for Testing

Use the Inspector to interactively test this server with a custom config file. Pass any server flags after `--`:

```bash
# Inspect with built server and test config
npx @modelcontextprotocol/inspector -- node dist/index.js --config tests/config.json

# Or test the published package
npx @modelcontextprotocol/inspector wcli0 -- --config tests/config.json
```

## Development and Testing

This project requires **Node.js 18 or later**.

### Running Tests

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run specific test suites
npm run test:validation    # Path validation tests
npm run test:wsl          # WSL emulation tests
npm run test:integration  # Integration tests
npm run test:async        # Async operation tests

# Run tests with coverage
npm run test:coverage

# Debug open handles
npm run test:debug
```

### Cross-Platform Testing

The project uses a Node.js-based WSL emulator (`scripts/wsl-emulator.js`) to enable testing of WSL functionality on all platforms. This allows the test suite to run successfully on both Windows and Linux environments.

## Acknowledgments

This project is based on the excellent work by [SimonB97](https://github.com/SimonB97) in the [win-cli-mcp-server](https://github.com/SimonB97/win-cli-mcp-server) repository. Due to significant configuration differences and architectural changes that made merging back to the source repository challenging, this has been maintained as a separate fork with enhanced features and extensive modifications.

**Key enhancements in this version:**

- Enhanced inheritance-based configuration system
- Improved WSL support with cross-platform testing
- Advanced security features and path validation
- Comprehensive test coverage with Node.js-based WSL emulation
- Extended documentation and configuration examples

We gratefully acknowledge SimonB97's foundational work that made this project possible.

## Development Environment using Dev Containers

This project includes a [Dev Container](https://code.visualstudio.com/docs/remote/containers) configuration, which allows you to use a Docker container as a fully-featured development environment. This ensures consistency and makes it easy to get started with development and testing.

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.
- [Visual Studio Code](https://code.visualstudio.com/) installed.
- The [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) installed in VS Code.

### Getting Started

1. Clone this repository to your local machine.
2. Open the repository in Visual Studio Code.
3. When prompted "Reopen in Container", click the button. (If you don't see a prompt, you can open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P) and select "Dev Containers: Reopen in Container".)
4. VS Code will build the dev container image (as defined in `.devcontainer/devcontainer.json` and `Dockerfile`) and start the container. This might take a few minutes the first time.
5. Once the container is built and started, your VS Code will be connected to this environment. The `postCreateCommand` (`npm install`) will ensure all dependencies are installed.

### Running Tests in the Dev Container

After opening the project in the dev container:

1. Open a new terminal in VS Code (it will be a terminal inside the container).
2. Run the tests using the command:

    ```bash
    npm test
    ```

This setup mirrors the environment used in GitHub Actions for tests, ensuring consistency between local development and CI.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
