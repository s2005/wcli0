# Shell Architecture Exploration Report

## 1. Shell-Specific Code Locations

### Core Shell Implementation Files:
- **src/index.ts** (Main server entry point - 1160 lines)
  - `executeShellCommand()` method (lines 302-479) - Core shell execution logic
  - Shell type-specific handling for execution
  - Dynamic tool listing and resource exposure based on enabled shells

- **src/types/config.ts** (Config type definitions)
  - `ShellType` type definition (line 141): `'cmd' | 'powershell' | 'gitbash' | 'wsl' | 'bash'`
  - `BaseShellConfig` interface (lines 146-170)
  - `WslShellConfig` interface (lines 190-196) - WSL/Bash specific config

- **src/utils/config.ts** (Configuration management)
  - `DEFAULT_CONFIG` with all 5 shell definitions (lines 26-118)
  - `getResolvedShellConfig()` - Resolves individual shell configuration
  - `loadConfig()` - Loads and merges configurations
  - Shell-specific overrides handling

- **src/utils/configMerger.ts** (Configuration merging logic)
  - `resolveShellConfiguration()` - Merges global + shell-specific settings
  - `applyWslPathInheritance()` - WSL-specific path conversion (lines 132-159)
  - Separate merge functions for each shell type in `mergeConfigs()`

- **src/utils/validation.ts** (Command validation)
  - `extractCommandName()` - Shell-agnostic command name extraction
  - `isCommandBlocked()`, `isArgumentBlocked()`, `validateShellOperators()` - Shell-agnostic validation
  - Uses validation context to apply shell-specific rules

- **src/utils/validationContext.ts** (Shell context)
  - `ValidationContext` interface (lines 6-12)
  - `createValidationContext()` - Creates context based on shell type
  - Shell type classification (lines 21-23):
    - Windows shells: cmd, powershell
    - Unix shells: gitbash, wsl, bash
    - WSL-specific: wsl, bash

- **src/utils/pathValidation.ts** (Path handling)
  - `normalizePathForShell()` - Shell-specific path normalization
  - `validateWorkingDirectory()` - Shell-aware directory validation
  - Shell-specific validation functions:
    - `validateWslPath()` - For WSL/bash shells
    - `validateWindowsPath()` - For Windows shells
    - `validateUnixPath()` - For Unix-like shells

- **src/utils/toolSchemas.ts** (Tool schema generation)
  - `buildExecuteCommandSchema()` - Dynamically builds schema based on enabled shells
  - Shell type detection for description generation (lines 29-35)

- **src/utils/toolDescription.ts** (Tool descriptions)
  - `buildExecuteCommandDescription()` - Dynamic descriptions per shell
  - Shell-specific examples for each supported shell
  - `buildToolDescription()` - Alternative description builder

## 2. Supported Shells

### Five Shell Types Supported:

1. **PowerShell** (Windows)
   - Type: `powershell`
   - Path format: Windows (C:\Path\Format)
   - Executable: `powershell.exe` with args `["-NoProfile", "-NonInteractive", "-Command"]`
   - Classification: Windows shell
   - Default blocked commands: None additional (uses global)

2. **Command Prompt (CMD)** (Windows)
   - Type: `cmd`
   - Path format: Windows (C:\Path\Format)
   - Executable: `cmd.exe` with args `["/c"]`
   - Classification: Windows shell
   - Default blocked commands: `del`, `rd`, `rmdir` (shell-specific override)

3. **Git Bash** (Unix-like on Windows)
   - Type: `gitbash`
   - Path format: Mixed (both C:\Path and /c/path accepted)
   - Executable: `C:\Program Files\Git\bin\bash.exe` with args `["-c"]`
   - Classification: Unix shell
   - Default blocked commands: `rm` (shell-specific override)
   - Custom path validator: `/^([a-zA-Z]:\\|\/[a-z]\/)/.test(dir)`

4. **Bash** (Unix shell)
   - Type: `bash`
   - Path format: Unix (/mnt/c/path, /home/user)
   - Executable: `bash` with args `["-c"]`
   - Classification: Unix + WSL-specific
   - WSL Config: Mount point `/mnt/`, inherit global paths
   - Custom path validator: `/^(\/mnt\/[a-zA-Z]\/|\/)/.test(dir)`

5. **WSL (Windows Subsystem for Linux)**
   - Type: `wsl`
   - Path format: Unix (/mnt/c/path, /)
   - Executable: `wsl.exe` with args `["-e"]`
   - Classification: Unix + WSL-specific
   - WSL Config: Mount point `/mnt/`, inherit global paths
   - Custom path validator: `/^(\/mnt\/[a-zA-Z]\/|\/)/.test(dir)`
   - Can execute arbitrary Linux commands within WSL

## 3. How Shells Are Currently Implemented and Integrated

### Shell Registration and Initialization:

1. **Configuration-Driven Registration** (src/utils/config.ts, lines 26-118)
   - All shells defined in `DEFAULT_CONFIG.shells` with full executable info
   - Each shell can be enabled/disabled via `enabled` flag
   - Shell executable command and arguments specified in config

2. **Resolution Pipeline** (src/index.ts, lines 173-182)
   - `initializeShellConfigs()` iterates enabled shells
   - Calls `getResolvedShellConfig()` for each enabled shell
   - Stores resolved configs in `resolvedConfigs` Map
   - Only enabled shells are registered

3. **Dynamic Tool Generation** (src/index.ts, lines 698-757)
   - `ListToolsRequestSchema` handler dynamically generates tool schemas
   - `buildExecuteCommandSchema()` creates enum of enabled shell names
   - Shell parameter becomes enum with only enabled shells
   - Different shells shown in tool description based on enabled set

4. **Shell-Specific Execution** (src/index.ts, lines 302-479)
   - `executeShellCommand()` method handles shell type differences
   - WSL/bash shells: Parse command and pass args separately (lines 313-315)
   - Other shells: Pass full command string (line 317)
   - Shell type checked explicitly: `if (shellConfig.type === 'wsl' || shellConfig.type === 'bash')`
   - Path conversion for WSL (lines 325-343)
   - Environment variables passed for WSL path emulation

### Command Validation Flow:

1. **Shell Context Creation** (src/utils/validationContext.ts, lines 17-32)
   - Creates context from shell config
   - Sets boolean flags: `isWindowsShell`, `isUnixShell`, `isWslShell`
   - Determines expected path format

2. **Validation** (src/index.ts, lines 271-300, 242-269)
   - `validateCommand()` processes command chain
   - `validateSingleCommand()` checks operators, blocked commands, args
   - Uses shell context for shell-specific rules
   - Handles path normalization per shell type

3. **Path Normalization** (src/utils/pathValidation.ts, lines 10-28)
   - Windows shells: Keep Windows format
   - WSL/bash: Convert to Unix format, handle /mnt/ mount points
   - Git Bash: Accept both formats, normalize to Windows for spawn

## 4. Build Configuration and Entry Points

### Package Configuration:
- **File**: `package.json`
- **Bin entry** (line 7): `"wcli0": "dist/index.js"`
- **Type**: ES Module (`"type": "module"`)

### Build Configuration:
- **File**: `tsconfig.json`
- **Target**: ES2020
- **Module**: NodeNext
- **Output**: `./dist` directory
- **Source**: `./src/**/*`

### Build Scripts:
- `build`: `tsc && shx chmod +x dist/index.js`
- `clean`: `shx rm -rf dist`
- `prepare`: Runs build on install (npm module)
- `start`: `node dist/index.js`

### Jest Configuration:
- **File**: `jest.config.js`
- **Preset**: `ts-jest/presets/default-esm`
- **Test environment**: Node.js
- **Test timeout**: 10000ms

### CLI Entry Point:
- **File**: `src/index.ts`
- **Main function** (lines 1093-1141): `main()`
  - Parses command-line args via yargs
  - Handles `--init-config` flag for config generation
  - Loads configuration with CLI overrides
  - Applies CLI parameters (shell, allowedDirs, security, etc.)
  - Creates CLIServer instance
  - Runs MCP server on stdio

### CLI Arguments Supported:
- `--config` / `-c`: Path to config file
- `--init-config`: Create default config
- `--initialDir`: Override initial directory
- `--shell`: Enable only specific shell
- `--allowedDir`: Override allowed directories (array)
- `--maxCommandLength`: Override max command length
- `--commandTimeout`: Override command timeout
- `--wslMountPoint`: Override WSL mount point
- `--blockedCommand`: Override blocked commands
- `--blockedArgument`: Override blocked arguments
- `--blockedOperator`: Override blocked operators
- `--allowAllDirs`: Disable directory restriction if no paths configured
- `--debug`: Enable debug logging

## 5. Modularization Patterns

### 1. Configuration Layering:
- **Global config**: Applied to all shells
- **Shell-specific overrides**: Per-shell settings override global
- **CLI overrides**: Command-line args override everything
- **Resolution pipeline**: Global + overrides = ResolvedShellConfig

### 2. Functional Separation:
- **Shell definitions** → `src/types/config.ts`
- **Config loading/merging** → `src/utils/config.ts`, `src/utils/configMerger.ts`
- **Shell context** → `src/utils/validationContext.ts`
- **Validation logic** → `src/utils/validation.ts`
- **Path handling** → `src/utils/pathValidation.ts`
- **Tool generation** → `src/utils/toolSchemas.ts`, `src/utils/toolDescription.ts`
- **Execution** → `src/index.ts` (CLIServer class)

### 3. Shell Classification System:
- **Windows shells**: `cmd`, `powershell`
- **Unix shells**: `gitbash`, `wsl`, `bash`
- **WSL-specific**: `wsl`, `bash`
- Classification used to determine:
  - Expected path format
  - Path validation rules
  - Path normalization behavior
  - Command execution strategy

### 4. Per-Shell Customization Points:

**Custom Path Validators** (src/types/config.ts, line 169):
```typescript
validatePath?: (dir: string) => boolean;
```

**Shell-Specific Overrides** (BaseShellConfig.overrides):
- Security settings override
- Restrictions override (blocked commands, args, operators)
- Paths override (allowed paths)

**WSL Configuration** (WslShellConfig):
- Mount point mapping
- Global path inheritance

**Default Blocked Commands per Shell** (src/utils/config.ts):
- cmd: `['del', 'rd', 'rmdir']`
- gitbash: `['rm']`
- powershell: None (uses global)
- bash: None (uses global)
- wsl: None (uses global)

### 5. Test Organization:
```
tests/
├── bash/
│   └── bashShell.test.ts          # Bash execution tests
├── wsl/
│   ├── pathConversion.test.ts      # WSL path handling
│   ├── pathResolution.test.ts
│   ├── validateWslWorkingDirectory.test.ts
│   └── isWslPathAllowed.test.ts
├── validation/
│   ├── shellSpecific.test.ts       # Shell-specific validation
│   ├── context.test.ts             # ValidationContext
│   └── pathValidation.test.ts
├── unit/
│   └── folderPropagation.test.ts   # WSL path propagation
├── integration/
│   └── shellExecution.test.ts      # End-to-end shell tests
├── gitbashWorkingDir.test.ts       # Git Bash paths
├── conditionalShells.test.ts       # Shell enable/disable
└── shellCliOverride.test.ts        # CLI shell overrides
```

### 6. Configuration Examples:
- `config.sample.json` - Standard configuration
- `config.development.json` - Dev environment
- `config.secure.json` - High-security setup
- `emptyRestrictions.json` - No restrictions
- `minimal.json` - Minimal config
- `production.json` - Production setup

## 6. Dependencies Between Shells and Core Functionality

### Dependency Graph:

```
src/index.ts (CLIServer)
├─> src/utils/config.ts
│   ├─> src/types/config.ts
│   ├─> src/utils/configMerger.ts
│   │   └─> src/utils/configTypes.ts
│   └─> src/utils/validation.ts
├─> src/utils/validationContext.ts
│   └─> src/types/config.ts
├─> src/utils/pathValidation.ts
│   ├─> src/utils/validationContext.ts
│   └─> src/utils/validation.ts
├─> src/utils/toolSchemas.ts
│   └─> src/types/config.ts
├─> src/utils/toolDescription.ts
│   └─> src/types/config.ts
└─> [Shell execution via spawn()]
    ├─> Determined by shellConfig.type
    ├─> Uses shellConfig.executable
    └─> Uses shellConfig.wslConfig (if WSL)
```

### Shell Type Usage Throughout Codebase:

**Core Type Checks** (Multiple locations):
1. **Execution logic** (src/index.ts:313, 324, 340)
   - `if (shellConfig.type === 'wsl' || shellConfig.type === 'bash')`
   - `else if (shellConfig.type === 'gitbash')`

2. **Path handling** (src/pathValidation.ts:54, 56, 59)
   - Check `isWslShell` → validate Unix paths
   - Check `isWindowsShell` → validate Windows paths
   - Else → validate Unix paths

3. **Tool generation** (src/toolSchemas.ts:29, 31, 33)
   - Determine path format descriptions
   - Show Unix vs Windows vs Mixed paths

4. **Configuration** (src/configMerger.ts:203-204)
   - Apply WSL path inheritance for `wsl` or `bash`

5. **Context creation** (src/validationContext.ts:21-23)
   - Set boolean flags based on type
   - Determine validation rules

### Shell-Specific Features:

**WSL-Specific** (bash, wsl):
- `wslConfig` property with mount point
- Path conversion from Windows to Unix
- Environment variable for path emulation
- Global path inheritance option

**Git Bash-Specific** (gitbash):
- Mixed path format support
- Custom path validation
- Specific blocked command override

**Windows-Specific** (cmd, powershell):
- Full command string passing
- Windows path validation
- Executable.exe handling

## Summary

The shell architecture is **configuration-driven and modular**:

1. **All 5 shells defined declaratively** in configuration with executable paths and args
2. **No hardcoded shell logic** - behavior determined by config + type classification
3. **Context-based validation** - shell type determines validation rules
4. **Dynamic tool generation** - only enabled shells appear in MCP tools
5. **Layered configuration** - global defaults + shell overrides + CLI args
6. **Functional modules** - separation of concerns across utils
7. **Type-based branching** - explicit shell type checks for special handling
8. **Extensible design** - new shells can be added by extending types and config

The system is well-suited for modularization, with clear separation between:
- Configuration management
- Shell-specific execution
- Path validation/normalization
- Command validation
- Tool generation
- MCP server core
