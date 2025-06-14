# Scripts Directory

## wsl-emulator.js

A Node.js-based WSL emulator for cross-platform testing of WSL functionality.

### Usage:
- List distributions: `node wsl-emulator.js -l -v`
- Execute command: `node wsl-emulator.js -e <command> [args...]`

### Purpose:
This emulator allows WSL-related tests to run on any platform where Node.js is available, including Linux CI environments where `wsl.exe` is not present.
