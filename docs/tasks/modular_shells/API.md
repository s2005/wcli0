# Modular Shell Architecture - API Documentation

## Overview

This document provides comprehensive API documentation for the modular shell architecture in WCLI0 MCP server. It covers the plugin interface, registry system, build configuration, and shell implementations.

## Table of Contents

1. [Core Interfaces](#core-interfaces)
2. [Shell Plugin Interface](#shell-plugin-interface)
3. [Shell Registry API](#shell-registry-api)
4. [Build Configuration API](#build-configuration-api)
5. [Shell Loader API](#shell-loader-api)
6. [Individual Shell Implementations](#individual-shell-implementations)
7. [Type Definitions](#type-definitions)

---

## Core Interfaces

### ShellPlugin

The main interface that all shell implementations must implement.

**Location**: `src/shells/base/ShellInterface.ts`

```typescript
interface ShellPlugin {
  /** Unique shell identifier (e.g., 'powershell', 'gitbash') */
  readonly shellType: string;

  /** Display name for UI/docs */
  readonly displayName: string;

  /** Default configuration for this shell */
  readonly defaultConfig: ShellConfig;

  /** Validate a command for this shell */
  validateCommand(
    command: string,
    context: ValidationContext
  ): ValidationResult;

  /** Validate a path for this shell */
  validatePath(
    path: string,
    context: ValidationContext
  ): ValidationResult;

  /** Execute a command (optional - can use default executor) */
  executeCommand?(
    command: string,
    options: ExecutionOptions
  ): Promise<ExecutionResult>;

  /** Get shell-specific blocked commands */
  getBlockedCommands(): string[];

  /** Get shell-specific tool schema extensions */
  getToolSchemaExtensions?(): Record<string, any>;

  /** Merge configuration with shell-specific logic */
  mergeConfig(
    base: ShellConfig,
    override: Partial<ShellConfig>
  ): ShellConfig;
}
```

#### Properties

##### `shellType: string`

Unique identifier for the shell. Must be lowercase and match the directory name.

**Examples**:

- `'powershell'`
- `'cmd'`
- `'gitbash'`
- `'bash'`
- `'wsl'`

##### `displayName: string`

Human-readable name for the shell, used in documentation and UI.

**Examples**:

- `'PowerShell'`
- `'Command Prompt (CMD)'`
- `'Git Bash'`
- `'Bash'`
- `'WSL (Windows Subsystem for Linux)'`

##### `defaultConfig: ShellConfig`

Default configuration object for the shell. See [ShellConfig](#shellconfig) for details.

#### Methods

##### `validateCommand(command: string, context: ValidationContext): ValidationResult`

Validates a command string according to the shell's security rules.

**Parameters**:

- `command`: The command string to validate
- `context`: Validation context containing shell type and optional constraints

**Returns**: `ValidationResult` object with `valid` flag and optional `errors`/`warnings` arrays

**Example**:

```typescript
const result = shell.validateCommand('rm -rf /', {
  shellType: 'bash',
  blockedCommands: ['wget']
});
// result = { valid: false, errors: ['Command "rm" is blocked for bash'] }
```

##### `validatePath(path: string, context: ValidationContext): ValidationResult`

Validates a file system path according to the shell's path conventions.

**Parameters**:

- `path`: The path string to validate
- `context`: Validation context

**Returns**: `ValidationResult` object

**Example**:

```typescript
const result = shell.validatePath('C:\\Users\\test', {
  shellType: 'powershell'
});
// result = { valid: true }
```

##### `getBlockedCommands(): string[]`

Returns an array of commands that are blocked by default for this shell.

**Returns**: Array of blocked command names

**Example**:

```typescript
const blocked = shell.getBlockedCommands();
// ['rm -rf /', 'mkfs', 'dd', 'wget', 'curl']
```

##### `mergeConfig(base: ShellConfig, override: Partial<ShellConfig>): ShellConfig`

Merges a base configuration with override values, applying shell-specific logic.

**Parameters**:

- `base`: Base configuration object
- `override`: Partial configuration to merge

**Returns**: Merged configuration object

**Example**:

```typescript
const merged = shell.mergeConfig(shell.defaultConfig, {
  timeout: 60000,
  security: { allowCommandChaining: true }
});
```

---

## Shell Plugin Interface

### BaseShell

Abstract base class providing common functionality for shell plugins.

**Location**: `src/shells/base/BaseShell.ts`

```typescript
abstract class BaseShell implements ShellPlugin {
  abstract readonly shellType: string;
  abstract readonly displayName: string;
  abstract readonly defaultConfig: ShellConfig;

  validateCommand(command: string, context: ValidationContext): ValidationResult;
  validatePath(path: string, context: ValidationContext): ValidationResult;
  abstract getBlockedCommands(): string[];
  mergeConfig(base: ShellConfig, override: Partial<ShellConfig>): ShellConfig;
}
```

**Usage**:

Create a new shell by extending `BaseShell`:

```typescript
import { BaseShell } from '../base/BaseShell';
import { ShellConfig } from '../../types/config';

export class MyShellPlugin extends BaseShell {
  readonly shellType = 'myshell';
  readonly displayName = 'My Shell';

  readonly defaultConfig: ShellConfig = {
    // ... configuration
  };

  getBlockedCommands(): string[] {
    return ['dangerous-command'];
  }

  // Optional: Override validatePath for custom path handling
  validatePath(path: string, context: ValidationContext): ValidationResult {
    // Custom validation logic
    return { valid: true };
  }
}
```

---

## Shell Registry API

### ShellRegistry

Singleton registry for managing shell plugin instances.

**Location**: `src/core/registry.ts`

```typescript
class ShellRegistry {
  /** Register a shell plugin */
  register(shell: ShellPlugin): void;

  /** Unregister a shell plugin */
  unregister(shellType: string): boolean;

  /** Get a registered shell by type */
  getShell(shellType: string): ShellPlugin | undefined;

  /** Get all registered shells */
  getAllShells(): ShellPlugin[];

  /** Get all registered shell types */
  getShellTypes(): string[];

  /** Check if a shell is registered */
  hasShell(shellType: string): boolean;

  /** Get count of registered shells */
  getCount(): number;

  /** Clear all registered shells (mainly for testing) */
  clear(): void;
}
```

#### Registry Methods

##### `register(shell: ShellPlugin): void`

Registers a shell plugin with the registry. If a shell with the same type is already registered, it will be skipped with a warning.

**Parameters**:

- `shell`: The shell plugin instance to register

**Example**:

```typescript
import { shellRegistry } from './core/registry';
import { GitBashPlugin } from './shells/gitbash';

const gitBash = new GitBashPlugin();
shellRegistry.register(gitBash);
```

##### `unregister(shellType: string): boolean`

Unregisters a shell plugin from the registry.

**Parameters**:

- `shellType`: The shell type identifier to unregister

**Returns**: `true` if shell was unregistered, `false` if it wasn't registered

**Example**:

```typescript
const wasRemoved = shellRegistry.unregister('gitbash');
```

##### `getShell(shellType: string): ShellPlugin | undefined`

Retrieves a registered shell plugin by its type.

**Parameters**:

- `shellType`: The shell type identifier

**Returns**: The shell plugin instance, or `undefined` if not registered

**Example**:

```typescript
const gitBash = shellRegistry.getShell('gitbash');
if (gitBash) {
  const result = gitBash.validateCommand('ls -la', { shellType: 'gitbash' });
}
```

##### `getAllShells(): ShellPlugin[]`

Gets an array of all registered shell plugins.

**Returns**: Array of shell plugin instances

**Example**:

```typescript
const allShells = shellRegistry.getAllShells();
allShells.forEach(shell => {
  console.log(`${shell.displayName}: ${shell.shellType}`);
});
```

##### `getShellTypes(): string[]`

Gets an array of all registered shell type identifiers.

**Returns**: Array of shell type strings

**Example**:

```typescript
const types = shellRegistry.getShellTypes();
// ['gitbash', 'powershell', 'cmd']
```

##### `hasShell(shellType: string): boolean`

Checks if a shell type is registered.

**Parameters**:

- `shellType`: The shell type identifier to check

**Returns**: `true` if registered, `false` otherwise

**Example**:

```typescript
if (shellRegistry.hasShell('gitbash')) {
  // Git Bash is available
}
```

##### `getCount(): number`

Gets the number of registered shells.

**Returns**: Count of registered shells

**Example**:

```typescript
const count = shellRegistry.getCount();
console.log(`${count} shell(s) registered`);
```

##### `clear(): void`

Removes all registered shells. Primarily used for testing.

**Example**:

```typescript
// In test setup
beforeEach(() => {
  shellRegistry.clear();
});
```

---

## Build Configuration API

### BuildConfig

Configuration interface for build-time shell selection.

**Location**: `src/build/shell-config.ts`

```typescript
interface BuildConfig {
  /** Shells to include in this build */
  includedShells: string[];

  /** Build name/identifier */
  buildName: string;

  /** Whether to include all shells (overrides includedShells) */
  includeAll?: boolean;

  /** Whether to log debug info during build */
  verbose?: boolean;
}
```

### getBuildConfig()

Retrieves the build configuration from environment variables or returns default.

**Returns**: `BuildConfig` object

**Environment Variables**:

- `SHELL_BUILD_PRESET`: Name of a preset configuration (e.g., 'gitbash-only', 'windows')
- `INCLUDED_SHELLS`: Comma-separated list of shell types (e.g., 'gitbash,powershell')
- `BUILD_VERBOSE`: Set to 'true' to enable verbose logging

**Example**:

```typescript
import { getBuildConfig } from './build/shell-config';

const config = getBuildConfig();
console.log(`Building: ${config.buildName}`);
console.log(`Shells: ${config.includedShells.join(', ')}`);
```

**Default Configuration**:

```javascript
{
  includedShells: ['powershell', 'cmd', 'gitbash', 'bash', 'wsl'],
  buildName: 'full',
  includeAll: true
}
```

### Build Presets

Pre-configured build settings available in `src/build/presets/`:

#### `full.ts`

All shells included (default)

```javascript
{
  buildName: 'full',
  includeAll: true,
  includedShells: ['powershell', 'cmd', 'gitbash', 'bash', 'wsl']
}
```

#### `windows.ts`

Windows shells only

```javascript
{
  buildName: 'windows',
  includedShells: ['powershell', 'cmd', 'gitbash']
}
```

#### `unix.ts`

Unix/Linux shells only

```javascript
{
  buildName: 'unix',
  includedShells: ['bash']
}
```

#### `gitbash-only.ts`

Git Bash only

```javascript
{
  buildName: 'gitbash-only',
  includedShells: ['gitbash']
}
```

#### `cmd-only.ts`

CMD only

```javascript
{
  buildName: 'cmd-only',
  includedShells: ['cmd']
}
```

---

## Shell Loader API

### loadShells()

Dynamically loads and registers shell plugins based on configuration.

**Location**: `src/shells/loader.ts`

```typescript
interface LoaderConfig {
  shells: string[];
  verbose?: boolean;
}

async function loadShells(config: LoaderConfig): Promise<void>
```

**Parameters**:

- `config.shells`: Array of shell type identifiers to load
- `config.verbose`: Optional flag to enable verbose logging

**Example**:

```typescript
import { loadShells } from './shells/loader';

// Load specific shells
await loadShells({
  shells: ['gitbash', 'powershell'],
  verbose: true
});

// Load all shells
await loadShells({
  shells: ['powershell', 'cmd', 'gitbash', 'bash', 'wsl']
});
```

**Behavior**:

- Dynamically imports only the specified shell modules
- Registers each shell with the `shellRegistry`
- Skips unknown shell types with a warning
- Logs errors if a shell fails to load

---

## Individual Shell Implementations

### PowerShellPlugin

**Location**: `src/shells/powershell/PowerShellImpl.ts`

**Shell Type**: `'powershell'`

**Display Name**: `'PowerShell'`

**Default Configuration**:

```javascript
{
  enabled: true,
  shellCommand: 'powershell.exe',
  shellArgs: ['-NoProfile', '-Command'],
  timeout: 30000,
  maxOutputLines: 1000,
  security: {
    allowCommandChaining: false,
    allowPipeOperators: true,
    allowRedirection: false,
    validatePaths: true
  },
  restrictions: {
    allowedCommands: [],
    blockedCommands: ['Invoke-WebRequest', 'Invoke-RestMethod', 'Start-Process'],
    allowedPaths: [],
    blockedPaths: [],
    requirePathValidation: true
  },
  paths: {
    enforceAbsolutePaths: false,
    pathStyle: 'windows'
  }
}
```

**Blocked Commands**:

- `Invoke-WebRequest`
- `Invoke-RestMethod`
- `Start-Process`
- `New-Object`
- `Invoke-Expression`
- `iex`
- `wget`
- `curl`

**Path Validation**: Windows path format (`C:\path` or relative)

---

### CmdPlugin

**Location**: `src/shells/cmd/CmdImpl.ts`

**Shell Type**: `'cmd'`

**Display Name**: `'Command Prompt (CMD)'`

**Default Configuration**:

```javascript
{
  enabled: true,
  shellCommand: 'cmd.exe',
  shellArgs: ['/C'],
  timeout: 30000,
  maxOutputLines: 1000,
  security: {
    allowCommandChaining: false,
    allowPipeOperators: true,
    allowRedirection: false,
    validatePaths: true
  },
  restrictions: {
    allowedCommands: [],
    blockedCommands: ['del', 'rd', 'rmdir', 'format'],
    allowedPaths: [],
    blockedPaths: [],
    requirePathValidation: true
  },
  paths: {
    enforceAbsolutePaths: false,
    pathStyle: 'windows'
  }
}
```

**Blocked Commands**:

- `del`, `erase`
- `rd`, `rmdir`
- `format`
- `diskpart`
- `reg delete`

**Path Validation**: Windows path format

---

### GitBashPlugin

**Location**: `src/shells/gitbash/GitBashImpl.ts`

**Shell Type**: `'gitbash'`

**Display Name**: `'Git Bash'`

**Default Configuration**:

```javascript
{
  enabled: true,
  shellCommand: 'C:\\Program Files\\Git\\bin\\bash.exe',
  shellArgs: ['-c'],
  timeout: 30000,
  maxOutputLines: 1000,
  security: {
    allowCommandChaining: true,
    allowPipeOperators: true,
    allowRedirection: true,
    validatePaths: true
  },
  restrictions: {
    allowedCommands: [],
    blockedCommands: ['rm -rf /', 'mkfs', 'dd'],
    allowedPaths: [],
    blockedPaths: [],
    requirePathValidation: false
  },
  paths: {
    enforceAbsolutePaths: false,
    pathStyle: 'unix'
  }
}
```

**Blocked Commands**:

- `rm -rf /`
- `mkfs`
- `dd`
- `wget`
- `curl`

**Path Validation**: Supports both Unix (`/c/path`) and Windows (`C:\path`) formats

---

### BashPlugin

**Location**: `src/shells/bash/BashImpl.ts`

**Shell Type**: `'bash'`

**Display Name**: `'Bash'`

**Default Configuration**:

```javascript
{
  enabled: true,
  shellCommand: '/bin/bash',
  shellArgs: ['-c'],
  timeout: 30000,
  maxOutputLines: 1000,
  security: {
    allowCommandChaining: true,
    allowPipeOperators: true,
    allowRedirection: true,
    validatePaths: true
  },
  restrictions: {
    allowedCommands: [],
    blockedCommands: ['rm -rf /', 'mkfs', 'dd'],
    allowedPaths: [],
    blockedPaths: [],
    requirePathValidation: false
  },
  paths: {
    enforceAbsolutePaths: false,
    pathStyle: 'unix'
  }
}
```

**Blocked Commands**:

- `rm -rf /`
- `mkfs`
- `dd`
- `fdisk`
- `wget`
- `curl`

**Path Validation**: Unix path format (`/path` or relative)

---

### WslPlugin

**Location**: `src/shells/wsl/WslImpl.ts`

**Shell Type**: `'wsl'`

**Display Name**: `'WSL (Windows Subsystem for Linux)'`

**Default Configuration**:

```javascript
{
  enabled: true,
  shellCommand: 'wsl.exe',
  shellArgs: ['-e', 'bash', '-c'],
  timeout: 30000,
  maxOutputLines: 1000,
  security: {
    allowCommandChaining: true,
    allowPipeOperators: true,
    allowRedirection: true,
    validatePaths: true
  },
  restrictions: {
    allowedCommands: [],
    blockedCommands: ['rm -rf /', 'mkfs', 'dd'],
    allowedPaths: [],
    blockedPaths: [],
    requirePathValidation: false
  },
  paths: {
    enforceAbsolutePaths: false,
    pathStyle: 'unix',
    wslMountPoint: '/mnt'
  }
}
```

**Blocked Commands**:

- `rm -rf /`
- `mkfs`
- `dd`
- `fdisk`

**Path Validation**: Unix paths with WSL mount point support (`/mnt/c/path`)

---

## Type Definitions

### ValidationContext

Context information for validation operations.

```typescript
interface ValidationContext {
  shellType: string;
  workingDirectory?: string;
  allowedCommands?: string[];
  blockedCommands?: string[];
}
```

### ValidationResult

Result of a validation operation.

```typescript
interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}
```

### ExecutionOptions

Options for command execution.

```typescript
interface ExecutionOptions {
  command: string;
  workingDirectory?: string;
  timeout?: number;
  environment?: Record<string, string>;
}
```

### ExecutionResult

Result of a command execution.

```typescript
interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: Error;
}
```

### ShellConfig

Complete shell configuration object.

```typescript
interface ShellConfig {
  enabled: boolean;
  shellCommand: string;
  shellArgs: string[];
  timeout: number;
  maxOutputLines: number;

  security: {
    allowCommandChaining: boolean;
    allowPipeOperators: boolean;
    allowRedirection: boolean;
    validatePaths: boolean;
  };

  restrictions: {
    allowedCommands: string[];
    blockedCommands: string[];
    allowedPaths: string[];
    blockedPaths: string[];
    requirePathValidation: boolean;
  };

  paths: {
    enforceAbsolutePaths: boolean;
    pathStyle: 'windows' | 'unix';
    wslMountPoint?: string;
  };
}
```

---

## Usage Examples

### Complete Example: Custom Shell Implementation

```typescript
// 1. Create shell implementation
import { BaseShell } from '../base/BaseShell';
import { ShellConfig } from '../../types/config';
import { ValidationContext, ValidationResult } from '../base/ShellInterface';

export class MyCustomShell extends BaseShell {
  readonly shellType = 'mycustom';
  readonly displayName = 'My Custom Shell';

  readonly defaultConfig: ShellConfig = {
    enabled: true,
    shellCommand: '/usr/bin/mycustom',
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
    return ['dangerous-cmd', 'another-blocked'];
  }

  validatePath(path: string, context: ValidationContext): ValidationResult {
    // Custom path validation
    if (!path.startsWith('/')) {
      return {
        valid: false,
        errors: ['Path must be absolute']
      };
    }
    return { valid: true };
  }
}

// 2. Register the shell
import { shellRegistry } from '../../core/registry';

const myShell = new MyCustomShell();
shellRegistry.register(myShell);

// 3. Use the shell
const shell = shellRegistry.getShell('mycustom');
if (shell) {
  const cmdResult = shell.validateCommand('ls -la', {
    shellType: 'mycustom'
  });

  const pathResult = shell.validatePath('/home/user', {
    shellType: 'mycustom'
  });
}
```

### Example: Dynamic Shell Loading Based on Platform

```typescript
import { loadShells } from './shells/loader';
import { getBuildConfig } from './build/shell-config';

async function initializeShells() {
  const buildConfig = getBuildConfig();

  // Load shells based on build configuration
  await loadShells({
    shells: buildConfig.includedShells,
    verbose: process.env.DEBUG === 'true'
  });

  console.log(`Initialized with shells: ${buildConfig.includedShells.join(', ')}`);
}

// Initialize during server startup
await initializeShells();
```

### Example: Validating Commands Across Multiple Shells

```typescript
import { shellRegistry } from './core/registry';

function validateCommandForAllShells(command: string): Map<string, boolean> {
  const results = new Map<string, boolean>();

  for (const shell of shellRegistry.getAllShells()) {
    const result = shell.validateCommand(command, {
      shellType: shell.shellType
    });
    results.set(shell.shellType, result.valid);
  }

  return results;
}

const results = validateCommandForAllShells('rm -rf /');
// Map { 'gitbash' => false, 'bash' => false, 'powershell' => true, ... }
```

---

## Best Practices

### 1. Shell Implementation

- Always extend `BaseShell` for common functionality
- Provide comprehensive blocked commands list
- Implement shell-specific path validation
- Use descriptive error messages in validation results

### 2. Registry Usage

- Register shells during application initialization
- Check if shell is registered before using `getShell()`
- Clear registry in test teardown to avoid cross-test pollution

### 3. Build Configuration

- Use presets for common configurations
- Document custom build combinations
- Test each build configuration independently

### 4. Error Handling

- Always check `ValidationResult.valid` before proceeding
- Provide user-friendly error messages
- Log warnings for non-critical issues

---

## Versioning

**API Version**: 1.0.0

**Compatibility**:

- Node.js >= 16.0.0
- TypeScript >= 4.5.0

---

## See Also

- [User Guide](./USER_GUIDE.md) - How to use the modular shell system
- [Migration Guide](./MIGRATION_GUIDE.md) - Migrating from monolithic architecture
- [Architecture](./ARCHITECTURE.md) - System architecture overview
- [Testing Guide](./TESTING_GUIDE.md) - Testing strategies and examples
