# WCLI0 Modular Shells - Testing Strategy

## Overview

This document outlines the testing strategy for the modular shell architecture, including test organization, migration approach, and best practices.

## Test Organization

### Target Structure

```text
src/
├── shells/
│   ├── base/__tests__/
│   │   ├── ShellInterface.test.ts
│   │   └── BaseShell.test.ts
│   │
│   ├── powershell/__tests__/
│   │   ├── PowerShellImpl.test.ts
│   │   ├── validation.test.ts
│   │   ├── pathHandling.test.ts
│   │   └── integration.test.ts
│   │
│   ├── cmd/__tests__/
│   ├── gitbash/__tests__/
│   ├── bash/__tests__/
│   ├── wsl/__tests__/
│   │
│   └── __tests__/
│       ├── loader.test.ts
│       └── cross-shell.test.ts
│
├── core/__tests__/
│   ├── registry.test.ts
│   ├── server.test.ts
│   └── executor.test.ts
│
├── build/__tests__/
│   ├── shell-config.test.ts
│   └── presets.test.ts
│
└── __tests__/
    ├── integration/
    │   ├── modular-shells.test.ts
    │   ├── build-full.test.ts
    │   ├── build-windows.test.ts
    │   └── build-gitbash.test.ts
    │
    └── e2e/
        ├── gitbash-only.test.ts
        └── cmd-only.test.ts
```

## Test Migration Strategy

### Phase 1: Base Infrastructure Tests

**Priority**: Critical - Must pass before proceeding

**Files to Create**:

1. `shells/base/__tests__/ShellInterface.test.ts` - Interface contract tests
2. `shells/base/__tests__/BaseShell.test.ts` - Base class tests
3. `core/__tests__/registry.test.ts` - Registry tests

**Key Tests**:

- Interface compliance
- Base class functionality
- Registry registration/retrieval
- Error handling

### Phase 2: Shell Module Tests

**Priority**: High - One shell at a time

**For Each Shell (PowerShell, CMD, Git Bash, Bash, WSL)**:

1. Extract shell-specific tests from existing files
2. Create module test directory
3. Organize into categories:
   - Implementation tests
   - Validation tests
   - Path handling tests
   - Integration tests

**Migration Example**:

```typescript
// Before: tests/validation.test.ts
describe('Command Validation', () => {
  describe('Git Bash', () => {
    it('should validate git bash commands', () => {
      // Test implementation
    });
  });
});

// After: src/shells/gitbash/__tests__/validation.test.ts
describe('Git Bash Command Validation', () => {
  let plugin: GitBashPlugin;
  
  beforeEach(() => {
    plugin = new GitBashPlugin();
  });

  it('should validate commands', () => {
    const result = plugin.validateCommand('ls', { shellType: 'gitbash' });
    expect(result.valid).toBe(true);
  });
});
```

### Phase 3: Integration Tests

**Priority**: Medium - After shell modules complete

**Tests**:

- Cross-shell behavior
- Shell loader functionality
- Registry integration
- Build configuration
- Tool generation with multiple shells

### Phase 4: Build-Specific Tests

**Priority**: Medium - Verify build configurations work

**Tests**:

- Full build includes all shells
- Windows build includes correct shells
- Git Bash-only build works
- Bundle sizes meet targets
- Tree-shaking works correctly

## Test Categories

### 1. Unit Tests (Per Shell Module)

**Coverage Target**: ≥95%

**Test Structure**:

```typescript
describe('GitBashPlugin', () => {
  let plugin: GitBashPlugin;

  beforeEach(() => {
    plugin = new GitBashPlugin();
  });

  describe('properties', () => {
    it('has correct shell type', () => {
      expect(plugin.shellType).toBe('gitbash');
    });

    it('has correct display name', () => {
      expect(plugin.displayName).toBe('Git Bash');
    });
  });

  describe('validateCommand', () => {
    it('blocks dangerous commands', () => {
      const result = plugin.validateCommand('rm -rf /', {
        shellType: 'gitbash'
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Command 'rm' is blocked");
    });

    it('allows safe commands', () => {
      const result = plugin.validateCommand('ls -la', {
        shellType: 'gitbash'
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('validatePath', () => {
    it('accepts Unix-style paths', () => {
      expect(plugin.validatePath('/c/Users/test', {}).valid).toBe(true);
    });

    it('accepts Windows-style paths', () => {
      expect(plugin.validatePath('C:\\Users\\test', {}).valid).toBe(true);
    });

    it('rejects invalid paths', () => {
      expect(plugin.validatePath('invalid', {}).valid).toBe(false);
    });
  });

  describe('getBlockedCommands', () => {
    it('returns blocked command list', () => {
      const blocked = plugin.getBlockedCommands();
      expect(blocked).toContain('rm -rf /');
      expect(blocked).toContain('mkfs');
    });
  });

  describe('mergeConfig', () => {
    it('merges configurations correctly', () => {
      const base = plugin.defaultConfig;
      const override = { timeout: 60000 };
      const merged = plugin.mergeConfig(base, override);
      expect(merged.timeout).toBe(60000);
    });
  });
});
```

### 2. Registry Tests

**Coverage Target**: ≥95%

```typescript
describe('ShellRegistry', () => {
  let registry: ShellRegistry;

  beforeEach(() => {
    registry = ShellRegistry.getInstance();
    registry.clear();
  });

  it('registers shells', () => {
    const shell = new GitBashPlugin();
    registry.register(shell);
    expect(registry.hasShell('gitbash')).toBe(true);
  });

  it('retrieves registered shells', () => {
    const shell = new GitBashPlugin();
    registry.register(shell);
    const retrieved = registry.getShell('gitbash');
    expect(retrieved).toBe(shell);
  });

  it('returns undefined for unregistered shells', () => {
    expect(registry.getShell('nonexistent')).toBeUndefined();
  });

  it('prevents duplicate registration', () => {
    const shell1 = new GitBashPlugin();
    const shell2 = new GitBashPlugin();
    registry.register(shell1);
    registry.register(shell2);
    expect(registry.getCount()).toBe(1);
  });

  it('unregisters shells', () => {
    const shell = new GitBashPlugin();
    registry.register(shell);
    registry.unregister('gitbash');
    expect(registry.hasShell('gitbash')).toBe(false);
  });
});
```

### 3. Shell Loader Tests

**Coverage Target**: ≥90%

```typescript
describe('Shell Loader', () => {
  beforeEach(() => {
    shellRegistry.clear();
  });

  it('loads specified shells', async () => {
    await loadShells({ shells: ['gitbash', 'powershell'] });
    expect(shellRegistry.hasShell('gitbash')).toBe(true);
    expect(shellRegistry.hasShell('powershell')).toBe(true);
    expect(shellRegistry.getCount()).toBe(2);
  });

  it('handles invalid shell types', async () => {
    await loadShells({ shells: ['invalid'] });
    expect(shellRegistry.hasShell('invalid')).toBe(false);
  });

  it('loads all shells when configured', async () => {
    await loadShells({ shells: ['powershell', 'cmd', 'gitbash', 'bash', 'wsl'] });
    expect(shellRegistry.getCount()).toBe(5);
  });
});
```

### 4. Integration Tests

**Coverage Target**: ≥85%

```typescript
describe('Modular Shell System Integration', () => {
  beforeAll(async () => {
    await loadShells({ shells: ['gitbash'] });
  });

  it('validates commands using registered shells', () => {
    const shell = shellRegistry.getShell('gitbash');
    expect(shell).toBeDefined();
    
    const result = shell!.validateCommand('ls', { shellType: 'gitbash' });
    expect(result.valid).toBe(true);
  });

  it('generates correct tool schemas', () => {
    const schema = buildExecuteCommandSchema(shellRegistry.getAllShells());
    expect(schema.properties.shell.enum).toContain('gitbash');
  });
});
```

### 5. Build Configuration Tests

**Coverage Target**: ≥90%

```typescript
describe('Build Configuration', () => {
  it('returns correct config for preset', () => {
    process.env.SHELL_BUILD_PRESET = 'gitbash-only';
    const config = getBuildConfig();
    expect(config.includedShells).toEqual(['gitbash']);
    expect(config.buildName).toBe('gitbash-only');
  });

  it('parses INCLUDED_SHELLS environment variable', () => {
    process.env.INCLUDED_SHELLS = 'gitbash,powershell';
    const config = getBuildConfig();
    expect(config.includedShells).toContain('gitbash');
    expect(config.includedShells).toContain('powershell');
  });

  it('defaults to full build', () => {
    delete process.env.SHELL_BUILD_PRESET;
    delete process.env.INCLUDED_SHELLS;
    const config = getBuildConfig();
    expect(config.includeAll).toBe(true);
  });
});
```

### 6. E2E Tests

**Coverage Target**: ≥80%

```typescript
describe('Git Bash-Only Build E2E', () => {
  let server: CLIServer;

  beforeAll(async () => {
    process.env.SHELL_BUILD_PRESET = 'gitbash-only';
    await loadShells({ shells: ['gitbash'] });
    server = new CLIServer(config);
  });

  it('only exposes Git Bash in tools', async () => {
    const tools = await server.listTools();
    const executeCmd = tools.find(t => t.name === 'execute_command');
    expect(executeCmd.inputSchema.properties.shell.enum).toEqual(['gitbash']);
  });

  it('executes Git Bash commands', async () => {
    const result = await server.executeCommand({
      shell: 'gitbash',
      command: 'echo test'
    });
    expect(result.stdout).toContain('test');
  });

  it('rejects non-Git-Bash shells', async () => {
    await expect(server.executeCommand({
      shell: 'powershell',
      command: 'echo test'
    })).rejects.toThrow();
  });
});
```

## Test Utilities

### Shell Test Helpers

```typescript
// test-helpers/shell-helpers.ts
export function createMockShellPlugin(
  shellType: string = 'mock'
): ShellPlugin {
  return {
    shellType,
    displayName: `Mock ${shellType}`,
    defaultConfig: createMockConfig(),
    validateCommand: () => ({ valid: true }),
    validatePath: () => ({ valid: true }),
    getBlockedCommands: () => [],
    mergeConfig: (base, override) => ({ ...base, ...override })
  };
}

export function createMockConfig(): ShellConfig {
  return {
    enabled: true,
    shellCommand: 'mock',
    shellArgs: [],
    timeout: 30000,
    maxOutputLines: 1000,
    security: {
      allowCommandChaining: false,
      allowPipeOperators: false,
      allowRedirection: false,
      validatePaths: true
    },
    restrictions: {
      allowedCommands: [],
      blockedCommands: [],
      allowedPaths: [],
      blockedPaths: [],
      requirePathValidation: true
    },
    paths: {
      enforceAbsolutePaths: false,
      pathStyle: 'unix'
    }
  };
}
```

### Registry Test Setup

```typescript
// test-helpers/registry-setup.ts
export function setupTestRegistry(): ShellRegistry {
  const registry = ShellRegistry.getInstance();
  registry.clear();
  return registry;
}

export function registerTestShells(shells: string[]): void {
  const registry = setupTestRegistry();
  
  shells.forEach(shellType => {
    const plugin = createMockShellPlugin(shellType);
    registry.register(plugin);
  });
}
```

## Running Tests

### Test Commands

```bash
# All tests
npm test

# Specific shell module
npm test -- shells/gitbash

# Integration tests only
npm test -- integration

# E2E tests only
npm test -- e2e

# With coverage
npm test -- --coverage

# Watch mode
npm test -- --watch

# Specific file
npm test -- shells/gitbash/__tests__/validation.test.ts
```

### Coverage Requirements

| Component | Minimum Coverage |
|-----------|-----------------|
| Shell modules | 95% |
| Core registry | 95% |
| Shell loader | 90% |
| Build config | 90% |
| Integration | 85% |
| E2E | 80% |
| **Overall** | **90%** |

## CI/CD Integration

### GitHub Actions

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - run: npm ci
      
      - name: Run unit tests
        run: npm test -- --coverage
      
      - name: Check coverage
        run: |
          npm run test:coverage-check
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  test-builds:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        preset: [full, windows, unix, gitbash-only, cmd-only]
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      
      - name: Build ${{ matrix.preset }}
        run: npm run build:${{ matrix.preset }}
      
      - name: Test ${{ matrix.preset }} build
        run: npm test -- e2e/${{ matrix.preset }}.test.ts
```

## Performance Testing

### Bundle Size Tests

```typescript
describe('Bundle Size', () => {
  it('full build is within limits', () => {
    const size = fs.statSync('dist/index.full.js').size;
    expect(size).toBeLessThan(5 * 1024 * 1024); // 5MB
  });

  it('gitbash-only build is 60% smaller', () => {
    const fullSize = fs.statSync('dist/index.full.js').size;
    const gitbashSize = fs.statSync('dist/index.gitbash-only.js').size;
    const reduction = 1 - (gitbashSize / fullSize);
    expect(reduction).toBeGreaterThan(0.5); // >50% reduction
  });
});
```

### Startup Time Tests

```typescript
describe('Performance', () => {
  it('loads within time limit', async () => {
    const start = Date.now();
    await loadShells({ shells: ['gitbash'] });
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // 100ms
  });
});
```

## Test Best Practices

### 1. Isolation

- Each test should be independent
- Use `beforeEach` to reset state
- Clear registry between tests
- Don't rely on test execution order

### 2. Naming

- Use descriptive test names
- Follow pattern: `should [expected behavior] when [condition]`
- Group related tests with `describe` blocks

### 3. Mocking

- Mock external dependencies
- Use test helpers for common mocks
- Don't mock the unit under test

### 4. Assertions

- One logical assertion per test
- Use specific matchers
- Test both success and failure cases

### 5. Coverage

- Aim for high coverage (≥90%)
- Don't just test happy paths
- Include edge cases and error conditions

## Troubleshooting Tests

### Tests Failing After Migration

**Problem**: Tests can't find shells

**Solution**: Load shells in test setup

```typescript
beforeAll(async () => {
  await loadShells({ shells: ['gitbash'] });
});
```

### Mock Not Working

**Problem**: Mock shell not recognized

**Solution**: Register mock in registry

```typescript
const mockShell = createMockShellPlugin('test');
shellRegistry.register(mockShell);
```

### Coverage Too Low

**Problem**: Coverage below requirements

**Solution**:

1. Check for untested branches
2. Add edge case tests
3. Test error conditions
4. Remove dead code

---

**Last Updated**: 2025-11-10  
**Coverage Requirements**: ≥90% overall  
**See Also**: MODULAR_PLAN.md, MODULAR_USAGE.md
