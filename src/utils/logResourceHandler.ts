/**
 * Handler for log resource requests
 */

import { LogStorageManager } from './logStorage.js';
import { LoggingConfig } from '../types/config.js';
import { LogResourceError, LogErrorType, ParsedLogUri } from '../types/logging.js';
import { LineRangeProcessor } from './lineRangeProcessor.js';
import { SearchProcessor } from './searchProcessor.js';

/**
 * Result of reading a resource
 */
export interface ReadResourceResult {
  contents: Array<{
    uri: string;
    mimeType: string;
    text: string;
  }>;
}

/**
 * Handles all log resource requests
 */
export class LogResourceHandler {
  constructor(
    private logStorage: LogStorageManager,
    private config: LoggingConfig
  ) {}

  /**
   * Handle a resource read request
   */
  public async handleRead(uri: string): Promise<ReadResourceResult> {
    const parsed = this.parseLogUri(uri);

    switch (parsed.type) {
      case 'list':
        return this.handleListResource();
      case 'recent':
        return this.handleRecentResource(parsed.params);
      case 'full':
        return this.handleFullLogResource(parsed.id!);
      case 'range':
        return this.handleRangeResource(parsed.id!, parsed.params);
      case 'search':
        return this.handleSearchResource(parsed.id!, parsed.params);
      default:
        throw new LogResourceError(
          LogErrorType.INVALID_URI,
          `Unknown resource type: ${uri}`
        );
    }
  }

  /**
   * Parse a log resource URI
   */
  private parseLogUri(uri: string): ParsedLogUri {
    try {
      const url = new URL(uri);
      const pathParts = url.pathname.split('/').filter(p => p);

      // cli://logs/...
      if (pathParts[0] !== 'logs') {
        throw new Error('Invalid log URI - must start with cli://logs/');
      }

      // cli://logs/list
      if (pathParts[1] === 'list') {
        return { type: 'list', params: url.searchParams };
      }

      // cli://logs/recent
      if (pathParts[1] === 'recent') {
        return { type: 'recent', params: url.searchParams };
      }

      // cli://logs/commands/{id}
      if (pathParts[1] === 'commands' && pathParts[2]) {
        const id = pathParts[2];

        // cli://logs/commands/{id}/range
        if (pathParts[3] === 'range') {
          return { type: 'range', id, params: url.searchParams };
        }

        // cli://logs/commands/{id}/search
        if (pathParts[3] === 'search') {
          return { type: 'search', id, params: url.searchParams };
        }

        // cli://logs/commands/{id}
        return { type: 'full', id, params: url.searchParams };
      }

      throw new Error(`Invalid log URI format: ${uri}`);
    } catch (error) {
      throw new LogResourceError(
        LogErrorType.INVALID_URI,
        `Failed to parse log URI: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Handle list resource - returns all stored logs with metadata
   */
  private handleListResource(): Promise<ReadResourceResult> {
    const logs = this.logStorage.listLogs();
    const stats = this.logStorage.getStats();

    const response = {
      logs: logs.map(log => ({
        id: log.id,
        timestamp: log.timestamp.toISOString(),
        command: log.command,
        shell: log.shell,
        workingDirectory: log.workingDirectory,
        exitCode: log.exitCode,
        totalLines: log.totalLines,
        stdoutLines: log.stdoutLines,
        stderrLines: log.stderrLines,
        size: log.size,
        wasTruncated: log.wasTruncated
      })),
      totalCount: logs.length,
      totalSize: stats.totalSize,
      maxLogs: stats.maxLogs,
      maxSize: stats.maxSize
    };

    return Promise.resolve({
      contents: [{
        uri: 'cli://logs/list',
        mimeType: 'application/json',
        text: JSON.stringify(response, null, 2)
      }]
    });
  }

  /**
   * Handle recent resource - returns N most recent logs
   */
  private handleRecentResource(params: URLSearchParams): Promise<ReadResourceResult> {
    const n = parseInt(params.get('n') || '5', 10);
    const shell = params.get('shell') || undefined;

    // Validate n parameter
    if (isNaN(n) || n < 1 || n > 100) {
      throw new LogResourceError(
        LogErrorType.INVALID_URI,
        'Parameter "n" must be between 1 and 100'
      );
    }

    const logs = this.logStorage.listLogs({ shell });
    const recent = logs.slice(-n); // Get last N logs

    const response = {
      logs: recent.map(log => ({
        id: log.id,
        timestamp: log.timestamp.toISOString(),
        command: log.command,
        shell: log.shell,
        workingDirectory: log.workingDirectory,
        exitCode: log.exitCode,
        totalLines: log.totalLines,
        size: log.size
      })),
      count: recent.length,
      limit: n,
      shell: shell || null
    };

    return Promise.resolve({
      contents: [{
        uri: 'cli://logs/recent',
        mimeType: 'application/json',
        text: JSON.stringify(response, null, 2)
      }]
    });
  }

  /**
   * Handle full log resource - returns complete output from a specific execution
   */
  private handleFullLogResource(id: string): Promise<ReadResourceResult> {
    const log = this.logStorage.getLog(id);

    if (!log) {
      throw new LogResourceError(
        LogErrorType.LOG_NOT_FOUND,
        `Log entry not found: ${id}`,
        { requestedId: id }
      );
    }

    return Promise.resolve({
      contents: [{
        uri: `cli://logs/commands/${id}`,
        mimeType: 'text/plain',
        text: log.combinedOutput
      }]
    });
  }

  /**
   * Handle range resource - returns a specific range of lines from a log
   */
  private handleRangeResource(
    id: string,
    params: URLSearchParams
  ): Promise<ReadResourceResult> {
    const log = this.logStorage.getLog(id);

    if (!log) {
      throw new LogResourceError(
        LogErrorType.LOG_NOT_FOUND,
        `Log entry not found: ${id}`,
        { requestedId: id }
      );
    }

    // Parse parameters
    const startParam = params.get('start');
    const endParam = params.get('end');

    if (!startParam || !endParam) {
      throw new LogResourceError(
        LogErrorType.INVALID_RANGE,
        'Both start and end parameters are required for range queries',
        { hasStart: !!startParam, hasEnd: !!endParam }
      );
    }

    const start = parseInt(startParam, 10);
    const end = parseInt(endParam, 10);

    if (isNaN(start) || isNaN(end)) {
      throw new LogResourceError(
        LogErrorType.INVALID_RANGE,
        'start and end parameters must be valid integers',
        { start: startParam, end: endParam }
      );
    }

    // Parse options
    const lineNumbers = params.get('lineNumbers') !== 'false';

    // Process range
    const result = LineRangeProcessor.processRange(
      log.combinedOutput,
      start,
      end,
      { lineNumbers }
    );

    return Promise.resolve({
      contents: [{
        uri: `cli://logs/commands/${id}/range`,
        mimeType: 'text/plain',
        text: result
      }]
    });
  }

  /**
   * Handle search resource - search for a pattern with context
   */
  private handleSearchResource(
    id: string,
    params: URLSearchParams
  ): Promise<ReadResourceResult> {
    const log = this.logStorage.getLog(id);

    if (!log) {
      throw new LogResourceError(
        LogErrorType.LOG_NOT_FOUND,
        `Log entry not found: ${id}`,
        { requestedId: id }
      );
    }

    // Parse search parameters
    const pattern = params.get('q');
    if (!pattern) {
      throw new LogResourceError(
        LogErrorType.INVALID_SEARCH,
        'Search pattern (q parameter) is required',
        { availableParams: Array.from(params.keys()) }
      );
    }

    // Parse options
    const contextLines = parseInt(params.get('context') || '3', 10);
    const occurrence = parseInt(params.get('occurrence') || '1', 10);
    const caseInsensitive = params.get('caseInsensitive') === 'true';
    const lineNumbers = params.get('lineNumbers') !== 'false';

    // Validate parameters
    if (isNaN(contextLines) || contextLines < 0 || contextLines > 20) {
      throw new LogResourceError(
        LogErrorType.INVALID_SEARCH,
        'context parameter must be between 0 and 20',
        { context: params.get('context') }
      );
    }

    if (isNaN(occurrence) || occurrence < 1) {
      throw new LogResourceError(
        LogErrorType.INVALID_SEARCH,
        'occurrence parameter must be a positive integer',
        { occurrence: params.get('occurrence') }
      );
    }

    // Perform search
    const result = SearchProcessor.search(log.combinedOutput, {
      pattern,
      contextLines,
      occurrence,
      caseInsensitive,
      lineNumbers
    });

    return Promise.resolve({
      contents: [{
        uri: `cli://logs/commands/${id}/search`,
        mimeType: 'text/plain',
        text: result.fullOutput || ''
      }]
    });
  }
}
