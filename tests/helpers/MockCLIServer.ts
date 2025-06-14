import path from 'path';
import { ServerConfig, ResolvedShellConfig } from '../../src/types/config.js';
import { getResolvedShellConfig } from '../../src/utils/config.js';
import { createValidationContext } from '../../src/utils/validationContext.js';
import {
  parseCommand,
  extractCommandName,
  validateShellOperators,
  normalizeWindowsPath,
  isCommandBlocked,
  isArgumentBlocked
} from '../../src/utils/validation.js';
import { validateWorkingDirectory } from '../../src/utils/pathValidation.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const validateCommandCallHistory: { command: string, workingDir: string }[] = [];
const MAX_VALIDATE_CMD_HISTORY_SIZE = 5;
const VALIDATE_CMD_RECURSION_THRESHOLD = 2;

export class MockCLIServer {
  private resolvedConfigs: Map<string, ResolvedShellConfig> = new Map();
  
  constructor(public config: ServerConfig) {
    // Pre-resolve all shell configurations
    for (const [shellName, shellConfig] of Object.entries(config.shells)) {
      if (shellConfig?.enabled) {
        const resolved = getResolvedShellConfig(config, shellName as keyof ServerConfig['shells']);
        if (resolved) {
          this.resolvedConfigs.set(shellName, resolved);
        }
      }
    }
  }

  getResolvedConfig(shellName: string): ResolvedShellConfig | null {
    return this.resolvedConfigs.get(shellName) || null;
  }

  private validateSingleCommand(shellName: string, resolved: ResolvedShellConfig, command: string): void {
    const context = createValidationContext(shellName, resolved);
    
    if (resolved.security.enableInjectionProtection) {
      validateShellOperators(command, context);
    }

    const { command: executable, args } = parseCommand(command);

    if (isCommandBlocked(executable, context)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Command is blocked: "${extractCommandName(executable)}"`
      );
    }

    if (isArgumentBlocked(args, context)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'One or more arguments are blocked. Check configuration for blocked patterns.'
      );
    }

    if (command.length > resolved.security.maxCommandLength) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Command exceeds maximum length of ${resolved.security.maxCommandLength}`
      );
    }
  }

  validateCommand(shellName: string, command: string, workingDir: string): void {
    const normalizePathCallStack: Set<string> = new Set(); // Call stack for normalizeWindowsPath calls within this validateCommand execution
    // Debugging: Track call history for validateCommand
    const currentCall = { command, workingDir };
    validateCommandCallHistory.push(currentCall);
    if (validateCommandCallHistory.length > MAX_VALIDATE_CMD_HISTORY_SIZE) {
        validateCommandCallHistory.shift();
    }
    const occurrences = validateCommandCallHistory.filter(c => c.command === command && c.workingDir === workingDir).length;
    if (occurrences >= VALIDATE_CMD_RECURSION_THRESHOLD && validateCommandCallHistory.length >= VALIDATE_CMD_RECURSION_THRESHOLD) {
        const historyString = validateCommandCallHistory.map(c => `(cmd: '${c.command}', wd: '${c.workingDir}')`).join(" -> ");
        const historyCopy = [...validateCommandCallHistory];
        validateCommandCallHistory.length = 0; // Clear for next tests
        throw new Error(`MockCLIServer.validateCommand: Potential recursion detected. Call with (cmd: '${command}', wd: '${workingDir}') appeared ${occurrences} times in the last ${historyCopy.length} calls. History: [${historyString}]`);
    }

    const resolved = this.getResolvedConfig(shellName);
    if (!resolved) {
      throw new Error(`Shell ${shellName} not found or not enabled`);
    }
    
    const context = createValidationContext(shellName, resolved);

    const steps = command.split(/\s*&&\s*/);
    let currentDir = normalizeWindowsPath(workingDir);

    for (const step of steps) {
      const trimmed = step.trim();
      if (!trimmed) continue;

      this.validateSingleCommand(shellName, resolved, trimmed);

      const { command: executable, args } = parseCommand(trimmed);
      if ((executable.toLowerCase() === 'cd' || executable.toLowerCase() === 'chdir') && args.length) {
        const cdArg = args[0];
           
        let pathForNormalization: string;

        // Check if cdArg is a Git Bash style absolute path (e.g., /c/foo)

        const gitBashMatch = cdArg.match(/^\/([a-zA-Z])(\/.*)?$/);
        const isWSLAbsolutePath = !gitBashMatch && cdArg.startsWith('/');
        const isWin32Absolute = path.win32.isAbsolute(cdArg);


        if (gitBashMatch) {
          // It's a Git Bash path (e.g., /c/foo), normalizeWindowsPath will handle its conversion
          pathForNormalization = cdArg; 

        } else if (isWSLAbsolutePath) {
          // It's a WSL absolute path (e.g., /mnt/c/foo or /home/user)
          // normalizeWindowsPath will handle it (preserving forward slashes)
          pathForNormalization = cdArg;

        } else if (path.win32.isAbsolute(cdArg)) {
          // It's a Windows absolute path (e.g., C:\foo)
          pathForNormalization = cdArg;

        } else {
          // It's a relative path
          if (cdArg === '..') {
            const normalizedCurrentDir = normalizeWindowsPath(currentDir); // Ensure currentDir is in a consistent format for checks
            const isWindowsRoot = /^[a-zA-Z]:\\$/.test(normalizedCurrentDir);
            const isWslRoot = normalizedCurrentDir === '/';
            const isUncRoot = /^\\\\[^\\\\]+\\[^\\\\]+$/.test(normalizedCurrentDir);

            if (isWindowsRoot || isWslRoot || isUncRoot) {
              pathForNormalization = normalizedCurrentDir; // Stay at root

            } else {
              // Not at a root, resolve '..' normally
              pathForNormalization = path.resolve(currentDir, cdArg);

            }
          } else {
            // Relative path, but not '..', resolve normally
            pathForNormalization = path.resolve(currentDir, cdArg);

          }
        }
        
        let target = normalizeWindowsPath(pathForNormalization);


        if (resolved.security.restrictWorkingDirectory) {
          validateWorkingDirectory(target, context);
        }
        currentDir = target;
      }
    }
  }
}
