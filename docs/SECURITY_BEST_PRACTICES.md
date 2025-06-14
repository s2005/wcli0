# Security Best Practices

This document outlines security best practices for configuring and using the Windows CLI MCP Server safely.

## Core Security Principles

### Defense in Depth

Implement multiple layers of security controls:

1. **Path Restrictions** - Limit accessible directories
2. **Command Blocking** - Block dangerous operations
3. **Input Validation** - Prevent injection attacks
4. **Process Controls** - Limit execution time and resources
5. **Audit Logging** - Monitor and review activities

### Principle of Least Privilege

- Grant only the minimum permissions necessary
- Start with restrictive settings and relax as needed
- Regularly review and tighten permissions
- Use different security levels for different environments

## Environment-Specific Configurations

### Production Environment

**Ultra-restrictive configuration for production systems:**

```json
{
  "global": {
    "security": {
      "maxCommandLength": 200,
      "commandTimeout": 5,
      "enableInjectionProtection": true,
      "restrictWorkingDirectory": true
    },
    "restrictions": {
      "blockedCommands": [
        // System commands
        "format", "fdisk", "diskpart", "bcdedit",
        "shutdown", "restart", "reboot", "halt",
        
        // File operations  
        "del", "rm", "rmdir", "rd", "erase",
        "move", "mv", "copy", "cp",
        
        // Registry/System
        "reg", "regedit", "regedt32",
        "sc", "net", "netsh", "wmic",
        
        // Privileges
        "runas", "sudo", "su", "takeown", "icacls",
        
        // Shells (prevent shell escape)
        "cmd", "powershell", "pwsh", "bash", "sh",
        
        // Package managers
        "npm", "pip", "chocolatey", "winget",
        
        // Compilers/Interpreters
        "python", "node", "javac", "gcc", "cl"
      ],
      "blockedArguments": [
        "--exec", "-e", "/c", "-c", "-command",
        "--interactive", "-i", "--login", "-l",
        "--system", "-s", "--force", "-f",
        "--recursive", "-r", "-rf", "--all",
        "--privileged", "--admin", "--elevated"
      ],
      "blockedOperators": [
        "&", "&&", "|", "||", ";", "`", "$(",
        ">", ">>", "<", "<<", "^", "!", "*"
      ]
    },
    "paths": {
      "allowedPaths": [
        "C:\\SafeScripts",
        "C:\\ApprovedData"
      ],
      "initialDir": "C:\\SafeScripts"
    }
  },
  "shells": {
    "cmd": {
      "enabled": true,
      "executable": {
        "command": "cmd.exe",
        "args": ["/c"]
      },
      "overrides": {
        "security": {
          "maxCommandLength": 100
        },
        "restrictions": {
          "allowedCommands": [
            "echo Safe message",
            "type C:\\ApprovedData\\*.txt",
            "dir C:\\SafeScripts"
          ]
        }
      }
    }
  }
}
```

### Development Environment

**Balanced security for development work:**

```json
{
  "global": {
    "security": {
      "maxCommandLength": 3000,
      "commandTimeout": 120,
      "enableInjectionProtection": true,
      "restrictWorkingDirectory": true
    },
    "restrictions": {
      "blockedCommands": [
        // Critical system commands only
        "format", "shutdown", "restart",
        "reg", "regedit", "net user",
        "takeown", "icacls"
      ],
      "blockedArguments": [
        "--system", "--privileged", "--admin"
      ],
      "blockedOperators": [
        "&", "|", ";", "`"
      ]
    },
    "paths": {
      "allowedPaths": [
        "C:\\Development",
        "C:\\Users\\Developer\\Projects",
        "C:\\temp"
      ],
      "initialDir": "C:\\Development"
    }
  }
}
```

### Testing Environment

**Restrictive but functional for testing:**

```json
{
  "global": {
    "security": {
      "maxCommandLength": 1500,
      "commandTimeout": 60,
      "enableInjectionProtection": true,
      "restrictWorkingDirectory": true
    },
    "restrictions": {
      "blockedCommands": [
        "format", "shutdown", "restart", "reboot",
        "reg", "regedit", "net", "netsh",
        "takeown", "icacls", "del", "rm"
      ],
      "blockedOperators": ["&", "|", ";", "`", "$("]
    },
    "paths": {
      "allowedPaths": [
        "C:\\TestEnvironment",
        "C:\\TestData",
        "C:\\TestResults"
      ]
    }
  }
}
```

## Shell-Specific Security

### PowerShell Security

PowerShell requires special attention due to its power:

```json
{
  "shells": {
    "powershell": {
      "enabled": true,
      "executable": {
        "command": "powershell.exe",
        "args": [
          "-NoProfile",           // Don't load user profile
          "-NonInteractive",      // Prevent interactive prompts
          "-ExecutionPolicy", "Restricted",  // Block script execution
          "-Command"
        ]
      },
      "overrides": {
        "restrictions": {
          "blockedCommands": [
            // PowerShell-specific dangerous commands
            "Invoke-Expression", "iex", "Invoke-Command",
            "New-Object", "Add-Type", "Invoke-RestMethod",
            "Start-Process", "Stop-Process", "Remove-Item",
            "Set-ExecutionPolicy", "Import-Module",
            "Enable-PSRemoting", "Invoke-WmiMethod"
          ],
          "blockedArguments": [
            "-EncodedCommand", "-WindowStyle", "Hidden",
            "-ExecutionPolicy", "Bypass", "-File",
            "-ScriptBlock", "-FilterScript"
          ]
        }
      }
    }
  }
}
```

### CMD Security

CMD is generally safer but still needs restrictions:

```json
{
  "shells": {
    "cmd": {
      "enabled": true,
      "executable": {
        "command": "cmd.exe",
        "args": ["/c"]
      },
      "overrides": {
        "restrictions": {
          "blockedCommands": [
            // CMD-specific dangerous commands
            "del", "erase", "rd", "rmdir",
            "format", "fdisk", "attrib",
            "cacls", "takeown", "subst"
          ],
          "blockedArguments": [
            "/s", "/q", "/f", "/y",  // Silent/force flags
            "/c", "/k"               // Command execution flags
          ]
        }
      }
    }
  }
}
```

### WSL Security

WSL requires Unix-focused security:

```json
{
  "shells": {
    "wsl": {
      "enabled": true,
      "executable": {
        "command": "wsl.exe",
        "args": ["-e", "bash", "-c"]
      },
      "wslConfig": {
        "mountPoint": "/mnt/",
        "inheritGlobalPaths": false  // Explicit path control
      },
      "overrides": {
        "restrictions": {
          "blockedCommands": [
            // Unix dangerous commands
            "rm", "rmdir", "dd", "mkfs",
            "sudo", "su", "passwd", "chown", "chmod",
            "mount", "umount", "fdisk", "parted",
            "iptables", "ufw", "systemctl", "service"
          ],
          "blockedArguments": [
            "-rf", "--recursive", "--force",
            "--privileged", "--root", "--system"
          ]
        },
        "paths": {
          "allowedPaths": [
            "/home/user/safe",
            "/tmp/workspace"
          ]
        }
      }
    }
  }
}
```

### Git Bash Security

Git Bash combines Windows and Unix risks:

```json
{
  "shells": {
    "gitbash": {
      "enabled": true,
      "executable": {
        "command": "C:\\Program Files\\Git\\bin\\bash.exe",
        "args": ["-c"]
      },
      "overrides": {
        "restrictions": {
          "blockedCommands": [
            // Both Windows and Unix commands
            "rm", "del", "rmdir", "rd",
            "chmod", "chown", "sudo", "su"
          ],
          "blockedOperators": [
            "&", "&&", "|", "||", ";", "`", "$(", 
            ">", ">>", "<", "<<", "^"
          ]
        }
      }
    }
  }
}
```

## Path Security

### Windows Path Security

```json
{
  "paths": {
    "allowedPaths": [
      // Safe user directories
      "C:\\Users\\%USERNAME%\\Documents\\Safe",
      "C:\\Users\\%USERNAME%\\Desktop\\Workspace",
      
      // Dedicated work areas
      "C:\\Workspace",
      "D:\\Projects",
      
      // Temporary areas
      "C:\\Temp\\MCPWork"
    ],
    
    // Avoid these dangerous paths:
    // "C:\\Windows", "C:\\System32", "C:\\Program Files",
    // "C:\\Users\\%USERNAME%\\AppData", "C:\\"
  }
}
```

### Unix Path Security (WSL)

```json
{
  "paths": {
    "allowedPaths": [
      // Safe user areas
      "/home/user/workspace",
      "/home/user/documents",
      
      // Temporary areas
      "/tmp/mcpwork",
      "/var/tmp/safe",
      
      // Mounted Windows drives (controlled)
      "/mnt/c/Workspace",
      "/mnt/d/Projects"
    ]
    
    // Avoid these dangerous paths:
    // "/", "/bin", "/sbin", "/usr/bin", "/etc",
    // "/var", "/boot", "/sys", "/proc"
  }
}
```

## Command Security Patterns

### Allowlist Approach (Most Secure)

Instead of blocking commands, only allow specific ones:

```json
{
  "restrictions": {
    "allowedCommands": [
      // File viewing
      "type", "cat", "less", "more",
      "dir", "ls", "find",
      
      // Text processing
      "findstr", "grep", "sort", "head", "tail",
      
      // Git operations
      "git status", "git log", "git diff",
      
      // Build tools
      "npm run build", "npm test",
      "dotnet build", "dotnet test"
    ]
  }
}
```

### Blocklist Approach (More Flexible)

Block dangerous patterns while allowing others:

```json
{
  "restrictions": {
    "blockedCommands": [
      // Administrative
      "^(net|sc|wmic|reg|takeown|icacls)\\s",
      
      // File operations
      "^(del|rm|format|fdisk)\\s",
      
      // System control
      "^(shutdown|restart|reboot)\\s",
      
      // Shells (prevent escapes)
      "^(cmd|powershell|bash|sh)\\s"
    ]
  }
}
```

## Monitoring and Auditing

### Log Analysis

Regularly review command logs for:

```bash
# Suspicious patterns
grep -E "(sudo|admin|system|exec|eval)" mcp-commands.log

# Failed commands
grep "ERROR" mcp-commands.log | tail -50

# Long-running commands
grep "timeout" mcp-commands.log

# Path access attempts
grep -E "(\\\\|/)+(windows|system|etc|bin)" mcp-commands.log
```

### Automated Monitoring

Set up alerts for:
- Commands hitting blocked lists
- Path access violations
- Timeout events
- Repeated failure patterns
- Unusual command patterns

## Incident Response

### If Security Breach Suspected

1. **Immediate Actions**:
   - Stop the MCP server
   - Disconnect from network if needed
   - Preserve logs and evidence

2. **Investigation**:
   - Review command history
   - Check file system changes
   - Analyze network activity
   - Identify scope of access

3. **Recovery**:
   - Restore from clean backups
   - Update configuration
   - Patch vulnerabilities
   - Implement additional controls

### Hardening After Incidents

```json
{
  "global": {
    "security": {
      "maxCommandLength": 100,     // Reduce from default
      "commandTimeout": 3,         // Very short timeout
      "enableInjectionProtection": true,
      "restrictWorkingDirectory": true
    },
    "restrictions": {
      "blockedCommands": ["*"],    // Block all by default
      "allowedCommands": [         // Only specific allowed commands
        "echo Hello",
        "dir C:\\SafeOnly"
      ]
    }
  }
}
```

## Regular Security Reviews

### Monthly Reviews

- [ ] Review allowed paths for necessity
- [ ] Check blocked command lists for completeness
- [ ] Analyze command usage patterns
- [ ] Update security configurations
- [ ] Test incident response procedures

### Quarterly Reviews

- [ ] Full security audit of configuration
- [ ] Penetration testing with known attack vectors
- [ ] Review and update documentation
- [ ] Train users on security practices
- [ ] Update threat models

### Annual Reviews

- [ ] Complete security architecture review
- [ ] Benchmark against industry standards
- [ ] Review compliance requirements
- [ ] Update security policies
- [ ] Plan security improvements

## Compliance Considerations

### PCI DSS

If handling payment data:
- Use strongest restriction levels
- Log all commands with timestamps
- Restrict network access
- Regular vulnerability scans

### HIPAA

If handling health data:
- Implement access controls
- Audit all file access
- Encrypt sensitive directories
- Control data export capabilities

### SOX

If handling financial data:
- Immutable audit logs
- Separation of duties
- Change control processes
- Regular access reviews

## Common Security Mistakes

### ❌ **DON'T DO THESE:**

```json
{
  // DANGEROUS: Unrestricted paths
  "paths": { "allowedPaths": ["C:\\", "/"] },
  
  // DANGEROUS: No command restrictions
  "restrictions": { "blockedCommands": [] },
  
  // DANGEROUS: Disabled security features
  "security": {
    "restrictWorkingDirectory": false,
    "enableInjectionProtection": false
  },
  
  // DANGEROUS: Long timeouts
  "security": { "commandTimeout": 3600 }
}
```

### ✅ **DO THESE INSTEAD:**

```json
{
  // SAFE: Specific allowed paths
  "paths": { 
    "allowedPaths": ["C:\\Workspace", "/home/user/safe"] 
  },
  
  // SAFE: Comprehensive restrictions
  "restrictions": {
    "blockedCommands": [
      "format", "del", "rm", "shutdown", "reg"
    ]
  },
  
  // SAFE: All protections enabled
  "security": {
    "restrictWorkingDirectory": true,
    "enableInjectionProtection": true
  },
  
  // SAFE: Short timeouts
  "security": { "commandTimeout": 30 }
}
```

## Security Testing

### Test Your Configuration

```bash
# Test 1: Try accessing restricted paths
validate_directories ["C:\\Windows\\System32"]

# Test 2: Try blocked commands
execute_command { "shell": "cmd", "command": "format c:" }

# Test 3: Try injection attacks
execute_command { "shell": "cmd", "command": "dir && del *.*" }

# Test 4: Try privilege escalation
execute_command { "shell": "powershell", "command": "Start-Process cmd -Verb RunAs" }
```

### Penetration Testing Scenarios

1. **Command Injection**: Try various injection patterns
2. **Path Traversal**: Attempt to access restricted directories
3. **Shell Escape**: Try to break out to other shells
4. **Resource Exhaustion**: Test timeout and length limits
5. **Configuration Bypass**: Attempt to modify settings

Remember: Security is an ongoing process, not a one-time setup. Regularly review, test, and update your security configurations.
