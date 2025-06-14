import path from 'path';
import type { ValidationContext } from './validationContext.js';
import { normalizeWindowsPath, isPathAllowed, convertWindowsToWslPath } from './validation.js';
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { getExpectedPathFormat } from './validationContext.js';

/**
 * Normalize path based on shell type
 */
export function normalizePathForShell(inputPath: string, context: ValidationContext): string {
  const pathFormat = getExpectedPathFormat(context);
  
  switch (pathFormat) {
    case 'windows':
      return normalizeWindowsPath(inputPath);
      
    case 'unix':
      // For pure Unix shells, ensure forward slashes
      if (context.isWslShell && /^[A-Z]:\\/.test(inputPath)) {
        const mount = context.shellConfig.wslConfig?.mountPoint ?? '/mnt/';
        return convertWindowsToWslPath(inputPath, mount);
      }
      return inputPath.replace(/\\/g, '/');
      
    case 'mixed':
      // Git Bash: Try to determine format and normalize accordingly
      if (inputPath.match(/^[A-Z]:\\/i) || inputPath.includes('\\')) {
        return normalizeWindowsPath(inputPath);
      }
      return inputPath.replace(/\\/g, '/');
      
    default:
      return inputPath;
  }
}

/**
 * Validate working directory for specific shell
 */
export function validateWorkingDirectory(
  dir: string,
  context: ValidationContext
): void {
  // Check if restrictions are enabled
  if (!context.shellConfig.security.restrictWorkingDirectory) {
    return;
  }
  
  const allowedPaths = context.shellConfig.paths.allowedPaths;
  if (allowedPaths.length === 0) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `No allowed paths configured for ${context.shellName}`
    );
  }
  
  // Normalize the directory path for validation
  const normalizedDir = normalizePathForShell(dir, context);
  
  // Validate based on path format
  if (context.isWslShell) {
    validateWslPath(normalizedDir, allowedPaths, context);
  } else if (context.isWindowsShell) {
    validateWindowsPath(normalizedDir, allowedPaths, context);
  } else {
    // Git Bash or other mixed format shells
    validateMixedPath(normalizedDir, allowedPaths, context);
  }
}

/**
 * Validate WSL-specific paths
 */
function validateWslPath(
  dir: string,
  allowedPaths: string[],
  context: ValidationContext
): void {
  if (!dir.startsWith('/')) {
    dir = convertWindowsToWslPath(
      dir,
      context.shellConfig.wslConfig?.mountPoint ?? '/mnt/'
    );
  }

  // After conversion, ensure still absolute
  if (!dir.startsWith('/')) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'WSL working directory must be an absolute path (starting with /)'
    );
  }
  
  // Check against allowed paths
  const isAllowed = allowedPaths.some(allowed => {
    // Direct match or subdirectory
    return dir === allowed || 
           dir.startsWith(allowed.endsWith('/') ? allowed : allowed + '/');
  });
  
  if (!isAllowed) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `WSL working directory must be within allowed paths: ${allowedPaths.join(', ')}`
    );
  }
}

/**
 * Validate Windows-specific paths
 */
function validateWindowsPath(
  dir: string,
  allowedPaths: string[],
  context: ValidationContext
): void {
  // Windows paths should be normalized already
  if (!path.win32.isAbsolute(dir)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'Working directory must be an absolute path'
    );
  }
  
  if (!isPathAllowed(dir, allowedPaths)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Working directory must be within allowed paths: ${allowedPaths.join(', ')}`
    );
  }
}

/**
 * Validate mixed format paths (Git Bash)
 */
function validateMixedPath(
  dir: string,
  allowedPaths: string[],
  context: ValidationContext
): void {
  // Git Bash can use both Windows and Unix paths
  const isWindowsFormat = /^[A-Z]:\\/i.test(dir) || dir.includes('\\');
  const isUnixFormat = dir.startsWith('/');
  
  if (!isWindowsFormat && !isUnixFormat) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'Working directory must be an absolute path'
    );
  }
  
  // Check against allowed paths (which might be in either format)
  const isAllowed = allowedPaths.some(allowed => {
    if (isWindowsFormat && (allowed.includes('\\') || /^[A-Z]:/i.test(allowed))) {
      // Both are Windows format
      return isPathAllowed(dir, [allowed]);
    } else if (isUnixFormat && allowed.startsWith('/')) {
      // Both are Unix format
      return dir === allowed || 
             dir.startsWith(allowed.endsWith('/') ? allowed : allowed + '/');
    } else if (isWindowsFormat && allowed.startsWith('/')) {
      // Convert Git Bash Unix path to Windows for comparison
      const convertedAllowed = convertGitBashToWindows(allowed);
      return isPathAllowed(dir, [convertedAllowed]);
    } else if (isUnixFormat && (allowed.includes('\\') || /^[A-Z]:/i.test(allowed))) {
      // Convert Windows to Git Bash Unix path for comparison
      const convertedAllowed = convertWindowsToGitBash(allowed);
      return dir === convertedAllowed || 
             dir.startsWith(convertedAllowed.endsWith('/') ? convertedAllowed : convertedAllowed + '/');
    }
    return false;
  });
  
  if (!isAllowed) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Working directory must be within allowed paths: ${allowedPaths.join(', ')}`
    );
  }
}

/**
 * Convert Git Bash Unix-style path to Windows
 */
function convertGitBashToWindows(gitBashPath: string): string {
  // /c/Users/test -> C:\Users\test
  const match = gitBashPath.match(/^\/([a-z])\/(.*)$/i);
  if (match) {
    const drive = match[1].toUpperCase();
    const rest = match[2].replace(/\//g, '\\');
    return `${drive}:\\${rest}`;
  }
  return gitBashPath;
}

/**
 * Convert Windows path to Git Bash Unix-style
 */
function convertWindowsToGitBash(windowsPath: string): string {
  // C:\Users\test -> /c/Users/test
  const match = windowsPath.match(/^([A-Z]):\\(.*)$/i);
  if (match) {
    const drive = match[1].toLowerCase();
    const rest = match[2].replace(/\\/g, '/');
    return `/${drive}/${rest}`;
  }
  return windowsPath;
}
