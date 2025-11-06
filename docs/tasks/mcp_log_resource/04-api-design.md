# MCP Log Resource Feature - API Design

## Table of Contents

1. [Overview](#overview)
2. [Tool Response Changes](#tool-response-changes)
3. [Resource URIs](#resource-uris)
4. [Query Parameters](#query-parameters)
5. [Response Formats](#response-formats)
6. [Error Responses](#error-responses)
7. [Usage Examples](#usage-examples)

## Overview

This document defines the complete API surface for the MCP log resource feature, including:

- Enhanced `execute_command` tool responses
- New MCP resource URIs for accessing logs
- Query parameter specifications
- Response formats
- Error handling

## Tool Response Changes

### execute_command Tool

#### Previous Response Format

```json
{
  "content": [{
    "type": "text",
    "text": "<full command output>"
  }],
  "isError": false,
  "metadata": {
    "exitCode": 0,
    "shell": "bash",
    "workingDirectory": "/home/user/project"
  }
}
```

#### New Response Format (When Truncated)

```json
{
  "content": [{
    "type": "text",
    "text": "[Output truncated: Showing last 20 of 1,247 lines]\n[1,227 lines omitted]\n[Access full output: cli://logs/commands/20251105-143022-a8f3]\n\n<last 20 lines of output>"
  }],
  "isError": false,
  "metadata": {
    "exitCode": 0,
    "shell": "bash",
    "workingDirectory": "/home/user/project",
    "executionId": "20251105-143022-a8f3",
    "totalLines": 1247,
    "returnedLines": 20,
    "wasTruncated": true
  }
}
```

#### New Response Format (Not Truncated)

```json
{
  "content": [{
    "type": "text",
    "text": "<full command output>"
  }],
  "isError": false,
  "metadata": {
    "exitCode": 0,
    "shell": "bash",
    "workingDirectory": "/home/user/project",
    "executionId": "20251105-143022-a8f3",
    "totalLines": 15,
    "returnedLines": 15,
    "wasTruncated": false
  }
}
```

#### Metadata Fields

| Field | Type | Description |
|-------|------|-------------|
| `exitCode` | number | Command exit code |
| `shell` | string | Shell used for execution |
| `workingDirectory` | string | Directory where command was executed |
| `executionId` | string | Unique ID for this execution (NEW) |
| `totalLines` | number | Total lines in complete output (NEW) |
| `returnedLines` | number | Lines included in response (NEW) |
| `wasTruncated` | boolean | Whether output was truncated (NEW) |

## Resource URIs

### 1. List All Logs

**URI**: `cli://logs/list`

**Description**: Returns a list of all stored command execution logs with metadata.

**Query Parameters**: None

**Response Type**: JSON

**Example Response**:

```json
{
  "logs": [
    {
      "id": "20251105-143022-a8f3",
      "timestamp": "2025-11-05T14:30:22.345Z",
      "command": "npm test",
      "shell": "bash",
      "workingDirectory": "/home/user/project",
      "exitCode": 0,
      "totalLines": 1247,
      "stdoutLines": 1200,
      "stderrLines": 47,
      "size": 45678,
      "wasTruncated": true
    },
    {
      "id": "20251105-142015-b7e4",
      "timestamp": "2025-11-05T14:20:15.123Z",
      "command": "ls -la",
      "shell": "bash",
      "workingDirectory": "/home/user/project",
      "exitCode": 0,
      "totalLines": 25,
      "stdoutLines": 25,
      "stderrLines": 0,
      "size": 1234,
      "wasTruncated": false
    }
  ],
  "totalCount": 2,
  "totalSize": 46912,
  "maxLogs": 50,
  "maxSize": 52428800
}
```

### 2. Recent Logs

**URI**: `cli://logs/recent`

**Description**: Returns the N most recent command execution logs.

**Query Parameters**:

- `n` (optional, default: 5): Number of recent logs to return
- `shell` (optional): Filter by shell type

**Response Type**: JSON

**Examples**:

- `cli://logs/recent` - Last 5 logs
- `cli://logs/recent?n=10` - Last 10 logs
- `cli://logs/recent?n=5&shell=bash` - Last 5 bash logs

**Example Response**:

```json
{
  "logs": [
    {
      "id": "20251105-143022-a8f3",
      "timestamp": "2025-11-05T14:30:22.345Z",
      "command": "npm test",
      "shell": "bash",
      "exitCode": 0,
      "totalLines": 1247
    }
  ],
  "count": 1,
  "limit": 5,
  "shell": null
}
```

### 3. Full Log Output

**URI**: `cli://logs/commands/{executionId}`

**Description**: Returns the complete output from a specific command execution.

**Query Parameters**: None

**Response Type**: Plain text

**Example**:

- `cli://logs/commands/20251105-143022-a8f3`

**Example Response**:

```text
PASS src/components/Button.test.tsx
PASS src/components/Input.test.tsx
FAIL src/components/Form.test.tsx
  ● Form › should validate required fields

    expect(received).toBe(expected)

    Expected: true
    Received: false

      at Object.<anonymous> (src/components/Form.test.tsx:42:23)

<... full output ...>

Test Suites: 1 failed, 2 passed, 3 total
Tests:       1 failed, 15 passed, 16 total
```

### 4. Line Range Query

**URI**: `cli://logs/commands/{executionId}/range`

**Description**: Returns a specific range of lines from a log.

**Query Parameters**:

- `start` (required): Start line number (1-based, supports negative)
- `end` (required): End line number (1-based, supports negative)
- `lineNumbers` (optional, default: true): Include line numbers in output

**Response Type**: Plain text

**Examples**:

- `cli://logs/commands/{id}/range?start=1&end=100` - First 100 lines
- `cli://logs/commands/{id}/range?start=100&end=200` - Lines 100-200
- `cli://logs/commands/{id}/range?start=-50&end=-1` - Last 50 lines
- `cli://logs/commands/{id}/range?start=-100&end=-50` - 100th to 50th from end
- `cli://logs/commands/{id}/range?start=1&end=50&lineNumbers=false` - Without line numbers

**Example Response**:

```text
Lines 1-100 of 1247:

1: PASS src/components/Button.test.tsx
2:   ✓ should render button (15 ms)
3:   ✓ should handle click events (8 ms)
4:   ✓ should support disabled state (5 ms)
5:
6: PASS src/components/Input.test.tsx
7:   ✓ should render input field (12 ms)
...
100:   ✓ should validate phone numbers (6 ms)
```

### 5. Search with Context

**URI**: `cli://logs/commands/{executionId}/search`

**Description**: Search for a pattern in the log and return matches with surrounding context.

**Query Parameters**:

- `q` (required): Search pattern (regex supported)
- `context` (optional, default: 3): Number of lines before/after match
- `occurrence` (optional, default: 1): Which match to return (1-based)
- `caseInsensitive` (optional, default: false): Case-insensitive search
- `lineNumbers` (optional, default: true): Include line numbers

**Response Type**: Plain text

**Examples**:

- `cli://logs/commands/{id}/search?q=error` - Find "error"
- `cli://logs/commands/{id}/search?q=error&context=5` - With 5 lines context
- `cli://logs/commands/{id}/search?q=error&occurrence=2` - Second occurrence
- `cli://logs/commands/{id}/search?q=error&caseInsensitive=true` - Case-insensitive
- `cli://logs/commands/{id}/search?q=FAIL.*test` - Regex pattern

**Example Response**:

```text
Search: "FAIL" found 3 occurrence(s)
Showing occurrence 1 of 3 at line 145:

142: PASS src/components/Input.test.tsx
143:   ✓ should validate email (10 ms)
144:
>>> 145: FAIL src/components/Form.test.tsx <<<
146:   ● Form › should validate required fields
147:
148:     expect(received).toBe(expected)

To see next match, use occurrence=2
```

## Query Parameters

### Complete Parameter Reference

| Parameter | Type | Default | Valid Values | Description |
|-----------|------|---------|--------------|-------------|
| `n` | integer | 5 | 1-100 | Number of recent logs to return |
| `shell` | string | null | powershell, cmd, gitbash, bash, wsl | Filter logs by shell type |
| `start` | integer | - | Any integer (negative supported) | Start line for range query |
| `end` | integer | - | Any integer (negative supported) | End line for range query |
| `q` | string | - | Any string (regex) | Search pattern |
| `context` | integer | 3 | 0-20 | Lines of context around search match |
| `occurrence` | integer | 1 | 1-N | Which search match to return |
| `caseInsensitive` | boolean | false | true, false | Case-insensitive search |
| `lineNumbers` | boolean | true | true, false | Include line numbers in output |

### Parameter Validation

#### n (recent logs count)

- Must be integer between 1 and 100
- Error if out of range: "Parameter 'n' must be between 1 and 100"

#### start/end (line range)

- Must be valid integers
- Positive: 1-based line numbers from start
- Negative: Lines from end (-1 is last line)
- start must be <= end after resolving negatives
- Error examples:
  - "Start line must be >= 1"
  - "End line 1500 exceeds total lines 1247"
  - "Start line 100 must be <= end line 50"

#### q (search pattern)

- Must be non-empty string
- Interpreted as JavaScript regex
- Invalid regex will throw error: "Invalid regex pattern: {details}"

#### context (context lines)

- Must be integer between 0 and 20
- Error if out of range: "Context lines must be between 0 and 20"

#### occurrence (search occurrence)

- Must be positive integer
- Must be <= total occurrences found
- Error example: "Occurrence 5 out of range (1-3)"

## Response Formats

### JSON Response Structure

#### Log List Response

```typescript
interface LogListResponse {
  logs: LogEntryMetadata[];
  totalCount: number;
  totalSize: number;
  maxLogs: number;
  maxSize: number;
}

interface LogEntryMetadata {
  id: string;
  timestamp: string;  // ISO 8601
  command: string;
  shell: string;
  workingDirectory: string;
  exitCode: number;
  totalLines: number;
  stdoutLines: number;
  stderrLines: number;
  size: number;  // bytes
  wasTruncated: boolean;
}
```

#### Recent Logs Response

```typescript
interface RecentLogsResponse {
  logs: LogEntryMetadata[];
  count: number;
  limit: number;
  shell: string | null;
}
```

### Text Response Formats

#### Full Log Output

- Raw text output
- Combined stdout and stderr in execution order
- No modifications or formatting

#### Range Query Output

**With line numbers** (default):

```text
Lines {start}-{end} of {total}:

{lineNum}: {line content}
{lineNum}: {line content}
...
```

**Without line numbers**:

```text
Lines {start}-{end} of {total}:

{line content}
{line content}
...
```

#### Search Result Output

```text
Search: "{pattern}" found {totalOccurrences} occurrence(s)
Showing occurrence {occurrenceNum} of {totalOccurrences} at line {lineNum}:

{contextBefore}
>>> {matchLine} <<<
{contextAfter}

[Navigation hint if more occurrences]
```

## Error Responses

### Error Response Format

All errors follow this structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      // Additional context
    },
    "suggestion": "Helpful suggestion for fixing the error"
  }
}
```

### Error Codes

#### LOG_NOT_FOUND

**Trigger**: Requested log ID doesn't exist

**Response**:

```json
{
  "error": {
    "code": "LOG_NOT_FOUND",
    "message": "Log entry not found: 20251105-143022-a8f3",
    "details": {
      "requestedId": "20251105-143022-a8f3"
    },
    "suggestion": "Use cli://logs/list to see available logs"
  }
}
```

#### INVALID_RANGE

**Trigger**: Invalid line range parameters

**Examples**:

```json
{
  "error": {
    "code": "INVALID_RANGE",
    "message": "Start line 100 must be <= end line 50",
    "details": {
      "start": 100,
      "end": 50
    },
    "suggestion": "Valid range formats:\n  - Positive: ?start=1&end=100\n  - Negative: ?start=-50&end=-1\n  - Mixed: ?start=10&end=-10"
  }
}
```

```json
{
  "error": {
    "code": "INVALID_RANGE",
    "message": "End line 1500 exceeds total lines 1247",
    "details": {
      "end": 1500,
      "totalLines": 1247
    },
    "suggestion": "Use cli://logs/commands/{id} to see total line count"
  }
}
```

#### INVALID_SEARCH

**Trigger**: Invalid search parameters

**Examples**:

```json
{
  "error": {
    "code": "INVALID_SEARCH",
    "message": "Search pattern (q parameter) is required",
    "details": {},
    "suggestion": "Add ?q={pattern} to your search URI"
  }
}
```

```json
{
  "error": {
    "code": "INVALID_SEARCH",
    "message": "Invalid regex pattern: Unterminated character class",
    "details": {
      "pattern": "[incomplete"
    },
    "suggestion": "Check your regex syntax and try again"
  }
}
```

#### NO_MATCHES

**Trigger**: Search pattern found no matches

**Response**:

```json
{
  "error": {
    "code": "NO_MATCHES",
    "message": "No matches found for pattern: error",
    "details": {
      "pattern": "error",
      "totalLines": 1247
    },
    "suggestion": "Try:\n  - Different search pattern\n  - Case-insensitive search: &caseInsensitive=true\n  - View full log: cli://logs/commands/{id}"
  }
}
```

#### INVALID_OCCURRENCE

**Trigger**: Requested occurrence out of range

**Response**:

```json
{
  "error": {
    "code": "INVALID_OCCURRENCE",
    "message": "Occurrence 5 out of range (1-3)",
    "details": {
      "requested": 5,
      "totalOccurrences": 3
    },
    "suggestion": "Use cli://logs/commands/{id}/search?q={pattern} to see total occurrences"
  }
}
```

#### LOGS_DISABLED

**Trigger**: Log resources are disabled in configuration

**Response**:

```json
{
  "error": {
    "code": "LOGS_DISABLED",
    "message": "Log resources are disabled in configuration",
    "details": {},
    "suggestion": "Enable log resources in config:\n{\n  \"global\": {\n    \"logging\": {\n      \"enableLogResources\": true\n    }\n  }\n}"
  }
}
```

#### STORAGE_LIMIT

**Trigger**: Log storage limits reached

**Response**:

```json
{
  "error": {
    "code": "STORAGE_LIMIT",
    "message": "Log storage limit reached",
    "details": {
      "currentSize": 52428800,
      "maxSize": 52428800,
      "currentLogs": 50,
      "maxLogs": 50
    },
    "suggestion": "Older logs are automatically removed. Adjust limits in config if needed."
  }
}
```

## Usage Examples

### Example 1: Execute Command and Access Full Output

```bash
# Step 1: Execute command with verbose output
execute_command("npm test --verbose")

# Response includes truncation notice and executionId
{
  "content": [{
    "type": "text",
    "text": "[Output truncated: Showing last 20 of 487 lines]\n[467 lines omitted]\n[Access full output: cli://logs/commands/20251105-150000-c9d2]\n\n<last 20 lines>"
  }],
  "metadata": {
    "executionId": "20251105-150000-c9d2",
    "totalLines": 487,
    "returnedLines": 20,
    "wasTruncated": true
  }
}

# Step 2: Access full output
read_resource("cli://logs/commands/20251105-150000-c9d2")

# Returns all 487 lines
```

### Example 2: Search for Errors

```bash
# Execute command
execute_command("npm run build")

# Search for errors in output
read_resource("cli://logs/commands/{id}/search?q=error&caseInsensitive=true")

# Response shows first error with context
# Navigate to next error
read_resource("cli://logs/commands/{id}/search?q=error&caseInsensitive=true&occurrence=2")
```

### Example 3: Review Specific Section

```bash
# Execute command
execute_command("git log --oneline -n 100")

# View first 25 commits
read_resource("cli://logs/commands/{id}/range?start=1&end=25")

# View last 10 commits
read_resource("cli://logs/commands/{id}/range?start=-10&end=-1")

# View middle section
read_resource("cli://logs/commands/{id}/range?start=40&end=60")
```

### Example 4: List and Filter Logs

```bash
# List all stored logs
read_resource("cli://logs/list")

# Get recent bash commands
read_resource("cli://logs/recent?n=10&shell=bash")

# Get last 5 commands
read_resource("cli://logs/recent?n=5")
```

### Example 5: Analyze Test Output

```bash
# Run tests
execute_command("npm test")

# Search for all failures
read_resource("cli://logs/commands/{id}/search?q=FAIL&context=5")

# Navigate through failures
read_resource("cli://logs/commands/{id}/search?q=FAIL&context=5&occurrence=2")
read_resource("cli://logs/commands/{id}/search?q=FAIL&context=5&occurrence=3")

# View complete test summary at end
read_resource("cli://logs/commands/{id}/range?start=-30&end=-1")
```

### Example 6: Debug Build Issues

```bash
# Run build
execute_command("npm run build -- --verbose")

# Search for warnings
read_resource("cli://logs/commands/{id}/search?q=warning&caseInsensitive=true")

# Get lines around specific error
read_resource("cli://logs/commands/{id}/search?q=compilation\\s+failed&context=10")

# View build stats at end
read_resource("cli://logs/commands/{id}/range?start=-20&end=-1")
```

## Backward Compatibility

### execute_command Tool - Compatibility Notes

**Breaking Changes**: None

**New Fields**: All new metadata fields are additions. Existing fields remain unchanged.

**Behavior Changes**:

- Output may be truncated (configurable)
- New executionId in metadata
- Truncation can be disabled in config for full backward compatibility

### Resource Endpoints

**New Endpoints**: All log resources are new. No existing resources are modified.

### Configuration

**New Section**: `global.logging` is a new optional section. If not specified, defaults are used.

**Backward Compatibility**: Existing configurations work without modification. Logging features use sensible defaults.

---

**Document Version**: 1.0
**Last Updated**: 2025-11-05
**Status**: Draft for Review
