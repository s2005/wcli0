# Changelog

## [1.0.9] - 2025-11-06

### Added

- **Log Management System**: Automatic storage of command execution logs
  - Output truncation showing last N lines (default: 20) for long-running commands
  - Full log storage with configurable retention and size limits
  - MCP resources for querying historical command output
  - Advanced filtering: line ranges, search with context, recent logs
- **Log Resources**:
  - `cli://logs/list` - List all stored command execution logs with metadata
  - `cli://logs/recent?n={count}` - Get the N most recent logs (default: 5)
  - `cli://logs/commands/{id}` - Access full output from a specific command execution
  - `cli://logs/commands/{id}/range?start={n}&end={m}` - Query specific line ranges (supports negative indices)
  - `cli://logs/commands/{id}/search?q={pattern}&context={n}&occurrence={n}` - Search logs with regex patterns and context lines
- **Logging Configuration**: New `global.logging` configuration section
  - `maxOutputLines`: Number of lines to show in immediate response (default: 20)
  - `enableTruncation`: Enable tail truncation for long outputs (default: true)
  - `maxStoredLogs`: Maximum number of logs to store (default: 50)
  - `maxLogSize`: Maximum size per log entry in bytes (default: 1MB)
  - `maxTotalStorageSize`: Maximum total storage size (default: 50MB)
  - `enableLogResources`: Enable log resource endpoints (default: true)
  - `logRetentionMinutes`: How long to keep logs (default: 60 minutes)
  - `cleanupIntervalMinutes`: Cleanup frequency (default: 5 minutes)
- **Tail Functionality**: Smart truncation preserves the last N lines of output for long-running commands
- **Line Range Processor**: Query specific line ranges from stored logs
- **Search Processor**: Search logs with regex patterns, context lines, and occurrence selection

### Changed

- Command execution now returns truncated output with links to full logs when output exceeds configured line limit
- Truncation messages include execution ID for accessing full output via log resources

## [1.0.8] - 2025-07-09

### Fixed

- Updated bin path for wcli0 in package.json to ensure proper executable resolution

## [1.0.7] - 2025-07-09

### Added

- CLI restriction override flags
- WSL mount point flag
- Option to disable default directory restriction
- Bash shell support
- Resource templates handler

### Changed
- Simplified `get_config` output with enabled shells
- Improved configuration merging behavior

### Fixed
- Resolved script execution via symlink
- Corrected extra allowed path handling
- Improved Git Bash path detection
- CLI no longer auto-starts when imported


## [1.0.6] - 2025-07-04

### Added

- Added comprehensive manual debug documentation (MANUAL_DEBUG.md)
- Enhanced debug commands and testing instructions
- Debug logging toggle functionality

### Changed

- Implement initialDir CLI override
- Fix gitbash Windows working directory handling
- Minor version increment for release management

## [1.0.5] - 2025-06-29

### Changed

- Updated package dependencies and minor bug fixes
- Improved test coverage and stability
- Enhanced command validation and error handling

## [1.0.0] - Enhanced Fork

### Added

- Comprehensive acknowledgment of SimonB97's original work
- Enhanced package description and branding
- Publishing guide and documentation
- Extended feature documentation

### Changed

- Package name changed to `wcli0`
- Updated all installation and usage instructions
- Enhanced README with proper attribution
- Version reset to 1.0.0 for new package publication

## [Previous History - Based on SimonB97's work]

### Fixed

- Fixed path normalization for single backslash paths (e.g., `\\Users\\test`)
- Replaced bash-based WSL emulator with Node.js implementation for cross-platform compatibility
- Fixed directory validator error message test expectations
- Implemented proper WSL path validation for Linux-style paths
- Fixed integration and async test failures related to WSL execution
- Fixed WSL path handling to accept Windows drive paths for WSL shells
- CLIServer falls back to first allowed path if configured initialDir is outside allowed paths

### Improved

- WSL tests now use Node.js emulator instead of bash script
- Improved error messages for directory validation
- Enhanced test configuration for better debugging

### Removed

- Removed deprecated `scripts/wsl.sh` bash emulator
