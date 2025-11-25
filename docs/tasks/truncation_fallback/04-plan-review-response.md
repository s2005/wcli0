# Plan Review Response — Addressing Identified Issues

This document addresses all issues identified in `03-plan-review.md` and updates the implementation plan accordingly.

---

## Issue 1: File Path Disclosure

**Problem**: Truncation message and tool metadata return absolute `filePath`. This can leak host paths to clients.

**Solution**: Add configurable path exposure with safe default.

### Changes to Phase 1 (Configuration)

Add new config field:

```typescript
export interface LoggingConfig {
  // ... existing fields ...
  
  logDirectory?: string;
  logRetentionDays?: number;
  
  // NEW: Control path exposure
  exposeFullPath?: boolean;  // Default: false - only show basename
}
```

### Changes to Truncation Message

```typescript
export function buildTruncationMessage(
  omittedLines: number,
  totalLines: number,
  returnedLines: number,
  executionId?: string,
  template?: string,
  filePath?: string,
  exposeFullPath: boolean = false  // NEW parameter
): string {
  // ...
  if (executionId) {
    if (filePath) {
      // Only show full path if explicitly configured
      const displayPath = exposeFullPath ? filePath : path.basename(filePath);
      parts.push(`[Full log saved to: ${displayPath}]`);
      // ...
    }
  }
}
```

### Changes to Tool Metadata

```typescript
// In get_command_output handler
return {
  content: [{ type: 'text', text: output }],
  metadata: {
    executionId: args.executionId,
    totalLines: lines.length,
    returnedLines: resultLines.length,
    command: log.command,
    shell: log.shell,
    exitCode: log.exitCode,
    // Only expose full path if configured
    filePath: this.config.global.logging?.exposeFullPath ? log.filePath : undefined
  }
};
```

---

## Issue 2: Sync FS Calls in Hot Path

**Problem**: `storeLog` uses `fs.writeFileSync` and `fs.mkdirSync` inside command execution, blocking the event loop.

**Solution**: Use async file operations with fire-and-forget pattern (log errors but don't block).

### Updated Phase 2 Implementation

```typescript
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';

export class LogStorageManager {
  private logDirEnsured: boolean = false;
  private resolvedLogDir?: string;

  /**
   * Store a new command execution log (sync for ID generation, async for file write)
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
    
    // Create entry object FIRST (fixes Issue 3)
    const entry: CommandLogEntry = {
      id,
      timestamp: new Date(),
      command,
      shell,
      workingDirectory: workingDir,
      exitCode,
      stdout: currentStdout,
      stderr: currentStderr,
      combinedOutput: currentCombined,
      // ... other fields
    };
    
    // Store in memory (sync - fast)
    this.storage.entries.set(id, entry);
    this.storage.executionOrder.push(id);
    
    // Write to filesystem async (fire-and-forget)
    if (this.config.logDirectory) {
      this.writeLogToFileAsync(id, entry)
        .then(filePath => {
          entry.filePath = filePath;
        })
        .catch(err => {
          // Log error but don't crash (Issue 4)
          debugWarn(`Failed to write log file for ${id}: ${err.message}`);
        });
    }

    return id;
  }

  /**
   * Write log entry to filesystem asynchronously
   */
  private async writeLogToFileAsync(id: string, entry: CommandLogEntry): Promise<string> {
    const logDir = await this.ensureLogDirectoryAsync();
    const filePath = path.join(logDir, `${id}.log`);
    
    // Normalize line endings (Issue 10)
    const normalizedOutput = entry.combinedOutput.replace(/\r\n/g, '\n');
    
    await fs.writeFile(filePath, normalizedOutput, 'utf8');
    
    return filePath;
  }

  /**
   * Ensure log directory exists (lazy initialization)
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
    } catch (err: any) {
      if (err.code !== 'EEXIST') {
        throw new Error(`Cannot create log directory: ${err.message}`);
      }
    }
    
    return logDir;
  }
}
```

---

## Issue 3: Undefined `entry` in Snippet

**Problem**: `storeLog` references `entry` before declaration when calling `writeLogToFile`.

**Solution**: Create entry object before file persistence (see Issue 2 solution above - entry is created first, then stored, then file write is initiated).

---

## Issue 4: Error Handling Gaps

**Problem**: `writeLogToFile` / `cleanupOldLogFiles` lack try/catch; could crash the server.

**Solution**: Wrap all file operations in try/catch, log errors, continue operation.

### Updated `cleanupOldLogFiles`

```typescript
/**
 * Clean up old log files based on retention policy
 * Returns count of deleted files, never throws
 */
public async cleanupOldLogFiles(): Promise<number> {
  if (!this.config.logDirectory) return 0;
  
  try {
    const logDir = await this.ensureLogDirectoryAsync();
    const retentionMs = (this.config.logRetentionDays ?? 7) * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - retentionMs;  // Issue 5: Use monotonic time
    
    const files = await fs.readdir(logDir);
    let deletedCount = 0;
    
    for (const file of files) {
      if (!file.endsWith('.log')) continue;
      
      const filePath = path.join(logDir, file);
      
      try {
        const stats = await fs.stat(filePath);
        
        // Issue 5: Use mtimeMs for monotonic comparison
        if (stats.mtimeMs < cutoffTime) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      } catch (fileErr: any) {
        // Log but continue with other files
        debugWarn(`Failed to process log file ${file}: ${fileErr.message}`);
      }
    }
    
    return deletedCount;
  } catch (err: any) {
    debugWarn(`Failed to cleanup log files: ${err.message}`);
    return 0;  // Don't crash, return 0 deleted
  }
}
```

---

## Issue 5: Retention Logic Timezone Issues

**Problem**: Uses `mtime` with `setDate` on `Date` (local time). Timezone drift could delete fresh logs.

**Solution**: Use `Date.now() - stats.mtimeMs` for monotonic age check.

```typescript
// OLD (problematic)
const cutoffDate = new Date();
cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
if (stats.mtime < cutoffDate) { ... }

// NEW (monotonic)
const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
const cutoffTime = Date.now() - retentionMs;
if (stats.mtimeMs < cutoffTime) { ... }
```

---

## Issue 6: Regex Handling in Tool

**Problem**: `new RegExp(args.search)` can throw on invalid patterns.

**Solution**: Wrap in try/catch, return structured error.

### Tool Handler with Regex Error Handling

```typescript
case "get_command_output": {
  // ... validation ...

  let output = log.combinedOutput;
  const lines = output.split('\n');
  let resultLines = lines;

  // Apply line range if specified
  if (args.startLine !== undefined || args.endLine !== undefined) {
    const start = Math.max(0, (args.startLine ?? 1) - 1);
    const end = Math.min(lines.length, args.endLine ?? lines.length);
    resultLines = lines.slice(start, end);
  }

  // Apply search filter if specified (with error handling)
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

  // ... return result ...
}
```

---

## Issue 7: Resource Limits for get_command_output

**Problem**: Returns full stored output, potentially huge. Could blow memory/response size.

**Solution**: Add `maxReturnLines` limit with default, support pagination.

### Updated Configuration

```typescript
export interface LoggingConfig {
  // ... existing ...
  maxReturnLines?: number;  // Default: 1000 - max lines returned by get_command_output
}
```

### Tool Handler with Resource Limits

```typescript
case "get_command_output": {
  // ...
  
  const maxReturnLines = this.config.global.logging?.maxReturnLines ?? 1000;
  
  // Apply line range
  // ...
  
  // Apply search filter
  // ...
  
  // Enforce max return limit
  const wasTruncated = resultLines.length > maxReturnLines;
  if (wasTruncated) {
    resultLines = resultLines.slice(0, maxReturnLines);
  }

  return {
    content: [{
      type: 'text',
      text: resultLines.join('\n')
    }],
    metadata: {
      executionId: args.executionId,
      totalLines: lines.length,
      returnedLines: resultLines.length,
      wasTruncated: wasTruncated,
      maxReturnLines: wasTruncated ? maxReturnLines : undefined,
      // ... other fields
    }
  };
}
```

### Updated Tool Schema

Add pagination parameters:

```typescript
export function buildGetCommandOutputSchema(): object {
  return {
    type: 'object',
    properties: {
      executionId: { type: 'string', description: '...' },
      startLine: { type: 'number', description: 'Start line (1-based)' },
      endLine: { type: 'number', description: 'End line' },
      search: { type: 'string', description: 'Regex filter' },
      // NEW: explicit limit override
      maxLines: { 
        type: 'number', 
        description: 'Max lines to return (default: 1000, max: 10000)' 
      }
    },
    required: ['executionId']
  };
}
```

---

## Issue 8: Concurrency / Cleanup Timer

**Problem**: `setInterval` runs forever without teardown; repeated hot-reloads accumulate timers.

**Solution**: Track timer reference, provide cleanup method, clear on server shutdown.

### Updated Implementation

```typescript
export class CLIServer {
  private cleanupTimer?: NodeJS.Timeout;
  
  constructor(config: ServerConfig) {
    // ... existing init ...
    
    // Start cleanup timer if file logging enabled
    if (config.global.logging?.logDirectory) {
      this.startCleanupTimer();
    }
  }
  
  private startCleanupTimer(): void {
    // Clear any existing timer first
    this.stopCleanupTimer();
    
    // Run cleanup every 24 hours
    this.cleanupTimer = setInterval(() => {
      this.logStorage?.cleanupOldLogFiles().catch(err => {
        debugWarn(`Periodic cleanup failed: ${err.message}`);
      });
    }, 24 * 60 * 60 * 1000);
    
    // Don't prevent process exit
    this.cleanupTimer.unref();
  }
  
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
  
  /**
   * Cleanup resources on shutdown
   */
  public async shutdown(): Promise<void> {
    this.stopCleanupTimer();
    // ... other cleanup ...
  }
}
```

---

## Issue 9: Path Normalization

**Problem**: `ensureLogDirectory` expands `~` but ignores env vars and relative paths; no traversal protection.

**Solution**: Comprehensive path resolution and sanitization.

### Updated `resolveLogDirectory`

```typescript
/**
 * Resolve and validate log directory path
 * - Expands ~ to home directory
 * - Expands environment variables
 * - Resolves to absolute path
 * - Validates against path traversal
 */
private resolveLogDirectory(): string {
  let logDir = this.config.logDirectory!;
  
  // Expand ~ to home directory
  if (logDir.startsWith('~')) {
    logDir = path.join(os.homedir(), logDir.slice(1));
  }
  
  // Expand environment variables (Windows: %VAR%, Unix: $VAR)
  logDir = logDir.replace(/%([^%]+)%/g, (_, key) => process.env[key] || '');
  logDir = logDir.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, key) => process.env[key] || '');
  
  // Resolve to absolute path
  logDir = path.resolve(logDir);
  
  // Validate: must be absolute after resolution
  if (!path.isAbsolute(logDir)) {
    throw new Error(`Log directory must resolve to absolute path: ${this.config.logDirectory}`);
  }
  
  // Validate: prevent obvious traversal patterns in original input
  const originalNormalized = path.normalize(this.config.logDirectory!);
  if (originalNormalized.includes('..')) {
    throw new Error(`Log directory contains path traversal: ${this.config.logDirectory}`);
  }
  
  return logDir;
}
```

---

## Issue 10: Platform Newline Consistency

**Problem**: Writing `entry.combinedOutput` as-is may mix `\r\n`/`\n`; causes line count issues.

**Solution**: Normalize newlines before writing and when counting lines.

### Normalize on Write

```typescript
private async writeLogToFileAsync(id: string, entry: CommandLogEntry): Promise<string> {
  const logDir = await this.ensureLogDirectoryAsync();
  const filePath = path.join(logDir, `${id}.log`);
  
  // Normalize to Unix line endings for consistency
  const normalizedOutput = entry.combinedOutput.replace(/\r\n/g, '\n');
  
  await fs.writeFile(filePath, normalizedOutput, 'utf8');
  
  return filePath;
}
```

### Normalize When Counting/Splitting

```typescript
// In truncation.ts
const lines = output.replace(/\r\n/g, '\n').split('\n');

// In get_command_output handler
const normalizedOutput = log.combinedOutput.replace(/\r\n/g, '\n');
const lines = normalizedOutput.split('\n');
```

---

## Issue 11: Missing Validation for New Config Fields

**Problem**: New config fields lack bounds validation (e.g., negative `logRetentionDays`).

**Solution**: Add validation in config loading.

### Add to `src/utils/config.ts`

```typescript
/**
 * Validate logging configuration
 */
function validateLoggingConfig(logging: LoggingConfig | undefined): void {
  if (!logging) return;
  
  // Validate logRetentionDays
  if (logging.logRetentionDays !== undefined) {
    if (typeof logging.logRetentionDays !== 'number' || 
        logging.logRetentionDays < 1 || 
        logging.logRetentionDays > 365) {
      throw new Error('logRetentionDays must be a number between 1 and 365');
    }
  }
  
  // Validate logDirectory
  if (logging.logDirectory !== undefined) {
    if (typeof logging.logDirectory !== 'string' || 
        logging.logDirectory.trim() === '') {
      throw new Error('logDirectory must be a non-empty string');
    }
    
    // Check for invalid characters (Windows)
    if (process.platform === 'win32') {
      const invalidChars = /[<>"|?*]/;
      if (invalidChars.test(logging.logDirectory)) {
        throw new Error('logDirectory contains invalid characters');
      }
    }
  }
  
  // Validate maxReturnLines
  if (logging.maxReturnLines !== undefined) {
    if (typeof logging.maxReturnLines !== 'number' ||
        logging.maxReturnLines < 1 ||
        logging.maxReturnLines > 100000) {
      throw new Error('maxReturnLines must be a number between 1 and 100000');
    }
  }
  
  // Validate exposeFullPath
  if (logging.exposeFullPath !== undefined) {
    if (typeof logging.exposeFullPath !== 'boolean') {
      throw new Error('exposeFullPath must be a boolean');
    }
  }
}
```

### Tests for Validation

```typescript
describe('Logging config validation', () => {
  test('should reject negative logRetentionDays');
  test('should reject logRetentionDays > 365');
  test('should reject empty logDirectory');
  test('should reject logDirectory with invalid characters on Windows');
  test('should reject negative maxReturnLines');
  test('should reject maxReturnLines > 100000');
  test('should accept valid configuration');
});
```

---

## Issue 12: Disk Space Guardrails

**Problem**: Plan mentions `maxStoredLogs`/`maxLogSize` but Phase 2 ignores them; risk of unbounded disk growth.

**Solution**: Implement file count and size limits.

### Updated Configuration (use existing fields)

```typescript
export interface LoggingConfig {
  // Existing - now also applies to files
  maxStoredLogs?: number;   // Max log files to keep (default: 100)
  maxLogSize?: number;      // Max size per log file in bytes (default: 1MB)
  
  // NEW
  maxTotalLogSize?: number; // Max total size of all logs in bytes (default: 100MB)
}
```

### Implementation

```typescript
/**
 * Enforce disk space limits after writing a new log
 */
private async enforceStorageLimits(): Promise<void> {
  if (!this.config.logDirectory) return;
  
  const maxFiles = this.config.maxStoredLogs ?? 100;
  const maxTotalSize = this.config.maxTotalLogSize ?? 100 * 1024 * 1024; // 100MB
  
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
      await fs.unlink(oldest.path).catch(() => {});
      totalSize -= oldest.size;
    }
    
    // Delete oldest files if over size limit
    while (totalSize > maxTotalSize && fileStats.length > 0) {
      const oldest = fileStats.shift()!;
      await fs.unlink(oldest.path).catch(() => {});
      totalSize -= oldest.size;
    }
  } catch (err: any) {
    debugWarn(`Failed to enforce storage limits: ${err.message}`);
  }
}

/**
 * Check if single log exceeds size limit before writing
 */
private exceedsMaxLogSize(content: string): boolean {
  const maxSize = this.config.maxLogSize ?? 1024 * 1024; // 1MB default
  return Buffer.byteLength(content, 'utf8') > maxSize;
}
```

### Updated `writeLogToFileAsync`

```typescript
private async writeLogToFileAsync(id: string, entry: CommandLogEntry): Promise<string> {
  const logDir = await this.ensureLogDirectoryAsync();
  const filePath = path.join(logDir, `${id}.log`);
  
  // Normalize line endings
  let content = entry.combinedOutput.replace(/\r\n/g, '\n');
  
  // Truncate if exceeds max size (Issue 12)
  const maxSize = this.config.maxLogSize ?? 1024 * 1024;
  if (Buffer.byteLength(content, 'utf8') > maxSize) {
    // Truncate to max size, keeping end (most relevant)
    const lines = content.split('\n');
    while (Buffer.byteLength(content, 'utf8') > maxSize && lines.length > 1) {
      lines.shift();
      content = `[Log truncated - exceeded ${maxSize} bytes]\n` + lines.join('\n');
    }
  }
  
  await fs.writeFile(filePath, content, 'utf8');
  
  // Enforce overall storage limits
  await this.enforceStorageLimits();
  
  return filePath;
}
```

---

## Updated Configuration Summary

```typescript
export interface LoggingConfig {
  // Existing
  enableLogResources?: boolean;
  maxStoredLogs?: number;      // Max log files (default: 100)
  maxLogSize?: number;         // Max bytes per log (default: 1MB)
  maxOutputLines?: number;     // Truncation threshold
  enableTruncation?: boolean;
  truncationMessage?: string;
  
  // NEW
  logDirectory?: string;       // Enables file logging when set
  logRetentionDays?: number;   // Days to keep logs (default: 7, range: 1-365)
  maxTotalLogSize?: number;    // Max total bytes (default: 100MB)
  maxReturnLines?: number;     // Max lines from get_command_output (default: 1000)
  exposeFullPath?: boolean;    // Show full path in messages (default: false)
}
```

---

## Additional Tests Required

### Error Handling Tests

```typescript
describe('Error handling', () => {
  test('should continue operation when file write fails');
  test('should log warning when cleanup fails');
  test('should return structured error for invalid regex');
  test('should not crash on permission denied');
  test('should handle disk full gracefully');
});
```

### Security Tests

```typescript
describe('Security', () => {
  test('should not expose full path by default');
  test('should reject path traversal in logDirectory');
  test('should sanitize environment variables in path');
  test('should validate config bounds');
});
```

### Resource Limit Tests

```typescript
describe('Resource limits', () => {
  test('should enforce maxReturnLines');
  test('should enforce maxStoredLogs for files');
  test('should enforce maxLogSize per file');
  test('should enforce maxTotalLogSize');
  test('should delete oldest files when over limit');
});
```

---

## Updated Estimated Effort

| Phase | Original | With Fixes |
|-------|----------|------------|
| Phase 1 | 1-2 hrs | 2-3 hrs |
| Phase 2 | 2-3 hrs | 4-5 hrs |
| Phase 3 | 1-2 hrs | 1-2 hrs |
| Phase 4 | 2-3 hrs | 3-4 hrs |
| Phase 5 | 1-2 hrs | 1-2 hrs |
| Phase 6 | 30 min | 30 min |
| Phase 7 | 1 hr | 2 hrs |
| **Total** | **9-14 hrs** | **14-19 hrs** |

The additional ~5 hours accounts for proper error handling, async operations, validation, and resource limits.
