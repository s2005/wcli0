# Changelog
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
