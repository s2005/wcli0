# wcli0

Enhanced MCP server for Windows CLI interactions with advanced configuration and security features.

[![NPM Downloads](https://img.shields.io/npm/dt/wcli0.svg?style=flat)](https://www.npmjs.com/package/wcli0)
[![NPM Version](https://img.shields.io/npm/v/wcli0.svg?style=flat)](https://www.npmjs.com/package/wcli0?activeTab=versions)

## Quick Start

```bash
# Install and use with Claude Desktop
npx wcli0

# Or install globally
npm install -g wcli0
```

## About

This is an enhanced fork of [SimonB97/win-cli-mcp-server](https://github.com/SimonB97/win-cli-mcp-server), featuring:

- Enhanced inheritance-based configuration system
- Improved WSL support with cross-platform testing  
- Advanced security features and path validation
- Comprehensive test coverage (273+ tests)
- Extended documentation and examples

## Documentation

For complete documentation, configuration examples, and usage instructions, see the full project files.

## Installation with Claude Desktop

Add to your `claude_desktop_config.json`:

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

## License

MIT License - see LICENSE file for details.

## Acknowledgments

Based on the excellent work by [SimonB97](https://github.com/SimonB97) in the original [win-cli-mcp-server](https://github.com/SimonB97/win-cli-mcp-server) repository.