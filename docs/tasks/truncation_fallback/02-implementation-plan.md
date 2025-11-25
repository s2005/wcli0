# Implementation Plan: Truncation Fallback with File Logging & get_command_output Tool

## Overview

This document outlines the implementation plan for adding:

1. **File system logging** - Save truncated output to disk files
2. **`get_command_output` tool** - Retrieve full output via MCP tool
3. **Updated truncation messages** - Clear instructions for users

> **Note**: This plan incorporates all feedback from `03-plan-review.md` including security, error handling, and resource management concerns.

---

## Final Configuration Schema

```typescript
export interface LoggingConfig {
  // Existing fields
  enableLogResources?: boolean;
  maxStoredLogs?: number;        // Max log entries/files (default: 100)
  maxLogSize?: number;           // Max bytes per log (default: 1MB = 1048576)
  maxOutputLines?: number;       // Truncation threshold for execute_command
  enableTruncation?: boolean;
  truncationMessage?: string;

  // NEW fields
  logDirectory?: string;         // Enables file logging when set (e.g., "~/.wcli0/logs")
  logRetentionDays?: number;     // Days to keep logs (default: 7, range: 1-365)
  maxTotalLogSize?: number;      // Max total bytes for all logs (default: 100MB)
  maxReturnLines?: number;       // Max lines from get_command_output (default: 500)
  exposeFullPath?: boolean;      // Show full path in messages (default: false, security)
}
```

---

## Implementation Phases

### Phase 1: Configuration & Types

**Priority**: High | **Estimated**: 2-3 hours

#### 1.1 Update `src/types/config.ts`

Add new fields to `LoggingConfig` interface:

```typescript
export interface LoggingConfig {
  // Existing fields
  enableLogResources?: boolean;
  maxStoredLogs?: number;
  maxLogSize?: number;
  maxOutputLines?: number;
  enableTruncation?: boolean;
  truncationMessage?: string;

  // NEW fields
  logDirectory?: string;
  logRetentionDays?: number;
  maxTotalLogSize?: number;
  maxReturnLines?: number;
  exposeFullPath?: boolean;
}
```

#### 1.2 Update `src/types/logging.ts`

Add `filePath` to `CommandLogEntry`:

```typescript
export interface CommandLogEntry {
  // Existing fields...
  id: string;
  timestamp: Date;
  command: string;
  shell: string;
  workingDirectory: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  combinedOutput: string;
  totalLines: number;
  stdoutLines: number;
  stderrLines: number;
  size: number;
  wasTruncated: boolean;

  // NEW field
  filePath?: string;  // Path to log file on disk (if file logging enabled)
}
```

#### 1.3 Add Configuration Validation in `src/utils/config.ts`

```typescript
/**
 * Validate logging configuration with bounds checking
 * @throws Error if configuration is invalid
 */
function validateLoggingConfig(logging: LoggingConfig | undefined): void {
  if (!logging) return;

  // Validate logRetentionDays (1-365)
  if (logging.logRetentionDays !== undefined) {
    if (typeof logging.logRetentionDays !== 'number' ||
        !Number.isInteger(logging.logRetentionDays) ||
        logging.logRetentionDays < 1 ||
        logging.logRetentionDays > 365) {
      throw new Error('logRetentionDays must be an integer between 1 and 365');
    }
  }

  // Validate logDirectory (non-empty string, no traversal)
  if (logging.logDirectory !== undefined) {
    if (typeof logging.logDirectory !== 'string' ||
        logging.logDirectory.trim() === '') {
      throw new Error('logDirectory must be a non-empty string');
    }
    // Check for path traversal in original input
    const normalized = path.normalize(logging.logDirectory);
    if (normalized.includes('..')) {
      throw new Error('logDirectory must not contain path traversal (..)');
    }
    // Check for invalid characters (Windows)
    if (process.platform === 'win32') {
      const invalidChars = /[<>"|?*]/;
      if (invalidChars.test(logging.logDirectory.replace(/^[a-zA-Z]:/, ''))) {
        throw new Error('logDirectory contains invalid characters');
      }
    }
  }

  // Validate maxReturnLines (1-10000)
  if (logging.maxReturnLines !== undefined) {
    if (typeof logging.maxReturnLines !== 'number' ||
        !Number.isInteger(logging.maxReturnLines) ||
        logging.maxReturnLines < 1 ||
        logging.maxReturnLines > 10000) {
      throw new Error('maxReturnLines must be an integer between 1 and 10000');
    }
  }

  // Validate maxTotalLogSize (1MB - 1GB)
  if (logging.maxTotalLogSize !== undefined) {
    if (typeof logging.maxTotalLogSize !== 'number' ||
        logging.maxTotalLogSize < 1048576 ||
        logging.maxTotalLogSize > 1073741824) {
      throw new Error('maxTotalLogSize must be between 1MB and 1GB');
    }
  }

  // Validate exposeFullPath (boolean)
  if (logging.exposeFullPath !== undefined) {
    if (typeof logging.exposeFullPath !== 'boolean') {
      throw new Error('exposeFullPath must be a boolean');
    }
  }
}
```

#### Tests for Phase 1

**File**: `tests/unit/loggingConfigValidation.test.ts`

```typescript
describe('Logging config validation', () => {
  describe('logRetentionDays', () => {
    test('should accept valid values (1-365)');
    test('should reject negative values');
    test('should reject zero');
    test('should reject values > 365');
    test('should reject non-integer values');
    test('should use default 7 when undefined');
  });

  describe('logDirectory', () => {
    test('should accept valid absolute path');
    test('should accept path with ~ prefix');
    test('should reject empty string');
    test('should reject path traversal (..)');
    test('should reject invalid characters on Windows');
  });

  describe('maxReturnLines', () => {
    test('should accept valid values (1-10000)');
    test('should reject negative values');
    test('should reject values > 10000');
    test('should use default 500 when undefined');
  });

  describe('maxTotalLogSize', () => {
    test('should accept valid values (1MB-1GB)');
    test('should reject values < 1MB');
    test('should reject values > 1GB');
  });

  describe('exposeFullPath', () => {
    test('should accept true');
    test('should accept false');
    test('should reject non-boolean');
    test('should default to false');
  });
});
```

---

### Phase 2: File Logging in LogStorageManager

**Priority**: High | **Estimated**: 4-5 hours

#### 2.1 Update `src/utils/logStorage.ts`

**Key changes**:

- Use async file operations (non-blocking)
- Proper error handling (never crash)
- Path resolution and sanitization
- Newline normalization
- Storage limits enforcement

```typescript
import { promises as fs } from 'fs';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { debugLog, debugWarn } from './log.js';

export class LogStorageManager {
  private storage: LogStorage;
  private config: LoggingConfig;
  private cleanupTimer?: NodeJS.Timeout;
  
  // Cached resolved log directory
  private resolvedLogDir?: string;
  private logDirEnsured: boolean = false;

  constructor(config: LoggingConfig) {
    this.config = config;
    this.storage = {
      entries: new Map<string, CommandLogEntry>(),
      executionOrder: [],
      totalStorageSize: 0
    };
  }

  /**
   * Store a new command execution log
   * Memory storage is synchronous; file write is async (fire-and-forget)
   */
  public storeLog(
    command: string,
    shell: string,
    workingDir: string,
    stdout: string,
    stderr: string,
    exitCode: number
  ): string {
    const id = this.generateId();

    // Normalize line endings for consistency (fixes mixed \r\n and \n)
    const normalizedStdout = this.normalizeLineEndings(stdout);
    const normalizedStderr = this.normalizeLineEndings(stderr);
    const combinedOutput = this.combineOutput(normalizedStdout, normalizedStderr, exitCode);

    // Calculate metrics
    const stdoutLines = normalizedStdout ? normalizedStdout.split('\n').length : 0;
    const stderrLines = normalizedStderr ? normalizedStderr.split('\n').length : 0;
    const totalLines = combinedOutput.split('\n').length;

    // Create entry FIRST (before any file operations)
    const entry: CommandLogEntry = {
      id,
      timestamp: new Date(),
      command,
      shell,
      workingDirectory: workingDir,
      exitCode,
      stdout: normalizedStdout,
      stderr: normalizedStderr,
      combinedOutput,
      totalLines,
      stdoutLines,
      stderrLines,
      size: Buffer.byteLength(combinedOutput, 'utf8'),
      wasTruncated: false,
      filePath: undefined  // Set async if file logging enabled
    };

    // Store in memory (synchronous - fast)
    this.storage.entries.set(id, entry);
    this.storage.executionOrder.push(id);
    this.storage.totalStorageSize += entry.size;

    // Enforce in-memory limits
    this.enforceMemoryLimits();

    // Write to filesystem async (fire-and-forget, never blocks)
    if (this.config.logDirectory) {
      this.writeLogToFileAsync(id, entry)
        .then(filePath => {
          entry.filePath = filePath;
          debugLog(`Log file written: ${filePath}`);
        })
        .catch(err => {
          // Log error but don't crash - file logging is best-effort
          debugWarn(`Failed to write log file for ${id}: ${err.message}`);
        });
    }

    return id;
  }

  /**
   * Normalize line endings to \n for consistency
   */
  private normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  /**
   * Write log entry to filesystem asynchronously
   */
  private async writeLogToFileAsync(id: string, entry: CommandLogEntry): Promise<string> {
    const logDir = await this.ensureLogDirectoryAsync();
    const filePath = path.join(logDir, `${id}.log`);

    let content = entry.combinedOutput;

    // Enforce per-file size limit
    const maxSize = this.config.maxLogSize ?? 1048576; // 1MB default
    if (Buffer.byteLength(content, 'utf8') > maxSize) {
      content = this.truncateToSize(content, maxSize);
    }

    await fs.writeFile(filePath, content, 'utf8');

    // Enforce overall storage limits (async, best-effort)
    this.enforceFileLimitsAsync().catch(err => {
      debugWarn(`Failed to enforce file limits: ${err.message}`);
    });

    return filePath;
  }

  /**
   * Truncate content to fit within size limit, keeping the end (most relevant)
   */
  private truncateToSize(content: string, maxSize: number): string {
    const lines = content.split('\n');
    const header = `[Log truncated - exceeded ${maxSize} bytes]\n`;
    const headerSize = Buffer.byteLength(header, 'utf8');
    const targetSize = maxSize - headerSize;

    // Remove lines from start until we fit
    while (lines.length > 1 && Buffer.byteLength(lines.join('\n'), 'utf8') > targetSize) {
      lines.shift();
    }

    return header + lines.join('\n');
  }

  /**
   * Resolve and validate log directory path
   */
  private resolveLogDirectory(): string {
    let logDir = this.config.logDirectory!;

    // Expand ~ to home directory
    if (logDir.startsWith('~')) {
      logDir = path.join(os.homedir(), logDir.slice(1));
    }

    // Expand environment variables
    // Windows: %VAR%
    logDir = logDir.replace(/%([^%]+)%/g, (_, key) => process.env[key] || '');
    // Unix: $VAR or ${VAR}
    logDir = logDir.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (_, key) => process.env[key] || '');

    // Resolve to absolute path
    logDir = path.resolve(logDir);

    return logDir;
  }

  /**
   * Ensure log directory exists (async, with caching)
   */
  private async ensureLogDirectoryAsync(): Promise<string> {
    if (this.logDirEnsured && this.resolvedLogDir) {
      return this.resolvedLogDir;
    }

    const logDir = this.resolveLogDirectory();

    try {
      await fs.mkdir(logDir, { recursive: true });
      this.logDirEnsured = true;
      this.resolvedLogDir = logDir;
      debugLog(`Log directory ensured: ${logDir}`);
    } catch (err: any) {
      if (err.code !== 'EEXIST') {
        throw new Error(`Cannot create log directory '${logDir}': ${err.message}`);
      }
      this.logDirEnsured = true;
      this.resolvedLogDir = logDir;
    }

    return logDir;
  }

  /**
   * Get the file path for a log entry
   * Returns undefined if file logging disabled or file not yet written
   */
  public getLogFilePath(id: string): string | undefined {
    const entry = this.storage.entries.get(id);
    return entry?.filePath;
  }

  /**
   * Get display path (respects exposeFullPath setting)
   */
  public getDisplayPath(id: string, exposeFullPath: boolean): string | undefined {
    const filePath = this.getLogFilePath(id);
    if (!filePath) return undefined;
    return exposeFullPath ? filePath : path.basename(filePath);
  }

  /**
   * Clean up old log files based on retention policy
   * Returns count of deleted files, never throws
   */
  public async cleanupOldLogFiles(): Promise<number> {
    if (!this.config.logDirectory) return 0;

    try {
      const logDir = await this.ensureLogDirectoryAsync();
      const retentionDays = this.config.logRetentionDays ?? 7;
      const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - retentionMs;

      const files = await fs.readdir(logDir);
      let deletedCount = 0;

      for (const file of files) {
        if (!file.endsWith('.log')) continue;

        const filePath = path.join(logDir, file);

        try {
          const stats = await fs.stat(filePath);
          // Use mtimeMs for monotonic comparison (avoids timezone issues)
          if (stats.mtimeMs < cutoffTime) {
            await fs.unlink(filePath);
            deletedCount++;
            debugLog(`Deleted old log file: ${file}`);
          }
        } catch (fileErr: any) {
          // Log but continue with other files
          debugWarn(`Failed to process log file ${file}: ${fileErr.message}`);
        }
      }

      return deletedCount;
    } catch (err: any) {
      debugWarn(`Failed to cleanup log files: ${err.message}`);
      return 0;
    }
  }

  /**
   * Enforce file storage limits (count and total size)
   */
  private async enforceFileLimitsAsync(): Promise<void> {
    if (!this.config.logDirectory) return;

    const maxFiles = this.config.maxStoredLogs ?? 100;
    const maxTotalSize = this.config.maxTotalLogSize ?? 104857600; // 100MB

    try {
      const logDir = await this.ensureLogDirectoryAsync();
      const files = await fs.readdir(logDir);
      const logFiles = files.filter(f => f.endsWith('.log'));

      // Get file stats
      const fileStats: Array<{ name: string; path: string; size: number; mtime: number }> = [];
      let totalSize = 0;

      for (const file of logFiles) {
        const filePath = path.join(logDir, file);
        try {
          const stats = await fs.stat(filePath);
          fileStats.push({
            name: file,
            path: filePath,
            size: stats.size,
            mtime: stats.mtimeMs
          });
          totalSize += stats.size;
        } catch {
          // Skip files we can't stat
        }
      }

      // Sort by mtime (oldest first)
      fileStats.sort((a, b) => a.mtime - b.mtime);

      // Delete oldest files if over count limit
      while (fileStats.length > maxFiles) {
        const oldest = fileStats.shift()!;
        try {
          await fs.unlink(oldest.path);
          totalSize -= oldest.size;
          debugLog(`Deleted log file (count limit): ${oldest.name}`);
        } catch {
          // Continue even if delete fails
        }
      }

      // Delete oldest files if over size limit
      while (totalSize > maxTotalSize && fileStats.length > 0) {
        const oldest = fileStats.shift()!;
        try {
          await fs.unlink(oldest.path);
          totalSize -= oldest.size;
          debugLog(`Deleted log file (size limit): ${oldest.name}`);
        } catch {
          // Continue even if delete fails
        }
      }
    } catch (err: any) {
      debugWarn(`Failed to enforce file limits: ${err.message}`);
    }
  }

  /**
   * Start periodic cleanup timer
   */
  public startCleanupTimer(): void {
    this.stopCleanupTimer();

    if (!this.config.logDirectory) return;

    // Run cleanup every 24 hours
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldLogFiles().catch(err => {
        debugWarn(`Periodic cleanup failed: ${err.message}`);
      });
    }, 24 * 60 * 60 * 1000);

    // Don't prevent process exit
    this.cleanupTimer.unref();
  }

  /**
   * Stop cleanup timer
   */
  public stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  // ... existing methods (getLog, listLogs, etc.) ...
}
```

#### Tests for Phase 2

**File**: `tests/unit/logStorageFileLogging.test.ts`

```typescript
describe('LogStorageManager - File Logging', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wcli0-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('when logDirectory is configured', () => {
    test('should create log directory if it does not exist');
    test('should write log file with correct content');
    test('should use .log extension');
    test('should store filePath in entry after async write');
    test('should expand ~ to home directory');
    test('should expand environment variables');
    test('should resolve relative paths');
  });

  describe('when logDirectory is NOT configured', () => {
    test('should not write any files');
    test('should not set filePath in entry');
    test('should still store in memory');
  });

  describe('newline normalization', () => {
    test('should normalize \\r\\n to \\n');
    test('should normalize standalone \\r to \\n');
    test('should preserve \\n');
    test('should handle mixed line endings');
  });

  describe('size limits', () => {
    test('should truncate file if exceeds maxLogSize');
    test('should add truncation header when truncating');
    test('should keep end of output (most relevant)');
    test('should delete oldest files when exceeds maxStoredLogs');
    test('should delete oldest files when exceeds maxTotalLogSize');
  });

  describe('cleanupOldLogFiles', () => {
    test('should delete files older than retention period');
    test('should keep files newer than retention period');
    test('should return count of deleted files');
    test('should only delete .log files');
    test('should use default 7 days if logRetentionDays not set');
    test('should do nothing if logDirectory not configured');
    test('should not throw on permission errors');
    test('should continue if individual file delete fails');
  });

  describe('error handling', () => {
    test('should not crash on permission denied');
    test('should not crash on disk full');
    test('should log warning on write failure');
    test('should continue operation after file error');
  });

  describe('cleanup timer', () => {
    test('should start timer when startCleanupTimer called');
    test('should stop timer when stopCleanupTimer called');
    test('should not accumulate timers on repeated calls');
    test('should not prevent process exit (unref)');
  });

  describe('getDisplayPath', () => {
    test('should return full path when exposeFullPath is true');
    test('should return basename when exposeFullPath is false');
    test('should return undefined for non-existent entry');
  });
});
```

---

### Phase 3: Update Truncation Message

**Priority**: High | **Estimated**: 1-2 hours

#### 3.1 Update `src/utils/truncation.ts`

```typescript
/**
 * Builds a truncation message with template replacement
 * @param omittedLines - Number of lines omitted
 * @param totalLines - Total lines in output
 * @param returnedLines - Lines being returned
 * @param executionId - Optional execution ID for retrieval
 * @param template - Optional custom message template
 * @param displayPath - Optional display path (basename or full, based on config)
 */
export function buildTruncationMessage(
  omittedLines: number,
  totalLines: number,
  returnedLines: number,
  executionId?: string,
  template?: string,
  displayPath?: string
): string {
  const defaultTemplate = '[Output truncated: Showing last {returnedLines} of {totalLines} lines]';
  const messageTemplate = template || defaultTemplate;

  let message = messageTemplate
    .replace('{omittedLines}', omittedLines.toString())
    .replace('{totalLines}', totalLines.toString())
    .replace('{returnedLines}', returnedLines.toString());

  const parts: string[] = [];
  parts.push(message);
  parts.push(`[${omittedLines} lines omitted]`);

  if (executionId) {
    if (displayPath) {
      // File logging enabled - show file path as primary option
      parts.push(`[Full log saved to: ${displayPath}]`);
      parts.push(`[Alternative: use get_command_output tool with executionId "${executionId}"]`);
    } else {
      // Memory only - show tool as primary option
      parts.push(`[Full log id: ${executionId}]`);
      parts.push(`[To retrieve: use get_command_output tool with executionId "${executionId}"]`);
    }
  }

  return parts.join('\n');
}

/**
 * Truncates command output to a maximum number of lines
 * @param output - The full output string
 * @param maxLines - Maximum lines to return
 * @param config - Truncation configuration
 * @param executionId - Optional execution ID
 * @param displayPath - Optional file path for display (respects exposeFullPath)
 */
export function truncateOutput(
  output: string,
  maxLines: number,
  config: TruncationConfig,
  executionId?: string,
  displayPath?: string
): TruncatedOutput {
  // Normalize line endings first
  const normalizedOutput = output.replace(/\r\n/g, '\n');

  if (!normalizedOutput || normalizedOutput.length === 0) {
    return {
      output: '',
      wasTruncated: false,
      totalLines: 0,
      returnedLines: 0,
      message: null
    };
  }

  const lines = normalizedOutput.split('\n');
  const totalLines = lines.length;

  if (!config.enableTruncation || totalLines <= maxLines) {
    return {
      output: normalizedOutput,
      wasTruncated: false,
      totalLines,
      returnedLines: totalLines,
      message: null
    };
  }

  // Take last maxLines lines
  const truncatedLines = lines.slice(-maxLines);
  const truncatedOutput = truncatedLines.join('\n');
  const omittedLines = totalLines - maxLines;

  const message = buildTruncationMessage(
    omittedLines,
    totalLines,
    maxLines,
    executionId,
    config.truncationMessage,
    displayPath
  );

  return {
    output: truncatedOutput,
    wasTruncated: true,
    totalLines,
    returnedLines: maxLines,
    message
  };
}
```

#### Tests for Phase 3

**Update**: `tests/unit/truncation.test.ts`

```typescript
describe('buildTruncationMessage', () => {
  // Existing tests...

  describe('with displayPath (file logging)', () => {
    test('should include file path in message');
    test('should show tool as alternative');
    test('should use format: [Full log saved to: {path}]');
  });

  describe('without displayPath (memory only)', () => {
    test('should show tool as primary option');
    test('should use format: [Full log id: {id}]');
    test('should include tool instruction');
  });

  describe('path exposure', () => {
    test('should show only basename when exposeFullPath is false');
    test('should show full path when exposeFullPath is true');
  });
});

describe('truncateOutput', () => {
  // Existing tests...

  test('should normalize \\r\\n to \\n before counting');
  test('should pass displayPath to buildTruncationMessage');
});
```

---

### Phase 4: Add `get_command_output` Tool

**Priority**: High | **Estimated**: 3-4 hours

#### 4.1 Add tool description in `src/utils/toolDescription.ts`

```typescript
/**
 * Build get_command_output tool description
 */
export function buildGetCommandOutputDescription(): string {
  const lines: string[] = [];

  lines.push('Retrieve the full output from a previous command execution.');
  lines.push('');
  lines.push('Use this tool when command output was truncated and you need to see the complete result.');
  lines.push('The executionId is provided in the truncation message of the original command.');
  lines.push('');
  lines.push('**Parameters:**');
  lines.push('- `executionId` (required): The execution ID from the truncation message');
  lines.push('- `startLine` (optional): Start line number (1-based, default: 1)');
  lines.push('- `endLine` (optional): End line number (default: all remaining lines)');
  lines.push('- `search` (optional): Regex pattern to filter output lines');
  lines.push('- `maxLines` (optional): Max lines to return (default: 500)');
  lines.push('');
  lines.push('**Example - Get full output:**');
  lines.push('```json');
  lines.push('{');
  lines.push('  "executionId": "20251125-143022-a8f3"');
  lines.push('}');
  lines.push('```');
  lines.push('');
  lines.push('**Example - Get specific range:**');
  lines.push('```json');
  lines.push('{');
  lines.push('  "executionId": "20251125-143022-a8f3",');
  lines.push('  "startLine": 100,');
  lines.push('  "endLine": 200');
  lines.push('}');
  lines.push('```');
  lines.push('');
  lines.push('**Example - Search for errors:**');
  lines.push('```json');
  lines.push('{');
  lines.push('  "executionId": "20251125-143022-a8f3",');
  lines.push('  "search": "error|failed|exception"');
  lines.push('}');
  lines.push('```');

  return lines.join('\n');
}
```

#### 4.2 Add tool schema in `src/utils/toolSchemas.ts`

```typescript
/**
 * Build get_command_output tool schema
 */
export function buildGetCommandOutputSchema(): object {
  return {
    type: 'object',
    properties: {
      executionId: {
        type: 'string',
        description: 'The execution ID from a previous command (shown in truncation message)'
      },
      startLine: {
        type: 'number',
        description: 'Start line number (1-based, default: 1)'
      },
      endLine: {
        type: 'number',
        description: 'End line number (default: all remaining lines)'
      },
      search: {
        type: 'string',
        description: 'Regex pattern to filter output lines (case-insensitive)'
      },
      maxLines: {
        type: 'number',
        description: 'Maximum lines to return (default: 500, max: 10000)'
      }
    },
    required: ['executionId']
  };
}
```

#### 4.3 Add tool to tools list in `src/index.ts`

In `ListToolsRequestSchema` handler:

```typescript
// Add get_command_output tool if logging is enabled
if (this.config.global.logging?.enableLogResources && this.logStorage) {
  tools.push({
    name: "get_command_output",
    description: buildGetCommandOutputDescription(),
    inputSchema: buildGetCommandOutputSchema()
  });
}
```

#### 4.4 Add tool handler in `src/index.ts`

```typescript
case "get_command_output": {
  // Check if logging is enabled
  if (!this.logStorage) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'Log storage is not enabled. Enable logging in configuration to use this tool.'
    );
  }

  // Parse and validate arguments
  const args = z.object({
    executionId: z.string(),
    startLine: z.number().int().min(1).optional(),
    endLine: z.number().int().min(1).optional(),
    search: z.string().optional(),
    maxLines: z.number().int().min(1).max(10000).optional()
  }).parse(toolParams.arguments);

  // Get log entry
  const log = this.logStorage.getLog(args.executionId);

  if (!log) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Log entry not found: ${args.executionId}. The log may have expired or the ID is incorrect.`
    );
  }

  // Normalize and split output
  const normalizedOutput = log.combinedOutput.replace(/\r\n/g, '\n');
  const allLines = normalizedOutput.split('\n');
  let resultLines = allLines;

  // Apply line range if specified
  if (args.startLine !== undefined || args.endLine !== undefined) {
    const start = Math.max(0, (args.startLine ?? 1) - 1); // Convert to 0-based
    const end = Math.min(allLines.length, args.endLine ?? allLines.length);
    resultLines = allLines.slice(start, end);
  }

  // Apply search filter if specified (with error handling for invalid regex)
  if (args.search) {
    try {
      const regex = new RegExp(args.search, 'i');
      resultLines = resultLines.filter(line => regex.test(line));
    } catch (regexErr: any) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid search pattern: ${regexErr.message}. Ensure the pattern is a valid regular expression.`
      );
    }
  }

  // Enforce max return limit
  const configMaxLines = this.config.global.logging?.maxReturnLines ?? 500;
  const effectiveMaxLines = Math.min(args.maxLines ?? configMaxLines, configMaxLines);
  const wasTruncated = resultLines.length > effectiveMaxLines;

  if (wasTruncated) {
    resultLines = resultLines.slice(0, effectiveMaxLines);
  }

  // Build response
  const output = resultLines.join('\n');
  const exposeFullPath = this.config.global.logging?.exposeFullPath ?? false;

  return {
    content: [{
      type: 'text',
      text: output || '(no matching lines)'
    }],
    metadata: {
      executionId: args.executionId,
      totalLines: allLines.length,
      returnedLines: resultLines.length,
      wasTruncated,
      ...(wasTruncated && { maxReturnLines: effectiveMaxLines }),
      command: log.command,
      shell: log.shell,
      exitCode: log.exitCode,
      timestamp: log.timestamp.toISOString(),
      // Only expose file path if configured
      ...(exposeFullPath && log.filePath && { filePath: log.filePath })
    }
  };
}
```

#### Tests for Phase 4

**File**: `tests/handlers/getCommandOutputHandler.test.ts`

```typescript
describe('get_command_output tool', () => {
  describe('tool listing', () => {
    test('should be listed when logging is enabled');
    test('should NOT be listed when logging is disabled');
    test('should have correct description');
    test('should have correct schema');
    test('should require executionId');
  });

  describe('basic retrieval', () => {
    test('should return full output for valid executionId');
    test('should return error for non-existent executionId');
    test('should return error when logging is disabled');
    test('should include metadata in response');
    test('should normalize line endings in output');
  });

  describe('line range', () => {
    test('should return lines within specified range');
    test('should handle startLine only');
    test('should handle endLine only');
    test('should handle startLine > total lines');
    test('should handle endLine > total lines');
    test('should use 1-based line numbers');
    test('should reject startLine < 1');
    test('should reject non-integer line numbers');
  });

  describe('search filter', () => {
    test('should filter lines matching regex pattern');
    test('should be case-insensitive');
    test('should return empty result if no matches');
    test('should return structured error for invalid regex');
    test('should support regex alternation (a|b)');
    test('should support regex character classes');
  });

  describe('resource limits', () => {
    test('should enforce maxReturnLines from config');
    test('should allow maxLines parameter up to config limit');
    test('should reject maxLines > 10000');
    test('should indicate wasTruncated in metadata');
    test('should include maxReturnLines in metadata when truncated');
  });

  describe('combined options', () => {
    test('should apply line range before search');
    test('should apply maxLines after search');
    test('should work with all parameters specified');
  });

  describe('path exposure', () => {
    test('should not include filePath when exposeFullPath is false');
    test('should include filePath when exposeFullPath is true');
  });
});
```

---

### Phase 5: Integration with execute_command

**Priority**: High | **Estimated**: 1-2 hours

#### 5.1 Update `src/index.ts` - `executeShellCommand` method

```typescript
// Store log if enabled
let executionId: string | undefined;
let displayPath: string | undefined;

if (this.config.global.logging?.enableLogResources && this.logStorage) {
  executionId = this.logStorage.storeLog(command, shellName, workingDir, stdout, stderr, code ?? -1);

  // Get display path (respects exposeFullPath setting)
  const exposeFullPath = this.config.global.logging.exposeFullPath ?? false;
  displayPath = this.logStorage.getDisplayPath(executionId, exposeFullPath);
}

// Truncate output if enabled
if (this.config.global.logging?.enableTruncation) {
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
    displayPath  // Pass display path (basename or full path)
  );

  resultMessage = formatTruncatedOutput(truncated);
  wasTruncated = truncated.wasTruncated;
  totalLines = truncated.totalLines;
  returnedLines = truncated.returnedLines;
}
```

#### Tests for Phase 5

**Update**: `tests/integration/executeCommand.test.ts`

```typescript
describe('execute_command with file logging', () => {
  test('should include display path in truncation message when logDirectory configured');
  test('should show basename when exposeFullPath is false');
  test('should show full path when exposeFullPath is true');
  test('should NOT include path when logDirectory not configured');
  test('should create log file when output is truncated');
  test('should include executionId in response metadata');
});
```

---

### Phase 6: Update Tool Descriptions

**Priority**: Medium | **Estimated**: 30 minutes

#### 6.1 Update Output Truncation section in `buildExecuteCommandDescription`

```typescript
lines.push('**Output Truncation:**');
lines.push('- Output is automatically truncated if it exceeds the configured limit');
lines.push('- Default limit is usually 20 lines (configurable via global settings)');
lines.push('- Use `maxOutputLines` parameter to override the limit for a specific command');
lines.push('- If output is truncated, use the `get_command_output` tool to retrieve full output');
lines.push('- When file logging is enabled, full logs are also saved to disk');
lines.push('');
```

#### Tests for Phase 6

**Update**: `tests/toolDescription.test.ts`

```typescript
describe('buildExecuteCommandDescription', () => {
  test('should mention get_command_output tool in truncation section');
  test('should mention file logging capability');
});
```

---

### Phase 7: Cleanup Mechanism & Lifecycle

**Priority**: Medium | **Estimated**: 2 hours

#### 7.1 Add cleanup on server startup in `src/index.ts`

```typescript
constructor(config: ServerConfig) {
  // ... existing initialization ...

  // Initialize log storage if logging enabled
  if (config.global.logging?.enableLogResources) {
    this.logStorage = new LogStorageManager(config.global.logging);

    // Clean up old log files on startup
    if (config.global.logging.logDirectory) {
      this.logStorage.cleanupOldLogFiles()
        .then(deleted => {
          if (deleted > 0) {
            debugLog(`Cleaned up ${deleted} old log files on startup`);
          }
        })
        .catch(err => {
          debugWarn(`Startup cleanup failed: ${err.message}`);
        });

      // Start periodic cleanup timer
      this.logStorage.startCleanupTimer();
    }
  }
}
```

#### 7.2 Add shutdown method

```typescript
/**
 * Cleanup resources on shutdown
 */
public async shutdown(): Promise<void> {
  // Stop cleanup timer
  this.logStorage?.stopCleanupTimer();

  // Could add: flush pending file writes, close connections, etc.
  debugLog('Server shutdown complete');
}
```

#### Tests for Phase 7

```typescript
describe('Server lifecycle', () => {
  test('should cleanup old files on startup');
  test('should start cleanup timer on startup');
  test('should stop cleanup timer on shutdown');
  test('should not crash if cleanup fails on startup');
});
```

---

## Implementation Order

```text
Phase 1: Configuration & Types (Foundation)
    ↓
Phase 2: File Logging in LogStorageManager
    ↓
Phase 3: Update Truncation Message
    ↓
Phase 4: Add get_command_output Tool
    ↓
Phase 5: Integration with execute_command
    ↓
Phase 6: Update Tool Descriptions
    ↓
Phase 7: Cleanup Mechanism & Lifecycle
```

---

## Test Summary

### New Test Files

| File | Description | Est. Tests |
|------|-------------|------------|
| `tests/unit/loggingConfigValidation.test.ts` | Config validation | 15-18 |
| `tests/unit/logStorageFileLogging.test.ts` | File logging | 25-30 |
| `tests/handlers/getCommandOutputHandler.test.ts` | Tool handler | 25-30 |

### Updated Test Files

| File | Changes | Additional Tests |
|------|---------|------------------|
| `tests/unit/truncation.test.ts` | Path display, normalization | 8-10 |
| `tests/toolDescription.test.ts` | Updated descriptions | 2-3 |
| `tests/integration/executeCommand.test.ts` | File logging integration | 5-6 |

### Total Estimated New Tests: 80-97 tests

---

## Files to Modify

| File | Type of Change |
|------|----------------|
| `src/types/config.ts` | Add 5 new fields to LoggingConfig |
| `src/types/logging.ts` | Add `filePath` to CommandLogEntry |
| `src/utils/config.ts` | Add `validateLoggingConfig()` |
| `src/utils/logStorage.ts` | Add async file operations, limits, cleanup |
| `src/utils/truncation.ts` | Add `displayPath` parameter, normalize newlines |
| `src/utils/toolDescription.ts` | Add `buildGetCommandOutputDescription()` |
| `src/utils/toolSchemas.ts` | Add `buildGetCommandOutputSchema()` |
| `src/index.ts` | Add tool, handler, integration, lifecycle |

---

## Rollout Checklist

- [ ] Phase 1: Types updated
- [ ] Phase 1: Config validation implemented
- [ ] Phase 1: Config validation tests pass
- [ ] Phase 2: File logging implemented (async)
- [ ] Phase 2: Error handling complete
- [ ] Phase 2: Storage limits enforced
- [ ] Phase 2: File logging tests pass
- [ ] Phase 3: Truncation message updated
- [ ] Phase 3: Path exposure controlled
- [ ] Phase 3: Truncation tests pass
- [ ] Phase 4: get_command_output tool added
- [ ] Phase 4: Regex error handling
- [ ] Phase 4: Resource limits enforced
- [ ] Phase 4: Tool handler tests pass
- [ ] Phase 5: Integration complete
- [ ] Phase 5: Integration tests pass
- [ ] Phase 6: Descriptions updated
- [ ] Phase 7: Cleanup mechanism added
- [ ] Phase 7: Lifecycle cleanup on shutdown
- [ ] All existing tests still pass
- [ ] Manual testing with VS Code + Copilot
- [ ] Documentation updated (README, CONFIGURATION_EXAMPLES)
- [ ] CHANGELOG updated

---

## Estimated Total Effort

| Phase | Effort |
|-------|--------|
| Phase 1 | 2-3 hours |
| Phase 2 | 4-5 hours |
| Phase 3 | 1-2 hours |
| Phase 4 | 3-4 hours |
| Phase 5 | 1-2 hours |
| Phase 6 | 30 minutes |
| Phase 7 | 2 hours |
| **Total** | **14-19 hours** |

---

## Risk Assessment

| Risk | Mitigation | Status |
|------|------------|--------|
| File path disclosure | `exposeFullPath` config, default false | ✅ Addressed |
| Sync FS blocking | Async operations, fire-and-forget | ✅ Addressed |
| Undefined entry reference | Create entry before file ops | ✅ Addressed |
| Crash on FS errors | Try/catch everywhere, log warnings | ✅ Addressed |
| Timezone issues in retention | Monotonic `Date.now() - mtimeMs` | ✅ Addressed |
| Invalid regex crash | Try/catch, structured McpError | ✅ Addressed |
| Huge responses | `maxReturnLines` config + param | ✅ Addressed |
| Timer accumulation | Track ref, unref, cleanup on shutdown | ✅ Addressed |
| Path traversal attacks | Validation, `path.resolve` | ✅ Addressed |
| Mixed line endings | Normalize to `\n` everywhere | ✅ Addressed |
| Invalid config values | Bounds validation in loadConfig | ✅ Addressed |
| Unbounded disk growth | `maxStoredLogs`, `maxTotalLogSize` | ✅ Addressed |

---

## Configuration Example

```json
{
  "global": {
    "logging": {
      "enableLogResources": true,
      "enableTruncation": true,
      "maxOutputLines": 20,
      "maxStoredLogs": 100,
      "maxLogSize": 1048576,
      "logDirectory": "~/.wcli0/logs",
      "logRetentionDays": 7,
      "maxTotalLogSize": 104857600,
      "maxReturnLines": 500,
      "exposeFullPath": false
    }
  }
}
```
