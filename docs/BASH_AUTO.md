# Bash Auto Shell Plugin

The `bash_auto` shell plugin provides automatic platform detection to select the appropriate Bash implementation.

## Overview

Instead of manually choosing between `bash` and `gitbash`, the `bash_auto` plugin automatically selects:

| Platform | Selected Shell | Default Executable |
|----------|---------------|-------------------|
| Linux | Bash | `/bin/bash` |
| macOS (darwin) | Bash | `/bin/bash` |
| Windows (win32) | Git Bash | `C:\Program Files\Git\bin\bash.exe` |

## Use Cases

- **Cross-platform scripts**: Write shell commands once that work on any platform
- **Development environments**: Simplify configuration for teams with mixed OS usage
- **CI/CD pipelines**: Use the same shell type across different runners

## Configuration

### Using Presets

The following build presets include `bash_auto`:

- `full` - All shells including `bash_auto`
- `windows` - Windows shells plus `bash_auto`
- `unix` - Bash and `bash_auto`

```bash
# Environment variable
SHELL_BUILD_PRESET=windows
```

### Custom Shell List

Include `bash_auto` in a custom shell list:

```bash
INCLUDED_SHELLS=bash_auto,powershell
```

### Runtime Configuration

```json
{
  "shells": {
    "bash_auto": {
      "type": "bash_auto",
      "enabled": true
    }
  }
}
```

## Behavior

### Command Validation

The `bash_auto` plugin delegates command validation to the underlying shell implementation. Blocked commands are inherited from either:

- **Linux/macOS**: Bash plugin restrictions
- **Windows**: Git Bash plugin restrictions

### Path Validation

Path formatting follows the selected implementation:

- **Linux/macOS**: Unix paths (e.g., `/home/user/project`)
- **Windows**: Git Bash mixed paths (e.g., `/c/Users/user/project` or `C:\Users\user\project`)

### Display Name

The display name reflects the selected implementation:

- **Linux/macOS**: "Bash (Auto)"
- **Windows**: "Git Bash (Auto)"

## Limitations

1. **Detection is static**: Platform is detected once at plugin initialization
2. **No runtime switching**: Cannot change between implementations without restart
3. **Inherits limitations**: Subject to the same restrictions as the underlying shell

## Architecture

```mermaid
graph TD
    A[bash_auto plugin] --> B{Platform?}
    B -->|linux/darwin| C[BashPlugin]
    B -->|win32| D[GitBashPlugin]
    C --> E[/bin/bash]
    D --> F[C:\Program Files\Git\bin\bash.exe]
```

## Related Documentation

- [Shell Architecture](./SHELL_ARCHITECTURE.md) - Overall shell system design
- [Configuration Examples](./CONFIGURATION_EXAMPLES.md) - More configuration scenarios
- [CLI Usage](./CLI_USAGE.md) - Command-line options
