/**
 * Type definitions for the logging system
 */

/**
 * Represents a single command execution log entry
 */
export interface CommandLogEntry {
  /** Unique identifier for this execution (timestamp-based) */
  id: string;

  /** Execution metadata */
  timestamp: Date;
  command: string;
  shell: string;
  workingDirectory: string;
  exitCode: number;

  /** Output data */
  stdout: string;
  stderr: string;
  combinedOutput: string; // stdout + stderr in execution order

  /** Statistics */
  totalLines: number;
  stdoutLines: number;
  stderrLines: number;

  /** Truncation info (from when returned to user) */
  wasTruncated: boolean;
  returnedLines: number;

  /** Size tracking */
  size: number; // Total bytes
}

/**
 * Internal storage structure for log entries
 */
export interface LogStorage {
  /** Map of log ID to log entry */
  entries: Map<string, CommandLogEntry>;

  /** Ordered list of IDs for FIFO cleanup */
  executionOrder: string[];

  /** Current total storage size in bytes */
  totalStorageSize: number;
}

/**
 * Storage statistics
 */
export interface StorageStats {
  /** Total number of stored logs */
  totalLogs: number;

  /** Total storage size in bytes */
  totalSize: number;

  /** Maximum allowed logs */
  maxLogs: number;

  /** Maximum allowed storage size in bytes */
  maxSize: number;
}

/**
 * Filter criteria for listing logs
 */
export interface LogFilter {
  /** Filter by shell type */
  shell?: string;

  /** Filter by exit code */
  exitCode?: number;

  /** Filter by minimum timestamp */
  since?: Date;

  /** Filter by maximum timestamp */
  until?: Date;
}

/**
 * Configuration for output truncation
 */
export interface TruncationConfig {
  /** Maximum number of lines to return */
  maxOutputLines: number;

  /** Whether truncation is enabled */
  enableTruncation: boolean;

  /** Custom truncation message template */
  truncationMessage: string;
}

/**
 * Result of output truncation
 */
export interface TruncatedOutput {
  /** The truncated output string */
  output: string;

  /** Whether the output was truncated */
  wasTruncated: boolean;

  /** Total number of lines in original output */
  totalLines: number;

  /** Number of lines returned */
  returnedLines: number;

  /** Truncation message (null if not truncated) */
  message: string | null;
}

/**
 * Query parameters for log resources
 */
export interface LogResourceQuery {
  type: 'range' | 'search' | 'full' | 'list' | 'recent';

  /** Range query parameters */
  startLine?: number; // 1-based, supports negative
  endLine?: number; // 1-based, supports negative

  /** Search query parameters */
  searchPattern?: string;
  contextLines?: number;
  occurrence?: number; // Which match to return (1-based)
  caseInsensitive?: boolean;

  /** Output options */
  includeLineNumbers?: boolean;
  maxResults?: number;
}

/**
 * Options for range queries
 */
export interface RangeOptions {
  /** Include line numbers in output */
  lineNumbers: boolean;

  /** Maximum number of lines to return */
  maxLines?: number;
}

/**
 * Options for search queries
 */
export interface SearchOptions {
  /** Search pattern (regex) */
  pattern: string;

  /** Number of context lines before/after match */
  contextLines: number;

  /** Which occurrence to return (1-based) */
  occurrence: number;

  /** Case-insensitive search */
  caseInsensitive: boolean;

  /** Include line numbers in output */
  lineNumbers: boolean;
}

/**
 * A single search match
 */
export interface SearchMatch {
  /** Line number where match was found (1-based) */
  lineNumber: number;

  /** The matching line content */
  line: string;
}

/**
 * Result of a search operation
 */
export interface SearchResult {
  /** Which occurrence this is */
  occurrenceNumber: number;

  /** Total number of occurrences found */
  totalOccurrences: number;

  /** Line number of the match (1-based) */
  matchLineNumber: number;

  /** Lines before the match */
  beforeContext: string[];

  /** The matching line */
  matchLine: string;

  /** Lines after the match */
  afterContext: string[];

  /** Formatted output with context */
  fullOutput?: string;
}

/**
 * Result of a query operation
 */
export interface QueryResult {
  /** The result content */
  content: string;

  /** Metadata about the query */
  metadata?: {
    totalLines?: number;
    returnedLines?: number;
    matchCount?: number;
  };
}

/**
 * Error types for log resource operations
 */
export enum LogErrorType {
  LOG_NOT_FOUND = 'LOG_NOT_FOUND',
  INVALID_RANGE = 'INVALID_RANGE',
  INVALID_SEARCH = 'INVALID_SEARCH',
  NO_MATCHES = 'NO_MATCHES',
  INVALID_OCCURRENCE = 'INVALID_OCCURRENCE',
  STORAGE_LIMIT = 'STORAGE_LIMIT',
  LOGS_DISABLED = 'LOGS_DISABLED',
  INVALID_URI = 'INVALID_URI'
}

/**
 * Custom error class for log resource operations
 */
export class LogResourceError extends Error {
  constructor(
    public type: LogErrorType,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'LogResourceError';

    // Maintain proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LogResourceError);
    }
  }
}

/**
 * Parsed log URI components
 */
export interface ParsedLogUri {
  /** Type of resource */
  type: 'list' | 'recent' | 'full' | 'range' | 'search';

  /** Log ID (for specific log queries) */
  id?: string;

  /** Query parameters */
  params: URLSearchParams;
}
