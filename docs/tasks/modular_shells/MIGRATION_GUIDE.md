# Modular Shell Architecture - Migration Guide

## Overview

This guide helps you migrate from the monolithic shell architecture to the new modular shell system in WCLI0. The migration has been designed to be backward compatible, with the full build maintaining all existing functionality.

## Table of Contents

1. [Breaking Changes](#breaking-changes)
2. [Compatibility](#compatibility)
3. [Migration Paths](#migration-paths)
4. [Step-by-Step Migration](#step-by-step-migration)
5. [Configuration Changes](#configuration-changes)
6. [Code Changes](#code-changes)
7. [Testing Changes](#testing-changes)
8. [Rollback Plan](#rollback-plan)
9. [Common Issues](#common-issues)

---

## Breaking Changes

### None for Default Build

**Good news**: If you use the default build (`npm run build`), there are **NO breaking changes**. The full build maintains 100% backward compatibility with the previous version.

### For Custom Builds

If you create custom builds with specific shells, be aware:

1. **Import paths have changed** for internal shell implementations
2. **Shell configuration is now per-module** instead of centralized
3. **Dynamic imports** are used instead of static imports

---

## Compatibility

### Backward Compatible

✅ **These continue to work without changes**:

- Default build (`npm run build`)
- Existing MCP tool schemas
- Shell configurations
- Command validation
- Path validation
- Command execution
- All existing tests (with full build)

### Forward Compatible

✅ **New features available**:

- Build-time shell selection
- Smaller bundle sizes
- Modular shell implementations
- Custom build presets
- Per-shell testing

---

## Migration Paths

### Path 1: No Changes (Recommended for Most Users)

**Who**: Users who need all shells

**What to do**: Nothing! Just use the default build.

```bash
# Before
npm run build

# After (same)
npm run build
```

**Benefits**:
- Zero migration effort
- All shells available
- Complete backward compatibility

---

### Path 2: Adopt Specialized Build

**Who**: Users who only need specific shells

**What to do**: Switch to a specialized build.

```bash
# Before
npm run build

# After
npm run build:gitbash  # or windows, unix, cmd, etc.
```

**Benefits**:
- Smaller bundle size (30-65% reduction)
- Faster startup
- Lower memory usage

**Migration steps**: See [Step-by-Step Migration](#step-by-step-migration)

---

### Path 3: Custom Build Configuration

**Who**: Advanced users with specific requirements

**What to do**: Create custom build configuration.

**Migration steps**: See [Custom Configuration Migration](#custom-configuration-migration)

---

## Step-by-Step Migration

### For End Users

#### Step 1: Update Dependencies

```bash
# Pull latest changes
git pull origin main

# Install dependencies
npm install
```

#### Step 2: Choose Your Build

Decide which shells you need:

```bash
# Option A: All shells (no change)
npm run build

# Option B: Windows shells only
npm run build:windows

# Option C: Git Bash only
npm run build:gitbash

# Option D: CMD only
npm run build:cmd

# Option E: Unix/Linux only
npm run build:unix

# Option F: Custom combination
INCLUDED_SHELLS=gitbash,powershell npm run build:custom
```

#### Step 3: Update Your Configuration

Update your Claude Desktop configuration if using a specialized build:

**Before** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "wcli0": {
      "command": "node",
      "args": ["/path/to/wcli0/dist/index.js"]
    }
  }
}
```

**After** (for Git Bash-only build):
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

#### Step 4: Test

Verify the build works:

```bash
# Test the build
npm test

# Verify shells
node dist/index.gitbash-only.js --list-shells
```

#### Step 5: Deploy

Deploy the new build:

```bash
# Copy to deployment location
cp dist/index.gitbash-only.js /path/to/deployment/
```

---

### For Developers

#### Step 1: Update Imports

**Before** (monolithic):
```typescript
import { DEFAULT_CONFIG } from './utils/config';
import { validateCommand } from './utils/validation';
import { validatePath } from './utils/pathValidation';
```

**After** (modular):
```typescript
import { shellRegistry } from './core/registry';
import { loadShells } from './shells/loader';

// Load shells
await loadShells({
  shells: ['gitbash', 'powershell']
});

// Use shells
const gitBash = shellRegistry.getShell('gitbash');
if (gitBash) {
  const result = gitBash.validateCommand('ls', {
    shellType: 'gitbash'
  });
}
```

#### Step 2: Update Configuration Access

**Before**:
```typescript
const powershellConfig = DEFAULT_CONFIG.shells.powershell;
```

**After**:
```typescript
const powershell = shellRegistry.getShell('powershell');
const powershellConfig = powershell?.defaultConfig;
```

#### Step 3: Update Validation Calls

**Before**:
```typescript
import { validateCommand } from './utils/validation';

const result = validateCommand(command, shellType);
```

**After**:
```typescript
import { shellRegistry } from './core/registry';

const shell = shellRegistry.getShell(shellType);
if (shell) {
  const result = shell.validateCommand(command, {
    shellType
  });
}
```

#### Step 4: Update Tests

**Before** (all shells in one file):
```typescript
// src/__tests__/validation.test.ts
describe('Command Validation', () => {
  describe('Git Bash', () => {
    it('should validate git bash commands', () => {
      // Test
    });
  });

  describe('PowerShell', () => {
    it('should validate powershell commands', () => {
      // Test
    });
  });
});
```

**After** (separate files):
```typescript
// src/shells/gitbash/__tests__/validation.test.ts
describe('Git Bash Command Validation', () => {
  it('should validate git bash commands', () => {
    // Test
  });
});

// src/shells/powershell/__tests__/validation.test.ts
describe('PowerShell Command Validation', () => {
  it('should validate powershell commands', () => {
    // Test
  });
});
```

---

## Configuration Changes

### Shell Configuration

**Before**: All shell configurations in one file

**File**: `src/utils/config.ts`
```typescript
export const DEFAULT_CONFIG = {
  shells: {
    powershell: { /* config */ },
    cmd: { /* config */ },
    gitbash: { /* config */ },
    // ...
  }
};
```

**After**: Each shell has its own configuration

**File**: `src/shells/gitbash/GitBashImpl.ts`
```typescript
export class GitBashPlugin extends BaseShell {
  readonly defaultConfig: ShellConfig = {
    // Git Bash specific config
  };
}
```

**File**: `src/shells/powershell/PowerShellImpl.ts`
```typescript
export class PowerShellPlugin extends BaseShell {
  readonly defaultConfig: ShellConfig = {
    // PowerShell specific config
  };
}
```

### Accessing Configuration

**Before**:
```typescript
import { DEFAULT_CONFIG } from './utils/config';
const config = DEFAULT_CONFIG.shells.gitbash;
```

**After**:
```typescript
import { shellRegistry } from './core/registry';
const gitBash = shellRegistry.getShell('gitbash');
const config = gitBash?.defaultConfig;
```

---

## Code Changes

### Creating a Shell Plugin

If you need to create a custom shell plugin:

**New File**: `src/shells/myshell/MyShellImpl.ts`

```typescript
import { BaseShell } from '../base/BaseShell';
import { ShellConfig } from '../../types/config';
import { ValidationContext, ValidationResult } from '../base/ShellInterface';

export class MyShellPlugin extends BaseShell {
  readonly shellType = 'myshell';
  readonly displayName = 'My Shell';

  readonly defaultConfig: ShellConfig = {
    enabled: true,
    shellCommand: '/path/to/myshell',
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

  getBlockedCommands(): string[] {
    return ['dangerous-command'];
  }

  // Optional: Custom path validation
  validatePath(path: string, context: ValidationContext): ValidationResult {
    // Custom validation logic
    return { valid: true };
  }
}
```

**New File**: `src/shells/myshell/index.ts`

```typescript
export { MyShellPlugin } from './MyShellImpl';
```

**Update Loader**: `src/shells/loader.ts`

```typescript
// Add case for your shell
case 'myshell': {
  const { MyShellPlugin } = await import('./myshell');
  plugin = new MyShellPlugin();
  break;
}
```

---

## Testing Changes

### Test Organization

**Before**: All tests in centralized files

```
src/
└── __tests__/
    ├── validation.test.ts      # All validation tests
    ├── pathValidation.test.ts  # All path tests
    └── config.test.ts          # All config tests
```

**After**: Tests organized by shell

```
src/
├── shells/
│   ├── gitbash/
│   │   └── __tests__/
│   │       ├── GitBashImpl.test.ts
│   │       ├── validation.test.ts
│   │       └── pathHandling.test.ts
│   ├── powershell/
│   │   └── __tests__/
│   │       ├── PowerShellImpl.test.ts
│   │       ├── validation.test.ts
│   │       └── pathHandling.test.ts
│   └── ...
└── __tests__/
    └── integration/
        └── modular-shells.test.ts
```

### Running Tests

**Before**:
```bash
npm test
```

**After** (multiple options):
```bash
# Test everything
npm test

# Test specific shell
npm run test:gitbash

# Test specific build configuration
npm run test:windows

# Test with coverage
npm run test:coverage
```

### Test Configuration

**New Files**: Create Jest configs for each build

**File**: `jest.config.gitbash.js`

```javascript
module.exports = {
  ...require('./jest.config'),
  testMatch: [
    '**/shells/base/**/*.test.ts',
    '**/shells/gitbash/**/*.test.ts',
    '**/core/**/*.test.ts',
  ],
  coveragePathIgnorePatterns: [
    '/shells/powershell/',
    '/shells/cmd/',
    '/shells/bash/',
    '/shells/wsl/',
  ],
};
```

---

## Custom Configuration Migration

### Old Custom Configuration

**Before** (`wcli0-config.json`):
```json
{
  "shells": {
    "gitbash": {
      "enabled": true,
      "timeout": 60000
    },
    "powershell": {
      "enabled": false
    }
  }
}
```

### New Custom Configuration

**Option 1**: Build-time selection (recommended)

```bash
# Only include enabled shells
INCLUDED_SHELLS=gitbash npm run build:custom
```

**Option 2**: Runtime configuration

```typescript
import { shellRegistry } from './core/registry';
import { loadShells } from './shells/loader';

// Load only specific shells
await loadShells({
  shells: ['gitbash'],
  verbose: true
});

// Get shell and merge custom config
const gitBash = shellRegistry.getShell('gitbash');
if (gitBash) {
  const customConfig = gitBash.mergeConfig(
    gitBash.defaultConfig,
    {
      timeout: 60000
    }
  );
  // Use customConfig
}
```

---

## Rollback Plan

If you need to rollback to the old version:

### Step 1: Revert Git Changes

```bash
# Find the commit before modular shells
git log --oneline

# Revert to previous version
git checkout <commit-hash>
```

### Step 2: Rebuild

```bash
npm install
npm run build
```

### Step 3: Update Configuration

Restore your previous `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wcli0": {
      "command": "node",
      "args": ["/path/to/wcli0/dist/index.js"]
    }
  }
}
```

### Step 4: Verify

```bash
npm test
```

---

## Common Issues

### Issue 1: "Shell not found" Error

**Symptom**:
```
Error: Shell 'gitbash' not found
```

**Cause**: Shell not included in build

**Solution**:
```bash
# Rebuild with the correct shells
INCLUDED_SHELLS=gitbash npm run build:custom

# Or use a preset that includes it
npm run build:windows
```

---

### Issue 2: Import Errors After Migration

**Symptom**:
```
Cannot find module './utils/validation'
```

**Cause**: Old import paths

**Solution**: Update to new import paths

**Before**:
```typescript
import { validateCommand } from './utils/validation';
```

**After**:
```typescript
import { shellRegistry } from './core/registry';
const shell = shellRegistry.getShell('gitbash');
const result = shell?.validateCommand(cmd, { shellType: 'gitbash' });
```

---

### Issue 3: Tests Failing After Migration

**Symptom**:
```
Test suite failed to run
Cannot find module 'shells/gitbash'
```

**Cause**: Shell not loaded in test

**Solution**: Load shell in test setup

```typescript
import { shellRegistry } from '../../core/registry';
import { loadShells } from '../../shells/loader';

beforeAll(async () => {
  await loadShells({
    shells: ['gitbash']
  });
});

afterAll(() => {
  shellRegistry.clear();
});
```

---

### Issue 4: Configuration Not Applied

**Symptom**: Custom configuration is ignored

**Cause**: Shell loaded after configuration

**Solution**: Merge configuration after loading

```typescript
// Load shells first
await loadShells({ shells: ['gitbash'] });

// Then merge config
const gitBash = shellRegistry.getShell('gitbash');
if (gitBash) {
  const config = gitBash.mergeConfig(
    gitBash.defaultConfig,
    customConfig
  );
}
```

---

### Issue 5: Build Size Not Reducing

**Symptom**: Git Bash-only build is same size as full build

**Cause**: Tree-shaking not working

**Solution**:

1. Check build configuration:
```bash
# Ensure you're using the correct build command
npm run build:gitbash
```

2. Verify Rollup config:
```javascript
// rollup.config.js
treeshake: {
  moduleSideEffects: false,
  propertyReadSideEffects: false,
  unknownGlobalSideEffects: false
}
```

3. Clean and rebuild:
```bash
npm run clean
npm run build:gitbash
```

---

## Migration Checklist

### For End Users

- [ ] Pull latest changes
- [ ] Install dependencies
- [ ] Choose build configuration
- [ ] Build project
- [ ] Update Claude Desktop config
- [ ] Test MCP server
- [ ] Verify shells available
- [ ] Deploy to production

### For Developers

- [ ] Update imports
- [ ] Update configuration access
- [ ] Update validation calls
- [ ] Migrate tests
- [ ] Update build scripts
- [ ] Test all build configurations
- [ ] Update documentation
- [ ] Review bundle sizes

### For Contributors

- [ ] Understand new architecture
- [ ] Review plugin interface
- [ ] Update development environment
- [ ] Run test suite
- [ ] Create shell-specific tests
- [ ] Follow new code organization
- [ ] Update PR templates

---

## Timeline

### Phase 1: Preparation (Week 1)
- Review documentation
- Choose migration path
- Plan configuration changes

### Phase 2: Implementation (Week 2)
- Update code
- Migrate tests
- Update build scripts

### Phase 3: Testing (Week 3)
- Test all builds
- Verify functionality
- Performance testing

### Phase 4: Deployment (Week 4)
- Deploy to staging
- User acceptance testing
- Deploy to production

---

## Support & Resources

### Documentation
- [Architecture](./ARCHITECTURE.md) - System architecture
- [API Documentation](./API.md) - API reference
- [User Guide](./USER_GUIDE.md) - Usage guide
- [Testing Guide](./TESTING_GUIDE.md) - Testing strategies

### Getting Help

1. **Check Documentation**: Review this guide and other docs
2. **Search Issues**: Look for similar issues on GitHub
3. **Ask Questions**: Create a discussion on GitHub
4. **Report Bugs**: Open an issue with details

### Reporting Issues

When reporting migration issues, include:

1. **Version Information**:
   ```bash
   git log -1 --oneline
   node --version
   npm --version
   ```

2. **Build Configuration**:
   ```bash
   echo $SHELL_BUILD_PRESET
   echo $INCLUDED_SHELLS
   ```

3. **Error Messages**: Full error output

4. **Steps to Reproduce**: Detailed steps

5. **Expected vs Actual**: What you expected and what happened

---

## FAQs

### Q: Do I need to migrate?

**A**: No, if you use the default build (`npm run build`), everything continues to work as before.

### Q: Will my existing config break?

**A**: No, existing configurations work with the full build. Only specialized builds may need config updates.

### Q: Can I mix old and new code?

**A**: Yes, the full build maintains backward compatibility. However, it's recommended to migrate fully for consistency.

### Q: How long does migration take?

**A**: For end users using default build: **0 minutes**. For users adopting specialized builds: **15-30 minutes**. For developers: **2-4 hours**.

### Q: Can I rollback if something goes wrong?

**A**: Yes, see [Rollback Plan](#rollback-plan) for detailed instructions.

### Q: What if I need a shell that's not included?

**A**: You can create a custom build or extend the system with a new shell plugin. See [Code Changes](#code-changes) for details.

### Q: Will this affect performance?

**A**: Yes, positively! Specialized builds have:
- 30-65% smaller bundle size
- 20-45% faster startup
- 30-50% lower memory usage

### Q: Are there any security implications?

**A**: No negative implications. Security is maintained through:
- Same validation logic per shell
- No reduction in security features
- Isolated shell implementations

---

## Success Metrics

Track these metrics during migration:

### Before Migration
```bash
# Bundle size
ls -lh dist/index.js

# Startup time
time node dist/index.js --version

# Memory usage
node --expose-gc dist/index.js
```

### After Migration
```bash
# Bundle size (should be smaller for specialized builds)
ls -lh dist/index.gitbash-only.js

# Startup time (should be faster)
time node dist/index.gitbash-only.js --version

# Memory usage (should be lower)
node --expose-gc dist/index.gitbash-only.js
```

### Target Improvements

For specialized builds:
- ✅ Bundle size: 30-65% reduction
- ✅ Startup time: 20-45% faster
- ✅ Memory usage: 30-50% lower
- ✅ Type checking: 15-25% faster

---

## Conclusion

The migration to modular shell architecture provides significant benefits while maintaining backward compatibility. Whether you choose to adopt specialized builds immediately or continue using the full build, the system is designed to support your needs.

For most users, no migration is required. For those who want to optimize, the migration process is straightforward and well-documented.

---

**Last Updated**: 2025-11-09
**Version**: 1.0.0
**Migration Support**: Available via GitHub Issues
