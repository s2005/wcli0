# MCP Log Resource Feature - Technical Specification

## Table of Contents

1. [Data Structures](#data-structures)
2. [Storage System Design](#storage-system-design)
3. [Output Truncation Logic](#output-truncation-logic)
4. [Resource URI Specification](#resource-uri-specification)
5. [Query Parameter Processing](#query-parameter-processing)
6. [Configuration Schema](#configuration-schema)
7. [Error Handling](#error-handling)
8. [Performance Considerations](#performance-considerations)

## Data Structures

### CommandLogEntry

```typescript
interface CommandLogEntry {
  // Unique identifier for this execution
  id: string;

  // Execution metadata
  timestamp: Date;
  command: string;
  shell: string;
  workingDirectory: string;
  exitCode: number;

  // Output data
  stdout: string;
  stderr: string;
  combinedOutput: string;  // stdout + stderr in execution order

  // Statistics
  totalLines: number;
  stdoutLines: number;
  stderrLines: number;

  // Truncation info
  wasTruncated: boolean;
  returnedLines: number;

  // Size tracking
  size: number;  // Total bytes
}
```

### LogStorage

```typescript
interface LogStorage {
  // Core storage
  entries: Map<string, CommandLogEntry>;

  // Ordered list for FIFO cleanup
  executionOrder: string[];

  // Statistics
  totalStorageSize: number;
  maxEntries: number;
  maxSizePerEntry: number;
}
```

### LogResourceQuery

```typescript
interface LogResourceQuery {
  type: 'range' | 'search' | 'full';

  // Range query parameters
  startLine?: number;  // 1-based, supports negative
  endLine?: number;    // 1-based, supports negative

  // Search query parameters
  searchPattern?: string;
  contextLines?: number;
  occurrence?: number;  // Which match to return (1-based)

  // Output options
  includeLineNumbers?: boolean;
  maxResults?: number;
}
```

### SearchResult

```typescript
interface SearchResult {
  // Match information
  occurrenceNumber: number;
  totalOccurrences: number;
  matchLineNumber: number;  // 1-based line number of match

  // Context
  beforeContext: string[];
  matchLine: string;
  afterContext: string[];

  // Full output if needed
  fullOutput?: string;
}
```

## Storage System Design

### LogStorageManager Class

```typescript
class LogStorageManager {
  private storage: LogStorage;
  private config: LogStorageConfig;

  constructor(config: LogStorageConfig) {
    this.storage = {
      entries: new Map(),
      executionOrder: [],
      totalStorageSize: 0,
      maxEntries: config.maxStoredLogs,
      maxSizePerEntry: config.maxLogSize
    };
    this.config = config;
  }

  /**
   * Store a new command execution log
   * Returns the execution ID
   */
  public storeLog(
    command: string,
    shell: string,
    workingDir: string,
    stdout: string,
    stderr: string,
    exitCode: number
  ): string;

  /**
   * Retrieve a log entry by ID
   */
  public getLog(id: string): CommandLogEntry | undefined;

  /**
   * Get all log entries, optionally filtered
   */
  public listLogs(filter?: LogFilter): CommandLogEntry[];

  /**
   * Query log content with advanced filters
   */
  public queryLog(id: string, query: LogResourceQuery): QueryResult;

  /**
   * Clean up old entries based on policy
   */
  private cleanup(): void;

  /**
   * Calculate total size of stored logs
   */
  private calculateSize(): number;

  /**
   * Generate unique execution ID
   */
  private generateId(): string;
}
```

### Storage Lifecycle

1. **Insertion**:

   ```typescript
   storeLog() {
     1. Generate unique ID (timestamp + random)
     2. Create CommandLogEntry
     3. Check size limits (truncate if needed)
     4. Add to Map and executionOrder
     5. Update totalStorageSize
     6. Trigger cleanup if needed
     7. Return ID
   }
   ```

2. **Cleanup Policy**:

   ```typescript
   cleanup() {
     while (needsCleanup()) {
       if (exceedsMaxEntries() || exceedsMaxTotalSize()) {
         removeOldestEntry()
       }
     }
   }
   ```

3. **Size Calculation**:

   ```typescript
   calculateEntrySize(entry) {
     return entry.stdout.length +
            entry.stderr.length +
            entry.combinedOutput.length +
            estimateMetadataSize();
   }
   ```

## Output Truncation Logic

### Truncation Algorithm

```typescript
function truncateOutput(
  output: string,
  maxLines: number,
  config: TruncationConfig
): TruncatedOutput {
  // Split into lines
  const lines = output.split('\n');
  const totalLines = lines.length;

  // Check if truncation needed
  if (totalLines <= maxLines) {
    return {
      output: output,
      wasTruncated: false,
      totalLines: totalLines,
      returnedLines: totalLines,
      message: null
    };
  }

  // Take last maxLines lines
  const truncatedLines = lines.slice(-maxLines);
  const truncatedOutput = truncatedLines.join('\n');

  // Build truncation message
  const omittedLines = totalLines - maxLines;
  const message = buildTruncationMessage(omittedLines, totalLines, executionId);

  return {
    output: truncatedOutput,
    wasTruncated: true,
    totalLines: totalLines,
    returnedLines: maxLines,
    message: message
  };
}
```

### Truncation Message Format

```text
[Output truncated: Showing last {maxLines} of {totalLines} lines]
[{omittedLines} lines omitted]
[Access full output: cli://logs/commands/{executionId}]

{truncated output here}
```

### Integration with executeShellCommand

```typescript
// In executeShellCommand function (src/index.ts)
async executeShellCommand() {
  // ... existing execution logic ...

  // After collecting output
  const fullOutput = stdout + stderr;

  // Store full output
  const executionId = this.logStorage.storeLog(
    command,
    shellName,
    workingDir,
    stdout,
    stderr,
    exitCode
  );

  // Truncate for response
  const truncated = truncateOutput(
    fullOutput,
    this.config.global.logging?.maxOutputLines || 20,
    this.config.global.logging
  );

  // Build response with truncation info
  let resultMessage = truncated.output;
  if (truncated.wasTruncated) {
    resultMessage = truncated.message + '\n\n' + truncated.output;
  }

  return {
    content: [{
      type: 'text',
      text: resultMessage
    }],
    isError: exitCode !== 0,
    metadata: {
      exitCode: exitCode,
      shell: shellName,
      workingDirectory: workingDir,
      executionId: executionId,
      totalLines: truncated.totalLines,
      returnedLines: truncated.returnedLines,
      wasTruncated: truncated.wasTruncated
    }
  };
}
```

## Resource URI Specification

### URI Patterns

| URI Pattern | Description | Example |
|------------|-------------|---------|
| `cli://logs/list` | List all stored logs | `cli://logs/list` |
| `cli://logs/recent?n={count}` | Get N most recent logs | `cli://logs/recent?n=10` |
| `cli://logs/commands/{id}` | Full output of specific execution | `cli://logs/commands/20251105-143022-a8f3` |
| `cli://logs/commands/{id}/range` | Line range query | `cli://logs/commands/{id}/range?start=10&end=50` |
| `cli://logs/commands/{id}/search` | Search with context | `cli://logs/commands/{id}/search?q=error&context=3` |

### URI Parameter Specification

#### List Resource (`cli://logs/list`)

**Query Parameters**:

- None

**Response Format**:

```json
{
  "logs": [
    {
      "id": "20251105-143022-a8f3",
      "timestamp": "2025-11-05T14:30:22.345Z",
      "command": "npm test",
      "shell": "bash",
      "exitCode": 0,
      "totalLines": 1247,
      "size": 45678
    }
  ],
  "totalCount": 15,
  "totalSize": 567890
}
```

#### Recent Resource (`cli://logs/recent`)

**Query Parameters**:

- `n` (optional, default: 5): Number of recent logs to return
- `shell` (optional): Filter by shell type

**Response Format**: Same as list, but limited to N entries

#### Full Log Resource (`cli://logs/commands/{id}`)

**Query Parameters**:

- None

**Response Format**: Full combined output as text

#### Range Resource (`cli://logs/commands/{id}/range`)

**Query Parameters**:

- `start` (required): Start line number (1-based, negative supported)
- `end` (required): End line number (1-based, negative supported)
- `lineNumbers` (optional, default: true): Include line numbers

**Examples**:

- `?start=1&end=100` - First 100 lines
- `?start=-50&end=-1` - Last 50 lines
- `?start=100&end=200` - Lines 100-200
- `?start=-100&end=-50` - 100th to 50th from end

**Response Format**:

```text
Lines 1-100 of 1247:

1: output line 1
2: output line 2
...
100: output line 100
```

#### Search Resource (`cli://logs/commands/{id}/search`)

**Query Parameters**:

- `q` (required): Search pattern (regex)
- `context` (optional, default: 3): Lines before/after match
- `occurrence` (optional, default: 1): Which match to return
- `lineNumbers` (optional, default: true): Include line numbers
- `caseInsensitive` (optional, default: false): Case-insensitive search

**Response Format**:

```text
Search: "error" found 5 occurrences
Showing occurrence 1 of 5 at line 145:

142: previous context line
143: previous context line
144: previous context line
145: line with ERROR in it
146: next context line
147: next context line
148: next context line

Use cli://logs/commands/{id}/search?q=error&occurrence=2 for next match
```

## Query Parameter Processing

### LineRangeProcessor

```typescript
class LineRangeProcessor {
  /**
   * Process line range query
   * Handles negative indices (from end)
   */
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

    // Validate range
    if (actualStart < 1 || actualEnd > totalLines) {
      throw new Error('Line range out of bounds');
    }

    if (actualStart > actualEnd) {
      throw new Error('Start line must be <= end line');
    }

    // Extract lines (convert to 0-based)
    const selectedLines = lines.slice(actualStart - 1, actualEnd);

    // Format output
    return this.formatLines(selectedLines, actualStart, options);
  }

  private static formatLines(
    lines: string[],
    startLineNumber: number,
    options: RangeOptions
  ): string {
    if (!options.lineNumbers) {
      return lines.join('\n');
    }

    return lines
      .map((line, index) => {
        const lineNum = startLineNumber + index;
        return `${lineNum}: ${line}`;
      })
      .join('\n');
  }
}
```

### SearchProcessor

```typescript
class SearchProcessor {
  /**
   * Search for pattern and return results with context
   */
  static search(
    output: string,
    pattern: string,
    options: SearchOptions
  ): SearchResult {
    const lines = output.split('\n');
    const regex = new RegExp(
      pattern,
      options.caseInsensitive ? 'gi' : 'g'
    );

    // Find all matches
    const matches: number[] = [];
    lines.forEach((line, index) => {
      if (regex.test(line)) {
        matches.push(index);
      }
    });

    if (matches.length === 0) {
      throw new Error(`No matches found for pattern: ${pattern}`);
    }

    // Validate occurrence
    const occurrence = options.occurrence || 1;
    if (occurrence < 1 || occurrence > matches.length) {
      throw new Error(
        `Occurrence ${occurrence} out of range (1-${matches.length})`
      );
    }

    // Get match line index
    const matchIndex = matches[occurrence - 1];
    const contextLines = options.contextLines || 3;

    // Extract context
    const startIndex = Math.max(0, matchIndex - contextLines);
    const endIndex = Math.min(lines.length - 1, matchIndex + contextLines);

    const beforeContext = lines.slice(startIndex, matchIndex);
    const matchLine = lines[matchIndex];
    const afterContext = lines.slice(matchIndex + 1, endIndex + 1);

    return {
      occurrenceNumber: occurrence,
      totalOccurrences: matches.length,
      matchLineNumber: matchIndex + 1,
      beforeContext: beforeContext,
      matchLine: matchLine,
      afterContext: afterContext,
      fullOutput: this.formatSearchResult(
        beforeContext,
        matchLine,
        afterContext,
        matchIndex + 1,
        matches.length,
        occurrence,
        options
      )
    };
  }

  private static formatSearchResult(
    before: string[],
    match: string,
    after: string[],
    lineNumber: number,
    totalOccurrences: number,
    occurrence: number,
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

    // Context before
    const startLineNum = lineNumber - before.length;
    before.forEach((line, i) => {
      const num = startLineNum + i;
      parts.push(`${num}: ${line}`);
    });

    // Match line (highlighted)
    parts.push(`>>> ${lineNumber}: ${match} <<<`);

    // Context after
    after.forEach((line, i) => {
      const num = lineNumber + i + 1;
      parts.push(`${num}: ${line}`);
    });

    // Navigation hint
    if (occurrence < totalOccurrences) {
      parts.push('');
      parts.push(
        `Use occurrence=${occurrence + 1} for next match`
      );
    }

    return parts.join('\n');
  }
}
```

## Configuration Schema

### New Configuration Types

```typescript
// Add to src/types/config.ts

interface LoggingConfig {
  // Output truncation settings
  maxOutputLines: number;           // Default: 20
  enableTruncation: boolean;        // Default: true
  truncationMessage: string;        // Custom message template

  // Storage settings
  maxStoredLogs: number;            // Default: 50
  maxLogSize: number;               // Default: 1MB (1048576 bytes)
  maxTotalStorageSize: number;      // Default: 50MB
  enableLogResources: boolean;      // Default: true

  // Cleanup settings
  logRetentionMinutes: number;      // Default: 60
  cleanupIntervalMinutes: number;   // Default: 5
}

interface GlobalConfig {
  security: SecurityConfig;
  restrictions: RestrictionsConfig;
  paths: PathsConfig;
  logging?: LoggingConfig;  // NEW
}
```

### Default Configuration

```typescript
const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  maxOutputLines: 20,
  enableTruncation: true,
  truncationMessage: '[Output truncated: Showing last {returnedLines} of {totalLines} lines]',
  maxStoredLogs: 50,
  maxLogSize: 1048576,  // 1MB
  maxTotalStorageSize: 52428800,  // 50MB
  enableLogResources: true,
  logRetentionMinutes: 60,
  cleanupIntervalMinutes: 5
};
```

### Configuration Validation

```typescript
// Add to src/utils/config.ts

function validateLoggingConfig(config: Partial<LoggingConfig>): void {
  if (config.maxOutputLines !== undefined) {
    if (config.maxOutputLines < 1 || config.maxOutputLines > 10000) {
      throw new Error('maxOutputLines must be between 1 and 10000');
    }
  }

  if (config.maxStoredLogs !== undefined) {
    if (config.maxStoredLogs < 1 || config.maxStoredLogs > 1000) {
      throw new Error('maxStoredLogs must be between 1 and 1000');
    }
  }

  if (config.maxLogSize !== undefined) {
    if (config.maxLogSize < 1024 || config.maxLogSize > 10485760) {
      throw new Error('maxLogSize must be between 1KB and 10MB');
    }
  }
}
```

## Error Handling

### Error Types

```typescript
enum LogErrorType {
  LOG_NOT_FOUND = 'LOG_NOT_FOUND',
  INVALID_RANGE = 'INVALID_RANGE',
  INVALID_SEARCH = 'INVALID_SEARCH',
  NO_MATCHES = 'NO_MATCHES',
  INVALID_OCCURRENCE = 'INVALID_OCCURRENCE',
  STORAGE_LIMIT = 'STORAGE_LIMIT'
}

class LogResourceError extends Error {
  constructor(
    public type: LogErrorType,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'LogResourceError';
  }
}
```

### Error Response Format

```typescript
function formatLogError(error: LogResourceError): string {
  const templates = {
    LOG_NOT_FOUND: `Log entry not found: {details}

Available logs can be listed at: cli://logs/list`,

    INVALID_RANGE: `Invalid line range: {details}

Valid range formats:
  - Positive: ?start=1&end=100
  - Negative: ?start=-50&end=-1
  - Mixed: ?start=10&end=-10`,

    NO_MATCHES: `No matches found for search pattern: {details}

Try:
  - Different search pattern
  - Case-insensitive search: &caseInsensitive=true
  - View full log: cli://logs/commands/{id}`,

    INVALID_OCCURRENCE: `Invalid occurrence number: {details}

Use cli://logs/commands/{id}/search?q={pattern} to see total occurrences`
  };

  return templates[error.type].replace('{details}', String(error.details));
}
```

## Performance Considerations

### Memory Management

1. **Circular Buffer Pattern**:
   - Fixed maximum number of entries
   - FIFO eviction when limit reached
   - Constant-time insertion and deletion

2. **Size-Based Eviction**:
   - Track total storage size
   - Evict oldest entries when size limit exceeded
   - Per-entry size limits to prevent single large log

3. **Lazy Line Splitting**:
   - Store output as strings
   - Split into lines only when querying
   - Cache split result if multiple queries

### Search Optimization

1. **Early Termination**:
   - Stop searching after finding all needed occurrences
   - For occurrence=1, stop after first match

2. **Regex Compilation**:
   - Compile regex once per query
   - Cache compiled patterns for repeated searches

3. **Result Limiting**:
   - Maximum context lines (default: 10)
   - Maximum search results per query (default: 100)

### Storage Overhead

```typescript
// Estimated overhead per entry
const OVERHEAD_PER_ENTRY =
  200 +  // Metadata (id, timestamp, etc.)
  command.length +
  shell.length +
  workingDirectory.length +
  (3 * output.length);  // stdout + stderr + combined

// For 50 logs averaging 1000 lines each:
// ~50MB total storage
```

### Cleanup Strategy

```typescript
class LogCleanupManager {
  private cleanupTimer: NodeJS.Timer;

  start(intervalMs: number) {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, intervalMs);
  }

  private performCleanup() {
    // 1. Remove expired logs (by time)
    this.removeExpiredLogs();

    // 2. Remove oldest if over size limit
    this.enforceStorageLimit();

    // 3. Remove oldest if over count limit
    this.enforceCountLimit();
  }
}
```

---

**Document Version**: 1.0
**Last Updated**: 2025-11-05
**Status**: Draft for Review
