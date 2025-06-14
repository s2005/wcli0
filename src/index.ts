#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  CallToolResult, // Changed from CallToolResultPayload
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
import { readFileSync } from 'fs';
import path from 'path';
import { buildToolDescription } from './utils/toolDescription.js';
import { buildExecuteCommandSchema, buildValidateDirectoriesSchema } from './utils/toolSchemas.js';
import { buildExecuteCommandDescription, buildValidateDirectoriesDescription, buildGetConfigDescription } from './utils/toolDescription.js';
import { loadConfig, createDefaultConfig, getResolvedShellConfig } from './utils/config.js';
import { createSerializableConfig, createResolvedConfigSummary } from './utils/configUtils.js';
import type { ServerConfig, ResolvedShellConfig, GlobalConfig } from './types/config.js';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

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
    .help()
    .parse();
};

const ValidateDirectoriesArgsSchema = z.object({
  directories: z.array(z.string()),
  shell: z.string().optional()
});


class CLIServer {
  private server: Server;
  private config: ServerConfig;
  private serverActiveCwd: string | undefined;
  // Cache resolved configurations for performance
  private resolvedConfigs: Map<string, ResolvedShellConfig> = new Map();

  constructor(config: ServerConfig) {
    this.config = config;
    this.server = new Server({
      name: "windows-cli-server",
      version: packageJson.version,
    }, {
      capabilities: {
        tools: {},
        resources: {}
      }
    });

    // Pre-resolve enabled shell configurations
    this.initializeShellConfigs();

    // Initialize server working directory
    this.initializeWorkingDirectory();

    this.setupHandlers();
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

    startupMessages.forEach(msg => console.error(msg));
  }

  private getShellConfig(shellName: string): ResolvedShellConfig | null {
    return this.resolvedConfigs.get(shellName) || null;
  }

  private getEnabledShells(): string[] {
    return Array.from(this.resolvedConfigs.keys());
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

  private async executeShellCommand(
    shellName: string,
    shellConfig: ResolvedShellConfig,
    command: string,
    workingDir: string
  ): Promise<CallToolResult> {
    return new Promise((resolve, reject) => {
      let shellProcess: ReturnType<typeof spawn>;
      let spawnArgs: string[];

      if (shellName === 'wsl') {
        const parsedCommand = parseCommand(command);
        spawnArgs = [...shellConfig.executable.args, parsedCommand.command, ...parsedCommand.args];
      } else {
        spawnArgs = [...shellConfig.executable.args, command];
      }

      try {
        // For WSL, convert WSL paths back to Windows paths for spawn cwd
        let spawnCwd = workingDir;
        let envVars = { ...process.env };
        if (shellName === 'wsl') {
          if (workingDir.startsWith('/mnt/')) {
            // Convert /mnt/c/path to C:\path
            const match = workingDir.match(/^\/mnt\/([a-z])\/(.*)$/i);
            if (match) {
              const drive = match[1].toUpperCase();
              const pathPart = match[2].replace(/\//g, '\\');
              spawnCwd = `${drive}:\\${pathPart}`;
            }
          } else if (workingDir.startsWith('/')) {
            // Pure Linux paths like /tmp - use current directory for spawn
            // and let emulator handle the path emulation
            spawnCwd = process.cwd();
          }
          // Pass original WSL path to emulator via environment variable
          envVars.WSL_ORIGINAL_PATH = workingDir;
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
        clearTimeout(timeout);

        let resultMessage = '';
        if (code === 0) {
          resultMessage = output || 'Command completed successfully (no output)';
        } else {
          resultMessage = `Command failed with exit code ${code}\n`;
          if (error) {
            resultMessage += `Error output:\n${error}\n`;
          }
          if (output) {
            resultMessage += `Standard output:\n${output}`;
          }
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
            workingDirectory: workingDir
          }
        });
      });

      shellProcess.on('error', (err) => {
        clearTimeout(timeout);
        reject(new McpError(
          ErrorCode.InternalError,
          `${shellName} process error: ${err.message}`
        ));
      });

      const timeout = setTimeout(() => {
        shellProcess.kill();
        reject(new McpError(
          ErrorCode.InternalError,
          `Command execution timed out after ${shellConfig.security.commandTimeout} seconds in ${shellName}`
        ));
      }, shellConfig.security.commandTimeout * 1000);
    });
  }

  /**
   * Creates a structured copy of the configuration for external use
   * @returns A serializable version of the configuration
   */
  private getSafeConfig(): any {
    return createSerializableConfig(this.config);
  }

  private setupHandlers(): void {
    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
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

      return { resources };
    });

    // Read resource content
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
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
      
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown resource URI: ${uri}`
      );
    });

    // List available tools with dynamic descriptions and schemas
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      // Get enabled shells and their resolved configurations
      const enabledShells = this.getEnabledShells();
      const tools = [];

      // Add execute_command tool with dynamic description and schema
      if (enabledShells.length > 0) {
        const executeCommandDescription = buildExecuteCommandDescription(this.resolvedConfigs);
        const executeCommandSchema = buildExecuteCommandSchema(enabledShells, this.resolvedConfigs);
        
        console.error(`[tool: execute_command] Description:\n${executeCommandDescription}`);
        
        tools.push({
          name: "execute_command",
          description: executeCommandDescription,
          inputSchema: executeCommandSchema
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
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Directly call the public tool execution logic
      return this._executeTool(request.params);
    });
  }

  // Public method for testing or direct invocation of tool logic
  public async _executeTool(toolParams: z.infer<typeof CallToolRequestSchema>['params']): Promise<CallToolResult> { // Changed return type
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
            workingDir: z.string().optional()
          }).parse(toolParams.arguments);

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
            if (!this.serverActiveCwd) {
              return {
                content: [{
                  type: "text",
                  text: "Error: Server's active working directory is not set. Please use the 'set_current_directory' tool to establish a valid working directory before running commands without an explicit 'workingDir'."
                }],
                isError: true,
                metadata: {}
              };
            }
            workingDir = this.serverActiveCwd;

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

          this.validateCommand(context, args.command, workingDir);

          return this.executeShellCommand(args.shell, shellConfig, args.command, workingDir);
        }

        case "get_current_directory": {
          if (!this.serverActiveCwd) {
            return {
              content: [{
                type: "text",
                text: "The server's active working directory is not currently set. Use 'set_current_directory' to set it."
              }],
              isError: false,
              metadata: {}
            };
          }
          const currentDir = this.serverActiveCwd;
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

            // Change directory and update server state
            process.chdir(newDir);
            this.serverActiveCwd = newDir;
            
            return {
              content: [{
                type: "text",
                text: `Current directory changed to: ${newDir}`
              }],
              isError: false,
              metadata: {
                previousDirectory: args.path,
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


      case "get_config": {
        const safeConfig = createSerializableConfig(this.config);

        const resolvedConfigs: any = {};
        for (const [shellName, resolved] of this.resolvedConfigs.entries()) {
          resolvedConfigs[shellName] = createResolvedConfigSummary(shellName, resolved);
        }

        const fullConfig = {
          configuration: safeConfig,
          resolvedShells: resolvedConfigs
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(fullConfig, null, 2)
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

  private async cleanup(): Promise<void> {
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    
    // Set up cleanup handler
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
    
    await this.server.connect(transport);
    console.error("Windows CLI MCP Server running on stdio");
  }
}

// Start server
const main = async () => {
  try {
    const args = await parseArgs();
    
    // Handle --init-config flag
    if (args['init-config']) {
      try {
        createDefaultConfig(args['init-config'] as string);
        console.error(`Created default config at: ${args['init-config']}`);
        process.exit(0);
      } catch (error) {
        console.error('Failed to create config file:', error);
        process.exit(1);
      }
    }

    // Load configuration
    const config = loadConfig(args.config);
    
    const server = new CLIServer(config);
    await server.run();
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
};

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}

export { CLIServer, main };
