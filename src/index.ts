#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  CallToolResult, // Changed from CallToolResultPayload
  CallToolRequest,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import {
  isCommandBlocked,
  isArgumentBlocked,
  parseCommand,
  extractCommandName,
  validateShellOperators,
  isPathAllowed,
  normalizeWindowsPath
} from './utils/validation.js';
import { createValidationContext, ValidationContext } from './utils/validationContext.js';
import {
  validateWorkingDirectory as validateWorkingDirectoryWithContext,
  normalizePathForShell
} from './utils/pathValidation.js';
import { validateDirectoriesAndThrow } from './utils/directoryValidator.js';
import { spawn } from 'child_process';
import { z } from 'zod';
import { readFileSync, realpathSync } from 'fs';
import path from 'path';
import { buildToolDescription } from './utils/toolDescription.js';
import { buildExecuteCommandSchema, buildValidateDirectoriesSchema, buildGetCommandOutputSchema } from './utils/toolSchemas.js';
import { buildExecuteCommandDescription, buildValidateDirectoriesDescription, buildGetConfigDescription, buildGetCommandOutputDescription } from './utils/toolDescription.js';
import { loadConfig, createDefaultConfig, getResolvedShellConfig, applyCliInitialDir, applyCliShellAndAllowedDirs, applyCliSecurityOverrides, applyCliWslMountPoint, applyCliRestrictions, applyCliLogging, applyCliUnsafeMode, applyDebugLogDirectory, applyCliTransport } from './utils/config.js';
import { createSerializableConfig, createResolvedConfigSummary } from './utils/configUtils.js';
import { resolveProfileEnv, ProfileSelectionError } from './utils/envProfiles.js';
import type { ServerConfig, ResolvedShellConfig, GlobalConfig, LoggingConfig } from './types/config.js';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';
import { setDebugLogging, debugLog, debugWarn, errorLog } from './utils/log.js';
import { truncateOutput, formatTruncatedOutput } from './utils/truncation.js';
import { LogStorageManager } from './utils/logStorage.js';
import { LogResourceHandler } from './utils/logResourceHandler.js';
// Import modular shell system
import { loadShells } from './shells/loader.js';
import { shellRegistry } from './core/registry.js';
import { getBuildConfig } from './build/shell-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import package.json with fallback for robust cross-environment support
const packageJson = (() => {
  const fallbackPackageInfo = { version: '1.0.2', name: 'wcli0' };
  
  try {
    const packagePath = path.resolve(__dirname, '../package.json');
    return JSON.parse(readFileSync(packagePath, 'utf8'));
  } catch (error: any) {
    debugWarn('Warning: Could not locate package.json, using fallback version information');
    return fallbackPackageInfo;
  }
})();

// Parse command line arguments using yargs
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

const parseArgs = async () => {
  return yargs(hideBin(process.argv))
    .option('config', {
      alias: 'c',
      type: 'string',
      description: 'Path to config file'
    })
    .option('init-config', {
      type: 'string',
      description: 'Create a default config file at the specified path'
    })
    .option('initialDir', {
      type: 'string',
      description: 'Initial working directory (overrides config)'
    })
    .option('shell', {
      type: 'string',
      description: 'Enable only this shell and disable others'
    })
    .option('allowedDir', {
      type: 'string',
      array: true,
      description: 'Allowed directory, can be specified multiple times'
    })
    .option('maxCommandLength', {
      type: 'number',
      description: 'Maximum length for command strings'
    })
    .option('commandTimeout', {
      type: 'number',
      description: 'Command timeout in seconds'
    })
    .option('wslMountPoint', {
      type: 'string',
      description: 'Mount point for Windows drives in WSL (default: /mnt/)'
    })
    .option('blockedCommand', {
      type: 'string',
      array: true,
      description: 'Override blocked commands; use empty string to allow all'
    })
    .option('blockedArgument', {
      type: 'string',
      array: true,
      description: 'Override blocked arguments; use empty string to allow all'
    })
    .option('blockedOperator', {
      type: 'string',
      array: true,
      description: 'Override blocked operators; use empty string to allow all'
    })
    .option('allowAllDirs', {
      type: 'boolean',
      default: false,
      description: 'Disable working directory restriction when no allowed paths are configured'
    })
    .option('yolo', {
      type: 'boolean',
      description:
        'Disable safety checks that block command execution but keep allowed working directory restrictions.'
    })
    .option('unsafe', {
      type: 'boolean',
      description:
        'Disable all safety checks that block command execution, including allowed working directory restrictions.'
    })
    .conflicts('unsafe', 'yolo')
    .option('debug', {
      type: 'boolean',
      default: false,
      description: 'Enable debug logging'
    })
    .option('maxOutputLines', {
      type: 'number',
      description: 'Maximum output lines before truncation (default: 20)'
    })
    .option('enableTruncation', {
      type: 'boolean',
      description: 'Enable output truncation (default: true)'
    })
    .option('enableLogResources', {
      type: 'boolean',
      description: 'Enable log resources for get_command_output (default: true)'
    })
    .option('maxReturnLines', {
      type: 'number',
      description: 'Maximum lines returned by get_command_output (default: 500)'
    })
    .option('logDirectory', {
      type: 'string',
      description: 'Directory to store command output log files (enables file-based logging)'
    })
    .option('transport', {
      type: 'string',
      choices: ['stdio', 'sse', 'http'],
      description: 'Transport protocol (default: stdio). "http" = Streamable HTTP (2025-03-26, single /mcp endpoint); "sse" = legacy HTTP+SSE (2024-11-05).'
    })
    .option('sse-host', {
      type: 'string',
      description: 'Host address for SSE transport (default: 127.0.0.1)'
    })
    .option('sse-port', {
      type: 'number',
      description: 'Port for SSE transport (default: 9444)'
    })
    .option('sse-allowed-origins', {
      type: 'string',
      description: 'Comma-separated browser origins allowed to use the SSE transport, in addition to loopback hosts and the bind host (e.g. "https://app.example.com,192.168.1.10"). Required for browser clients when binding to 0.0.0.0.'
    })
    .option('http-host', {
      type: 'string',
      description: 'Host address for the Streamable HTTP transport (default: 127.0.0.1). Only used with --transport http.'
    })
    .option('http-port', {
      type: 'number',
      description: 'Port for the Streamable HTTP transport (default: 9444). Only used with --transport http.'
    })
    .option('http-allowed-origins', {
      type: 'string',
      description: 'Comma-separated browser origins allowed to use the Streamable HTTP transport, in addition to loopback hosts and the bind host (e.g. "https://app.example.com,192.168.1.10"). Required for browser clients when binding to 0.0.0.0.'
    })
    // Pin --version to the resolved package version (the same robustly-loaded
    // package.json used for the MCP server info) instead of relying on yargs'
    // implicit package.json discovery, which is unreliable for a globally
    // installed or bundled CLI.
    .version(packageJson.version)
    .help()
    .parse();
};

const ValidateDirectoriesArgsSchema = z.object({
  directories: z.array(z.string()),
  shell: z.string().optional()
});


/**
 * Mutable per-session state. In stdio mode there is a single session
 * (`primarySession`); in SSE mode each connection gets its own SessionState so
 * the active working directory selected by one client cannot leak into another.
 */
export interface SessionState {
  activeCwd: string | undefined;
}

class CLIServer {
  private server: Server;
  private config: ServerConfig;
  // State for the primary (stdio) session. Each SSE connection carries its own
  // SessionState instead (see createServerInstance / run).
  private primarySession: SessionState = { activeCwd: undefined };
  // Cache resolved configurations for performance
  private resolvedConfigs: Map<string, ResolvedShellConfig> = new Map();
  // Log storage manager
  private logStorage?: LogStorageManager;
  // HTTP server reference for SSE mode cleanup
  private httpServer?: import('http').Server;
  // Stored SIGINT handler reference for cleanup removal
  private sigintHandler?: () => Promise<void>;

  constructor(config: ServerConfig) {
    this.config = config;
    // Build the primary server (used for stdio mode and shutdown). In SSE mode a
    // fresh instance is created per connection via createServerInstance().
    this.server = this.createServerInstance();

    // Pre-resolve enabled shell configurations
    this.initializeShellConfigs();

    // Initialize server working directory
    this.initializeWorkingDirectory();

    // Initialize log storage whenever logging is configured (resource exposure controlled separately)
    if (this.config.global.logging) {
      this.logStorage = new LogStorageManager(this.config.global.logging);
      this.logStorage.startCleanup();
      
      // Log storage location info (always log to stderr for security awareness)
      const logDir = this.config.global.logging.logDirectory;
      if (logDir) {
        // Always warn about file-based logging since it may contain sensitive data
        errorLog(`WARNING: Command output logs will be stored in: ${logDir}`);
        errorLog(`WARNING: Log files may contain sensitive information from command output.`);
      } else {
        debugLog('Log storage: in-memory only (no logDirectory configured)');
      }
    }
  }

  /**
   * Backwards-compatible accessor for the primary session's active working
   * directory. Stdio-mode code paths, initialization, and tests read and write
   * `serverActiveCwd`; it now proxies to `primarySession`. SSE connections each
   * carry their own SessionState (see createServerInstance / _executeTool), so
   * concurrent SSE clients no longer share a directory.
   */
  private get serverActiveCwd(): string | undefined {
    return this.primarySession.activeCwd;
  }

  private set serverActiveCwd(value: string | undefined) {
    this.primarySession.activeCwd = value;
  }

  /**
   * Create a fully-wired MCP Server instance. Used for the primary server and,
   * in SSE mode, for the per-connection server handed to createSseServer(). Each
   * instance gets its own request handlers; all handlers close over `this`, so
   * they share the CLIServer's config, resolved shells, and log storage. The
   * `session` argument holds the per-instance mutable state (active working
   * directory); it defaults to the primary session used by stdio mode.
   */
  private createServerInstance(session: SessionState = this.primarySession): Server {
    const server = new Server({
      name: "wcli0",
      version: packageJson.version,
    }, {
      capabilities: {
        tools: {},
        resources: {}
      }
    });
    this.setupHandlers(server, session);
    return server;
  }

  private initializeShellConfigs(): void {
    for (const [shellName, shellConfig] of Object.entries(this.config.shells)) {
      if (shellConfig?.enabled) {
        const resolved = getResolvedShellConfig(this.config, shellName as keyof ServerConfig['shells']);
        if (resolved) {
          this.resolvedConfigs.set(shellName, resolved);
        }
      }
    }
  }

  private initializeWorkingDirectory(): void {
    let candidateCwd: string | undefined = undefined;
    let chdirFailed = false;
    const startupMessages: string[] = [];

    // Try initial directory if configured
    if (this.config.global.paths.initialDir && typeof this.config.global.paths.initialDir === 'string') {
      try {
        process.chdir(this.config.global.paths.initialDir);
        candidateCwd = this.config.global.paths.initialDir;
        startupMessages.push(`INFO: Successfully changed current working directory to configured initialDir: ${candidateCwd}`);
      } catch (err: any) {
        startupMessages.push(`ERROR: Failed to change directory to configured initialDir '${this.config.global.paths.initialDir}': ${err?.message}. Falling back to process CWD.`);
        chdirFailed = true;
      }
    }

    // Fallback to process.cwd()
    if (!candidateCwd || chdirFailed) {
      candidateCwd = normalizeWindowsPath(process.cwd());
      if (chdirFailed) {
        startupMessages.push(`INFO: Current working directory remains: ${candidateCwd}`);
      }
    }

    // Check if CWD is allowed based on global config
    const restrictCwd = this.config.global.security.restrictWorkingDirectory;
    const globalAllowedPaths = this.config.global.paths.allowedPaths;

    if (restrictCwd && globalAllowedPaths.length > 0) {
      const isCandidateCwdAllowed = isPathAllowed(candidateCwd!, globalAllowedPaths);
      if (!isCandidateCwdAllowed) {
        this.serverActiveCwd = undefined;
        startupMessages.push(`INFO: Server's effective starting directory: ${candidateCwd}`);
        startupMessages.push("INFO: 'restrictWorkingDirectory' is enabled, and this directory is not in the configured 'allowedPaths'.");
        startupMessages.push("INFO: The server's active working directory is currently NOT SET.");
        startupMessages.push("INFO: To run commands that don't specify a 'workingDir', you must first set a valid working directory using the 'set_current_directory' tool.");
        startupMessages.push(`INFO: Configured allowed paths are: ${globalAllowedPaths.join(', ')}`);
      } else {
        this.serverActiveCwd = candidateCwd;
        startupMessages.push(`INFO: Server's active working directory initialized to: ${this.serverActiveCwd}.`);
      }
    } else {
      this.serverActiveCwd = candidateCwd;
      startupMessages.push(`INFO: Server's active working directory initialized to: ${this.serverActiveCwd}.`);
    }

    startupMessages.forEach(msg => debugLog(msg));
  }

  private getShellConfig(shellName: string): ResolvedShellConfig | null {
    return this.resolvedConfigs.get(shellName) || null;
  }

  private getEnabledShells(): string[] {
    // Return shells that are both loaded in the registry AND enabled in config
    const configShells = Array.from(this.resolvedConfigs.keys());
    const loadedShells = shellRegistry.getShellTypes();

    // If registry is empty, return all config shells (backward compatibility)
    // Once fully migrated, this will enforce that shells must be in registry
    if (loadedShells.length === 0) {
      return configShells;
    }

    // Intersection: shells that are in both lists
    return configShells.filter(shell => loadedShells.includes(shell));
  }

  private validateSingleCommand(context: ValidationContext, command: string): void {
    if (context.shellConfig.security.enableInjectionProtection) {
      validateShellOperators(command, context);
    }

    const { command: executable, args } = parseCommand(command);

    if (isCommandBlocked(executable, context)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Command is blocked for ${context.shellName}: "${extractCommandName(executable)}"`
      );
    }

    if (isArgumentBlocked(args, context)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `One or more arguments are blocked for ${context.shellName}. Check configuration for blocked patterns.`
      );
    }

    if (command.length > context.shellConfig.security.maxCommandLength) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Command exceeds maximum length of ${context.shellConfig.security.maxCommandLength} for ${context.shellName}`
      );
    }
  }

  private validateCommand(context: ValidationContext, command: string, workingDir: string): void {
    const steps = command.split(/\s*&&\s*/);
    let currentDir = normalizePathForShell(workingDir, context);

    for (const step of steps) {
      const trimmed = step.trim();
      if (!trimmed) continue;

      this.validateSingleCommand(context, trimmed);

      const { command: executable, args } = parseCommand(trimmed);
      if ((executable.toLowerCase() === 'cd' || executable.toLowerCase() === 'chdir') && args.length) {
        // Normalize the target path for the shell type
        let target = normalizePathForShell(args[0], context);

        // If relative, resolve against current directory
        if (!path.isAbsolute(target) && !target.startsWith('/')) {
          if (context.isWindowsShell) {
            target = path.win32.resolve(currentDir, target);
          } else {
            target = path.posix.resolve(currentDir, target);
          }
        }

        // Validate the new directory
        validateWorkingDirectoryWithContext(target, context);
        currentDir = target;
      }
    }
  }

  private logValidationFailure(command: string, shellName: string, workingDir: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    debugLog(`[execute_command] Validation failed for shell ${shellName}: ${message}. Command: ${command}`);

    if (!this.logStorage) {
      return;
    }

    this.logStorage.storeLog(
      command,
      shellName,
      workingDir,
      '',
      `Validation error: ${message}`,
      -1
    );
  }

  /**
   * Resolve a working directory to an absolute path anchored to this session's
   * active directory. A relative `workingDir` would otherwise be handed to
   * spawn({ cwd }) verbatim and resolved against the process-global cwd, which
   * set_current_directory mutates via process.chdir(). Because that global is
   * shared by every concurrent SSE session, one client's set_current_directory
   * could silently change the base another client's relative path resolves
   * against. Anchoring relative paths to session.activeCwd keeps each session
   * isolated. Absolute paths (Windows drive/UNC or POSIX/WSL `/`-rooted) are
   * returned unchanged, as is any path when the session has no active directory.
   */
  private resolveWorkingDirForSession(workingDir: string, session: SessionState): string {
    const isAbsolute = workingDir.startsWith('/') || path.win32.isAbsolute(workingDir);
    if (isAbsolute) {
      return workingDir;
    }
    const base = session.activeCwd;
    if (!base) {
      return workingDir;
    }
    // Resolve with the path flavor of the base so the result keeps the base's
    // separator style (POSIX for `/`-rooted WSL paths, Windows otherwise).
    return base.startsWith('/')
      ? path.posix.resolve(base, workingDir)
      : path.win32.resolve(base, workingDir);
  }

  private async executeShellCommand(
    shellName: string,
    shellConfig: ResolvedShellConfig,
    command: string,
    workingDir: string,
    maxOutputLines?: number,
    timeout?: number,
    profile?: string
  ): Promise<CallToolResult> {
    // Resolve the selected profile's environment before spawning so an invalid
    // selection surfaces as an InvalidParams error to the client. An omitted or
    // empty profile resolves to {} and preserves the pre-feature environment.
    let profileEnv: Record<string, string>;
    try {
      profileEnv = resolveProfileEnv(
        this.config.profiles,
        profile,
        shellConfig.type,
        process.env
      );
    } catch (err) {
      if (err instanceof ProfileSelectionError) {
        throw new McpError(ErrorCode.InvalidParams, err.message);
      }
      throw err;
    }

    return new Promise((resolve, reject) => {
      let shellProcess: ReturnType<typeof spawn>;
      let spawnArgs: string[];

      if (shellConfig.type === 'wsl') {
        const parsedCommand = parseCommand(command);
        spawnArgs = [...shellConfig.executable.args, parsedCommand.command, ...parsedCommand.args];
      } else {
        spawnArgs = [...shellConfig.executable.args, command];
      }

      try {
        // For WSL, convert WSL paths back to Windows paths for spawn cwd
        let spawnCwd = workingDir;
        let envVars = { ...process.env, ...profileEnv };
        if (shellConfig.type === 'wsl') {
          // Convert paths when on native Windows or when the executable is a
          // Windows binary (.exe). On WSL2 (Linux Node), only .exe-suffixed
          // commands are Windows interop binaries; other launchers need Linux paths.
          const isWindowsExe = process.platform === 'win32' ||
            shellConfig.executable.command.toLowerCase().endsWith('.exe');
          if (isWindowsExe) {
            if (workingDir.startsWith('/mnt/')) {
              const match = workingDir.match(/^\/mnt\/([a-z])\/(.*)$/i);
              if (match) {
                const drive = match[1].toUpperCase();
                const pathPart = match[2].replace(/\//g, '\\');
                spawnCwd = `${drive}:\\${pathPart}`;
              }
            } else if (workingDir.startsWith('/')) {
              spawnCwd = process.cwd();
            }
          }
          // Pass original WSL path to emulator via environment variable
          envVars.WSL_ORIGINAL_PATH = workingDir;
        } else if (shellConfig.type === 'gitbash') {
          // Normalize Git Bash paths like /c/foo to Windows format for spawn
          spawnCwd = normalizeWindowsPath(workingDir);
        }
        
        shellProcess = spawn(
          shellConfig.executable.command,
          spawnArgs,
          {
            cwd: spawnCwd,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: envVars
          }
        );
      } catch (err) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to start ${shellName} process: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      let output = '';
      let error = '';

      shellProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });

      shellProcess.stderr?.on('data', (data) => {
        error += data.toString();
      });

      shellProcess.on('close', (code) => {
        clearTimeout(timeoutHandle);

        // Combine output for storage and truncation
        const stdout = output;
        const stderr = error;
        let fullOutput = '';

        if (code === 0) {
          fullOutput = stdout || '';
        } else {
          const parts: string[] = [];
          if (code !== null && code !== undefined) {
            parts.push(`Command failed with exit code ${code}`);
          }
          if (stderr) {
            parts.push(`Error output:\n${stderr}`);
          }
          if (stdout) {
            parts.push(`Standard output:\n${stdout}`);
          }
          fullOutput = parts.join('\n');
        }

        // Handle empty output case
        if (!fullOutput) {
          fullOutput = 'Command completed successfully (no output)';
        }

        // Store log if enabled
        let executionId: string | undefined;
        let logFilePath: string | undefined;
        if (this.logStorage) {
          executionId = this.logStorage.storeLog(command, shellName, workingDir, stdout, stderr, code ?? -1);
          const storedEntry = this.logStorage.getLog(executionId);
          logFilePath = storedEntry?.filePath;
        }

        // Truncate output if enabled
        let resultMessage: string;
        let wasTruncated = false;
        let totalLines = 0;
        let returnedLines = 0;

        if (this.config.global.logging?.enableTruncation) {
          // Determine effective maxOutputLines with precedence:
          // 1. Command-level parameter (if provided)
          // 2. Global configuration (if set)
          // 3. Default value (20)
          const effectiveMaxOutputLines =
            maxOutputLines ??
            this.config.global.logging.maxOutputLines ??
            20;

          const truncated = truncateOutput(
            fullOutput,
            effectiveMaxOutputLines,
            {
              maxOutputLines: effectiveMaxOutputLines,
              enableTruncation: true,
              truncationMessage: this.config.global.logging.truncationMessage
            },
            executionId,
            logFilePath,
            Boolean(this.config.global.logging?.exposeFullPath),
            Boolean(this.config.global.logging?.enableLogResources),
            this.config.global.logging?.logDirectory
          );

          resultMessage = formatTruncatedOutput(truncated);
          wasTruncated = truncated.wasTruncated;
          totalLines = truncated.totalLines;
          returnedLines = truncated.returnedLines;
        } else {
          resultMessage = fullOutput;
          const lines = fullOutput.split('\n');
          totalLines = lines.length;
          returnedLines = lines.length;
        }

        resolve({
          content: [{
            type: 'text',
            text: resultMessage
          }],
          isError: code !== 0,
          metadata: {
            exitCode: code ?? -1,
            shell: shellName,
            workingDirectory: workingDir,
            executionId: executionId,
            totalLines: totalLines,
            returnedLines: returnedLines,
            wasTruncated: wasTruncated,
            // Only expose filePath when exposeFullPath is true (consistent with get_command_output)
            filePath: logFilePath && this.config.global.logging?.exposeFullPath
              ? logFilePath
              : undefined
          }
        });
      });

      shellProcess.on('error', (err) => {
        clearTimeout(timeoutHandle);
        reject(new McpError(
          ErrorCode.InternalError,
          `${shellName} process error: ${err.message}`
        ));
      });

      // Use provided timeout or fall back to shell's default timeout
      const effectiveTimeout = timeout ?? shellConfig.security.commandTimeout;
      const timeoutHandle = setTimeout(() => {
        shellProcess.kill();
        reject(new McpError(
          ErrorCode.InternalError,
          `Command execution timed out after ${effectiveTimeout} seconds in ${shellName}`
        ));
      }, effectiveTimeout * 1000);
    });
  }

  /**
   * Creates a structured copy of the configuration for external use
   * @returns A serializable version of the configuration
   */
  private getSafeConfig(): any {
    return createSerializableConfig(this.config);
  }

  private setupHandlers(server: Server = this.server, session: SessionState = this.primarySession): void {
    // List available resources
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources: Array<{uri:string,name:string,description:string,mimeType:string}> = [];
      
      // Add resources for configuration
      resources.push({
        uri: "cli://config",
        name: "CLI Server Configuration",
        description: "Complete server configuration with global and shell-specific settings",
        mimeType: "application/json"
      });

      resources.push({
        uri: "cli://config/global",
        name: "Global Configuration",
        description: "Global default settings applied to all shells",
        mimeType: "application/json"
      });
      
      // Add shell-specific configuration resources for each enabled shell
      const enabledShells = this.getEnabledShells();
      for (const shellName of enabledShells) {
        resources.push({
          uri: `cli://config/shells/${shellName}`,
          name: `${shellName} Shell Configuration`,
          description: `Resolved configuration for ${shellName} shell`,
          mimeType: "application/json"
        });
      }
      
      // Add security information resource
      resources.push({
        uri: "cli://info/security",
        name: "Security Information",
        description: "Current security settings and restrictions",
        mimeType: "application/json"
      });

      // Add log resources if enabled
      if (this.config.global.logging?.enableLogResources && this.logStorage) {
        // List resource
        resources.push({
          uri: 'cli://logs/list',
          name: 'Command Execution Logs List',
          description: 'List all stored command execution logs with metadata',
          mimeType: 'application/json'
        });

        // Recent resource
        resources.push({
          uri: 'cli://logs/recent',
          name: 'Recent Command Logs',
          description: 'Get most recent command execution logs (supports ?n=<count> and ?shell=<shell>)',
          mimeType: 'application/json'
        });

        // Add individual log resources
        const logs = this.logStorage.listLogs();
        logs.forEach(log => {
          resources.push({
            uri: `cli://logs/commands/${log.id}`,
            name: `Log: ${log.command.substring(0, 50)}${log.command.length > 50 ? '...' : ''}`,
            description: `Full output from: ${log.command} (${log.shell}, exit code: ${log.exitCode})`,
            mimeType: 'text/plain'
          });
        });
      }

      return { resources };
    });

    // Provide an empty list of resource templates for now
    server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
      return { resourceTemplates: [] };
    });

    // Read resource content
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      
      // Handle CLI configuration resource
      if (uri === "cli://config") {
        // Create a structured copy of config for external use
        const safeConfig = this.getSafeConfig();
        
        return {
          contents: [{
            uri,
            mimeType: "application/json",
            text: JSON.stringify(safeConfig, null, 2)
          }]
        };
      }
      
      // Handle global configuration
      if (uri === "cli://config/global") {
        const globalConfig = createSerializableConfig({
          global: this.config.global,
          shells: {} // Add empty shells object to satisfy ServerConfig type
        });
        
        return {
          contents: [{
            uri,
            mimeType: "application/json",
            text: JSON.stringify(globalConfig.global, null, 2)
          }]
        };
      }
      
      // Handle shell-specific configuration
      const shellMatch = uri.match(/^cli:\/\/config\/shells\/([a-zA-Z0-9_-]+)$/);
      if (shellMatch) {
        const shellName = shellMatch[1];
        const resolved = this.getShellConfig(shellName);
        
        if (!resolved) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Shell '${shellName}' not found or not enabled`
          );
        }
        
        const shellInfo = createResolvedConfigSummary(shellName, resolved);
        
        return {
          contents: [{
            uri,
            mimeType: "application/json",
            text: JSON.stringify(shellInfo, null, 2)
          }]
        };
      }
      
      // Handle security information
      if (uri === "cli://info/security") {
        const securityInfo: any = {
          globalSettings: {
            restrictWorkingDirectory: this.config.global.security.restrictWorkingDirectory,
            enableInjectionProtection: this.config.global.security.enableInjectionProtection,
            maxCommandLength: this.config.global.security.maxCommandLength,
            defaultCommandTimeout: this.config.global.security.commandTimeout
          },
          globalAllowedPaths: this.config.global.paths.allowedPaths,
          enabledShells: this.getEnabledShells(),
          shellSpecificSettings: {}
        };

        // Add shell-specific security settings
        for (const [shellName, config] of this.resolvedConfigs.entries()) {
          securityInfo.shellSpecificSettings[shellName] = {
            timeout: config.security.commandTimeout,
            maxCommandLength: config.security.maxCommandLength,
            restrictedPaths: config.paths.allowedPaths,
            blockedCommands: config.restrictions.blockedCommands,
            blockedOperators: config.restrictions.blockedOperators
          };
        }

        return {
          contents: [{
            uri,
            mimeType: "application/json",
            text: JSON.stringify(securityInfo, null, 2)
          }]
        };
      }

      // Handle log resources
      if (uri.startsWith('cli://logs/')) {
        if (!this.config.global.logging?.enableLogResources) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            'Log resources are disabled in configuration'
          );
        }

        if (!this.logStorage) {
          throw new McpError(
            ErrorCode.InternalError,
            'Log storage not initialized'
          );
        }

        const handler = new LogResourceHandler(
          this.logStorage,
          this.config.global.logging
        );

        try {
          return await handler.handleRead(uri);
        } catch (error) {
          if (error instanceof Error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              error.message
            );
          }
          throw error;
        }
      }

      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown resource URI: ${uri}`
      );
    });

    // List available tools with dynamic descriptions and schemas
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      // Get enabled shells and their resolved configurations
      const enabledShells = this.getEnabledShells();
      const tools = [];

      // Add execute_command tool with dynamic description and schema
      if (enabledShells.length > 0) {
        const maxOutputLines = this.config.global.logging?.maxOutputLines ?? 20;
        const executeCommandDescription = buildExecuteCommandDescription(this.resolvedConfigs, maxOutputLines, this.config.profiles);
        const executeCommandSchema = buildExecuteCommandSchema(enabledShells, this.resolvedConfigs, this.config.profiles);
        
        debugLog(`[tool: execute_command] Description:\n${executeCommandDescription}`);
        
        tools.push({
          name: "execute_command",
          description: executeCommandDescription,
          inputSchema: executeCommandSchema
        });
      }

      // Add get_command_output tool whenever logging is enabled (resources optional)
      if (this.logStorage) {
        tools.push({
          name: "get_command_output",
          description: buildGetCommandOutputDescription(),
          inputSchema: buildGetCommandOutputSchema()
        });
      }

      // Add directory management tools
      tools.push({
        name: "get_current_directory",
        description: "Get the current working directory",
        inputSchema: { type: "object", properties: {} }
      });
      
      tools.push({
        name: "set_current_directory",
        description: "Set the current working directory",
        inputSchema: { 
          type: "object", 
          properties: { 
            path: { type: "string", description: "Path to set as current working directory" } 
          },
          required: ["path"]
        }
      });
      
      // Add get_config with enhanced description
      tools.push({
        name: "get_config",
        description: buildGetConfigDescription(),
        inputSchema: { type: "object", properties: {} }
      });
      
      // Add validate_directories only when path restrictions are enabled
      if (this.config.global.security.restrictWorkingDirectory) {
        const validateDescription = buildValidateDirectoriesDescription(enabledShells.length > 0);
        const validateSchema = buildValidateDirectoriesSchema(enabledShells);
        
        tools.push({
          name: "validate_directories",
          description: validateDescription,
          inputSchema: validateSchema
        });
      }
      
      return { tools };
    });

    // Handle tool execution
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Directly call the public tool execution logic, scoped to this server
      // instance's session so the active working directory stays per-session.
      return this._executeTool(request.params, session);
    });
  }

  // Public method for testing or direct invocation of tool logic. `session`
  // defaults to the primary session so existing callers (stdio, tests) are
  // unaffected; SSE handlers pass their own per-connection SessionState.
  public async _executeTool(
    toolParams: CallToolRequest['params'],
    session: SessionState = this.primarySession
  ): Promise<CallToolResult> { // Changed return type
    try {
      switch (toolParams.name) {
        case "execute_command": {
          const enabledShells = this.getEnabledShells();
          if (enabledShells.length === 0) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              'No shells are enabled in the configuration'
            );
          }

          const args = z.object({
            shell: z.enum(enabledShells as [string, ...string[]]),
            command: z.string(),
            workingDir: z.string().optional(),
            maxOutputLines: z.number().optional(),
            timeout: z.number().optional(),
            profile: z.string().optional()
          }).parse(toolParams.arguments);

          // Validate maxOutputLines if provided
          if (args.maxOutputLines !== undefined) {
            if (!Number.isInteger(args.maxOutputLines)) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `maxOutputLines must be an integer, got: ${typeof args.maxOutputLines}`
              );
            }
            if (args.maxOutputLines < 1) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `maxOutputLines must be at least 1, got: ${args.maxOutputLines}`
              );
            }
            if (args.maxOutputLines > 10000) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `maxOutputLines cannot exceed 10000, got: ${args.maxOutputLines}`
              );
            }
          }

          // Validate timeout if provided
          if (args.timeout !== undefined) {
            if (!Number.isInteger(args.timeout)) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `timeout must be an integer, got: ${typeof args.timeout}`
              );
            }
            if (args.timeout < 1) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `timeout must be at least 1 second, got: ${args.timeout}`
              );
            }
            if (args.timeout > 3600) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `timeout cannot exceed 3600 seconds (1 hour), got: ${args.timeout}`
              );
            }
          }

          const shellConfig = this.getShellConfig(args.shell);
          if (!shellConfig) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Shell '${args.shell}' is not configured or enabled`
            );
          }

          const context = createValidationContext(args.shell, shellConfig);

          let workingDir: string;
          if (args.workingDir) {
            workingDir = normalizePathForShell(args.workingDir, context);
            // Anchor a relative workingDir to this session's active directory so
            // it never resolves against the shared process-global cwd (which
            // another SSE session can change via set_current_directory).
            workingDir = this.resolveWorkingDirForSession(workingDir, session);
            if (shellConfig.security.restrictWorkingDirectory) {
              try {
                validateWorkingDirectoryWithContext(workingDir, context);
              } catch (error: any) {
                throw new McpError(
                  ErrorCode.InvalidRequest,
                  `Working directory validation failed: ${error.message}`
                );
              }
            }
          } else {
            if (!session.activeCwd) {
              return {
                content: [{
                  type: "text",
                  text: "Error: Server's active working directory is not set. Please use the 'set_current_directory' tool to establish a valid working directory before running commands without an explicit 'workingDir'."
                }],
                isError: true,
                metadata: {}
              };
            }
            workingDir = session.activeCwd;

            if (shellConfig.security.restrictWorkingDirectory) {
              try {
                validateWorkingDirectoryWithContext(workingDir, context);
              } catch (error: any) {
                return {
                  content: [{
                    type: "text",
                    text: `Error: Current directory '${workingDir}' is not allowed for shell '${args.shell}'. ${error.message}`
                  }],
                  isError: true,
                  metadata: {}
                };
              }
            }
          }

          try {
            this.validateCommand(context, args.command, workingDir);
          } catch (error) {
            this.logValidationFailure(args.command, args.shell, workingDir, error);
            throw error;
          }

          return this.executeShellCommand(args.shell, shellConfig, args.command, workingDir, args.maxOutputLines, args.timeout, args.profile);
        }

        case "get_current_directory": {
          if (!session.activeCwd) {
            return {
              content: [{
                type: "text",
                text: "The server's active working directory is not currently set. Use 'set_current_directory' to set it."
              }],
              isError: false,
              metadata: {}
            };
          }
          const currentDir = session.activeCwd;
          return {
            content: [{
              type: "text",
              text: currentDir
            }],
            isError: false,
            metadata: {}
          };
        }

        case "set_current_directory": {
          const args = z.object({
            path: z.string()
          }).parse(toolParams.arguments);

          // Normalize the path (Windows style for server's internal use)
          const newDir = normalizeWindowsPath(args.path);

          // Validate against global allowed paths
          try {
            if (this.config.global.security.restrictWorkingDirectory) {
              if (!isPathAllowed(newDir, this.config.global.paths.allowedPaths)) {
                throw new Error(
                  `Directory must be within allowed paths: ${this.config.global.paths.allowedPaths.join(', ')}`
                );
              }
            }

            // Store the actual previous directory for metadata
            const actualPreviousDir = session.activeCwd;

            // Change directory and update the session's state. process.chdir is
            // process-global, but command execution always uses an explicit cwd
            // resolved from session.activeCwd, so concurrent SSE sessions keep
            // independent working directories for routing.
            process.chdir(newDir);
            session.activeCwd = newDir;

            return {
              content: [{
                type: "text",
                text: `Current directory changed to: ${newDir}`
              }],
              isError: false,
              metadata: {
                previousDirectory: actualPreviousDir || undefined,
                newDirectory: newDir
              }
            };
          } catch (error) {
            return {
              content: [{
                type: "text",
                text: `Failed to change directory: ${error instanceof Error ? error.message : String(error)}`
              }],
              isError: true,
              metadata: {
                requestedDirectory: args.path
              }
            };
        }
      }

      case "validate_directories": {
        if (!this.config.global.security.restrictWorkingDirectory) {
          return {
            content: [{
              type: "text",
              text: "Directory validation is disabled because 'restrictWorkingDirectory' is not enabled in the server configuration."
            }],
            isError: true,
            metadata: {}
          };
        }

        try {
          // Build schema dynamically based on enabled shells
          const enabledShells = this.getEnabledShells();
          const schema = z.object({
            directories: z.array(z.string()).min(1),
            shell: enabledShells.length > 0 
              ? z.enum([...enabledShells] as [string, ...string[]]).optional()
              : z.string().optional()
          });
          
          const args = schema.parse(toolParams.arguments);
          const { directories } = args;
          const shellName = args.shell;

          if (shellName) {
            const shellConfig = this.getShellConfig(shellName);
            if (!shellConfig) {
              return {
                content: [{
                  type: "text",
                  text: `Shell '${shellName}' is not configured or enabled`
                }],
                isError: true,
                metadata: {}
              };
            }

            const context = createValidationContext(shellName, shellConfig);
            const invalidDirs: string[] = [];

            for (const dir of directories) {
              try {
                validateWorkingDirectoryWithContext(dir, context);
              } catch (error) {
                invalidDirs.push(dir);
              }
            }

            if (invalidDirs.length > 0) {
              return {
                content: [{
                  type: "text",
                  text: `The following directories are invalid for ${shellName}: ${invalidDirs.join(', ')}. Allowed paths: ${shellConfig.paths.allowedPaths.join(', ')}`
                }],
                isError: true,
                metadata: { invalidDirectories: invalidDirs, shell: shellName }
              };
            }
          } else {
            validateDirectoriesAndThrow(directories, this.config.global.paths.allowedPaths);
          }

          return {
            content: [{
              type: "text",
              text: "All specified directories are valid and within allowed paths."
            }],
            isError: false,
            metadata: {}
          };
        } catch (error: any) {
          if (error instanceof z.ZodError) {
            return {
              content: [{
                type: "text",
                text: `Invalid arguments for validate_directories: ${error.errors.map(e => `${e.path.join('.')} - ${e.message}`).join(', ')}`
              }],
              isError: true,
              metadata: {}
            };
          } else if (error instanceof McpError) {
            return {
              content: [{
                type: "text",
                text: error.message
              }],
              isError: true,
              metadata: {}
            };
          } else {
            return {
              content: [{
                type: "text",
                text: `An unexpected error occurred during directory validation: ${error.message || String(error)}`
              }],
              isError: true,
              metadata: {}
            };
          }
        }
      }


      case "get_command_output": {
        if (!this.logStorage) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            'Log storage is not enabled. Enable logging to retrieve command output.'
          );
        }

        const loggingConfig: Partial<LoggingConfig> = this.config.global.logging ?? {};
        const maxReturnLines = loggingConfig.maxReturnLines ?? 500;
        const maxReturnBytes = loggingConfig.maxReturnBytes ?? loggingConfig.maxLogSize ?? 1024 * 1024;

        const args = z.object({
          executionId: z.string(),
          startLine: z.number().int().min(1).optional(),
          endLine: z.number().int().min(1).optional(),
          search: z.string().optional(),
          maxLines: z.number().int().min(1).max(10000).optional()
        }).parse(toolParams.arguments);

        const log = this.logStorage.getLog(args.executionId);

        if (!log) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Log entry not found: ${args.executionId}. It may have expired.`
          );
        }

        const normalizedOutput = log.combinedOutput.replace(/\r\n/g, '\n');
        const originalTotalLines = normalizedOutput.split('\n').length;
        let lines = normalizedOutput.split('\n');

        const start = args.startLine ?? 1;
        const end = args.endLine ?? lines.length;
        if (start > end) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `startLine (${start}) must be less than or equal to endLine (${end})`
          );
        }
        lines = lines.slice(start - 1, end);

        if (args.search) {
          let regex: RegExp;
          try {
            regex = new RegExp(args.search, 'i');
          } catch (error) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Invalid search pattern: ${error instanceof Error ? error.message : String(error)}`
            );
          }

          lines = lines.filter(line => regex.test(line));
          if (lines.length === 0) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `No matches found for pattern: ${args.search}`
            );
          }
        }

        const effectiveMaxLines = Math.min(args.maxLines ?? maxReturnLines, maxReturnLines);
        const lineLimited = lines.length > effectiveMaxLines;
        const candidateLines = lineLimited ? lines.slice(0, effectiveMaxLines) : lines;

        // Build headers first (they must fit as well)
        const header: string[] = [];
        if (lineLimited) {
          header.push(`[Output truncated to ${effectiveMaxLines} lines of ${lines.length}]`);
        }

        // Apply byte-size guardrail to full response (headers + lines)
        let byteLimited = false;
        let byteTotal = 0;
        let outputText = '';
        const returnedLinesArr: string[] = [];

        const appendWithLimit = (line: string, countAsReturned: boolean) => {
          const addition = outputText.length === 0 ? line : `\n${line}`;
          const chunkBytes = Buffer.byteLength(addition, 'utf8');
          if (byteTotal + chunkBytes > maxReturnBytes) {
            return false;
          }
          byteTotal += chunkBytes;
          outputText += addition;
          if (countAsReturned) {
            returnedLinesArr.push(line);
          }
          return true;
        };

        const byteNotice = `[Output truncated to fit ${maxReturnBytes} bytes]`;

        for (const h of header) {
          if (!appendWithLimit(h, false)) {
            // Even the header doesn't fit; fall back to a minimal notice
            outputText = byteNotice;
            byteLimited = true;
            break;
          }
        }

        if (!byteLimited) {
          for (const line of candidateLines) {
            if (!appendWithLimit(line, true)) {
              byteLimited = true;
              break;
            }
          }
        }

        if (byteLimited && outputText === '') {
          outputText = byteNotice;
        }
        const filePath = log.filePath
          ? (loggingConfig.exposeFullPath ? log.filePath : undefined)
          : undefined;

        return {
          content: [{
            type: 'text',
            text: outputText
          }],
          isError: false,
          metadata: {
            executionId: args.executionId,
            totalLines: originalTotalLines,
            returnedLines: returnedLinesArr.length,
            wasTruncated: lineLimited || byteLimited,
            command: log.command,
            shell: log.shell,
            exitCode: log.exitCode,
            filePath,
            truncatedByBytes: byteLimited
          }
        };
      }


      case "get_config": {
        const safeConfig = createSerializableConfig(this.config);

        return {
          content: [{
            type: "text",
            text: JSON.stringify(safeConfig, null, 2)
          }],
          isError: false,
          metadata: {}
        };
      }

        default:
          throw new McpError(
            ErrorCode.InvalidRequest,
            // Use type assertion to handle potential undefined name, though schema should ensure it
            `Unknown tool: ${(toolParams as { name: string }).name}`
          );
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid arguments: ${err.errors.map(e => e.message).join(', ')}`
        );
      }
      throw err;
    }
  }

  async cleanup(): Promise<void> {
    // Remove SIGINT handler
    if (this.sigintHandler) {
      process.removeListener('SIGINT', this.sigintHandler);
      this.sigintHandler = undefined;
    }
    // Disconnect the MCP transport. In stdio mode this removes the 'data'
    // listener that StdioServerTransport attaches to process.stdin (which keeps
    // stdin in flowing mode and the process alive); in SSE mode it ends the
    // active SSE response. Best-effort: the server may never have been connected.
    try {
      await this.server.close();
    } catch {
      // ignore - server may not be connected to a transport
    }
    // StdioServerTransport.close() only removes its stdin 'data' listener; it
    // does not take stdin out of flowing mode, so the stdin handle stays
    // referenced and keeps the process alive. Pause it explicitly so the event
    // loop can drain. Only stdio mode ever touches stdin, so the HTTP-based
    // transports (sse, http) are left alone.
    const transportMode = this.config.transport?.mode;
    if (transportMode !== 'sse' && transportMode !== 'http') {
      process.stdin.pause();
    }
    // Close the HTTP server (used by both the sse and http transports). The
    // shared closeHttpServer() force-destroys lingering sockets so long-lived
    // /sse or /mcp streams cannot hang shutdown or keep the port bound.
    if (this.httpServer) {
      const { closeHttpServer } = await import('./utils/httpShared.js');
      await closeHttpServer(this.httpServer);
      this.httpServer = undefined;
    }
    // Stop and clear log storage
    if (this.logStorage) {
      this.logStorage.stopCleanup();
      this.logStorage.clear();
    }
  }

  async run(): Promise<void> {
    if (this.config.transport?.mode === 'sse') {
      const { createSseServer } = await import('./utils/transport.js');
      const host = this.config.transport.sseHost ?? '127.0.0.1';
      const port = this.config.transport.ssePort ?? 9444;
      const allowedOrigins = this.config.transport.sseAllowedOrigins ?? [];
      this.httpServer = await createSseServer(
        // Each SSE connection gets a fresh SessionState seeded from the primary
        // session's initial cwd, so one client's set_current_directory cannot
        // change another client's active working directory.
        () => this.createServerInstance({ activeCwd: this.primarySession.activeCwd }),
        host,
        port,
        allowedOrigins
      );
      debugLog(`Windows CLI MCP Server running on SSE at http://${host}:${port}`);
    } else if (this.config.transport?.mode === 'http') {
      const { createStreamableHttpServer } = await import('./utils/streamableHttp.js');
      const host = this.config.transport.httpHost ?? '127.0.0.1';
      const port = this.config.transport.httpPort ?? 9444;
      const allowedOrigins = this.config.transport.httpAllowedOrigins ?? [];
      this.httpServer = await createStreamableHttpServer(
        // Each Streamable HTTP session gets a fresh SessionState seeded from the
        // primary session's initial cwd, so one client's set_current_directory
        // cannot change another client's active working directory.
        () => this.createServerInstance({ activeCwd: this.primarySession.activeCwd }),
        host,
        port,
        allowedOrigins
      );
      debugLog(`Windows CLI MCP Server running on Streamable HTTP at http://${host}:${port}/mcp`);
    } else {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      debugLog("Windows CLI MCP Server running on stdio");
    }

    // Set up cleanup handler
    this.sigintHandler = async () => {
      await this.cleanup();
      process.exit(0);
    };
    process.on('SIGINT', this.sigintHandler);
  }
}

// Start server
const main = async () => {
  try {
    const args = await parseArgs();

    // Set debug logging based on CLI argument
    setDebugLogging(Boolean(args.debug));

    // Initialize modular shell system
    // If --shell is specified, only load that shell; otherwise use build config
    const buildConfig = getBuildConfig();
    const shellsToLoad = args.shell 
      ? [args.shell as string]
      : buildConfig.includedShells;
    
    await loadShells({
      shells: shellsToLoad,
      verbose: buildConfig.verbose || Boolean(args.debug)
    });
    debugLog(`Loaded ${shellRegistry.getCount()} shell modules: ${shellRegistry.getShellTypes().join(', ')}`);

    // Handle --init-config flag
    if (args['init-config']) {
      try {
        createDefaultConfig(args['init-config'] as string);
        errorLog(`Created default config at: ${args['init-config']}`);
        process.exit(0);
      } catch (error) {
        errorLog('Failed to create config file:', error);
        process.exit(1);
      }
    }

    // Load configuration
    const config = loadConfig(args.config, Boolean(args.allowAllDirs));

    // Apply command line override for initialDir
    applyCliInitialDir(config, args.initialDir as string | undefined);
    applyCliShellAndAllowedDirs(
      config,
      args.shell as string | undefined,
      args.allowedDir as string[] | undefined
    );
    applyCliSecurityOverrides(
      config,
      args.maxCommandLength as number | undefined,
      args.commandTimeout as number | undefined
    );
    applyCliRestrictions(
      config,
      args.blockedCommand as string[] | undefined,
      args.blockedArgument as string[] | undefined,
      args.blockedOperator as string[] | undefined
    );
    applyCliWslMountPoint(config, args.wslMountPoint as string | undefined);
    applyCliLogging(
      config,
      args.maxOutputLines as number | undefined,
      args.enableTruncation as boolean | undefined,
      args.enableLogResources as boolean | undefined,
      args.maxReturnLines as number | undefined,
      args.logDirectory as string | undefined
    );
    applyDebugLogDirectory(config, Boolean(args.debug));
    applyCliUnsafeMode(config, {
      unsafe: args.unsafe as boolean | undefined,
      yolo: args.yolo as boolean | undefined
    });
    applyCliTransport(
      config,
      args.transport as string | undefined,
      args['sse-host'] as string | undefined,
      args['sse-port'] as number | undefined,
      args['sse-allowed-origins'] as string | undefined,
      args['http-host'] as string | undefined,
      args['http-port'] as number | undefined,
      args['http-allowed-origins'] as string | undefined
    );

    const server = new CLIServer(config);
    await server.run();
  } catch (error) {
    errorLog("Fatal error:", error);
    process.exit(1);
  }
};

// For ES modules, run main() only when executed directly via Node
// This avoids starting the server when the module is imported in tests
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
} else if (process.argv[1]) {
  // Handle case where the script is run via symlink (e.g., global npm install)
  try {
    const resolvedPath = realpathSync(process.argv[1]);
    if (import.meta.url === pathToFileURL(resolvedPath).href) {
      main();
    }
  } catch {
    // If symlink resolution fails, don't run main()
  }
}

export { CLIServer, main };
