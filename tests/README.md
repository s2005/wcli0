# Test Suite Documentation

## WSL Testing

The test suite uses a Node.js-based WSL emulator (`scripts/wsl-emulator.js`) to enable cross-platform testing of WSL functionality.

### Emulated Commands

The emulator provides special handling for common test commands:
- `pwd`: Returns the current working directory
- `echo`: Outputs arguments
- `ls /tmp`: Simulates temporary directory listing
- `ls /mnt/c`: Simulates non-existent mount error
- `exit N`: Exits with specified code
- `uname -a`: Returns Linux system information

### Test Configuration

All WSL tests should use the Node.js emulator:
```typescript
command: 'node',
args: [path.resolve(process.cwd(), 'scripts/wsl-emulator.js'), '-e']
```
