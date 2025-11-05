# MCP Log Resource Feature - Implementation Plan

## Table of Contents

1. [Overview](#overview)
2. [Phase 1: Foundation](#phase-1-foundation)
3. [Phase 2: Output Truncation](#phase-2-output-truncation)
4. [Phase 3: Log Storage](#phase-3-log-storage)
5. [Phase 4: Basic Resources](#phase-4-basic-resources)
6. [Phase 5: Range Queries](#phase-5-range-queries)
7. [Phase 6: Search Functionality](#phase-6-search-functionality)
8. [Phase 7: Testing & Documentation](#phase-7-testing--documentation)
9. [Phase 8: Optimization & Polish](#phase-8-optimization--polish)

## Overview

This document provides a detailed, step-by-step implementation plan for the MCP log resource feature. Each phase builds upon the previous one, allowing for incremental development and testing.

**Estimated Total Time**: 9-14 days
**Target Completion**: TBD

---

## Phase 1: Foundation

**Duration**: 1 day
**Goal**: Set up data structures, types, and configuration schema

### Tasks

#### 1.1: Create Type Definitions

**File**: `src/types/logging.ts` (NEW)

```typescript
// Create comprehensive type definitions for logging system
export interface CommandLogEntry { ... }
export interface LogStorage { ... }
export interface LogResourceQuery { ... }
export interface SearchResult { ... }
export interface SearchOptions { ... }
export interface RangeOptions { ... }
export interface TruncatedOutput { ... }
export interface LogFilter { ... }
export interface QueryResult { ... }

// Error types
export enum LogErrorType { ... }
export class LogResourceError extends Error { ... }
```

**Checklist**:
- [ ] Define all interfaces from technical spec
- [ ] Add JSDoc comments for each type
- [ ] Export all types
- [ ] Add type guards where needed

#### 1.2: Extend Configuration Types

**File**: `src/types/config.ts`

```typescript
// Add LoggingConfig interface
export interface LoggingConfig {
  maxOutputLines: number;
  enableTruncation: boolean;
  truncationMessage: string;
  maxStoredLogs: number;
  maxLogSize: number;
  maxTotalStorageSize: number;
  enableLogResources: boolean;
  logRetentionMinutes: number;
  cleanupIntervalMinutes: number;
}

// Update GlobalConfig to include logging
export interface GlobalConfig {
  security: SecurityConfig;
  restrictions: RestrictionsConfig;
  paths: PathsConfig;
  logging?: LoggingConfig;  // NEW
}
```

**Checklist**:
- [ ] Add LoggingConfig interface
- [ ] Update GlobalConfig interface
- [ ] Update ServerConfig interface if needed
- [ ] Add JSDoc comments

#### 1.3: Add Default Configuration

**File**: `src/utils/config.ts`

```typescript
const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  maxOutputLines: 20,
  enableTruncation: true,
  truncationMessage: '[Output truncated: Showing last {returnedLines} of {totalLines} lines]',
  maxStoredLogs: 50,
  maxLogSize: 1048576,
  maxTotalStorageSize: 52428800,
  enableLogResources: true,
  logRetentionMinutes: 60,
  cleanupIntervalMinutes: 5
};

// Update DEFAULT_GLOBAL_CONFIG
const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  // ... existing config ...
  logging: DEFAULT_LOGGING_CONFIG
};
```

**Checklist**:
- [ ] Define DEFAULT_LOGGING_CONFIG constant
- [ ] Update DEFAULT_GLOBAL_CONFIG
- [ ] Update loadServerConfig function to merge logging config
- [ ] Add validation for logging config values

#### 1.4: Configuration Validation

**File**: `src/utils/config.ts`

```typescript
function validateLoggingConfig(config: Partial<LoggingConfig>): void {
  // Validate maxOutputLines
  // Validate maxStoredLogs
  // Validate maxLogSize
  // Validate maxTotalStorageSize
  // Validate retention times
}

// Update loadServerConfig to call validateLoggingConfig
```

**Checklist**:
- [ ] Implement validateLoggingConfig function
- [ ] Add bounds checking for all numeric values
- [ ] Add helpful error messages
- [ ] Integrate into config loading pipeline
- [ ] Add unit tests for validation

#### 1.5: Update Configuration Examples

**File**: `config.examples/config.sample.json`

```json
{
  "global": {
    "security": { ... },
    "restrictions": { ... },
    "paths": { ... },
    "logging": {
      "maxOutputLines": 20,
      "enableTruncation": true,
      "maxStoredLogs": 50,
      "maxLogSize": 1048576,
      "enableLogResources": true
    }
  }
}
```

**Checklist**:
- [ ] Update config.sample.json
- [ ] Update config.development.json
- [ ] Update config.secure.json
- [ ] Add comments explaining logging options
- [ ] Update README with logging config section

---

## Phase 2: Output Truncation

**Duration**: 2 days
**Goal**: Implement output truncation in execute_command

### Tasks

#### 2.1: Create Truncation Utility

**File**: `src/utils/truncation.ts` (NEW)

```typescript
export interface TruncatedOutput {
  output: string;
  wasTruncated: boolean;
  totalLines: number;
  returnedLines: number;
  message: string | null;
}

export interface TruncationConfig {
  maxOutputLines: number;
  enableTruncation: boolean;
  truncationMessage: string;
}

export function truncateOutput(
  output: string,
  maxLines: number,
  config: TruncationConfig,
  executionId?: string
): TruncatedOutput {
  // Implementation
}

export function buildTruncationMessage(
  omittedLines: number,
  totalLines: number,
  returnedLines: number,
  executionId?: string,
  template?: string
): string {
  // Implementation
}
```

**Checklist**:
- [ ] Implement truncateOutput function
- [ ] Handle empty output edge case
- [ ] Handle output shorter than maxLines
- [ ] Implement buildTruncationMessage with template replacement
- [ ] Add comprehensive unit tests
- [ ] Test with various line endings (CRLF, LF)

#### 2.2: Update executeShellCommand

**File**: `src/index.ts`

Modify the `executeShellCommand` method in CLIServer class:

```typescript
private async executeShellCommand(
  command: string,
  shellName: string,
  config: ResolvedShellConfig,
  workingDir: string
): Promise<CallToolResult> {
  // ... existing execution logic ...

  // NEW: After collecting stdout/stderr
  const fullOutput = stdout + (stderr ? '\n' + stderr : '');

  // NEW: Store log (will implement in Phase 3)
  let executionId: string | undefined;
  if (this.config.global.logging?.enableLogResources) {
    // executionId = this.logStorage.storeLog(...);
    executionId = 'temp-id';  // Placeholder for Phase 2
  }

  // NEW: Truncate output
  let resultMessage: string;
  let wasTruncated = false;
  let totalLines = 0;
  let returnedLines = 0;

  if (this.config.global.logging?.enableTruncation) {
    const truncated = truncateOutput(
      fullOutput,
      this.config.global.logging.maxOutputLines,
      {
        maxOutputLines: this.config.global.logging.maxOutputLines,
        enableTruncation: true,
        truncationMessage: this.config.global.logging.truncationMessage
      },
      executionId
    );

    resultMessage = truncated.wasTruncated
      ? truncated.message + '\n\n' + truncated.output
      : truncated.output;

    wasTruncated = truncated.wasTruncated;
    totalLines = truncated.totalLines;
    returnedLines = truncated.returnedLines;
  } else {
    resultMessage = fullOutput;
    const lines = fullOutput.split('\n');
    totalLines = lines.length;
    returnedLines = lines.length;
  }

  // NEW: Enhanced metadata
  return {
    content: [{
      type: 'text',
      text: resultMessage
    }],
    isError: code !== 0,
    metadata: {
      exitCode: code ?? -1,
      shell: shellName,
      workingDirectory: workingDir,
      executionId: executionId,
      totalLines: totalLines,
      returnedLines: returnedLines,
      wasTruncated: wasTruncated
    }
  };
}
```

**Checklist**:
- [ ] Import truncateOutput utility
- [ ] Collect full output (stdout + stderr)
- [ ] Add truncation logic with config check
- [ ] Update return metadata
- [ ] Handle case when logging disabled
- [ ] Test with real commands (short and long output)
- [ ] Verify backward compatibility

#### 2.3: Integration Testing

**File**: `tests/integration/truncation.test.ts` (NEW)

```typescript
describe('Output Truncation', () => {
  test('should truncate long output', async () => { ... });
  test('should not truncate short output', async () => { ... });
  test('should include truncation message', async () => { ... });
  test('should respect maxOutputLines config', async () => { ... });
  test('should work when truncation disabled', async () => { ... });
  test('should handle empty output', async () => { ... });
  test('should include execution ID in metadata', async () => { ... });
});
```

**Checklist**:
- [ ] Write integration tests
- [ ] Test with various output sizes
- [ ] Test config variations
- [ ] Test edge cases
- [ ] Verify metadata correctness
- [ ] Run tests and fix issues

---

## Phase 3: Log Storage

**Duration**: 2 days
**Goal**: Implement log storage system with lifecycle management

### Tasks

#### 3.1: Create LogStorageManager

**File**: `src/utils/logStorage.ts` (NEW)

```typescript
export class LogStorageManager {
  private storage: LogStorage;
  private config: LoggingConfig;
  private cleanupTimer?: NodeJS.Timer;

  constructor(config: LoggingConfig) { ... }

  public storeLog(
    command: string,
    shell: string,
    workingDir: string,
    stdout: string,
    stderr: string,
    exitCode: number
  ): string { ... }

  public getLog(id: string): CommandLogEntry | undefined { ... }

  public listLogs(filter?: LogFilter): CommandLogEntry[] { ... }

  public hasLog(id: string): boolean { ... }

  public deleteLog(id: string): boolean { ... }

  public clear(): void { ... }

  public getStats(): StorageStats { ... }

  private generateId(): string { ... }

  private cleanup(): void { ... }

  private removeOldestEntry(): void { ... }

  private calculateSize(): number { ... }

  private isExpired(entry: CommandLogEntry): boolean { ... }

  public startCleanup(): void { ... }

  public stopCleanup(): void { ... }
}
```

**Checklist**:
- [ ] Implement constructor
- [ ] Implement storeLog with size checking
- [ ] Implement ID generation (timestamp + random)
- [ ] Implement getLog
- [ ] Implement listLogs with filtering
- [ ] Implement cleanup logic
- [ ] Implement size calculation
- [ ] Implement expiration checking
- [ ] Add unit tests for each method

#### 3.2: Create Cleanup Manager

Within `logStorage.ts`:

```typescript
class LogCleanupManager {
  private storage: LogStorageManager;

  constructor(storage: LogStorageManager) { ... }

  public performCleanup(): void {
    this.removeExpiredLogs();
    this.enforceStorageLimit();
    this.enforceCountLimit();
  }

  private removeExpiredLogs(): void { ... }
  private enforceStorageLimit(): void { ... }
  private enforceCountLimit(): void { ... }
}
```

**Checklist**:
- [ ] Implement cleanup logic
- [ ] Test FIFO eviction
- [ ] Test size-based eviction
- [ ] Test time-based expiration
- [ ] Test cleanup interval

#### 3.3: Integrate Storage with CLIServer

**File**: `src/index.ts`

```typescript
export class CLIServer {
  // ... existing properties ...
  private logStorage?: LogStorageManager;

  constructor() {
    // ... existing initialization ...

    // NEW: Initialize log storage
    if (this.config.global.logging?.enableLogResources) {
      this.logStorage = new LogStorageManager(this.config.global.logging);
      this.logStorage.startCleanup();
    }
  }

  // Update executeShellCommand to actually store logs
  private async executeShellCommand(...) {
    // ... execution logic ...

    // Store log
    let executionId: string | undefined;
    if (this.logStorage) {
      executionId = this.logStorage.storeLog(
        command,
        shellName,
        workingDir,
        stdout,
        stderr,
        code ?? -1
      );
    }

    // ... rest of function ...
  }

  // Add cleanup on shutdown
  public async shutdown(): Promise<void> {
    if (this.logStorage) {
      this.logStorage.stopCleanup();
      this.logStorage.clear();
    }
  }
}
```

**Checklist**:
- [ ] Add logStorage property
- [ ] Initialize in constructor
- [ ] Update executeShellCommand to store logs
- [ ] Add shutdown cleanup
- [ ] Test storage integration
- [ ] Verify logs are stored correctly

#### 3.4: Unit Tests for Storage

**File**: `tests/unit/logStorage.test.ts` (NEW)

```typescript
describe('LogStorageManager', () => {
  describe('storeLog', () => {
    test('should store log entry', () => { ... });
    test('should generate unique IDs', () => { ... });
    test('should respect maxStoredLogs', () => { ... });
    test('should respect maxLogSize', () => { ... });
    test('should truncate oversized logs', () => { ... });
  });

  describe('getLog', () => {
    test('should retrieve stored log', () => { ... });
    test('should return undefined for non-existent log', () => { ... });
  });

  describe('cleanup', () => {
    test('should remove expired logs', () => { ... });
    test('should enforce count limit', () => { ... });
    test('should enforce size limit', () => { ... });
    test('should remove oldest first', () => { ... });
  });

  describe('listLogs', () => {
    test('should list all logs', () => { ... });
    test('should filter by shell', () => { ... });
    test('should filter by exit code', () => { ... });
    test('should sort by timestamp', () => { ... });
  });
});
```

**Checklist**:
- [ ] Write comprehensive unit tests
- [ ] Test all public methods
- [ ] Test edge cases
- [ ] Test concurrent access scenarios
- [ ] Achieve >90% code coverage

---

## Phase 4: Basic Resources

**Duration**: 2 days
**Goal**: Implement list and full log resources

### Tasks

#### 4.1: Update Resource List Handler

**File**: `src/index.ts`

Modify the ListResourcesRequestSchema handler:

```typescript
this.server.setRequestHandler(
  ListResourcesRequestSchema,
  async () => {
    const resources: Resource[] = [
      // ... existing resources ...
    ];

    // NEW: Add log resources if enabled
    if (this.config.global.logging?.enableLogResources && this.logStorage) {
      // List resource
      resources.push({
        uri: 'cli://logs/list',
        mimeType: 'application/json',
        name: 'Command Execution Logs List',
        description: 'List all stored command execution logs'
      });

      // Recent resource
      resources.push({
        uri: 'cli://logs/recent',
        mimeType: 'application/json',
        name: 'Recent Command Logs',
        description: 'Get most recent command execution logs'
      });

      // Get all stored log IDs
      const logs = this.logStorage.listLogs();

      // Add resource for each log
      logs.forEach(log => {
        resources.push({
          uri: `cli://logs/commands/${log.id}`,
          mimeType: 'text/plain',
          name: `Log: ${log.command}`,
          description: `Full output from: ${log.command} (${log.shell})`
        });
      });
    }

    return { resources };
  }
);
```

**Checklist**:
- [ ] Add log list resource
- [ ] Add recent logs resource
- [ ] Add individual log resources
- [ ] Include proper descriptions
- [ ] Test resource discovery

#### 4.2: Implement Log Resource Reader

**File**: `src/utils/logResourceHandler.ts` (NEW)

```typescript
export class LogResourceHandler {
  constructor(
    private logStorage: LogStorageManager,
    private config: LoggingConfig
  ) {}

  public async handleRead(uri: string): Promise<ReadResourceResult> {
    // Parse URI
    const parsed = this.parseLogUri(uri);

    switch (parsed.type) {
      case 'list':
        return this.handleListResource();
      case 'recent':
        return this.handleRecentResource(parsed.params);
      case 'full':
        return this.handleFullLogResource(parsed.id);
      case 'range':
        // Will implement in Phase 5
        throw new Error('Range queries not yet implemented');
      case 'search':
        // Will implement in Phase 6
        throw new Error('Search not yet implemented');
      default:
        throw new LogResourceError(
          LogErrorType.INVALID_URI,
          `Unknown resource type: ${uri}`
        );
    }
  }

  private parseLogUri(uri: string): ParsedLogUri {
    // Parse different URI formats
    // cli://logs/list
    // cli://logs/recent?n=10
    // cli://logs/commands/{id}
    // cli://logs/commands/{id}/range?start=1&end=100
    // cli://logs/commands/{id}/search?q=error
  }

  private handleListResource(): Promise<ReadResourceResult> {
    const logs = this.logStorage.listLogs();

    const response = {
      logs: logs.map(log => ({
        id: log.id,
        timestamp: log.timestamp.toISOString(),
        command: log.command,
        shell: log.shell,
        workingDirectory: log.workingDirectory,
        exitCode: log.exitCode,
        totalLines: log.totalLines,
        size: log.size
      })),
      totalCount: logs.length,
      totalSize: this.logStorage.getStats().totalSize
    };

    return Promise.resolve({
      contents: [{
        uri: 'cli://logs/list',
        mimeType: 'application/json',
        text: JSON.stringify(response, null, 2)
      }]
    });
  }

  private handleRecentResource(params: URLSearchParams): Promise<ReadResourceResult> {
    const n = parseInt(params.get('n') || '5', 10);
    const shell = params.get('shell') || undefined;

    const logs = this.logStorage.listLogs({ shell });
    const recent = logs.slice(-n);

    const response = {
      logs: recent.map(log => ({ ... })),
      count: recent.length,
      limit: n
    };

    return Promise.resolve({
      contents: [{
        uri: 'cli://logs/recent',
        mimeType: 'application/json',
        text: JSON.stringify(response, null, 2)
      }]
    });
  }

  private handleFullLogResource(id: string): Promise<ReadResourceResult> {
    const log = this.logStorage.getLog(id);

    if (!log) {
      throw new LogResourceError(
        LogErrorType.LOG_NOT_FOUND,
        `Log not found: ${id}`,
        id
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
}
```

**Checklist**:
- [ ] Implement URI parsing
- [ ] Implement list resource handler
- [ ] Implement recent resource handler
- [ ] Implement full log resource handler
- [ ] Add error handling
- [ ] Add unit tests

#### 4.3: Integrate Resource Handler

**File**: `src/index.ts`

```typescript
this.server.setRequestHandler(
  ReadResourceRequestSchema,
  async (request) => {
    const uri = request.params.uri;

    // Handle log resources
    if (uri.startsWith('cli://logs/')) {
      if (!this.config.global.logging?.enableLogResources) {
        throw new Error('Log resources are disabled');
      }

      if (!this.logStorage) {
        throw new Error('Log storage not initialized');
      }

      const handler = new LogResourceHandler(
        this.logStorage,
        this.config.global.logging
      );

      return handler.handleRead(uri);
    }

    // ... existing resource handling ...
  }
);
```

**Checklist**:
- [ ] Add log resource routing
- [ ] Add feature flag check
- [ ] Add error handling
- [ ] Test all resource types
- [ ] Verify JSON formatting

#### 4.4: Integration Tests

**File**: `tests/integration/logResources.test.ts` (NEW)

```typescript
describe('Log Resources', () => {
  describe('cli://logs/list', () => {
    test('should list all logs', async () => { ... });
    test('should return empty list when no logs', async () => { ... });
    test('should include log metadata', async () => { ... });
  });

  describe('cli://logs/recent', () => {
    test('should return recent logs', async () => { ... });
    test('should respect n parameter', async () => { ... });
    test('should filter by shell', async () => { ... });
  });

  describe('cli://logs/commands/{id}', () => {
    test('should return full log', async () => { ... });
    test('should error on non-existent log', async () => { ... });
    test('should include stdout and stderr', async () => { ... });
  });
});
```

**Checklist**:
- [ ] Write integration tests
- [ ] Test all resource endpoints
- [ ] Test error cases
- [ ] Test with real command execution
- [ ] Verify resource discovery

---

## Phase 5: Range Queries

**Duration**: 1-2 days
**Goal**: Implement line range query functionality

### Tasks

#### 5.1: Create LineRangeProcessor

**File**: `src/utils/lineRangeProcessor.ts` (NEW)

```typescript
export interface RangeOptions {
  lineNumbers: boolean;
  maxLines?: number;
}

export class LineRangeProcessor {
  static processRange(
    output: string,
    start: number,
    end: number,
    options: RangeOptions
  ): string {
    const lines = output.split('\n');
    const totalLines = lines.length;

    // Convert negative indices
    const actualStart = start < 0 ? totalLines + start + 1 : start;
    const actualEnd = end < 0 ? totalLines + end + 1 : end;

    // Validate
    this.validateRange(actualStart, actualEnd, totalLines);

    // Extract
    const selectedLines = lines.slice(actualStart - 1, actualEnd);

    // Format
    return this.formatLines(
      selectedLines,
      actualStart,
      actualEnd,
      totalLines,
      options
    );
  }

  private static validateRange(
    start: number,
    end: number,
    totalLines: number
  ): void {
    if (start < 1) {
      throw new LogResourceError(
        LogErrorType.INVALID_RANGE,
        `Start line must be >= 1, got ${start}`
      );
    }

    if (end > totalLines) {
      throw new LogResourceError(
        LogErrorType.INVALID_RANGE,
        `End line ${end} exceeds total lines ${totalLines}`
      );
    }

    if (start > end) {
      throw new LogResourceError(
        LogErrorType.INVALID_RANGE,
        `Start line ${start} must be <= end line ${end}`
      );
    }
  }

  private static formatLines(
    lines: string[],
    startLineNumber: number,
    endLineNumber: number,
    totalLines: number,
    options: RangeOptions
  ): string {
    const parts: string[] = [];

    // Header
    parts.push(
      `Lines ${startLineNumber}-${endLineNumber} of ${totalLines}:`
    );
    parts.push('');

    // Lines
    if (options.lineNumbers) {
      lines.forEach((line, index) => {
        const lineNum = startLineNumber + index;
        parts.push(`${lineNum}: ${line}`);
      });
    } else {
      parts.push(...lines);
    }

    return parts.join('\n');
  }
}
```

**Checklist**:
- [ ] Implement processRange
- [ ] Handle negative indices
- [ ] Add validation
- [ ] Add formatting options
- [ ] Add unit tests for all cases

#### 5.2: Update LogResourceHandler

**File**: `src/utils/logResourceHandler.ts`

```typescript
// Add to handleRead method
case 'range':
  return this.handleRangeResource(parsed.id, parsed.params);

// Add new method
private handleRangeResource(
  id: string,
  params: URLSearchParams
): Promise<ReadResourceResult> {
  const log = this.logStorage.getLog(id);

  if (!log) {
    throw new LogResourceError(
      LogErrorType.LOG_NOT_FOUND,
      `Log not found: ${id}`,
      id
    );
  }

  // Parse parameters
  const startParam = params.get('start');
  const endParam = params.get('end');

  if (!startParam || !endParam) {
    throw new LogResourceError(
      LogErrorType.INVALID_RANGE,
      'Both start and end parameters are required'
    );
  }

  const start = parseInt(startParam, 10);
  const end = parseInt(endParam, 10);

  if (isNaN(start) || isNaN(end)) {
    throw new LogResourceError(
      LogErrorType.INVALID_RANGE,
      'start and end must be valid integers'
    );
  }

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
```

**Checklist**:
- [ ] Add range handler
- [ ] Parse query parameters
- [ ] Validate parameters
- [ ] Call LineRangeProcessor
- [ ] Handle errors
- [ ] Add tests

#### 5.3: Update parseLogUri

**File**: `src/utils/logResourceHandler.ts`

```typescript
private parseLogUri(uri: string): ParsedLogUri {
  // cli://logs/commands/{id}/range?start=1&end=100

  const url = new URL(uri);
  const pathParts = url.pathname.split('/').filter(p => p);

  if (pathParts[0] !== 'logs') {
    throw new Error('Invalid log URI');
  }

  if (pathParts[1] === 'list') {
    return { type: 'list', params: url.searchParams };
  }

  if (pathParts[1] === 'recent') {
    return { type: 'recent', params: url.searchParams };
  }

  if (pathParts[1] === 'commands' && pathParts[2]) {
    const id = pathParts[2];

    if (pathParts[3] === 'range') {
      return { type: 'range', id, params: url.searchParams };
    }

    if (pathParts[3] === 'search') {
      return { type: 'search', id, params: url.searchParams };
    }

    return { type: 'full', id, params: url.searchParams };
  }

  throw new Error(`Invalid log URI: ${uri}`);
}
```

**Checklist**:
- [ ] Update URI parsing
- [ ] Handle range URIs
- [ ] Extract query parameters
- [ ] Add error handling
- [ ] Add tests

#### 5.4: Tests

**File**: `tests/unit/lineRangeProcessor.test.ts` (NEW)

```typescript
describe('LineRangeProcessor', () => {
  test('should extract positive range', () => { ... });
  test('should handle negative indices', () => { ... });
  test('should format with line numbers', () => { ... });
  test('should format without line numbers', () => { ... });
  test('should validate range bounds', () => { ... });
  test('should handle edge cases', () => { ... });
});
```

**File**: `tests/integration/logRangeQueries.test.ts` (NEW)

```typescript
describe('Log Range Queries', () => {
  test('should query positive range', async () => { ... });
  test('should query negative range', async () => { ... });
  test('should handle invalid range', async () => { ... });
});
```

**Checklist**:
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Test all parameter combinations
- [ ] Test error cases
- [ ] Verify output format

---

## Phase 6: Search Functionality

**Duration**: 2-3 days
**Goal**: Implement search with context and occurrence handling

### Tasks

#### 6.1: Create SearchProcessor

**File**: `src/utils/searchProcessor.ts` (NEW)

```typescript
export interface SearchOptions {
  pattern: string;
  contextLines: number;
  occurrence: number;
  caseInsensitive: boolean;
  lineNumbers: boolean;
}

export interface SearchMatch {
  lineNumber: number;
  line: string;
}

export class SearchProcessor {
  static search(
    output: string,
    options: SearchOptions
  ): SearchResult {
    const lines = output.split('\n');

    // Find all matches
    const matches = this.findMatches(lines, options);

    if (matches.length === 0) {
      throw new LogResourceError(
        LogErrorType.NO_MATCHES,
        `No matches found for pattern: ${options.pattern}`,
        options.pattern
      );
    }

    // Validate occurrence
    if (options.occurrence < 1 || options.occurrence > matches.length) {
      throw new LogResourceError(
        LogErrorType.INVALID_OCCURRENCE,
        `Occurrence ${options.occurrence} out of range (1-${matches.length})`,
        { occurrence: options.occurrence, total: matches.length }
      );
    }

    // Get specific occurrence
    const match = matches[options.occurrence - 1];

    // Extract context
    const context = this.extractContext(
      lines,
      match.lineNumber - 1,
      options.contextLines
    );

    // Format result
    return {
      occurrenceNumber: options.occurrence,
      totalOccurrences: matches.length,
      matchLineNumber: match.lineNumber,
      beforeContext: context.before,
      matchLine: match.line,
      afterContext: context.after,
      fullOutput: this.formatSearchResult(
        context.before,
        match.line,
        context.after,
        match.lineNumber,
        options.occurrence,
        matches.length,
        options
      )
    };
  }

  private static findMatches(
    lines: string[],
    options: SearchOptions
  ): SearchMatch[] {
    const matches: SearchMatch[] = [];
    const flags = options.caseInsensitive ? 'gi' : 'g';
    const regex = new RegExp(options.pattern, flags);

    lines.forEach((line, index) => {
      if (regex.test(line)) {
        matches.push({
          lineNumber: index + 1,
          line: line
        });
      }
    });

    return matches;
  }

  private static extractContext(
    lines: string[],
    matchIndex: number,
    contextLines: number
  ): { before: string[]; after: string[] } {
    const startIndex = Math.max(0, matchIndex - contextLines);
    const endIndex = Math.min(lines.length - 1, matchIndex + contextLines);

    return {
      before: lines.slice(startIndex, matchIndex),
      after: lines.slice(matchIndex + 1, endIndex + 1)
    };
  }

  private static formatSearchResult(
    before: string[],
    match: string,
    after: string[],
    lineNumber: number,
    occurrence: number,
    totalOccurrences: number,
    options: SearchOptions
  ): string {
    const parts: string[] = [];

    // Header
    parts.push(
      `Search: "${options.pattern}" found ${totalOccurrences} occurrence(s)`
    );
    parts.push(
      `Showing occurrence ${occurrence} of ${totalOccurrences} at line ${lineNumber}:`
    );
    parts.push('');

    // Before context
    const startLineNum = lineNumber - before.length;
    if (options.lineNumbers) {
      before.forEach((line, i) => {
        parts.push(`${startLineNum + i}: ${line}`);
      });
    } else {
      parts.push(...before);
    }

    // Match line (highlighted)
    if (options.lineNumbers) {
      parts.push(`>>> ${lineNumber}: ${match} <<<`);
    } else {
      parts.push(`>>> ${match} <<<`);
    }

    // After context
    if (options.lineNumbers) {
      after.forEach((line, i) => {
        parts.push(`${lineNumber + i + 1}: ${line}`);
      });
    } else {
      parts.push(...after);
    }

    // Navigation hint
    if (occurrence < totalOccurrences) {
      parts.push('');
      parts.push(
        `To see next match, use occurrence=${occurrence + 1}`
      );
    }

    return parts.join('\n');
  }
}
```

**Checklist**:
- [ ] Implement search method
- [ ] Implement findMatches with regex
- [ ] Handle case sensitivity
- [ ] Implement context extraction
- [ ] Implement result formatting
- [ ] Add comprehensive unit tests

#### 6.2: Update LogResourceHandler

**File**: `src/utils/logResourceHandler.ts`

```typescript
// Add to handleRead method
case 'search':
  return this.handleSearchResource(parsed.id, parsed.params);

// Add new method
private handleSearchResource(
  id: string,
  params: URLSearchParams
): Promise<ReadResourceResult> {
  const log = this.logStorage.getLog(id);

  if (!log) {
    throw new LogResourceError(
      LogErrorType.LOG_NOT_FOUND,
      `Log not found: ${id}`,
      id
    );
  }

  // Parse search parameters
  const pattern = params.get('q');
  if (!pattern) {
    throw new LogResourceError(
      LogErrorType.INVALID_SEARCH,
      'Search pattern (q parameter) is required'
    );
  }

  const contextLines = parseInt(params.get('context') || '3', 10);
  const occurrence = parseInt(params.get('occurrence') || '1', 10);
  const caseInsensitive = params.get('caseInsensitive') === 'true';
  const lineNumbers = params.get('lineNumbers') !== 'false';

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
```

**Checklist**:
- [ ] Add search handler
- [ ] Parse query parameters
- [ ] Validate pattern parameter
- [ ] Call SearchProcessor
- [ ] Handle errors with helpful messages
- [ ] Add tests

#### 6.3: Tests

**File**: `tests/unit/searchProcessor.test.ts` (NEW)

```typescript
describe('SearchProcessor', () => {
  describe('findMatches', () => {
    test('should find single match', () => { ... });
    test('should find multiple matches', () => { ... });
    test('should handle case insensitive', () => { ... });
    test('should handle regex patterns', () => { ... });
    test('should return empty for no matches', () => { ... });
  });

  describe('extractContext', () => {
    test('should extract context lines', () => { ... });
    test('should handle start of file', () => { ... });
    test('should handle end of file', () => { ... });
  });

  describe('formatSearchResult', () => {
    test('should format with line numbers', () => { ... });
    test('should format without line numbers', () => { ... });
    test('should include navigation hint', () => { ... });
  });
});
```

**File**: `tests/integration/logSearchQueries.test.ts` (NEW)

```typescript
describe('Log Search Queries', () => {
  test('should search for pattern', async () => { ... });
  test('should return occurrence count', async () => { ... });
  test('should navigate between occurrences', async () => { ... });
  test('should handle case insensitive search', async () => { ... });
  test('should error on no matches', async () => { ... });
  test('should error on invalid occurrence', async () => { ... });
});
```

**Checklist**:
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Test all search options
- [ ] Test error cases
- [ ] Verify occurrence navigation

---

## Phase 7: Testing & Documentation

**Duration**: 2 days
**Goal**: Comprehensive testing and documentation

### Tasks

#### 7.1: End-to-End Tests

**File**: `tests/e2e/logFeature.test.ts` (NEW)

```typescript
describe('Log Feature End-to-End', () => {
  test('full workflow: execute, truncate, store, query', async () => {
    // 1. Execute command with long output
    // 2. Verify truncation
    // 3. Verify storage
    // 4. Query full log
    // 5. Query range
    // 6. Search log
  });

  test('configuration: disable truncation', async () => { ... });
  test('configuration: disable log resources', async () => { ... });
  test('storage limits: max logs', async () => { ... });
  test('storage limits: max size', async () => { ... });
  test('cleanup: expiration', async () => { ... });
});
```

**Checklist**:
- [ ] Write end-to-end tests
- [ ] Test full workflows
- [ ] Test configuration variations
- [ ] Test edge cases
- [ ] Achieve >85% coverage

#### 7.2: Performance Tests

**File**: `tests/performance/logPerformance.test.ts` (NEW)

```typescript
describe('Log Performance', () => {
  test('truncation should be fast (<10ms)', async () => { ... });
  test('storage should handle large logs', async () => { ... });
  test('search should be fast (<100ms)', async () => { ... });
  test('range query should be fast (<50ms)', async () => { ... });
  test('memory usage should stay under limit', async () => { ... });
});
```

**Checklist**:
- [ ] Write performance tests
- [ ] Set performance benchmarks
- [ ] Test with large outputs
- [ ] Monitor memory usage
- [ ] Optimize bottlenecks

#### 7.3: Update Documentation

**Files to Update**:
- `README.md`
- `docs/API.md`
- `docs/ARCHITECTURE.md`
- `docs/CONFIGURATION_EXAMPLES.md`

**README.md additions**:
```markdown
## Log Management

wcli0 automatically stores command output and provides resources for querying logs:

### Output Truncation

By default, command responses show only the last 20 lines. Configure in config:

```json
{
  "global": {
    "logging": {
      "maxOutputLines": 20,
      "enableTruncation": true
    }
  }
}
```

### Log Resources

Access full command output via MCP resources:

- `cli://logs/list` - List all stored logs
- `cli://logs/recent?n=10` - Get recent logs
- `cli://logs/commands/{id}` - Full output
- `cli://logs/commands/{id}/range?start=1&end=100` - Line range
- `cli://logs/commands/{id}/search?q=error&context=3` - Search

See [API.md](docs/API.md) for details.
```

**API.md additions**:
- Full resource URI reference
- Query parameter documentation
- Example requests and responses
- Error codes and messages

**ARCHITECTURE.md additions**:
- Log storage system design
- Storage lifecycle
- Cleanup policies
- Performance characteristics

**CONFIGURATION_EXAMPLES.md additions**:
- Logging configuration section
- Example configurations
- Best practices

**Checklist**:
- [ ] Update README
- [ ] Update API documentation
- [ ] Update architecture docs
- [ ] Add configuration examples
- [ ] Add usage examples
- [ ] Review and polish all docs

#### 7.4: Code Review Checklist

Create `docs/tasks/mcp_log_resource/REVIEW_CHECKLIST.md`:

```markdown
# Code Review Checklist

## Functionality
- [ ] All features working as specified
- [ ] Error handling comprehensive
- [ ] Edge cases handled
- [ ] Configuration respected

## Code Quality
- [ ] TypeScript types complete
- [ ] No any types (except necessary)
- [ ] Proper error classes
- [ ] Consistent naming
- [ ] JSDoc comments

## Testing
- [ ] Unit tests for all functions
- [ ] Integration tests for workflows
- [ ] Performance tests passing
- [ ] Edge cases covered
- [ ] >85% coverage

## Documentation
- [ ] API docs complete
- [ ] Configuration documented
- [ ] Examples provided
- [ ] Architecture explained

## Performance
- [ ] No memory leaks
- [ ] Efficient algorithms
- [ ] Proper cleanup
- [ ] Meets benchmarks

## Backward Compatibility
- [ ] Existing features work
- [ ] Config migration handled
- [ ] No breaking changes
```

**Checklist**:
- [ ] Create review checklist
- [ ] Complete self-review
- [ ] Fix all issues
- [ ] Request peer review

---

## Phase 8: Optimization & Polish

**Duration**: 1 day
**Goal**: Optimize performance and polish user experience

### Tasks

#### 8.1: Performance Optimization

**Areas to optimize**:

1. **Line splitting caching**:
```typescript
class CachedLogEntry extends CommandLogEntry {
  private _lines?: string[];

  get lines(): string[] {
    if (!this._lines) {
      this._lines = this.combinedOutput.split('\n');
    }
    return this._lines;
  }
}
```

2. **Regex compilation caching**:
```typescript
private regexCache = new Map<string, RegExp>();

private getRegex(pattern: string, flags: string): RegExp {
  const key = `${pattern}|${flags}`;
  if (!this.regexCache.has(key)) {
    this.regexCache.set(key, new RegExp(pattern, flags));
  }
  return this.regexCache.get(key)!;
}
```

3. **Search early termination**:
```typescript
// Stop after finding requested occurrence
if (matches.length >= options.occurrence) {
  break;
}
```

**Checklist**:
- [ ] Implement caching strategies
- [ ] Optimize hot paths
- [ ] Reduce allocations
- [ ] Profile and measure
- [ ] Verify improvements

#### 8.2: Error Message Polish

Review all error messages:
- [ ] Clear and actionable
- [ ] Include examples
- [ ] Suggest fixes
- [ ] Consistent format

#### 8.3: Resource URI Validation

Add comprehensive URI validation:
- [ ] Validate all parameters
- [ ] Helpful error for invalid URIs
- [ ] Suggest correct format
- [ ] List available resources

#### 8.4: Final Testing

Run full test suite:
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All e2e tests pass
- [ ] Performance tests pass
- [ ] No regressions

#### 8.5: Release Preparation

- [ ] Update CHANGELOG.md
- [ ] Version bump
- [ ] Create migration guide (if needed)
- [ ] Prepare release notes
- [ ] Tag release

---

## Summary Checklist

### Phase 1: Foundation
- [ ] Type definitions created
- [ ] Configuration extended
- [ ] Defaults defined
- [ ] Validation implemented

### Phase 2: Output Truncation
- [ ] Truncation utility created
- [ ] executeShellCommand updated
- [ ] Tests passing

### Phase 3: Log Storage
- [ ] LogStorageManager implemented
- [ ] Cleanup logic working
- [ ] Integration complete
- [ ] Tests passing

### Phase 4: Basic Resources
- [ ] Resource list updated
- [ ] List resource working
- [ ] Recent resource working
- [ ] Full log resource working
- [ ] Tests passing

### Phase 5: Range Queries
- [ ] LineRangeProcessor implemented
- [ ] Range resource working
- [ ] Negative indices supported
- [ ] Tests passing

### Phase 6: Search Functionality
- [ ] SearchProcessor implemented
- [ ] Search resource working
- [ ] Occurrence navigation working
- [ ] Tests passing

### Phase 7: Testing & Documentation
- [ ] E2E tests complete
- [ ] Performance tests passing
- [ ] Documentation updated
- [ ] Code review done

### Phase 8: Optimization & Polish
- [ ] Performance optimized
- [ ] Error messages polished
- [ ] Final testing complete
- [ ] Release ready

---

**Document Version**: 1.0
**Last Updated**: 2025-11-05
**Status**: Draft for Review
