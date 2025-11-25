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
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { debugWarn } from './log.js';

/**
 * Manages storage and lifecycle of command execution logs
 */
export class LogStorageManager {
  private storage: LogStorage;
  private config: LoggingConfig;
  private cleanupTimer?: NodeJS.Timeout;
  private resolvedLogDir?: string;
  private logDirEnsured = false;

  constructor(config: LoggingConfig) {
    this.config = config;
    this.storage = {
      entries: new Map<string, CommandLogEntry>(),
      executionOrder: [],
      totalStorageSize: 0
    };

    if (this.config.logDirectory) {
      this.resolvedLogDir = this.sanitizeLogDirectory(this.config.logDirectory);
    }
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

    // Normalize newlines to prevent double counting of \r\n
    let currentStdout = this.normalizeNewlines(stdout || '');
    let currentStderr = this.normalizeNewlines(stderr || '');

    // Combine output
    let currentCombined = this.normalizeNewlines(
      this.combineOutput(currentStdout, currentStderr, exitCode)
    );

    // Calculate initial size
    let currentSize = this.calculateEntrySize(currentStdout, currentStderr, currentCombined);

    // If entry exceeds max size, truncate all output fields
    const maxEntrySize = this.config.maxLogSize || 1048576;
    if (currentSize > maxEntrySize) {
      // Calculate how much space we can allocate (leaving room for metadata overhead)
      const maxOutputSize = maxEntrySize - 200; // metadata overhead
      const halfSize = Math.floor(maxOutputSize / 3); // Split between stdout, stderr, combined

      // Truncate stdout if needed
      if (Buffer.byteLength(currentStdout, 'utf8') > halfSize) {
        currentStdout = this.truncateEntryOutput(currentStdout, halfSize);
      }

      // Truncate stderr if needed
      if (Buffer.byteLength(currentStderr, 'utf8') > halfSize) {
        currentStderr = this.truncateEntryOutput(currentStderr, halfSize);
      }

      // Recombine from truncated outputs
      currentCombined = this.combineOutput(currentStdout, currentStderr, exitCode);

      // If still too large, truncate combined output as final safeguard
      if (Buffer.byteLength(currentCombined, 'utf8') > halfSize) {
        currentCombined = this.truncateEntryOutput(currentCombined, halfSize);
      }

      // Recalculate size with truncated fields
      currentSize = this.calculateEntrySize(currentStdout, currentStderr, currentCombined);
    }

    // Calculate line counts from potentially truncated outputs
    const stdoutLines = currentStdout ? currentStdout.split('\n').length : 0;
    const stderrLines = currentStderr ? currentStderr.split('\n').length : 0;
    const totalLines = currentCombined.split('\n').length;

    // Create log entry with truncated data
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
      totalLines,
      stdoutLines,
      stderrLines,
      wasTruncated: false, // Will be set when truncated for response
      returnedLines: totalLines,
      size: currentSize,
      filePath: this.resolvedLogDir ? this.getLogFilePath(id) : undefined
    };

    // Add to storage
    this.storage.entries.set(id, entry);
    this.storage.executionOrder.push(id);
    this.storage.totalStorageSize += entry.size;

    // Cleanup if needed
    this.cleanup();

    // Persist to disk asynchronously (best-effort, non-blocking)
    if (entry.filePath) {
      this.writeLogToFileAsync(entry).catch(err => {
        debugWarn(`Failed to write log file for ${id}: ${err instanceof Error ? err.message : String(err)}`);
      });
    }

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

    const filePath = entry.filePath;

    // Remove from storage
    this.storage.entries.delete(id);
    this.storage.totalStorageSize -= entry.size;

    // Remove from execution order
    const index = this.storage.executionOrder.indexOf(id);
    if (index > -1) {
      this.storage.executionOrder.splice(index, 1);
    }

    // Best-effort file removal
    if (filePath) {
      this.deleteLogFile(filePath).catch(err => {
        debugWarn(`Failed to delete log file ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      });
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
      maxSize: this.getMaxTotalBytes()
    };
  }

  /**
   * Start automatic cleanup timer
   */
  public startCleanup(): void {
    if (this.cleanupTimer) {
      return; // Already started
    }

    const intervalMs = (this.config.cleanupIntervalMinutes ?? 5) * 60 * 1000;
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, intervalMs).unref();
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

    // Kick off async file cleanup if file logging is enabled
    if (this.resolvedLogDir) {
      this.cleanupFilesAsync().catch(err => {
        debugWarn(`Log file cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
  }

  /**
   * Remove logs that have exceeded retention time
   */
  private removeExpiredLogs(): void {
    const retentionMs = this.getRetentionMs();
    if (retentionMs <= 0) {
      return;
    }

    const now = Date.now();

    const expiredIds: string[] = [];

    for (const [id, entry] of this.storage.entries) {
      if (now - entry.timestamp.getTime() > retentionMs) {
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
    const maxTotal = this.getMaxTotalBytes();
    while (this.storage.totalStorageSize > maxTotal) {
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

  /**
   * Normalize Windows/Unix newlines to a single style for counting/storage
   */
  private normalizeNewlines(text: string): string {
    return text.replace(/\r\n/g, '\n');
  }

  /**
   * Expand and sanitize the configured log directory
   */
  private sanitizeLogDirectory(logDir: string): string {
    let expanded = logDir.trim();

    // Expand leading ~
    expanded = expanded.replace(/^~(?=$|[\\/])/, os.homedir());

    // Expand environment variables like $HOME or %USERPROFILE%
    expanded = expanded.replace(/%([A-Za-z0-9_]+)%|\$([A-Za-z0-9_]+)/g, (_match, winVar, unixVar) => {
      const key = (winVar || unixVar) as string;
      return process.env[key] ?? '';
    });

    const resolved = path.resolve(expanded);
    const normalized = path.normalize(resolved);

    if (!path.isAbsolute(normalized)) {
      throw new Error(`Log directory must resolve to absolute path: ${logDir}`);
    }

    if (normalized.includes('..')) {
      throw new Error(`Log directory contains path traversal: ${logDir}`);
    }

    return normalized;
  }

  /**
   * Build full path for an execution's log file
   */
  private getLogFilePath(id: string): string {
    if (!this.resolvedLogDir) {
      throw new Error('Log directory not resolved');
    }
    return path.join(this.resolvedLogDir, `${id}.log`);
  }

  /**
   * Ensure the log directory exists
   */
  private async ensureLogDirectoryAsync(): Promise<string> {
    if (!this.resolvedLogDir) {
      throw new Error('Log directory is not configured');
    }

    if (!this.logDirEnsured) {
      await fs.mkdir(this.resolvedLogDir, { recursive: true });
      this.logDirEnsured = true;
    }

    return this.resolvedLogDir;
  }

  /**
   * Persist a log entry to disk (best effort)
   */
  private async writeLogToFileAsync(entry: CommandLogEntry): Promise<string> {
    if (!entry.filePath) {
      throw new Error('Cannot write log without filePath');
    }

    const logDir = await this.ensureLogDirectoryAsync();
    const filePath = path.isAbsolute(entry.filePath)
      ? entry.filePath
      : path.join(logDir, entry.filePath);

    // Normalize line endings for consistency
    let content = this.normalizeNewlines(entry.combinedOutput);

    // Final guardrail on size
    const maxSize = this.config.maxLogSize ?? 1024 * 1024;
    if (Buffer.byteLength(content, 'utf8') > maxSize) {
      const lines = content.split('\n');
      while (Buffer.byteLength(content, 'utf8') > maxSize && lines.length > 1) {
        lines.shift();
        content = `[Log truncated to ${maxSize} bytes]\n${lines.join('\n')}`;
      }
    }

    await fs.writeFile(filePath, content, 'utf8');

    // Enforce file-based limits asynchronously
    await this.cleanupFilesAsync();

    return filePath;
  }

  /**
   * Delete a log file (best effort)
   */
  private async deleteLogFile(filePath: string): Promise<void> {
    try {
      await fs.rm(filePath, { force: true });
    } catch (error) {
      debugWarn(`Failed to remove log file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Gather log file info in the configured directory
   */
  private async getLogFiles(): Promise<Array<{ file: string; fullPath: string; mtimeMs: number; size: number }>> {
    if (!this.resolvedLogDir) return [];
    try {
      const files = await fs.readdir(this.resolvedLogDir);
      const logFiles = files.filter(f => f.endsWith('.log'));
      const stats = await Promise.all(
        logFiles.map(async file => {
          const fullPath = path.join(this.resolvedLogDir!, file);
          const stat = await fs.stat(fullPath);
          return {
            file,
            fullPath,
            mtimeMs: stat.mtimeMs,
            size: stat.size
          };
        })
      );
      return stats;
    } catch (error) {
      debugWarn(`Failed to read log directory ${this.resolvedLogDir}: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Cleanup log files on disk based on retention/count/size
   */
  private async cleanupFilesAsync(): Promise<void> {
    if (!this.resolvedLogDir) return;

    const files = await this.getLogFiles();
    if (files.length === 0) return;

    const now = Date.now();
    const retentionMs = this.getRetentionMs();
    const maxFiles = this.config.maxStoredLogs ?? 50;
    const maxTotalBytes = this.getMaxTotalBytes();

    // Sort oldest first
    const sorted = files.sort((a, b) => a.mtimeMs - b.mtimeMs);
    const toDelete = new Set<string>();

    // Retention
    if (retentionMs > 0) {
      for (const info of sorted) {
        if (now - info.mtimeMs > retentionMs) {
          toDelete.add(info.fullPath);
        }
      }
    }

    // Count limit
    while (sorted.length - Array.from(toDelete).length > maxFiles) {
      const oldest = sorted.shift();
      if (oldest) {
        toDelete.add(oldest.fullPath);
      }
    }

    // Size limit
    let totalSize = sorted.reduce((sum, f) => toDelete.has(f.fullPath) ? sum : sum + f.size, 0);
    for (const info of sorted) {
      if (totalSize <= maxTotalBytes) break;
      if (toDelete.has(info.fullPath)) continue;
      toDelete.add(info.fullPath);
      totalSize -= info.size;
    }

    // Apply deletions
    for (const filePath of toDelete) {
      await this.deleteLogFile(filePath);
    }
  }

  /**
   * Calculate retention in milliseconds, preferring days when provided
   */
  private getRetentionMs(): number {
    if (this.config.logRetentionDays !== undefined) {
      return this.config.logRetentionDays * 24 * 60 * 60 * 1000;
    }
    return (this.config.logRetentionMinutes ?? 60) * 60 * 1000;
  }

  /**
   * Get max total bytes allowed for storage (memory/disk)
   */
  private getMaxTotalBytes(): number {
    if (this.config.maxTotalLogSize !== undefined) {
      return this.config.maxTotalLogSize;
    }
    return this.config.maxTotalStorageSize ?? 50 * 1024 * 1024;
  }
}
