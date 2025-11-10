WCLI0 SHELL ARCHITECTURE DIAGRAM
=================================

SUPPORTED SHELLS (5 Total)
==========================

                    Windows Shells          Unix-Like Shells       Unix + WSL
                    ══════════════          ════════════════       ══════════
                    
                    powershell              gitbash               bash
                    ├─ Windows paths        ├─ Mixed paths        ├─ Unix paths
                    ├─ .exe execution       ├─ /c/path format     ├─ /mnt/c/path
                    └─ Standard args        └─ Custom override    ├─ WSL-specific
                                                                   └─ Mount point
                    cmd                                           
                    ├─ Windows paths                              wsl
                    ├─ /c execution                               ├─ Unix paths
                    └─ Custom override                            ├─ wsl.exe runner
                                                                   ├─ WSL-specific
                                                                   └─ Mount point


CONFIGURATION HIERARCHY
=======================

                            DEFAULT_CONFIG
                            (All 5 shells)
                                  │
                                  ├─ Load from file ────> User Config
                                  │
                                  └─ Merge ────────────> CLI Args Override
                                         │
                                         └─> ResolvedShellConfig (per shell)


SHELL RESOLUTION FLOW
=====================

1. CLIServer.__init__()
   │
   └─ initializeShellConfigs()
      │
      ├─ For each shell in config:
      │  │
      │  └─ if shell.enabled:
      │     │
      │     └─ getResolvedShellConfig(name)
      │        │
      │        └─ Merge:
      │           ├─ Global config
      │           └─ Shell overrides
      │              │
      │              └─ Store in resolvedConfigs Map


VALIDATION CONTEXT SYSTEM
=========================

                        ShellConfig
                             │
                             └─ createValidationContext()
                                │
                                ├─ shellName: string
                                ├─ shellConfig: ResolvedShellConfig
                                ├─ isWindowsShell: boolean
                                │  └─ cmd, powershell
                                ├─ isUnixShell: boolean
                                │  └─ gitbash, wsl, bash
                                └─ isWslShell: boolean
                                   └─ wsl, bash


COMMAND EXECUTION PIPELINE
==========================

1. execute_command tool called with:
   ├─ shell (enum of enabled shells)
   ├─ command (string)
   ├─ workingDir (optional string)
   └─ maxOutputLines (optional number)
       │
       └─ Validation Context Created
           │
           └─ Path Normalization
           │  ├─ Windows shells: C:\Path format
           │  ├─ Unix shells: /path format
           │  └─ WSL shells: /mnt/c/path format
           │
           └─ Command Validation
           │  ├─ Check blocked operators
           │  ├─ Check blocked commands
           │  └─ Check blocked arguments
           │
           └─ Path Validation
           │  ├─ Check allowed paths
           │  └─ Shell-specific validation
           │
           └─ executeShellCommand()
              │
              ├─ If WSL/bash:
              │  ├─ Parse command into args
              │  ├─ Normalize paths
              │  └─ Pass via environment var
              │
              ├─ Else if gitbash:
              │  └─ Use mixed path handling
              │
              └─ Else (Windows):
                 └─ Use Windows paths directly
                     │
                     └─ spawn(executable, args, {cwd, env})
                        │
                        └─ Collect stdout/stderr
                           │
                           └─ Return result


DYNAMIC TOOL GENERATION
=======================

  ListToolsRequestSchema handler
          │
          ├─ Get enabled shells
          │
          ├─ buildExecuteCommandSchema()
          │  ├─ shell parameter: enum of enabled shells
          │  ├─ command: string
          │  ├─ workingDir: optional string
          │  │  (description changes per shell type)
          │  └─ maxOutputLines: optional number
          │
          ├─ buildExecuteCommandDescription()
          │  ├─ Lists each enabled shell
          │  ├─ Shows timeout per shell
          │  ├─ Shows path format per shell
          │  └─ Includes examples for each shell
          │
          └─ build validate_directories schema
             └─ Optional shell parameter


FILE STRUCTURE & DEPENDENCIES
=============================

src/
├── index.ts (Main server)
│   │
│   ├─> types/config.ts
│   ├─> utils/config.ts
│   ├─> utils/validationContext.ts
│   ├─> utils/pathValidation.ts
│   ├─> utils/validation.ts
│   ├─> utils/toolSchemas.ts
│   ├─> utils/toolDescription.ts
│   └─> utils/configMerger.ts
│
├── types/
│   └── config.ts (Type definitions)
│       ├─ ShellType
│       ├─ BaseShellConfig
│       ├─ WslShellConfig
│       ├─ ServerConfig
│       └─ ResolvedShellConfig
│
└── utils/
    ├── config.ts (Loading & merging)
    │   ├─ DEFAULT_CONFIG (all 5 shells)
    │   ├─ loadConfig()
    │   └─ mergeConfigs()
    │
    ├── configMerger.ts (Resolution logic)
    │   ├─ resolveShellConfiguration()
    │   └─ applyWslPathInheritance()
    │
    ├── validationContext.ts (Shell classification)
    │   ├─ createValidationContext()
    │   └─ Shell type flags
    │
    ├── pathValidation.ts (Path handling)
    │   ├─ normalizePathForShell()
    │   ├─ validateWorkingDirectory()
    │   ├─ validateWslPath()
    │   ├─ validateWindowsPath()
    │   └─ validateUnixPath()
    │
    ├── validation.ts (Command validation)
    │   ├─ parseCommand()
    │   ├─ isCommandBlocked()
    │   ├─ isArgumentBlocked()
    │   └─ validateShellOperators()
    │
    ├── toolSchemas.ts (Schema generation)
    │   ├─ buildExecuteCommandSchema()
    │   └─ buildValidateDirectoriesSchema()
    │
    └── toolDescription.ts (Descriptions)
        └─ buildExecuteCommandDescription()


SHELL CLASSIFICATION LOGIC
==========================

Shell Type Classification:
  
  Windows Shells?
  ├─ YES: cmd, powershell
  │  ├─ isWindowsShell = true
  │  ├─ isUnixShell = false
  │  └─ isWslShell = false
  │
  └─ NO: Check if Unix
     ├─ gitbash, wsl, bash
     ├─ isWindowsShell = false
     ├─ isUnixShell = true
     └─ isWslShell = (wsl || bash)


SHELL-SPECIFIC BEHAVIOR
=======================

┌─────────────────┬──────────────┬──────────────┬────────────────┐
│ Aspect          │ Windows      │ GitBash      │ WSL/Bash       │
├─────────────────┼──────────────┼──────────────┼────────────────┤
│ Path Format     │ C:\Path      │ Mixed        │ /mnt/c/path    │
│ Executable      │ .exe args    │ bash -c      │ bash -c        │
│ Args Style      │ Full string  │ Full string  │ Split args     │
│ Validation      │ Windows path │ Regex check  │ WSL path check │
│ Blocked Cmds    │ Global only  │ Global + rm  │ Global + none  │
│ Special Config  │ None         │ None         │ wslConfig      │
│ Mount Point     │ N/A          │ N/A          │ /mnt/ (config) │
└─────────────────┴──────────────┴──────────────┴────────────────┘


CONFIGURATION INHERITANCE
=========================

ResolvedShellConfig =
  {
    type: (from BaseShellConfig)
    enabled: (from BaseShellConfig)
    executable: (from BaseShellConfig)
    
    security: {
      ...global.security           (defaults)
      ...overrides.security        (if defined)
    }
    
    restrictions: {
      blockedCommands: 
        global.blockedCommands ++ overrides.blockedCommands
      blockedArguments:
        global.blockedArguments ++ overrides.blockedArguments
      blockedOperators:
        overrides.blockedOperators OR global.blockedOperators
    }
    
    paths: {
      allowedPaths:
        overrides.allowedPaths OR global.allowedPaths
    }
    
    validatePath: (custom function from BaseShellConfig)
    wslConfig: (only for WSL/bash)
  }


EXECUTION STRATEGY BY SHELL TYPE
================================

┌─────────────┬────────────────────────────────────────┐
│ Shell Type  │ Execution Strategy                     │
├─────────────┼────────────────────────────────────────┤
│ cmd         │ cmd.exe /c "command"                   │
│ powershell  │ powershell.exe -Command "command"      │
│ gitbash     │ bash.exe -c "command"                  │
│ bash        │ bash -c command arg1 arg2              │
│ wsl         │ wsl.exe -e bash -c command arg1 arg2   │
└─────────────┴────────────────────────────────────────┘

Note: WSL/bash split args for better shell parsing
      Others pass full command string


CONFIGURATION LOADING SEQUENCE
==============================

1. Parse CLI args
   ├─ --config
   ├─ --shell
   ├─ --allowedDir
   └─ ... other flags
       │
2. Load config from file (or use DEFAULT_CONFIG)
   │
3. Apply CLI overrides
   ├─ applyCliShellAndAllowedDirs()
   ├─ applyCliSecurityOverrides()
   ├─ applyCliRestrictions()
   ├─ applyCliWslMountPoint()
   └─ applyCliInitialDir()
       │
4. Create CLIServer with merged config
   │
5. initializeShellConfigs()
   └─ Resolve only enabled shells


ENABLED SHELLS DETERMINATION
=============================

A shell is "enabled" if:

1. config.shells[shellName].enabled === true (default)
   AND
2. NOT overridden by:
   a. Config file setting enabled=false
   b. CLI --shell flag (only one can be enabled)
   c. CLI config overrides


RESOLUTION & REGISTRATION TIMING
================================

┌─────────────────────────┬──────────────────┐
│ Phase                   │ When              │
├─────────────────────────┼──────────────────┤
│ Configuration loading   │ main() execution  │
│ CLI arg parsing         │ main() execution  │
│ CLIServer construction  │ main() execution  │
│ Shell resolution        │ constructor call  │
│ Tool generation         │ First MCP request │
│ Command execution       │ execute_command   │
│ Path validation         │ Before spawn      │
│ Command validation      │ Before spawn      │
└─────────────────────────┴──────────────────┘


TESTING STRUCTURE
=================

Tests organized by concern:

├─ Shell execution tests (bash/wsl)
├─ Path handling (validation/pathValidation)
├─ Shell-specific validation (validation/shellSpecific)
├─ Configuration (configMerge, configNormalization)
├─ CLI overrides (shellCliOverride, wslMountPointCliOverride)
├─ Directory validation (directoryValidator)
└─ Integration (integration/shellExecution, endToEnd)

Each test imports:
  - CLIServer
  - Config utilities
  - Validation utilities
  - Specific shell config


KEY EXTENSION POINTS FOR MODULARIZATION
========================================

1. Add New Shell Type:
   a. Add to ShellType union
   b. Add to DEFAULT_CONFIG.shells
   c. Add to mergeConfigs() logic
   d. Add validation context classification
   e. Add executeShellCommand() handling
   f. Add path validation rules
   g. Add tool description examples
   h. Add tests

2. Add Shell-Specific Feature:
   a. Add to BaseShellConfig or WslShellConfig
   b. Update mergeConfigs()
   c. Update validation logic
   d. Update execution logic
   e. Update tests

3. Add Validation Type:
   a. Add to GlobalRestrictionsConfig
   b. Add validation function
   c. Update executeShellCommand() validation
   d. Add tests

