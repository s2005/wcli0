/**
 * Log storage manager for command execution logs
 */

import {
  CommandLogEntry,
  LogStorage,
  StorageStats,
  LogFilter
} from '../types/logging.js';
import { LoggingConfig } from '../types/config.js';

/**
 * Manages storage and lifecycle of command execution logs
 */
export class LogStorageManager {
  private storage: LogStorage;
  private config: LoggingConfig;
  private cleanupTimer?: NodeJS.Timer;

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
   *
   * @param command - The command that was executed
   * @param shell - Shell type used
   * @param workingDir - Working directory
   * @param stdout - Standard output
   * @param stderr - Standard error output
   * @param exitCode - Command exit code
   * @returns The execution ID for the stored log
   */
  public storeLog(
    command: string,
    shell: string,
    workingDir: string,
    stdout: string,
    stderr: string,
    exitCode: number
  ): string {
    // Generate unique ID
    const id = this.generateId();

    // Combine outputs
    const combinedOutput = this.combineOutput(stdout, stderr, exitCode);

    // Calculate line counts
    const stdoutLines = stdout ? stdout.split('\n').length : 0;
    const stderrLines = stderr ? stderr.split('\n').length : 0;
    const totalLines = combinedOutput.split('\n').length;

    // Create log entry
    const entry: CommandLogEntry = {
      id,
      timestamp: new Date(),
      command,
      shell,
      workingDirectory: workingDir,
      exitCode,
      stdout,
      stderr,
      combinedOutput,
      totalLines,
      stdoutLines,
      stderrLines,
      wasTruncated: false, // Will be set when truncated for response
      returnedLines: totalLines,
      size: this.calculateEntrySize(stdout, stderr, combinedOutput)
    };

    // Check if entry exceeds max size and truncate if needed
    if (entry.size > this.config.maxLogSize) {
      entry.combinedOutput = this.truncateEntryOutput(entry.combinedOutput, this.config.maxLogSize);
      entry.size = this.calculateEntrySize(entry.stdout, entry.stderr, entry.combinedOutput);
    }

    // Add to storage
    this.storage.entries.set(id, entry);
    this.storage.executionOrder.push(id);
    this.storage.totalStorageSize += entry.size;

    // Cleanup if needed
    this.cleanup();

    return id;
  }

  /**
   * Retrieve a log entry by ID
   */
  public getLog(id: string): CommandLogEntry | undefined {
    return this.storage.entries.get(id);
  }

  /**
   * Check if a log exists
   */
  public hasLog(id: string): boolean {
    return this.storage.entries.has(id);
  }

  /**
   * Get all log entries, optionally filtered
   */
  public listLogs(filter?: LogFilter): CommandLogEntry[] {
    let logs = Array.from(this.storage.entries.values());

    // Apply filters
    if (filter) {
      if (filter.shell) {
        logs = logs.filter(log => log.shell === filter.shell);
      }

      if (filter.exitCode !== undefined) {
        logs = logs.filter(log => log.exitCode === filter.exitCode);
      }

      if (filter.since) {
        logs = logs.filter(log => log.timestamp >= filter.since!);
      }

      if (filter.until) {
        logs = logs.filter(log => log.timestamp <= filter.until!);
      }
    }

    // Sort by timestamp (oldest first)
    logs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return logs;
  }

  /**
   * Delete a specific log entry
   */
  public deleteLog(id: string): boolean {
    const entry = this.storage.entries.get(id);
    if (!entry) {
      return false;
    }

    // Remove from storage
    this.storage.entries.delete(id);
    this.storage.totalStorageSize -= entry.size;

    // Remove from execution order
    const index = this.storage.executionOrder.indexOf(id);
    if (index > -1) {
      this.storage.executionOrder.splice(index, 1);
    }

    return true;
  }

  /**
   * Clear all stored logs
   */
  public clear(): void {
    this.storage.entries.clear();
    this.storage.executionOrder = [];
    this.storage.totalStorageSize = 0;
  }

  /**
   * Get storage statistics
   */
  public getStats(): StorageStats {
    return {
      totalLogs: this.storage.entries.size,
      totalSize: this.storage.totalStorageSize,
      maxLogs: this.config.maxStoredLogs,
      maxSize: this.config.maxTotalStorageSize
    };
  }

  /**
   * Start automatic cleanup timer
   */
  public startCleanup(): void {
    if (this.cleanupTimer) {
      return; // Already started
    }

    const intervalMs = this.config.cleanupIntervalMinutes * 60 * 1000;
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }

  /**
   * Stop automatic cleanup timer
   */
  public stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Generate unique execution ID
   */
  private generateId(): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '-').split('-').slice(0, 6).join('');
    const random = Math.random().toString(36).substring(2, 6);
    return `${timestamp}-${random}`;
  }

  /**
   * Combine stdout and stderr based on exit code
   */
  private combineOutput(stdout: string, stderr: string, exitCode: number): string {
    if (exitCode === 0) {
      return stdout || '';
    } else {
      const parts: string[] = [];
      if (exitCode !== null && exitCode !== undefined) {
        parts.push(`Command failed with exit code ${exitCode}`);
      }
      if (stderr) {
        parts.push(`Error output:\n${stderr}`);
      }
      if (stdout) {
        parts.push(`Standard output:\n${stdout}`);
      }
      return parts.join('\n');
    }
  }

  /**
   * Calculate size of a log entry in bytes
   */
  private calculateEntrySize(stdout: string, stderr: string, combinedOutput: string): number {
    // Calculate string sizes (approximate UTF-8 byte size)
    const stdoutSize = Buffer.byteLength(stdout || '', 'utf8');
    const stderrSize = Buffer.byteLength(stderr || '', 'utf8');
    const combinedSize = Buffer.byteLength(combinedOutput || '', 'utf8');

    // Add overhead for metadata (approximate)
    const metadataOverhead = 200;

    return stdoutSize + stderrSize + combinedSize + metadataOverhead;
  }

  /**
   * Truncate entry output to fit within size limit
   */
  private truncateEntryOutput(output: string, maxSize: number): string {
    if (Buffer.byteLength(output, 'utf8') <= maxSize) {
      return output;
    }

    // Take approximately the last maxSize bytes
    const lines = output.split('\n');
    let truncated = '';
    let size = 0;

    // Add lines from the end until we reach the size limit
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const lineSize = Buffer.byteLength(line + '\n', 'utf8');

      if (size + lineSize > maxSize) {
        break;
      }

      truncated = line + '\n' + truncated;
      size += lineSize;
    }

    return `[Log truncated to fit size limit]\n${truncated}`;
  }

  /**
   * Cleanup old entries based on configured limits
   */
  private cleanup(): void {
    // Remove expired logs (by time)
    this.removeExpiredLogs();

    // Enforce count limit (FIFO)
    this.enforceCountLimit();

    // Enforce size limit (FIFO)
    this.enforceStorageLimit();
  }

  /**
   * Remove logs that have exceeded retention time
   */
  private removeExpiredLogs(): void {
    const now = new Date();
    const retentionMs = this.config.logRetentionMinutes * 60 * 1000;
    const expirationTime = new Date(now.getTime() - retentionMs);

    const expiredIds: string[] = [];

    for (const [id, entry] of this.storage.entries) {
      if (entry.timestamp < expirationTime) {
        expiredIds.push(id);
      }
    }

    for (const id of expiredIds) {
      this.deleteLog(id);
    }
  }

  /**
   * Enforce maximum number of stored logs
   */
  private enforceCountLimit(): void {
    while (this.storage.entries.size > this.config.maxStoredLogs) {
      this.removeOldestEntry();
    }
  }

  /**
   * Enforce maximum total storage size
   */
  private enforceStorageLimit(): void {
    while (this.storage.totalStorageSize > this.config.maxTotalStorageSize) {
      this.removeOldestEntry();
    }
  }

  /**
   * Remove the oldest entry from storage
   */
  private removeOldestEntry(): void {
    if (this.storage.executionOrder.length === 0) {
      return;
    }

    const oldestId = this.storage.executionOrder[0];
    this.deleteLog(oldestId);
  }
}
