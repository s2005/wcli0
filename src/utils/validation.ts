import path from 'path';
import type { ValidationContext } from './validationContext.js';
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"; // Import McpError and ErrorCode

export function extractCommandName(command: string): string {
    // Replace backslashes with forward slashes
    const normalizedCommand = command.replace(/\\/g, '/');
    // Remove any path components
    const basename = path.basename(normalizedCommand);
    // Remove extension
    return basename.replace(/\.(exe|cmd|bat)$/i, '').toLowerCase();
}

export function isCommandBlocked(command: string, context: ValidationContext): boolean {
    const commandName = extractCommandName(command.toLowerCase());
    const blockedCommands = context.shellConfig.restrictions.blockedCommands;
    
    return blockedCommands.some(blocked => {
        // Handle complex commands like "rm -rf /"
        if (blocked.includes(' ')) {
            return command.toLowerCase().startsWith(blocked.toLowerCase());
        }
        
        // Standard command blocking
        return commandName === blocked.toLowerCase() ||
               commandName === `${blocked.toLowerCase()}.exe` ||
               commandName === `${blocked.toLowerCase()}.cmd` ||
               commandName === `${blocked.toLowerCase()}.bat`;
    });
}

export function isArgumentBlocked(args: string[], context: ValidationContext): boolean {
    const blockedArguments = context.shellConfig.restrictions.blockedArguments;
    
    return args.some(arg => 
        blockedArguments.some(blocked => 
            new RegExp(`^${blocked}$`, 'i').test(arg)
        )
    );
}

/**
 * Validates a command for a specific shell, checking for shell-specific blocked operators
 */
export function validateShellOperators(command: string, context: ValidationContext): void {
    const blockedOperators = context.shellConfig.restrictions.blockedOperators;
    
    if (!blockedOperators || blockedOperators.length === 0) {
        return;
    }

    for (const op of blockedOperators) {
        const escapedOp = op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedOp);
        if (regex.test(command)) {
            throw new McpError(
                ErrorCode.InvalidRequest, 
                `Command contains blocked operator for ${context.shellName}: ${op}`
            );
        }
    }
}

/**
 * Parse a command string into command and arguments, properly handling paths with spaces and quotes
 */
export function parseCommand(fullCommand: string): { command: string; args: string[] } {
    fullCommand = fullCommand.trim();
    if (!fullCommand) {
        return { command: '', args: [] };
    }

    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    // Parse into tokens, preserving quoted strings
    for (let i = 0; i < fullCommand.length; i++) {
        const char = fullCommand[i];

        // Handle quotes
        if ((char === '"' || char === "'") && (!inQuotes || char === quoteChar)) {
            if (inQuotes) {
                tokens.push(current);
                current = '';
            }
            inQuotes = !inQuotes;
            quoteChar = inQuotes ? char : '';
            continue;
        }

        // Handle spaces outside quotes
        if (char === ' ' && !inQuotes) {
            if (current) {
                tokens.push(current);
                current = '';
            }
            continue;
        }

        current += char;
    }

    // Add any remaining token
    if (current) {
        tokens.push(current);
    }

    // Handle empty input
    if (tokens.length === 0) {
        return { command: '', args: [] };
    }

    // First, check if this is a single-token command
    if (!tokens[0].includes(' ') && !tokens[0].includes('\\')) {
        return {
            command: tokens[0],
            args: tokens.slice(1)
        };
    }

    // Special handling for Windows paths with spaces
    let commandTokens: string[] = [];
    let i = 0;

    // Keep processing tokens until we find a complete command path
    while (i < tokens.length) {
        commandTokens.push(tokens[i]);
        const potentialCommand = commandTokens.join(' ');

        // Check if this could be a complete command path
        if (/\.(exe|cmd|bat)$/i.test(potentialCommand) || 
            (!potentialCommand.includes('\\') && commandTokens.length === 1)) {
            return {
                command: potentialCommand,
                args: tokens.slice(i + 1)
            };
        }

        // If this is part of a path, keep looking
        if (potentialCommand.includes('\\')) {
            i++;
            continue;
        }

        // If we get here, treat the first token as the command
        return {
            command: tokens[0],
            args: tokens.slice(1)
        };
    }

    // If we get here, use all collected tokens as the command
    return {
        command: commandTokens.join(' '),
        args: tokens.slice(commandTokens.length)
    };
}

export function convertWindowsToWslPath(windowsPath: string, mountPoint: string = '/mnt/'): string {
  if (windowsPath.startsWith('\\\\') || windowsPath.startsWith('//')) {
    throw new Error('UNC paths are not supported for WSL conversion.');
  }

  const driveRegex = /^([a-zA-Z]):([\\/]?.*)$/;
  const match = windowsPath.match(driveRegex);

  if (match) {
    const driveLetter = match[1].toLowerCase();
    let restOfPath = match[2].replace(/\\/g, '/'); // Normalize to forward slashes

    // Remove all leading slashes and collapse duplicates within the path
    restOfPath = restOfPath.replace(/^\/+/g, '');
    restOfPath = restOfPath.replace(/\/+/g, '/');

    // Trim a single trailing slash
    if (restOfPath.endsWith('/')) {
      restOfPath = restOfPath.slice(0, -1);
    }

    // Ensure mountPoint ends with a slash
    const baseMount = mountPoint.endsWith('/') ? mountPoint : mountPoint + '/';

    if (!restOfPath) { // Path was just "C:" or "C:\" or "C:/"
        return `${baseMount}${driveLetter}`;
    }

    return `${baseMount}${driveLetter}/${restOfPath}`;
  }

  // Not a Windows drive path, return as-is
  return windowsPath;
}

export function resolveWslAllowedPaths(globalAllowedPaths: string[], context: ValidationContext): string[] {
  if (!context.isWslShell || !context.shellConfig.wslConfig) {
    return [];
  }
  const wslPaths: string[] = [];
  const mountPoint = context.shellConfig.wslConfig.mountPoint || '/mnt/';

  // Add directly configured WSL paths
  const shellAllowedPaths = context.shellConfig.paths.allowedPaths;
  if (shellAllowedPaths && shellAllowedPaths.length > 0) {
    shellAllowedPaths.forEach((p: string) => {
      if (!wslPaths.includes(p)) {
        wslPaths.push(p);
      }
    });
  }

  // Add converted global paths if enabled
  if (context.shellConfig.wslConfig.inheritGlobalPaths !== false) { // True or undefined
    globalAllowedPaths.forEach(globalPath => {
      try {
        const convertedPath = convertWindowsToWslPath(globalPath, mountPoint);
        // Add if not already present (either from shellAllowedPaths or a previous conversion)
        if (!wslPaths.includes(convertedPath)) {
          wslPaths.push(convertedPath);
        }
      } catch (error) {
        // Check if error is an instance of Error and has a message
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Skipping global path "${globalPath}" for WSL: ${message}`);
      }
    });
  }

  return wslPaths;
}

export function isWslPathAllowed(wslPath: string, allowedPaths: string[]): boolean {
  // Directly match against any Linux-style allowed paths
  for (const allowedPath of allowedPaths) {
    if (allowedPath.startsWith('/')) {
      if (wslPath === allowedPath || wslPath.startsWith(allowedPath + '/')) {
        return true;
      }
    }
  }

  // If the path is a mounted Windows drive (/mnt/x/...), convert to Windows format
  const mountMatch = wslPath.match(/^\/mnt\/([a-zA-Z])(\/.*)?$/);
  if (mountMatch) {
    const driveLetter = mountMatch[1].toUpperCase();
    const pathPart = mountMatch[2] || '';
    const windowsEquivalent = `${driveLetter}:${pathPart.replace(/\//g, '\\')}`;

    return isPathAllowed(windowsEquivalent, allowedPaths);
  }

  return false;
}

export function validateWslWorkingDirectory(dir: string, allowedPaths: string[]): void {
  if (!dir.startsWith('/')) {
    throw new Error('WSL working directory must be an absolute path (starting with /)');
  }

  if (!isWslPathAllowed(dir, allowedPaths)) {
    const allowedPathsStr = allowedPaths.join(', ');
    throw new Error(
      `WSL working directory must be within allowed paths: ${allowedPathsStr}`
    );
  }
}

export function isPathAllowed(testPath: string, allowedPaths: string[]): boolean {
    // Step 1: Normalize testPath
    let normalizedTestPath = normalizeWindowsPath(testPath).toLowerCase();
    normalizedTestPath = normalizedTestPath.replace(/[/\\]+$/, ''); // Remove ALL trailing slashes

    // Step 2: Iterate through allowedPaths
    return allowedPaths.some(allowedPath => {
        // Step 2a: Normalize current allowedPath
        let normalizedAllowedPath = normalizeWindowsPath(allowedPath).toLowerCase();
        normalizedAllowedPath = normalizedAllowedPath.replace(/[/\\]+$/, ''); // Remove ALL trailing slashes

        let comparisonResult = false;
        if (normalizedTestPath === normalizedAllowedPath) {
            comparisonResult = true;
        } else if (normalizedTestPath.startsWith(normalizedAllowedPath)) {
            const charAfterAllowedPath = normalizedTestPath[normalizedAllowedPath.length];
            if (charAfterAllowedPath === '/' || charAfterAllowedPath === '\\') {
                comparisonResult = true;
            }
        }

        if (comparisonResult) return true;

        // Fallback for other paths
        return false;
    });
}

// This function is now replaced by validateWorkingDirectory in pathValidation.ts
export function validateWindowsWorkingDirectory(dir: string, allowedPaths: string[]): void {
    const isWindowsDriveAbsolute = /^[a-zA-Z]:\\/.test(dir);
    if (!isWindowsDriveAbsolute && !path.isAbsolute(dir)) {
        throw new McpError(
            ErrorCode.InvalidRequest,
            'Working directory must be an absolute path'
        );
    }

    if (!isPathAllowed(dir, allowedPaths)) {
        const allowedPathsStr = allowedPaths.join(', ');
        throw new McpError(
            ErrorCode.InvalidRequest,
            `Working directory must be within allowed paths: ${allowedPathsStr}`
        );
    }
}

/**
 * Normalizes Windows paths to a consistent format
 * - Git Bash paths (/c/foo) → C:\\foo
 * - WSL paths (/mnt/..., /home/...) → preserved with forward slashes
 * - Single backslash paths (\\Users) → C:\\Users (relative to system drive)
 * - UNC paths (\\\\server\\share) → preserved
 * - Relative paths → resolved relative to C:\\
 */
export function normalizeWindowsPath(inputPath: string): string {
    // TEMPORARILY simplified for diagnostics, with WSL path distinction
    // console.log(`normalizeWindowsPath (simplified) INPUT: '${inputPath}'`);
    if (typeof inputPath !== 'string' || !inputPath.trim()) {
        // console.log(`normalizeWindowsPath (simplified) OUTPUT (empty for invalid): ''`);
        return '';
    }

    let tempPath = inputPath.trim();

    // Priority 1: Git Bash paths like /c/foo -> C:\foo
    const gitBashMatch = tempPath.match(/^\/([a-zA-Z])(\/.*)?$/);
    if (gitBashMatch) {
        const drive = gitBashMatch[1].toUpperCase();
        const pathPart = gitBashMatch[2] || '';
        tempPath = `${drive}:${pathPart.replace(/\//g, '\\')}`; // Convert slashes for path part
        // Proceed to common Windows-specific normalizations below
    }
    // Priority 2: WSL-like paths (e.g. /mnt/..., /home/..., /tmp, /etc/...)
    // These should retain forward slashes and are returned directly after basic forward-slash normalization.
    else if (tempPath.startsWith('/')) {
        const originalTrimmedPath = inputPath.trim();
        const originalEndsWithSlash = originalTrimmedPath.endsWith('/') && originalTrimmedPath !== '/';
        
        // Normalize multiple consecutive forward slashes to one
        tempPath = tempPath.replace(/\/\/+/g, '/');

        if (tempPath !== '/') { // Don't modify the root path "/"
            if (originalEndsWithSlash && !tempPath.endsWith('/')) {
                // If original had a trailing slash (and wasn't just "/"), and normalization removed it, add it back.
                tempPath += '/';
            } else if (!originalEndsWithSlash && tempPath.endsWith('/')) {
                // If original did not have a trailing slash, but normalization might have left one (e.g. from /foo// -> /foo/), remove it.
                tempPath = tempPath.slice(0, -1);
            }
        }
        // console.log(`normalizeWindowsPath (simplified) OUTPUT (WSL branch): '${tempPath}'`);
        return tempPath; // Return early, no further Windows normalization for WSL paths
    }
    // Priority 3: Other paths (assumed Windows or relative paths for Windows context)
    else {
        // Convert any forward slashes to backslashes for Windows paths
        tempPath = tempPath.replace(/\//g, '\\');

        // Handle paths starting with a single backslash (e.g. \Users\foo)
        if (tempPath.startsWith('\\') && !tempPath.startsWith('\\\\')) {
            tempPath = 'C:' + tempPath;
        }
    }

    // --- Windows Path Resolution and Normalization ---
    // At this point, tempPath is a Windows-style path string (e.g., "C:\\foo", "foo\\bar", "C:bar", "\\\\server\\share")
    // It might be absolute or relative. Slashes are backslashes.

    let resolvedPath: string;
    if (tempPath.startsWith('\\\\')) { // UNC Path
        resolvedPath = path.win32.normalize(tempPath);
    } else {
        const driveLetterOnly = tempPath.match(/^([a-zA-Z]):$/); // e.g. "C:"
        const driveLetterRelative = tempPath.match(/^([a-zA-Z]):(?![\\\/])(.*)$/); // e.g. C:foo
        const startsWithDrive = /^[a-zA-Z]:/.test(tempPath); // Does it start with C: or c: etc.

        if (path.win32.isAbsolute(tempPath)) {
            if (startsWithDrive) { // e.g. "C:\\foo"
                resolvedPath = path.win32.normalize(tempPath);
            } else { // Absolute but no drive, e.g. "\\foo\\bar". Tests expect C-rooting.
                resolvedPath = path.win32.resolve('C:\\', tempPath);
            }
        } else if (driveLetterOnly) { // "C:"
            resolvedPath = driveLetterOnly[1].toUpperCase() + ':\\';
        } else if (driveLetterRelative) { // "C:foo"
            resolvedPath = path.win32.normalize(driveLetterRelative[1].toUpperCase() + ':\\' + driveLetterRelative[2]);
        } else { // Truly relative path like "foo\\bar" or "..\\foo"
            // Tests expect these to be C-rooted.
            resolvedPath = path.win32.resolve('C:\\', tempPath);
        }
    }

    // Uppercase drive letter if present
    const finalDriveMatch = resolvedPath.match(/^([a-zA-Z]):(.*)$/);
    if (finalDriveMatch) {
        resolvedPath = finalDriveMatch[1].toUpperCase() + ':' + finalDriveMatch[2];
    }
    
    // Final trailing slash adjustment
    if (resolvedPath.endsWith('\\')) {
        const isDriveRoot = /^[a-zA-Z]:\\$/.test(resolvedPath); // C:\\
        const isUNCShareRootOnly = /^\\\\[^\\\\]+\\[^\\\\]+$/.test(resolvedPath); // \\\\server\\share

        if (!isDriveRoot && !isUNCShareRootOnly) { 
             resolvedPath = resolvedPath.slice(0, -1);
        }
    }
    return resolvedPath;
}

export function normalizeAllowedPaths(paths: string[]): string[] {
    // Step 1: Initial Normalization
    // For each path, normalize it with its own fresh history for normalizeWindowsPath
    const normalizedInputPaths = paths.map(p => normalizeWindowsPath(p).toLowerCase());

    // Step 2: Processing and Filtering
    const processedPaths: string[] = [];

    for (const currentPath of normalizedInputPaths) {
        // a. Create a version of currentPath without a trailing backslash
        const comparableCurrentPath = currentPath.replace(/\\$/, '');

        // b. Check for Duplicates
        if (processedPaths.some(existingPath => existingPath.replace(/\\$/, '') === comparableCurrentPath)) {
            continue;
        }

        // c. Check for Nesting (currentPath is child of an existing path)
        if (processedPaths.some(existingPath => {
            const comparableExistingPath = existingPath.replace(/\\$/, '');
            return comparableCurrentPath.startsWith(comparableExistingPath + '\\');
        })) {
            continue;
        }

        // d. Remove Existing Nested Children (existing path is child of currentPath)
        for (let i = processedPaths.length - 1; i >= 0; i--) {
            const comparableExistingPath = processedPaths[i].replace(/\\$/, '');
            if (comparableExistingPath.startsWith(comparableCurrentPath + '\\')) {
                processedPaths.splice(i, 1);
            }
        }
        
        // e. Add comparableCurrentPath (the version without the trailing slash)
        processedPaths.push(comparableCurrentPath);
    }

    // Step 3: Return
    return processedPaths;
}
