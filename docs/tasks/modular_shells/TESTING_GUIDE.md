# Modular Shell Architecture - Testing Guide

## Overview

This document provides comprehensive guidance on how to modify and organize tests for the modular shell architecture. It covers test restructuring, migration strategies, and best practices for testing shell modules independently.

## Table of Contents

1. [Current Test Structure](#current-test-structure)
2. [Target Test Structure](#target-test-structure)
3. [Test Migration Strategy](#test-migration-strategy)
4. [Testing Individual Shell Modules](#testing-individual-shell-modules)
5. [Integration Testing](#integration-testing)
6. [Build-Specific Testing](#build-specific-testing)
7. [Test Utilities and Helpers](#test-utilities-and-helpers)
8. [Performance Testing](#performance-testing)
9. [CI/CD Integration](#cicd-integration)

---

## Current Test Structure

### Existing Test Files

Based on the current codebase:

```
src/
├── __tests__/
│   ├── config.test.ts              # Configuration tests
│   ├── validation.test.ts          # Validation tests (all shells)
│   ├── pathValidation.test.ts      # Path validation tests
│   ├── configMerger.test.ts        # Config merging tests
│   └── ...
└── utils/
    └── __tests__/
        └── ...
```

### Current Test Characteristics

- Tests are organized by functionality (config, validation, paths)
- Tests cover all shells in single test files
- Shell-specific tests are mixed with general tests
- No separation by shell type

---

## Target Test Structure

### Proposed Test Organization

```
src/
├── shells/
│   ├── base/
│   │   └── __tests__/
│   │       ├── ShellInterface.test.ts        # Interface contract tests
│   │       └── BaseShell.test.ts             # Base implementation tests
│   │
│   ├── powershell/
│   │   └── __tests__/
│   │       ├── PowerShellImpl.test.ts        # Implementation tests
│   │       ├── validation.test.ts            # PowerShell validation
│   │       ├── pathHandling.test.ts          # PowerShell paths
│   │       └── integration.test.ts           # PowerShell integration
│   │
│   ├── cmd/
│   │   └── __tests__/
│   │       ├── CmdImpl.test.ts
│   │       ├── validation.test.ts
│   │       ├── pathHandling.test.ts
│   │       └── integration.test.ts
│   │
│   ├── gitbash/
│   │   └── __tests__/
│   │       ├── GitBashImpl.test.ts
│   │       ├── validation.test.ts
│   │       ├── pathHandling.test.ts
│   │       └── integration.test.ts
│   │
│   ├── bash/
│   │   └── __tests__/
│   │       ├── BashImpl.test.ts
│   │       ├── validation.test.ts
│   │       ├── pathHandling.test.ts
│   │       └── integration.test.ts
│   │
│   ├── wsl/
│   │   └── __tests__/
│   │       ├── WslImpl.test.ts
│   │       ├── validation.test.ts
│   │       ├── pathHandling.test.ts
│   │       └── integration.test.ts
│   │
│   └── __tests__/
│       ├── loader.test.ts                    # Shell loader tests
│       └── cross-shell.test.ts               # Cross-shell behavior tests
│
├── core/
│   └── __tests__/
│       ├── registry.test.ts                  # Registry tests
│       ├── server.test.ts                    # Server tests
│       └── executor.test.ts                  # Executor tests
│
├── build/
│   └── __tests__/
│       ├── shell-config.test.ts              # Build config tests
│       └── presets.test.ts                   # Preset tests
│
└── __tests__/
    ├── integration/
    │   ├── modular-shells.test.ts            # Modular system integration
    │   ├── build-full.test.ts                # Full build tests
    │   ├── build-windows.test.ts             # Windows build tests
    │   ├── build-gitbash.test.ts             # Git Bash build tests
    │   └── ...
    │
    └── e2e/
        ├── gitbash-only.test.ts              # E2E for Git Bash build
        ├── cmd-only.test.ts                  # E2E for CMD build
        └── ...
```

---

## Test Migration Strategy

### Phase 1: Create Base Tests

**Goal**: Test the foundation (interfaces, base classes, registry)

#### 1.1: Shell Interface Contract Tests

**File**: `src/shells/base/__tests__/ShellInterface.test.ts`

```typescript
import { ShellPlugin, ValidationContext, ValidationResult } from '../ShellInterface';

/**
 * Test suite for ShellPlugin interface contract
 * These tests ensure all shell implementations follow the interface correctly
 */
describe('ShellPlugin Interface Contract', () => {
  // Mock implementation for testing
  class MockShellPlugin implements ShellPlugin {
    readonly shellType = 'mock';
    readonly displayName = 'Mock Shell';
    readonly defaultConfig = {
      enabled: true,
      shellCommand: 'mock',
      shellArgs: [],
      timeout: 30000,
      maxOutputLines: 1000,
      security: {
        allowCommandChaining: false,
        allowPipeOperators: false,
        allowRedirection: false,
        validatePaths: true,
      },
      restrictions: {
        allowedCommands: [],
        blockedCommands: [],
        allowedPaths: [],
        blockedPaths: [],
        requirePathValidation: true,
      },
      paths: {
        enforceAbsolutePaths: false,
        pathStyle: 'unix' as const,
      },
    };

    validateCommand(command: string, context: ValidationContext): ValidationResult {
      return { valid: true };
    }

    validatePath(path: string, context: ValidationContext): ValidationResult {
      return { valid: true };
    }

    getBlockedCommands(): string[] {
      return [];
    }

    mergeConfig(base: any, override: any): any {
      return { ...base, ...override };
    }
  }

  let plugin: MockShellPlugin;

  beforeEach(() => {
    plugin = new MockShellPlugin();
  });

  describe('required properties', () => {
    it('should have shellType property', () => {
      expect(plugin.shellType).toBeDefined();
      expect(typeof plugin.shellType).toBe('string');
    });

    it('should have displayName property', () => {
      expect(plugin.displayName).toBeDefined();
      expect(typeof plugin.displayName).toBe('string');
    });

    it('should have defaultConfig property', () => {
      expect(plugin.defaultConfig).toBeDefined();
      expect(typeof plugin.defaultConfig).toBe('object');
    });
  });

  describe('required methods', () => {
    it('should implement validateCommand method', () => {
      expect(typeof plugin.validateCommand).toBe('function');
      const result = plugin.validateCommand('test', { shellType: 'mock' });
      expect(result).toHaveProperty('valid');
      expect(typeof result.valid).toBe('boolean');
    });

    it('should implement validatePath method', () => {
      expect(typeof plugin.validatePath).toBe('function');
      const result = plugin.validatePath('/test', { shellType: 'mock' });
      expect(result).toHaveProperty('valid');
      expect(typeof result.valid).toBe('boolean');
    });

    it('should implement getBlockedCommands method', () => {
      expect(typeof plugin.getBlockedCommands).toBe('function');
      const result = plugin.getBlockedCommands();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should implement mergeConfig method', () => {
      expect(typeof plugin.mergeConfig).toBe('function');
      const result = plugin.mergeConfig({ a: 1 }, { b: 2 });
      expect(result).toBeDefined();
    });
  });
});
```

#### 1.2: Base Shell Tests

**File**: `src/shells/base/__tests__/BaseShell.test.ts`

```typescript
import { BaseShell } from '../BaseShell';
import { ShellConfig } from '../../../types/config';
import { ValidationContext } from '../ShellInterface';

// Concrete implementation for testing
class TestShell extends BaseShell {
  readonly shellType = 'test';
  readonly displayName = 'Test Shell';
  readonly defaultConfig: ShellConfig = {
    enabled: true,
    shellCommand: 'test',
    shellArgs: [],
    timeout: 30000,
    maxOutputLines: 1000,
    security: {
      allowCommandChaining: false,
      allowPipeOperators: false,
      allowRedirection: false,
      validatePaths: true,
    },
    restrictions: {
      allowedCommands: [],
      blockedCommands: [],
      allowedPaths: [],
      blockedPaths: [],
      requirePathValidation: true,
    },
    paths: {
      enforceAbsolutePaths: false,
      pathStyle: 'unix',
    },
  };

  getBlockedCommands(): string[] {
    return ['rm', 'del'];
  }
}

describe('BaseShell', () => {
  let shell: TestShell;

  beforeEach(() => {
    shell = new TestShell();
  });

  describe('validateCommand', () => {
    it('should validate commands against blocked list', () => {
      const context: ValidationContext = {
        shellType: 'test',
        blockedCommands: [],
      };

      const result = shell.validateCommand('rm -rf /', context);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Command \'rm\' is blocked for test');
    });

    it('should allow non-blocked commands', () => {
      const context: ValidationContext = {
        shellType: 'test',
      };

      const result = shell.validateCommand('ls -la', context);
      expect(result.valid).toBe(true);
    });

    it('should merge context blocked commands', () => {
      const context: ValidationContext = {
        shellType: 'test',
        blockedCommands: ['custom'],
      };

      const result = shell.validateCommand('custom', context);
      expect(result.valid).toBe(false);
    });
  });

  describe('mergeConfig', () => {
    it('should merge configs correctly', () => {
      const base: ShellConfig = shell.defaultConfig;
      const override = {
        timeout: 60000,
        security: {
          allowCommandChaining: true,
        },
      };

      const merged = shell.mergeConfig(base, override);

      expect(merged.timeout).toBe(60000);
      expect(merged.security.allowCommandChaining).toBe(true);
      expect(merged.security.allowPipeOperators).toBe(false);
    });
  });
});
```

#### 1.3: Registry Tests

**File**: `src/core/__tests__/registry.test.ts`

```typescript
import { ShellRegistry } from '../registry';
import { ShellPlugin } from '../../shells/base/ShellInterface';

// Mock shell plugins for testing
class MockShellA implements ShellPlugin {
  readonly shellType = 'mock-a';
  readonly displayName = 'Mock Shell A';
  readonly defaultConfig: any = {};
  validateCommand = jest.fn(() => ({ valid: true }));
  validatePath = jest.fn(() => ({ valid: true }));
  getBlockedCommands = jest.fn(() => []);
  mergeConfig = jest.fn((base, override) => ({ ...base, ...override }));
}

class MockShellB implements ShellPlugin {
  readonly shellType = 'mock-b';
  readonly displayName = 'Mock Shell B';
  readonly defaultConfig: any = {};
  validateCommand = jest.fn(() => ({ valid: true }));
  validatePath = jest.fn(() => ({ valid: true }));
  getBlockedCommands = jest.fn(() => []);
  mergeConfig = jest.fn((base, override) => ({ ...base, ...override }));
}

describe('ShellRegistry', () => {
  let registry: ShellRegistry;

  beforeEach(() => {
    // Create fresh registry for each test
    registry = ShellRegistry.getInstance();
    registry.clear();
  });

  describe('register', () => {
    it('should register a shell plugin', () => {
      const shell = new MockShellA();
      registry.register(shell);

      expect(registry.hasShell('mock-a')).toBe(true);
      expect(registry.getCount()).toBe(1);
    });

    it('should not register duplicate shells', () => {
      const shell1 = new MockShellA();
      const shell2 = new MockShellA();

      registry.register(shell1);
      registry.register(shell2);

      expect(registry.getCount()).toBe(1);
    });

    it('should register multiple different shells', () => {
      const shellA = new MockShellA();
      const shellB = new MockShellB();

      registry.register(shellA);
      registry.register(shellB);

      expect(registry.getCount()).toBe(2);
      expect(registry.hasShell('mock-a')).toBe(true);
      expect(registry.hasShell('mock-b')).toBe(true);
    });
  });

  describe('getShell', () => {
    it('should retrieve registered shell', () => {
      const shell = new MockShellA();
      registry.register(shell);

      const retrieved = registry.getShell('mock-a');
      expect(retrieved).toBe(shell);
    });

    it('should return undefined for unregistered shell', () => {
      const retrieved = registry.getShell('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getAllShells', () => {
    it('should return all registered shells', () => {
      const shellA = new MockShellA();
      const shellB = new MockShellB();

      registry.register(shellA);
      registry.register(shellB);

      const all = registry.getAllShells();
      expect(all).toHaveLength(2);
      expect(all).toContain(shellA);
      expect(all).toContain(shellB);
    });

    it('should return empty array when no shells registered', () => {
      const all = registry.getAllShells();
      expect(all).toHaveLength(0);
    });
  });

  describe('getShellTypes', () => {
    it('should return all shell type identifiers', () => {
      registry.register(new MockShellA());
      registry.register(new MockShellB());

      const types = registry.getShellTypes();
      expect(types).toContain('mock-a');
      expect(types).toContain('mock-b');
      expect(types).toHaveLength(2);
    });
  });

  describe('unregister', () => {
    it('should unregister a shell', () => {
      const shell = new MockShellA();
      registry.register(shell);

      const result = registry.unregister('mock-a');
      expect(result).toBe(true);
      expect(registry.hasShell('mock-a')).toBe(false);
      expect(registry.getCount()).toBe(0);
    });

    it('should return false for non-existent shell', () => {
      const result = registry.unregister('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all registered shells', () => {
      registry.register(new MockShellA());
      registry.register(new MockShellB());

      expect(registry.getCount()).toBe(2);

      registry.clear();

      expect(registry.getCount()).toBe(0);
      expect(registry.getAllShells()).toHaveLength(0);
    });
  });
});
```

### Phase 2: Extract and Migrate Shell-Specific Tests

**Goal**: Separate existing tests by shell type

#### 2.1: Identify Shell-Specific Test Cases

Review existing tests and categorize:

```typescript
// Example from src/__tests__/validation.test.ts

// OLD: All shells in one file
describe('Command Validation', () => {
  describe('PowerShell', () => {
    // PowerShell tests → move to src/shells/powershell/__tests__/
  });

  describe('CMD', () => {
    // CMD tests → move to src/shells/cmd/__tests__/
  });

  describe('Git Bash', () => {
    // Git Bash tests → move to src/shells/gitbash/__tests__/
  });

  // etc...
});
```

#### 2.2: Git Bash Module Tests Example

**File**: `src/shells/gitbash/__tests__/GitBashImpl.test.ts`

```typescript
import { GitBashPlugin } from '../GitBashImpl';

describe('GitBashPlugin', () => {
  let plugin: GitBashPlugin;

  beforeEach(() => {
    plugin = new GitBashPlugin();
  });

  describe('configuration', () => {
    it('should have correct shell type', () => {
      expect(plugin.shellType).toBe('gitbash');
    });

    it('should have Git Bash display name', () => {
      expect(plugin.displayName).toBe('Git Bash');
    });

    it('should have default configuration', () => {
      expect(plugin.defaultConfig).toBeDefined();
      expect(plugin.defaultConfig.enabled).toBe(true);
      expect(plugin.defaultConfig.shellCommand).toContain('bash.exe');
    });

    it('should allow command chaining', () => {
      expect(plugin.defaultConfig.security.allowCommandChaining).toBe(true);
    });

    it('should allow pipe operators', () => {
      expect(plugin.defaultConfig.security.allowPipeOperators).toBe(true);
    });
  });

  describe('getBlockedCommands', () => {
    it('should block dangerous commands', () => {
      const blocked = plugin.getBlockedCommands();

      expect(blocked).toContain('rm -rf /');
      expect(blocked).toContain('mkfs');
      expect(blocked).toContain('dd');
    });

    it('should block network commands', () => {
      const blocked = plugin.getBlockedCommands();

      expect(blocked).toContain('wget');
      expect(blocked).toContain('curl');
    });
  });
});
```

**File**: `src/shells/gitbash/__tests__/pathHandling.test.ts`

```typescript
import { GitBashPlugin } from '../GitBashImpl';

describe('GitBash Path Handling', () => {
  let plugin: GitBashPlugin;

  beforeEach(() => {
    plugin = new GitBashPlugin();
  });

  describe('validatePath', () => {
    it('should accept Unix-style paths with drive letters', () => {
      const paths = [
        '/c/Users/test',
        '/d/Projects',
        '/e/Data/file.txt',
      ];

      paths.forEach(path => {
        const result = plugin.validatePath(path, { shellType: 'gitbash' });
        expect(result.valid).toBe(true);
      });
    });

    it('should accept Windows-style paths', () => {
      const paths = [
        'C:\\Users\\test',
        'D:\\Projects',
        'E:\\Data\\file.txt',
      ];

      paths.forEach(path => {
        const result = plugin.validatePath(path, { shellType: 'gitbash' });
        expect(result.valid).toBe(true);
      });
    });

    it('should accept relative paths', () => {
      const paths = [
        './file.txt',
        '../parent/file.txt',
        '../../grandparent',
      ];

      paths.forEach(path => {
        const result = plugin.validatePath(path, { shellType: 'gitbash' });
        expect(result.valid).toBe(true);
      });
    });

    it('should accept absolute Unix paths', () => {
      const paths = [
        '/usr/local/bin',
        '/home/user',
        '/tmp/file.txt',
      ];

      paths.forEach(path => {
        const result = plugin.validatePath(path, { shellType: 'gitbash' });
        expect(result.valid).toBe(true);
      });
    });

    it('should reject invalid path formats', () => {
      const paths = [
        'invalid:path',
        'no-slash',
        'http://example.com',
      ];

      paths.forEach(path => {
        const result = plugin.validatePath(path, { shellType: 'gitbash' });
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors?.[0]).toContain('Invalid Git Bash path format');
      });
    });
  });
});
```

**File**: `src/shells/gitbash/__tests__/validation.test.ts`

```typescript
import { GitBashPlugin } from '../GitBashImpl';
import { ValidationContext } from '../../base/ShellInterface';

describe('GitBash Command Validation', () => {
  let plugin: GitBashPlugin;

  beforeEach(() => {
    plugin = new GitBashPlugin();
  });

  describe('validateCommand', () => {
    it('should block dangerous rm commands', () => {
      const context: ValidationContext = {
        shellType: 'gitbash',
      };

      const result = plugin.validateCommand('rm -rf /', context);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should allow safe commands', () => {
      const context: ValidationContext = {
        shellType: 'gitbash',
      };

      const safeCommands = [
        'ls -la',
        'git status',
        'npm install',
        'mkdir test',
        'echo "hello"',
      ];

      safeCommands.forEach(cmd => {
        const result = plugin.validateCommand(cmd, context);
        expect(result.valid).toBe(true);
      });
    });

    it('should respect context blocked commands', () => {
      const context: ValidationContext = {
        shellType: 'gitbash',
        blockedCommands: ['custom-blocked'],
      };

      const result = plugin.validateCommand('custom-blocked arg', context);
      expect(result.valid).toBe(false);
    });
  });
});
```

#### 2.3: Test Migration Checklist

For each shell module:

- [ ] Extract configuration tests
- [ ] Extract path validation tests
- [ ] Extract command validation tests
- [ ] Extract integration tests
- [ ] Update test imports
- [ ] Ensure 100% coverage maintained
- [ ] Remove old tests from original location

### Phase 3: Integration Tests

#### 3.1: Shell Loader Tests

**File**: `src/shells/__tests__/loader.test.ts`

```typescript
import { loadShells } from '../loader';
import { shellRegistry } from '../../core/registry';

describe('Shell Loader', () => {
  beforeEach(() => {
    shellRegistry.clear();
  });

  afterEach(() => {
    shellRegistry.clear();
  });

  it('should load specified shells', async () => {
    await loadShells({
      shells: ['gitbash', 'powershell'],
    });

    expect(shellRegistry.getCount()).toBe(2);
    expect(shellRegistry.hasShell('gitbash')).toBe(true);
    expect(shellRegistry.hasShell('powershell')).toBe(true);
  });

  it('should load all shells when requested', async () => {
    await loadShells({
      shells: ['powershell', 'cmd', 'gitbash', 'bash', 'wsl'],
    });

    expect(shellRegistry.getCount()).toBe(5);
  });

  it('should handle empty shell list', async () => {
    await loadShells({
      shells: [],
    });

    expect(shellRegistry.getCount()).toBe(0);
  });

  it('should handle invalid shell types gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    await loadShells({
      shells: ['gitbash', 'invalid-shell', 'powershell'],
    });

    expect(shellRegistry.getCount()).toBe(2);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown shell type: invalid-shell')
    );

    consoleSpy.mockRestore();
  });

  it('should load shells independently', async () => {
    await loadShells({
      shells: ['gitbash'],
    });

    expect(shellRegistry.hasShell('gitbash')).toBe(true);
    expect(shellRegistry.hasShell('powershell')).toBe(false);
  });
});
```

#### 3.2: Build Configuration Tests

**File**: `src/build/__tests__/shell-config.test.ts`

```typescript
import { getBuildConfig } from '../shell-config';

describe('Build Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return default full build config', () => {
    const config = getBuildConfig();

    expect(config.buildName).toBe('full');
    expect(config.includeAll).toBe(true);
    expect(config.includedShells).toEqual([
      'powershell',
      'cmd',
      'gitbash',
      'bash',
      'wsl',
    ]);
  });

  it('should load preset from environment variable', () => {
    process.env.SHELL_BUILD_PRESET = 'gitbash-only';

    const config = getBuildConfig();

    expect(config.buildName).toBe('gitbash-only');
    expect(config.includedShells).toEqual(['gitbash']);
  });

  it('should parse custom shell list from environment', () => {
    process.env.INCLUDED_SHELLS = 'gitbash,powershell';

    const config = getBuildConfig();

    expect(config.buildName).toBe('custom');
    expect(config.includedShells).toEqual(['gitbash', 'powershell']);
  });

  it('should handle whitespace in shell list', () => {
    process.env.INCLUDED_SHELLS = ' gitbash , powershell , cmd ';

    const config = getBuildConfig();

    expect(config.includedShells).toEqual(['gitbash', 'powershell', 'cmd']);
  });
});
```

#### 3.3: End-to-End Build Tests

**File**: `src/__tests__/integration/build-gitbash.test.ts`

```typescript
import { shellRegistry } from '../../core/registry';
import { loadShells } from '../../shells/loader';

describe('Git Bash Only Build', () => {
  beforeEach(() => {
    shellRegistry.clear();
  });

  it('should only load Git Bash', async () => {
    await loadShells({
      shells: ['gitbash'],
    });

    expect(shellRegistry.getCount()).toBe(1);
    expect(shellRegistry.getShellTypes()).toEqual(['gitbash']);
  });

  it('should have correct Git Bash configuration', async () => {
    await loadShells({
      shells: ['gitbash'],
    });

    const shell = shellRegistry.getShell('gitbash');
    expect(shell).toBeDefined();
    expect(shell!.displayName).toBe('Git Bash');
    expect(shell!.defaultConfig.shellCommand).toContain('bash.exe');
  });

  it('should not have other shells available', async () => {
    await loadShells({
      shells: ['gitbash'],
    });

    expect(shellRegistry.hasShell('powershell')).toBe(false);
    expect(shellRegistry.hasShell('cmd')).toBe(false);
    expect(shellRegistry.hasShell('bash')).toBe(false);
    expect(shellRegistry.hasShell('wsl')).toBe(false);
  });
});
```

---

## Testing Individual Shell Modules

### Shell Module Test Template

Each shell should have these test files:

```
shells/{shell-name}/__tests__/
├── {ShellName}Impl.test.ts     # Core implementation
├── validation.test.ts          # Command validation
├── pathHandling.test.ts        # Path validation
└── integration.test.ts         # Integration scenarios
```

### Coverage Requirements

Each shell module should maintain:

- **Line Coverage**: ≥ 95%
- **Branch Coverage**: ≥ 90%
- **Function Coverage**: 100%
- **Statement Coverage**: ≥ 95%

### Example Coverage Report

```bash
npm run test:coverage -- shells/gitbash

-----------------------|---------|----------|---------|---------|
File                   | % Stmts | % Branch | % Funcs | % Lines |
-----------------------|---------|----------|---------|---------|
shells/gitbash/        |     100 |      100 |     100 |     100 |
  GitBashImpl.ts       |     100 |      100 |     100 |     100 |
  index.ts             |     100 |      100 |     100 |     100 |
-----------------------|---------|----------|---------|---------|
```

---

## Build-Specific Testing

### Test Configuration by Build

Different builds should run different test suites:

**File**: `jest.config.gitbash.js`

```javascript
module.exports = {
  ...require('./jest.config'),
  testMatch: [
    '**/shells/base/**/*.test.ts',
    '**/shells/gitbash/**/*.test.ts',
    '**/core/**/*.test.ts',
    '**/build/**/*.test.ts',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/shells/powershell/',
    '/shells/cmd/',
    '/shells/bash/',
    '/shells/wsl/',
  ],
};
```

### Package.json Test Scripts

```json
{
  "scripts": {
    "test": "jest",
    "test:full": "jest --config jest.config.js",
    "test:gitbash": "jest --config jest.config.gitbash.js",
    "test:cmd": "jest --config jest.config.cmd.js",
    "test:windows": "jest --config jest.config.windows.js",
    "test:coverage": "jest --coverage",
    "test:watch": "jest --watch",
    "test:ci": "jest --ci --coverage --maxWorkers=2"
  }
}
```

---

## Test Utilities and Helpers

### Shared Test Utilities

**File**: `src/__tests__/utils/testHelpers.ts`

```typescript
import { ShellPlugin, ValidationContext } from '../../shells/base/ShellInterface';
import { shellRegistry } from '../../core/registry';

/**
 * Create a test validation context
 */
export function createTestContext(
  overrides?: Partial<ValidationContext>
): ValidationContext {
  return {
    shellType: 'test',
    ...overrides,
  };
}

/**
 * Create a mock shell plugin for testing
 */
export function createMockShell(
  shellType: string,
  overrides?: Partial<ShellPlugin>
): ShellPlugin {
  return {
    shellType,
    displayName: `Mock ${shellType}`,
    defaultConfig: {} as any,
    validateCommand: jest.fn(() => ({ valid: true })),
    validatePath: jest.fn(() => ({ valid: true })),
    getBlockedCommands: jest.fn(() => []),
    mergeConfig: jest.fn((base, override) => ({ ...base, ...override })),
    ...overrides,
  };
}

/**
 * Setup registry with specific shells for testing
 */
export async function setupTestRegistry(shells: string[]): Promise<void> {
  shellRegistry.clear();
  const { loadShells } = await import('../../shells/loader');
  await loadShells({ shells });
}

/**
 * Cleanup registry after tests
 */
export function cleanupTestRegistry(): void {
  shellRegistry.clear();
}

/**
 * Test if path validation works correctly
 */
export function testPathValidation(
  plugin: ShellPlugin,
  validPaths: string[],
  invalidPaths: string[]
): void {
  const context = createTestContext({ shellType: plugin.shellType });

  describe('valid paths', () => {
    validPaths.forEach(path => {
      it(`should accept: ${path}`, () => {
        const result = plugin.validatePath(path, context);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('invalid paths', () => {
    invalidPaths.forEach(path => {
      it(`should reject: ${path}`, () => {
        const result = plugin.validatePath(path, context);
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
      });
    });
  });
}
```

### Using Test Helpers

```typescript
import { testPathValidation, setupTestRegistry } from '../../__tests__/utils/testHelpers';
import { GitBashPlugin } from '../GitBashImpl';

describe('GitBash Path Validation', () => {
  const plugin = new GitBashPlugin();

  testPathValidation(
    plugin,
    // Valid paths
    ['/c/Users', 'C:\\Users', './relative', '/absolute'],
    // Invalid paths
    ['invalid:path', 'http://url']
  );
});
```

---

## Performance Testing

### Performance Test Example

**File**: `src/__tests__/performance/shell-loading.test.ts`

```typescript
import { shellRegistry } from '../../core/registry';
import { loadShells } from '../../shells/loader';

describe('Performance: Shell Loading', () => {
  beforeEach(() => {
    shellRegistry.clear();
  });

  it('should load single shell quickly', async () => {
    const start = Date.now();

    await loadShells({ shells: ['gitbash'] });

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // < 100ms
  });

  it('should load all shells within acceptable time', async () => {
    const start = Date.now();

    await loadShells({
      shells: ['powershell', 'cmd', 'gitbash', 'bash', 'wsl'],
    });

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(500); // < 500ms
  });

  it('should have minimal memory overhead per shell', async () => {
    const beforeMemory = process.memoryUsage().heapUsed;

    await loadShells({ shells: ['gitbash'] });

    const afterMemory = process.memoryUsage().heapUsed;
    const overhead = afterMemory - beforeMemory;

    // Should use less than 1MB per shell
    expect(overhead).toBeLessThan(1024 * 1024);
  });
});
```

---

## CI/CD Integration

### GitHub Actions Workflow

**File**: `.github/workflows/test-modular-shells.yml`

```yaml
name: Test Modular Shells

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test-full:
    name: Test Full Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:full
      - run: npm run test:coverage

  test-gitbash:
    name: Test Git Bash Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:gitbash

  test-cmd:
    name: Test CMD Build
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:cmd

  test-windows:
    name: Test Windows Build
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:windows

  test-builds:
    name: Test All Build Configurations
    runs-on: ubuntu-latest
    strategy:
      matrix:
        preset: [full, windows, gitbash-only, cmd-only, unix]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: SHELL_BUILD_PRESET=${{ matrix.preset }} npm run build
      - run: ls -lh dist/
```

---

## Summary Checklist

### For Each Shell Module

- [ ] Create `__tests__` directory
- [ ] Write implementation tests
- [ ] Write validation tests
- [ ] Write path handling tests
- [ ] Write integration tests
- [ ] Achieve ≥95% coverage
- [ ] All tests passing

### For Core System

- [ ] Registry tests complete
- [ ] Loader tests complete
- [ ] Build config tests complete
- [ ] Integration tests complete

### For Build Configurations

- [ ] Jest config for each preset
- [ ] Package.json test scripts
- [ ] CI/CD workflows
- [ ] Performance benchmarks

### Documentation

- [ ] Test migration guide
- [ ] Coverage requirements documented
- [ ] CI/CD setup documented
- [ ] Test utilities documented

---

## Conclusion

This testing guide provides a comprehensive approach to restructuring and maintaining tests for the modular shell architecture. By following these guidelines, you ensure:

- **Complete test coverage** for all shell modules
- **Independent testing** of each shell
- **Build-specific test suites** for different configurations
- **Consistent test patterns** across all modules
- **Automated testing** in CI/CD pipelines

The modular approach to testing mirrors the modular architecture, making tests easier to maintain, faster to run, and more reliable.
