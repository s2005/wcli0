# Configuration Examples

This document provides practical examples of different configuration scenarios for the Windows CLI MCP Server.

## Basic Configurations

### Minimal Configuration

The simplest configuration that enables basic functionality:

```json
{
  "global": {
    "security": {
      "restrictWorkingDirectory": false
    }
  },
  "shells": {
    "powershell": {
      "enabled": true,
      "executable": {
        "command": "powershell.exe",
        "args": ["-NoProfile", "-NonInteractive", "-Command"]
      }
    }
  }
}
```

### Development Environment

Configuration suitable for development work with multiple shells:

```json
{
  "global": {
    "security": {
      "maxCommandLength": 3000,
      "commandTimeout": 60,
      "restrictWorkingDirectory": true
    },
    "paths": {
      "allowedPaths": [
        "C:\\Users\\Developer\\Projects",
        "C:\\temp",
        "D:\\workspace"
      ],
      "initialDir": "C:\\Users\\Developer\\Projects"
    },
    "restrictions": {
      "blockedCommands": ["format", "shutdown", "restart"],
      "blockedOperators": [";", "&"]
    }
  },
  "shells": {
    "powershell": {
      "enabled": true,
      "executable": {
        "command": "powershell.exe",
        "args": ["-NoProfile", "-NonInteractive", "-Command"]
      }
    },
    "cmd": {
      "enabled": true,
      "executable": {
        "command": "cmd.exe",
        "args": ["/c"]
      }
    },
    "gitbash": {
      "enabled": true,
      "executable": {
        "command": "C:\\Program Files\\Git\\bin\\bash.exe",
        "args": ["-c"]
      }
    }
  }
}
```

## Security-Focused Configurations

### High Security Environment

Restrictive configuration for sensitive environments:

```json
{
  "global": {
    "security": {
      "maxCommandLength": 1000,
      "commandTimeout": 15,
      "enableInjectionProtection": true,
      "restrictWorkingDirectory": true
    },
    "paths": {
      "allowedPaths": ["/home/user/safe-zone"],
      "initialDir": "/home/user/safe-zone"
    },
    "restrictions": {
      "blockedCommands": [
        "rm", "del", "rmdir", "format", "shutdown", "restart",
        "reg", "regedit", "net", "netsh", "takeown", "icacls",
        "powershell", "cmd", "bash", "sh", "python", "node"
      ],
      "blockedArguments": [
        "--exec", "-e", "/c", "-enc", "-encodedcommand",
        "-command", "--interactive", "-i", "--login", "--system",
        "--privileged", "--admin", "sudo"
      ],
      "blockedOperators": ["&", "|", ";", "`", "&&", "||", ">>", ">"]
    }
  },
  "shells": {
    "powershell": {
      "enabled": true,
      "executable": {
        "command": "powershell.exe",
        "args": ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Restricted", "-Command"]
      },
      "overrides": {
        "security": {
          "commandTimeout": 10
        },
        "restrictions": {
          "blockedCommands": [
            "Invoke-Expression", "Invoke-Command", "Start-Process",
            "New-Object", "Add-Type", "Invoke-WebRequest", "Invoke-RestMethod"
          ]
        }
      }
    }
  }
}
```

### Audit-Friendly Configuration

Configuration that allows monitoring and logging:

```json
{
  "global": {
    "security": {
      "maxCommandLength": 2000,
      "commandTimeout": 30,
      "restrictWorkingDirectory": true
    },
    "paths": {
      "allowedPaths": [
        "C:\\AuditedWorkspace",
        "C:\\temp\\audit-safe"
      ],
      "initialDir": "C:\\AuditedWorkspace"
    },
    "restrictions": {
      "blockedCommands": [
        "format", "shutdown", "restart", "reg", "regedit",
        "net", "netsh", "takeown", "icacls"
      ],
      "blockedOperators": [";", "&", "|"]
    }
  },
  "shells": {
    "powershell": {
      "enabled": true,
      "executable": {
        "command": "powershell.exe",
        "args": ["-NoProfile", "-NonInteractive", "-Command"]
      }
    }
  }
}
```

## Shell-Specific Configurations

### PowerShell-Only Configuration

Configuration that only enables PowerShell with specific restrictions:

```json
{
  "global": {
    "security": {
      "commandTimeout": 45,
      "restrictWorkingDirectory": true
    },
    "paths": {
      "allowedPaths": ["C:\\PowerShellWorkspace"],
      "initialDir": "C:\\PowerShellWorkspace"
    }
  },
  "shells": {
    "powershell": {
      "enabled": true,
      "executable": {
        "command": "powershell.exe",
        "args": ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", "-Command"]
      },
      "overrides": {
        "restrictions": {
          "blockedCommands": [
            "Invoke-Expression", "Invoke-Command", "Start-Process",
            "Remove-Item", "Remove-ItemProperty", "Clear-Content"
          ]
        }
      }
    }
  }
}
```

### WSL-Focused Configuration

Configuration optimized for WSL development:

```json
{
  "global": {
    "security": {
      "commandTimeout": 60,
      "restrictWorkingDirectory": true
    },
    "paths": {
      "allowedPaths": [
        "C:\\Users\\Developer\\WSLProjects",
        "/home/developer",
        "/tmp"
      ]
    },
    "restrictions": {
      "blockedCommands": ["sudo", "su", "passwd", "chmod", "chown"]
    }
  },
  "shells": {
    "wsl": {
      "enabled": true,
      "executable": {
        "command": "wsl.exe",
        "args": ["-e"]
      },
      "wslConfig": {
        "mountPoint": "/mnt/",
        "inheritGlobalPaths": true,
        "pathMapping": {
          "enabled": true,
          "windowsToWsl": true
        }
      },
      "overrides": {
        "security": {
          "commandTimeout": 90
        }
      }
    }
  }
}
```

## Advanced Configurations

### Multi-Environment Configuration

Configuration supporting different environments with shell-specific overrides:

```json
{
  "global": {
    "security": {
      "maxCommandLength": 2500,
      "commandTimeout": 45,
      "restrictWorkingDirectory": true
    },
    "paths": {
      "allowedPaths": [
        "C:\\Development",
        "C:\\temp",
        "/home/user/projects"
      ],
      "initialDir": "C:\\Development"
    },
    "restrictions": {
      "blockedCommands": ["format", "shutdown"],
      "blockedOperators": [";", "&"]
    }
  },
  "shells": {
    "powershell": {
      "enabled": true,
      "executable": {
        "command": "powershell.exe",
        "args": ["-NoProfile", "-NonInteractive", "-Command"]
      },
      "overrides": {
        "security": {
          "commandTimeout": 60
        },
        "restrictions": {
          "blockedCommands": ["Remove-Item", "Clear-Content"]
        }
      }
    },
    "cmd": {
      "enabled": true,
      "executable": {
        "command": "cmd.exe",
        "args": ["/c"]
      },
      "overrides": {
        "security": {
          "commandTimeout": 30
        },
        "restrictions": {
          "blockedCommands": ["del", "rmdir"]
        }
      }
    },
    "gitbash": {
      "enabled": true,
      "executable": {
        "command": "C:\\Program Files\\Git\\bin\\bash.exe",
        "args": ["-c"]
      },
      "overrides": {
        "restrictions": {
          "blockedCommands": ["rm", "rmdir"]
        }
      }
    },
    "wsl": {
      "enabled": true,
      "executable": {
        "command": "wsl.exe",
        "args": ["-e"]
      },
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
}
```

### Testing Environment Configuration

Configuration suitable for automated testing:

```json
{
  "global": {
    "security": {
      "maxCommandLength": 5000,
      "commandTimeout": 120,
      "restrictWorkingDirectory": true
    },
    "paths": {
      "allowedPaths": [
        "C:\\TestEnvironment",
        "C:\\temp\\test-runs",
        "/tmp/test-workspace"
      ],
      "initialDir": "C:\\TestEnvironment"
    },
    "restrictions": {
      "blockedCommands": ["format", "shutdown", "restart"],
      "blockedOperators": []
    }
  },
  "shells": {
    "powershell": {
      "enabled": true,
      "executable": {
        "command": "powershell.exe",
        "args": ["-NoProfile", "-NonInteractive", "-Command"]
      },
      "overrides": {
        "security": {
          "commandTimeout": 180
        }
      }
    },
    "cmd": {
      "enabled": true,
      "executable": {
        "command": "cmd.exe",
        "args": ["/c"]
      }
    },
    "gitbash": {
      "enabled": true,
      "executable": {
        "command": "C:\\Program Files\\Git\\bin\\bash.exe",
        "args": ["-c"]
      }
    }
  }
}
```

## Configuration Validation

### Valid Configuration Checklist

When creating your configuration, ensure:

1. **Required Fields**: Each enabled shell has `executable.command` and `executable.args`
2. **Path Validation**: All paths in `allowedPaths` exist and are accessible
3. **Shell Executables**: All shell commands point to valid executables
4. **Timeout Values**: Timeout values are reasonable (5-300 seconds recommended)
5. **Command Length**: `maxCommandLength` is appropriate for your use case (500-5000 recommended)
6. **Blocked Commands**: Review blocked commands list for your security requirements

### Common Configuration Errors

1. **Missing Executable Path**: Shell enabled but no executable specified
2. **Invalid Paths**: Paths in `allowedPaths` that don't exist
3. **Conflicting Settings**: Global and override settings that conflict
4. **Too Restrictive**: Configuration so restrictive it prevents normal operation
5. **Security Gaps**: Configuration that inadvertently allows dangerous operations

## Configuration Testing

To test your configuration:

1. Start the server with your config file
2. Use the `get_config` tool to verify settings
3. Test each enabled shell with simple commands
4. Verify path restrictions work as expected
5. Test timeout and length limits
6. Confirm blocked commands are properly restricted

Example test commands:

```bash
# Test basic functionality
echo "Hello World"

# Test path restrictions
cd /restricted/path

# Test blocked commands (should fail)
format C:

# Test timeout (use appropriate delay for your timeout setting)
sleep 60
```
