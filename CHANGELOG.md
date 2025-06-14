# Changelog

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
