# WCLI0 Shell Architecture - Quick Reference

Quick lookup guide for WCLI0 shell implementation details, file locations, and key information.

## At a Glance

| Aspect | Details |
|--------|---------|
| **Language** | TypeScript (ES Modules) |
| **Build Target** | ES2020 |
| **Supported Shells** | 5 (PowerShell, CMD, Git Bash, Bash, WSL) |
| **Source Files** | 19 TypeScript files in src/ |
| **Test Files** | 56 test files |
| **Entry Point** | src/index.ts → dist/index.js |

## Supported Shells

| Shell | Type | Executable | Args | Path Format |
|-------|------|------------|------|-------------|
| **PowerShell** | `powershell` | `powershell.exe` | `["-NoProfile", "-Command"]` | Windows (C:\Path) |
| **CMD** | `cmd` | `cmd.exe` | `["/c"]` | Windows (C:\Path) |
| **Git Bash** | `gitbash` | `C:\Program Files\Git\bin\bash.exe` | `["-c"]` | Mixed (both) |
| **Bash** | `bash` | `bash` | `["-c"]` | Unix (/mnt/c/path) |
| **WSL** | `wsl` | `wsl.exe` | `["-e"]` | Unix (/mnt/c/path) |

### Shell Classification

```text
Windows Shells: cmd, powershell
Unix Shells:    gitbash, wsl, bash
WSL-Specific:   wsl, bash (have wslConfig)
```

## Key Source Files

### Core Files

| File | Lines | Purpose | Key Functions/Classes |
|------|-------|---------|---------------------|
| `src/index.ts` | 1160 | Main server | CLIServer, executeShellCommand() (302-479) |
| `src/types/config.ts` | - | Type definitions | ShellType (141), BaseShellConfig (146-170) |
| `src/utils/config.ts` | - | Configuration | DEFAULT_CONFIG (26-118), loadConfig() |
| `src/utils/configMerger.ts` | - | Config merging | resolveShellConfiguration(), applyWslPathInheritance() (132-159) |
| `src/utils/validationContext.ts` | - | Shell context | ValidationContext (6-12), createValidationContext() |
| `src/utils/pathValidation.ts` | - | Path handling | normalizePathForShell(), validateWorkingDirectory() |
| `src/utils/validation.ts` | - | Command validation | extractCommandName(), isCommandBlocked() |
| `src/utils/toolSchemas.ts` | - | Schema generation | buildExecuteCommandSchema() (13-69) |
| `src/utils/toolDescription.ts` | - | Tool descriptions | buildExecuteCommandDescription() |

### Shell-Specific Code Locations

**PowerShell** (Windows shell):

- Config: `src/utils/config.ts:26-41`
- Blocked commands: None (uses global)
- Path format: Windows

**CMD** (Windows shell):

- Config: `src/utils/config.ts:42-57`
- Blocked commands: `['del', 'rd', 'rmdir']`
- Path format: Windows

**Git Bash** (Unix shell):

- Config: `src/utils/config.ts:58-73`
- Blocked commands: `['rm']`
- Path format: Mixed (accepts both)
- Custom validator: `/^([a-zA-Z]:\\|\/[a-z]\/)/.test(dir)`

**Bash** (Unix + WSL):

- Config: `src/utils/config.ts:74-89`
- Blocked commands: None (uses global)
- Path format: Unix
- WSL Config: mount point `/mnt/`, inherit paths
- Custom validator: `/^(\/mnt\/[a-zA-Z]\/|\/)/.test(dir)`

**WSL** (Unix + WSL):

- Config: `src/utils/config.ts:90-105`
- Blocked commands: None (uses global)
- Path format: Unix
- WSL Config: mount point `/mnt/`, inherit paths
- Custom validator: `/^(\/mnt\/[a-zA-Z]\/|\/)/.test(dir)`

## Test Files Overview

### Shell-Specific Tests

- `tests/bash/bashShell.test.ts` - Bash execution
- `tests/gitbashWorkingDir.test.ts` - Git Bash paths
- `tests/wsl/pathConversion.test.ts` - WSL path handling
- `tests/wsl/pathResolution.test.ts` - WSL path resolution
- `tests/wsl/validateWslWorkingDirectory.test.ts` - WSL validation
- `tests/wsl/isWslPathAllowed.test.ts` - WSL path checks

### Validation Tests

- `tests/validation/shellSpecific.test.ts` - Shell-specific validation
- `tests/validation/context.test.ts` - ValidationContext
- `tests/validation/pathValidation.test.ts` - Path validation
- `tests/validation.test.ts` - General validation

### Configuration Tests

- `tests/configMerge.test.ts` - Config merging
- `tests/configNormalization.test.ts` - Config normalization
- `tests/configValidation.test.ts` - Config validation
- `tests/conditionalShells.test.ts` - Shell enable/disable
- `tests/shellCliOverride.test.ts` - CLI shell overrides
- `tests/wslMountPointCliOverride.test.ts` - WSL mount point override

### Integration Tests

- `tests/integration/shellExecution.test.ts` - End-to-end shell tests
- `tests/integration/endToEnd.test.ts` - E2E tests

## Shell Initialization Flow

```text
1. main() parses CLI args (yargs)
2. loadConfig() loads from file or DEFAULT_CONFIG
3. CLI overrides applied to config
4. CLIServer constructor called
5. initializeShellConfigs() iterates enabled shells
6. getResolvedShellConfig() resolves each shell
7. resolvedConfigs Map populated
8. setupHandlers() registers MCP handlers
9. ListToolsRequestSchema generates dynamic schemas
10. execute_command schema has enum of enabled shells
```

## Shell Execution Special Handling

**Location**: `src/index.ts:executeShellCommand()` (lines 302-479)

### WSL/Bash (wsl, bash)

- Parse command into args
- Pass separately to spawn
- Convert /mnt/ paths to Windows for spawn cwd
- Handle WSL path emulation via environment variable

### Git Bash

- Pass full command string
- Normalize paths for spawn
- Accept both Windows and Unix path formats

### Windows (cmd, powershell)

- Pass full command string
- Use Windows paths directly
- No special path conversion

## Build Configuration

### Package.json Scripts

```bash
npm run build    # tsc && shx chmod +x dist/index.js
npm run clean    # shx rm -rf dist
npm run start    # node dist/index.js
npm run prepare  # Runs build on install
npm test         # jest
```

### TypeScript Config

```json
{
  "target": "ES2020",
  "module": "NodeNext",
  "outDir": "./dist",
  "rootDir": "./src"
}
```

### Jest Config

```javascript
{
  "preset": "ts-jest/presets/default-esm",
  "testEnvironment": "node",
  "testTimeout": 10000
}
```

## CLI Arguments

| Argument | Type | Purpose |
|----------|------|---------|
| `--config, -c` | string | Path to config file |
| `--init-config` | string | Create default config at path |
| `--initialDir` | string | Override initial directory |
| `--shell` | string | Enable only specific shell |
| `--allowedDir` | array | Override allowed directories |
| `--maxCommandLength` | number | Override max command length |
| `--commandTimeout` | number | Override command timeout (seconds) |
| `--wslMountPoint` | string | Override WSL mount point |
| `--blockedCommand` | array | Override blocked commands |
| `--blockedArgument` | array | Override blocked arguments |
| `--blockedOperator` | array | Override blocked operators |
| `--allowAllDirs` | boolean | Disable directory restriction |
| `--debug` | boolean | Enable debug logging |

## Type Definitions Quick Reference

### ShellType

```typescript
type ShellType = 'cmd' | 'powershell' | 'gitbash' | 'wsl' | 'bash';
```

### BaseShellConfig (lines 146-170)

```typescript
interface BaseShellConfig {
  enabled: boolean;
  executable: string;
  args: string[];
  overrides?: ShellOverrides;
  validatePath?: (dir: string) => boolean;
}
```

### WslShellConfig (lines 190-196)

```typescript
interface WslShellConfig extends BaseShellConfig {
  wslConfig?: {
    mountPoint: string;
    inheritGlobalPaths: boolean;
  };
}
```

### ValidationContext (lines 6-12)

```typescript
interface ValidationContext {
  shellName: string;
  shellConfig: ResolvedShellConfig;
  isWindowsShell: boolean;
  isUnixShell: boolean;
  isWslShell: boolean;
}
```

## Configuration Examples

Available in `config.examples/`:

- **config.sample.json** - Standard configuration
- **config.development.json** - Dev environment
- **config.secure.json** - High-security setup
- **emptyRestrictions.json** - No restrictions
- **minimal.json** - Minimal config
- **production.json** - Production setup

## Key Dependencies

```text
index.ts
├─> utils/config.ts
│   ├─> types/config.ts
│   └─> utils/configMerger.ts
├─> utils/validationContext.ts
├─> utils/pathValidation.ts
├─> utils/validation.ts
├─> utils/toolSchemas.ts
└─> utils/toolDescription.ts
```

## Default Blocked Commands

| Shell | Blocked Commands |
|-------|-----------------|
| **Global** | (defined in config.restrictions.blockedCommands) |
| **CMD** | `del`, `rd`, `rmdir` |
| **Git Bash** | `rm` |
| **PowerShell** | None (uses global) |
| **Bash** | None (uses global) |
| **WSL** | None (uses global) |

## Path Validation Patterns

| Shell | Pattern |
|-------|---------|
| **Windows** | `/^[A-Za-z]:[/\\]/` |
| **Git Bash** | `/^([a-zA-Z]:\\/)/` |
| **Bash** | `/^(\/mnt\/[a-zA-Z]\/)/` |
| **WSL** | `/^(\/mnt\/[a-zA-Z]\/)/` |

## Common Lookup Tasks

### "Where is X defined?"

| Item | Location |
|------|----------|
| Shell types | `src/types/config.ts:141` |
| Shell configs | `src/utils/config.ts:26-118` |
| Shell execution | `src/index.ts:302-479` |
| Path validation | `src/utils/pathValidation.ts` |
| Command validation | `src/utils/validation.ts` |
| Tool schemas | `src/utils/toolSchemas.ts:13-69` |
| ValidationContext | `src/utils/validationContext.ts:6-12` |

### "How do I X?"

| Task | How To |
|------|--------|
| Add a shell | Add to ShellType union + DEFAULT_CONFIG + validation logic |
| Change blocked commands | Modify DEFAULT_CONFIG.shells.[shell].overrides.restrictions |
| Change timeout | Modify shell config security.commandTimeout or use CLI flag |
| Add allowed path | Modify paths.allowedPaths in config or use --allowedDir flag |
| Change WSL mount point | Modify wslConfig.mountPoint or use --wslMountPoint flag |
| Enable one shell only | Use --shell flag: `--shell gitbash` |

## Performance Metrics

- **Startup Time**: <100ms (all shells)
- **Command Execution**: Depends on shell and command
- **Memory Usage**: ~50-80MB (all shells loaded)
- **Bundle Size**: ~2-3MB (all shells, pre-tree-shaking)

---

**For more details**: See CURRENT_ARCHITECTURE.md  
**For proposed changes**: See MODULAR_PLAN.md  
**Last Updated**: 2025-11-10
