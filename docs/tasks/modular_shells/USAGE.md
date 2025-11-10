# WCLI0 Modular Shells - Usage & Migration Guide

## Overview

This guide covers how to use the modular shell system, build specialized versions, migrate from the monolithic architecture, and key API information.

## Table of Contents

1. [Building for Different Shells](#building-for-different-shells)
2. [Using Built Binaries](#using-built-binaries)
3. [Migration Guide](#migration-guide)
4. [API Reference](#api-reference)
5. [Common Use Cases](#common-use-cases)
6. [Troubleshooting](#troubleshooting)

---

## Building for Different Shells

### Quick Start

**Default Build (All Shells)**:

```bash
npm run build
```

**Specialized Builds**:

```bash
npm run build:gitbash    # Git Bash only
npm run build:cmd        # CMD only  
npm run build:windows    # PowerShell, CMD, Git Bash
npm run build:unix       # Bash only
```

### Available Build Commands

| Command | Shells Included | Use Case | Bundle Size |
|---------|----------------|----------|-------------|
| `npm run build` | All | Default, development | 100% (baseline) |
| `npm run build:full` | All | Explicit full build | 100% |
| `npm run build:windows` | PowerShell, CMD, Git Bash | Windows users | ~60% |
| `npm run build:unix` | Bash | Linux/macOS | ~35-45% |
| `npm run build:gitbash` | Git Bash | Git Bash-only | ~35-45% |
| `npm run build:cmd` | CMD | CMD-only | ~30-40% |
| `npm run build:custom` | Custom (via env) | Custom | Varies |

### Build Output

Each build creates a separate output file:

```text
dist/
├── index.full.js           # Full build (all shells)
├── index.windows.js        # Windows build
├── index.unix.js           # Unix build
├── index.gitbash-only.js   # Git Bash only
└── index.cmd-only.js       # CMD only
```

### Custom Build Configuration

**Using Environment Variables**:

```bash
# Two shells
INCLUDED_SHELLS=gitbash,powershell npm run build:custom

# Single shell
INCLUDED_SHELLS=powershell npm run build:custom
```

**Creating a Custom Preset**:

```typescript
// src/build/presets/my-preset.ts
import { BuildConfig } from '../shell-config';

const config: BuildConfig = {
  buildName: 'my-preset',
  includedShells: ['gitbash', 'powershell']
};

export default config;
```

```bash
# Use custom preset
SHELL_BUILD_PRESET=my-preset npm run build
```

### Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `SHELL_BUILD_PRESET` | Select preset configuration | `SHELL_BUILD_PRESET=windows` |
| `INCLUDED_SHELLS` | Comma-separated shell list | `INCLUDED_SHELLS=gitbash,bash` |
| `BUILD_VERBOSE` | Enable verbose logging | `BUILD_VERBOSE=true` |
| `DEBUG` | Enable runtime debug mode | `DEBUG=true` |

---

## Using Built Binaries

### Running a Build

```bash
# Run Git Bash-only build
node dist/index.gitbash-only.js

# Run full build
node dist/index.full.js

# Run with debug
DEBUG=true node dist/index.gitbash-only.js
```

### Verifying Available Shells

```bash
node dist/index.gitbash-only.js --list-shells

# Output:
# Available shells:
# - gitbash: Git Bash
```

### MCP Configuration (Claude Desktop)

**Full build**:

```json
{
  "mcpServers": {
    "wcli0": {
      "command": "node",
      "args": ["/path/to/wcli0/dist/index.full.js"]
    }
  }
}
```

**Git Bash-only build**:

```json
{
  "mcpServers": {
    "wcli0": {
      "command": "node",
      "args": ["C:/path/to/wcli0/dist/index.gitbash-only.js"],
      "env": {
        "DEBUG": "false"
      }
    }
  }
}
```

---

## Migration Guide

### Breaking Changes

**None for Default Build**: If you use `npm run build`, there are NO breaking changes.

**For Custom Builds**: Import paths and internal structure have changed.

### Migration Paths

#### Path 1: No Changes (Recommended for Most Users)

**Who**: Users who need all shells

**Action**: None required

```bash
# Before and after - same command
npm run build
```

**Benefits**: Zero migration effort, all shells available

---

#### Path 2: Adopt Specialized Build

**Who**: Users who only need specific shells

**Steps**:

1. **Choose your build**:

   ```bash
   npm run build:gitbash  # or windows, unix, cmd, etc.
   ```

2. **Update Claude Desktop config**:

   ```json
   {
     "mcpServers": {
       "wcli0": {
         "command": "node",
         "args": ["/path/to/wcli0/dist/index.gitbash-only.js"]
       }
     }
   }
   ```

3. **Test**:

   ```bash
   npm test
   node dist/index.gitbash-only.js --list-shells
   ```

**Benefits**: 30-65% smaller bundle, faster startup, lower memory

---

### For Developers: Code Changes

#### Update Imports

**Before**:

```typescript
import { DEFAULT_CONFIG } from './utils/config';
import { validateCommand } from './utils/validation';
```

**After**:

```typescript
import { shellRegistry } from './core/registry';
import { loadShells } from './shells/loader';

await loadShells({ shells: ['gitbash', 'powershell'] });

const gitBash = shellRegistry.getShell('gitbash');
if (gitBash) {
  const result = gitBash.validateCommand('ls', { shellType: 'gitbash' });
}
```

#### Update Configuration Access

**Before**:

```typescript
const powershellConfig = DEFAULT_CONFIG.shells.powershell;
```

**After**:

```typescript
const powershell = shellRegistry.getShell('powershell');
const powershellConfig = powershell?.defaultConfig;
```

#### Update Validation Calls

**Before**:

```typescript
import { validateCommand } from './utils/validation';
const result = validateCommand(command, shellType);
```

**After**:

```typescript
const shell = shellRegistry.getShell(shellType);
if (shell) {
  const result = shell.validateCommand(command, { shellType });
}
```

### Test Organization Changes

**Before** (monolithic):

```text
tests/
└── validation.test.ts  # All shells in one file
```

**After** (modular):

```text
src/shells/
├── gitbash/__tests__/
│   └── validation.test.ts
└── powershell/__tests__/
    └── validation.test.ts
```

**Running Tests**:

```bash
# All tests
npm test

# Specific shell module
npm test -- shells/gitbash

# Integration only
npm test -- integration
```

---

## API Reference

### ShellPlugin Interface

All shell implementations must implement:

```typescript
interface ShellPlugin {
  readonly shellType: string;              // 'powershell', 'gitbash', etc.
  readonly displayName: string;            // 'PowerShell', 'Git Bash', etc.
  readonly defaultConfig: ShellConfig;     // Default configuration

  validateCommand(command: string, context: ValidationContext): ValidationResult;
  validatePath(path: string, context: ValidationContext): ValidationResult;
  executeCommand?(command: string, options: ExecutionOptions): Promise<ExecutionResult>;
  getBlockedCommands(): string[];
  mergeConfig(base: ShellConfig, override: Partial<ShellConfig>): ShellConfig;
}
```

### ShellRegistry API

```typescript
class ShellRegistry {
  register(shell: ShellPlugin): void;
  unregister(shellType: string): boolean;
  getShell(shellType: string): ShellPlugin | undefined;
  getAllShells(): ShellPlugin[];
  getShellTypes(): string[];
  hasShell(shellType: string): boolean;
  getCount(): number;
  clear(): void;  // For testing
}

// Singleton instance
import { shellRegistry } from './core/registry';
```

**Usage**:

```typescript
// Register
const gitBash = new GitBashPlugin();
shellRegistry.register(gitBash);

// Retrieve
const shell = shellRegistry.getShell('gitbash');

// Query
const allShells = shellRegistry.getAllShells();
const types = shellRegistry.getShellTypes();
```

### BaseShell Abstract Class

Extend for new shell implementations:

```typescript
export abstract class BaseShell implements ShellPlugin {
  abstract readonly shellType: string;
  abstract readonly displayName: string;
  abstract readonly defaultConfig: ShellConfig;

  validateCommand(command: string, context: ValidationContext): ValidationResult {
    // Default implementation
  }

  validatePath(path: string, context: ValidationContext): ValidationResult {
    return { valid: true }; // Override in subclass
  }

  abstract getBlockedCommands(): string[];

  mergeConfig(base: ShellConfig, override: Partial<ShellConfig>): ShellConfig {
    // Default merge implementation
  }
}
```

### Creating a Custom Shell

```typescript
import { BaseShell } from '../base/BaseShell';
import { ShellConfig } from '../../types/config';

export class MyShellPlugin extends BaseShell {
  readonly shellType = 'myshell';
  readonly displayName = 'My Shell';

  readonly defaultConfig: ShellConfig = {
    enabled: true,
    shellCommand: '/usr/bin/myshell',
    shellArgs: ['-c'],
    timeout: 30000,
    maxOutputLines: 1000,
    security: {
      allowCommandChaining: true,
      allowPipeOperators: true,
      allowRedirection: false,
      validatePaths: true
    },
    restrictions: {
      allowedCommands: [],
      blockedCommands: ['dangerous-cmd'],
      allowedPaths: [],
      blockedPaths: [],
      requirePathValidation: true
    },
    paths: {
      enforceAbsolutePaths: false,
      pathStyle: 'unix'
    }
  };

  getBlockedCommands(): string[] {
    return ['dangerous-cmd', 'rm -rf /'];
  }

  validatePath(path: string, context: ValidationContext): ValidationResult {
    if (!path.startsWith('/')) {
      return {
        valid: false,
        errors: ['Path must be absolute']
      };
    }
    return { valid: true };
  }
}
```

**Register the shell**:

```typescript
import { shellRegistry } from '../../core/registry';
const myShell = new MyShellPlugin();
shellRegistry.register(myShell);
```

### Shell Loader

```typescript
interface LoaderConfig {
  shells: string[];
  verbose?: boolean;
}

async function loadShells(config: LoaderConfig): Promise<void>
```

**Usage**:

```typescript
import { loadShells } from './shells/loader';

await loadShells({
  shells: ['gitbash', 'powershell'],
  verbose: true
});
```

### Build Configuration

```typescript
interface BuildConfig {
  includedShells: string[];
  buildName: string;
  includeAll?: boolean;
  verbose?: boolean;
}

function getBuildConfig(): BuildConfig
```

---

## Common Use Cases

### Use Case 1: Windows Developer with Git Bash

**Scenario**: Windows developer who exclusively uses Git Bash

**Solution**:

```bash
# Build
npm run build:gitbash

# Configure Claude Desktop
{
  "mcpServers": {
    "wcli0": {
      "command": "node",
      "args": ["C:/path/to/wcli0/dist/index.gitbash-only.js"]
    }
  }
}
```

**Benefits**: 60% smaller bundle, faster startup, simpler config

---

### Use Case 2: Linux Server Deployment

**Scenario**: Deploying to Linux server

**Solution**:

```bash
# Build
npm run build:unix

# Deploy
scp dist/index.unix.js user@server:/opt/wcli0/

# Run
node /opt/wcli0/index.unix.js
```

**Benefits**: Minimal bundle, no Windows dependencies

---

### Use Case 3: Corporate Windows Environment

**Scenario**: Corporate environment with PowerShell and CMD

**Solution**:

```bash
# Build
npm run build:windows

# Deploy to workstations
xcopy dist\index.windows.js \\fileserver\apps\wcli0\
```

**Benefits**: All Windows shells, no Unix code, optimized

---

### Use Case 4: Docker Container (Linux)

**Scenario**: Running in Linux Docker container

**Dockerfile**:

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Build Unix-only version
COPY . .
RUN npm run build:unix

CMD ["node", "dist/index.unix.js"]
```

**Benefits**: Smaller image, faster builds, minimal attack surface

---

### Use Case 5: Multi-Environment CI/CD

**Scenario**: Different shells for different environments

**.github/workflows/build.yml**:

```yaml
jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run build:windows
      - uses: actions/upload-artifact@v3
        with:
          name: windows-build
          path: dist/index.windows.js

  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run build:unix
      - uses: actions/upload-artifact@v3
        with:
          name: linux-build
          path: dist/index.unix.js
```

---

## Troubleshooting

### Shell Not Found

**Problem**: "Shell 'gitbash' not found"

**Solution**: Verify shell is included in build

```bash
node dist/index.js --list-shells
```

If missing, rebuild with correct preset:

```bash
npm run build:gitbash
```

---

### Import Errors

**Problem**: "Cannot find module './shells/gitbash'"

**Solution**: Check build configuration includes the shell

```bash
INCLUDED_SHELLS=gitbash,powershell npm run build:custom
```

---

### Configuration Not Applied

**Problem**: Shell config not being used

**Solution**: Ensure shell is registered before use

```typescript
import { loadShells } from './shells/loader';
await loadShells({ shells: ['gitbash'] });

// Now safe to use
const shell = shellRegistry.getShell('gitbash');
```

---

### Bundle Size Not Reduced

**Problem**: Specialized build still large

**Solution**: Verify tree-shaking is enabled

```javascript
// rollup.config.js or vite.config.js
export default {
  build: {
    treeshake: {
      moduleSideEffects: false
    }
  }
};
```

---

### Tests Failing After Migration

**Problem**: Tests fail with "shell not found"

**Solution**: Update test to load shells

```typescript
beforeAll(async () => {
  await loadShells({ shells: ['gitbash'] });
});
```

---

## Best Practices

### 1. Shell Selection

- Use **full build** for development
- Use **specialized builds** for production
- Choose smallest build that meets needs

### 2. Configuration

- Use presets for common configurations
- Create custom presets for repeated use
- Document which shells are required

### 3. Testing

- Test each shell module independently
- Test build configurations in CI
- Verify bundle sizes meet targets

### 4. Deployment

- Build once, deploy many times
- Use appropriate build for each environment
- Version specialized builds separately

### 5. Error Handling

- Always check if shell is registered
- Provide fallback for missing shells
- Log warnings for unexpected states

---

## Migration Checklist

### For End Users

- [ ] Decide which shells you need
- [ ] Choose appropriate build preset
- [ ] Update build command
- [ ] Update Claude Desktop configuration
- [ ] Test the new build
- [ ] Deploy

### For Developers

- [ ] Update imports to use registry
- [ ] Update tests to modular structure
- [ ] Update configuration access patterns
- [ ] Update validation calls
- [ ] Add shell loading in initialization
- [ ] Test all changes
- [ ] Update documentation

---

**Last Updated**: 2025-11-10  
**See Also**: MODULAR_PLAN.md, TESTING_STRATEGY.md  
**Status**: Ready for Implementation
