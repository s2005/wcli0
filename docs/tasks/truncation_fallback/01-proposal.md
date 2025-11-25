# Truncation Fallback Instructions - Proposal

## Problem Statement

When command output is truncated, the server currently provides a URL like:

```text
[Access full output: cli://logs/commands/exec-id-123]
```

However, **many MCP clients/hosts do not fully implement reading MCP resources**. This means:

- Users see the URL but cannot actually access the full log
- The instruction to use the resource URL is unhelpful
- Users have no alternative way to retrieve the complete output

### Key Finding: No Tool to Read Logs

Currently, **logs are only exposed as MCP Resources, not as MCP Tools**:

- Resources: `cli://logs/commands/{id}`, `cli://logs/list`, `cli://logs/recent`
- Tools: `execute_command`, `get_config`, `get_current_directory`, `set_current_directory`, `validate_directories`

This is the core issue - if a client doesn't support `resources/read`, there's no fallback tool to retrieve the log content.

## Current Implementation

### Location: `src/utils/truncation.ts`

The `buildTruncationMessage` function generates:

```typescript
parts.push(`[Access full output: cli://logs/commands/${executionId}]`);
```

Current output example:

```text
[Output truncated: Showing last 20 of 100 lines]
[80 lines omitted]
[Access full output: cli://logs/commands/20251125-143022-a8f3]

<truncated output>
```

### Issues

1. The message assumes MCP resource reading is available
2. No fallback instructions for clients that don't support resources
3. No mention of alternative tools that could read the log

## Proposed Solutions

### Option F: File System Log Storage with Path in Message (NEW - Best for Local/Stdio)

**For local MCP servers using stdio protocol**, the most universal solution is to **save logs to the filesystem** and provide the file path in the truncation message. Any MCP client can read a local file.

**New Configuration Options:**

```json
{
  "global": {
    "logging": {
      "enableLogResources": true,
      "enableFileLogging": true,
      "logDirectory": "C:\\Users\\username\\.wcli0\\logs",
      "logRetentionDays": 7,
      "includeFilePathInMessage": true
    }
  }
}
```

**Configuration Fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enableFileLogging` | boolean | `false` | Save logs to filesystem |
| `logDirectory` | string | OS temp dir | Directory for log files |
| `logRetentionDays` | number | `7` | Auto-cleanup old logs |
| `includeFilePathInMessage` | boolean | `true` | Show file path in truncation message |

**Updated truncation message (with file logging enabled):**

```text
[Output truncated: Showing last 20 of 1247 lines]
[1227 lines omitted]
[Full log saved to: C:\Users\username\.wcli0\logs\20251125-143022-a8f3.log]
[To retrieve: read the file above, or use get_command_output tool with executionId "20251125-143022-a8f3"]
```

**Pros:**

- **Universal access**: Any client/tool can read a local file
- **Works offline**: No MCP resource support needed
- **Persistent**: Logs survive server restarts
- **Configurable**: Users control where logs go and how long to keep them
- **Familiar**: Users understand file paths

**Cons:**

- Requires filesystem access
- Needs cleanup mechanism for old logs
- Not suitable for remote/cloud deployments

**Use Cases:**

- Local development with VS Code + Copilot
- Claude Desktop with stdio transport
- Any local MCP client that doesn't support resources

---

### Option E: Add a `get_command_output` Tool (Good for All Deployments)

**The most robust solution is to add a new tool that can read log content**, since tools are universally supported by MCP clients while resources are often not.

**New Tool: `get_command_output`**

```json
{
  "name": "get_command_output",
  "description": "Retrieve stored command execution log by ID. Use this when output was truncated and you need the full content.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "executionId": {
        "type": "string",
        "description": "The execution ID from a previous command (shown in truncation message)"
      },
      "startLine": {
        "type": "number",
        "description": "Optional: Start line number (1-based, default: 1)"
      },
      "endLine": {
        "type": "number",
        "description": "Optional: End line number (default: all lines)"
      },
      "search": {
        "type": "string",
        "description": "Optional: Search pattern (regex) to filter output"
      }
    },
    "required": ["executionId"]
  }
}
```

**Updated truncation message:**

```text
[Output truncated: Showing last 20 of 1247 lines]
[1227 lines omitted]
[Full log id: exec-20251125-143022]
[Use get_command_output tool with executionId "exec-20251125-143022" to retrieve full output]
```

**Pros:**

- Works with ALL MCP clients (tools are universally supported)
- Reuses existing log storage infrastructure
- Provides search/range capabilities via tool parameters
- Clear, actionable instruction

**Cons:**

- Requires adding a new tool
- Slightly increases API surface

---

### Option A: Enhanced Message with Tool Instructions (Message Only)

Update the truncation message to include information about which tool can be used as a fallback:

```text
[Output truncated: Showing last 20 of 100 lines]
[80 lines omitted]
[Full output available via:]
[  • MCP Resource: cli://logs/commands/20251125-143022-a8f3]
[  • Alternative: Use fetch_webpage tool with URL: cli://logs/commands/20251125-143022-a8f3]
[  • Alternative: Re-run command with maxOutputLines parameter set higher (e.g., 500)]
```

**Pros:**

- Provides multiple alternatives
- Users understand they can increase maxOutputLines

**Cons:**

- `fetch_webpage` typically doesn't support `cli://` protocol
- Message becomes longer

### Option B: Only Practical Alternatives (Recommended)

Update the message to focus on actionable alternatives:

```text
[Output truncated: Showing last 20 of 100 lines]
[80 lines omitted]
[To view full output:]
[  • Re-run with: "maxOutputLines": {totalLines} (or higher)]
[  • If supported: Access resource cli://logs/commands/20251125-143022-a8f3]
```

**Pros:**

- Clear, actionable instruction (`maxOutputLines` always works)
- Mentions resource but sets expectations ("if supported")
- Concise

**Cons:**

- Re-running command may not be desirable for destructive operations

### Option C: Configurable Message with Defaults

Add configuration option for the fallback instruction text:

```typescript
// New config option
interface TruncationConfig {
  maxOutputLines: number;
  enableTruncation: boolean;
  truncationMessage?: string;
  fallbackInstructions?: string;  // NEW
}
```

Default fallback instructions:

```text
[To view full output, re-run command with higher maxOutputLines parameter]
[Resource URI (if client supports): cli://logs/commands/{executionId}]
```

**Pros:**

- Flexible for different environments
- Users can customize based on their client capabilities

**Cons:**

- More complexity
- Most users won't customize

### Option D: Contextual Guidance Based on Output Type

Provide more specific guidance based on the situation:

```text
[Output truncated: Showing last 20 of 1247 lines]
[1227 lines omitted]

💡 To retrieve full output:
   1. Re-run with parameter: "maxOutputLines": 1247
   2. Or use line range: cli://logs/commands/{id}/range?start=1&end=500
   3. Or search specific content: cli://logs/commands/{id}/search?q=error

Note: Resource URLs require MCP resource support in your client.
```

**Pros:**

- Educates about range/search capabilities
- Provides multiple retrieval strategies

**Cons:**

- Verbose
- May overwhelm users

## Recommendation: Combined Approach (Options E + F)

I recommend implementing **both Option E and Option F** for maximum compatibility:

### Why Both?

| Scenario | Best Solution |
|----------|---------------|
| Local stdio (VS Code, Claude Desktop) | **Option F** - File path is universal |
| Remote/SSE transport | **Option E** - `get_command_output` tool |
| Client supports MCP resources | Existing resource URIs still work |

### Combined Implementation

1. **Option F: File System Logging** (configurable, default: enabled for local)
   - Save logs to filesystem when `enableFileLogging: true`
   - Show file path in truncation message
   - Auto-cleanup old logs

2. **Option E: `get_command_output` Tool** (always available when logging enabled)
   - Works regardless of transport
   - Provides search/range capabilities
   - Fallback when file access isn't practical

3. **Updated truncation message** (adapts based on config)

### Truncation Message Examples

**With file logging enabled (local stdio):**

```text
[Output truncated: Showing last 20 of 1247 lines]
[1227 lines omitted]
[Full log saved to: C:\Users\username\.wcli0\logs\20251125-143022-a8f3.log]
[Alternative: use get_command_output tool with executionId "20251125-143022-a8f3"]
```

**Without file logging (remote/memory only):**

```text
[Output truncated: Showing last 20 of 1247 lines]
[1227 lines omitted]
[Full log id: 20251125-143022-a8f3]
[To retrieve: use get_command_output tool with executionId "20251125-143022-a8f3"]
```

### Proposed Changes

#### 1. Update Configuration Types (`src/types/config.ts`)

Add new fields to `LoggingConfig`:

```typescript
interface LoggingConfig {
  // Existing fields
  enableLogResources?: boolean;
  maxStoredLogs?: number;
  maxLogSize?: number;
  maxOutputLines?: number;
  enableTruncation?: boolean;
  truncationMessage?: string;
  
  // NEW: File system logging
  enableFileLogging?: boolean;      // Save logs to disk
  logDirectory?: string;            // Where to save logs (default: OS temp)
  logRetentionDays?: number;        // Auto-cleanup after N days (default: 7)
  includeFilePathInMessage?: boolean; // Show path in truncation message (default: true)
}
```

#### 2. Add new `get_command_output` tool in `index.ts`

Add to the tools list:

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

#### 3. Add tool handler in `index.ts`

```typescript
case "get_command_output": {
  if (!this.logStorage) {
    throw new McpError(ErrorCode.InvalidRequest, 'Log storage is not enabled');
  }
  const args = z.object({
    executionId: z.string(),
    startLine: z.number().optional(),
    endLine: z.number().optional(),
    search: z.string().optional()
  }).parse(toolParams.arguments);
  
  // Reuse existing LogResourceHandler logic
  const handler = new LogResourceHandler(this.logStorage, this.config.global.logging!);
  // ... delegate to handler
}
```

#### 4. Update `LogStorageManager` (`src/utils/logStorage.ts`)

Add file writing capability:

```typescript
public storeLog(...): string {
  // Existing in-memory storage
  const id = this.generateId();
  // ...
  
  // NEW: Write to filesystem if enabled
  if (this.config.enableFileLogging) {
    this.writeLogToFile(id, entry);
  }
  
  return id;
}

private writeLogToFile(id: string, entry: CommandLogEntry): string {
  const logDir = this.config.logDirectory || os.tmpdir();
  const filePath = path.join(logDir, `${id}.log`);
  fs.writeFileSync(filePath, entry.combinedOutput, 'utf8');
  entry.filePath = filePath; // Store path in entry
  return filePath;
}
```

#### 5. Update `truncation.ts` - `buildTruncationMessage` function

Change from:

```typescript
if (executionId) {
  parts.push(`[Access full output: cli://logs/commands/${executionId}]`);
}
```

To:

```typescript
if (executionId) {
  if (filePath) {
    parts.push(`[Full log saved to: ${filePath}]`);
    parts.push(`[Alternative: use get_command_output tool with executionId "${executionId}"]`);
  } else {
    parts.push(`[Full log id: ${executionId}]`);
    parts.push(`[To retrieve: use get_command_output tool with executionId "${executionId}"]`);
  }
}
```

#### 6. Add new files

- `src/utils/toolDescription.ts` - Add `buildGetCommandOutputDescription()` function
- `src/utils/toolSchemas.ts` - Add `buildGetCommandOutputSchema()` function

#### 7. Update `toolDescription.ts` - Output Truncation Section

Enhance the tool description to clarify:

```typescript
lines.push('**Output Truncation:**');
lines.push('- Output is automatically truncated if it exceeds the configured limit');
lines.push('- Default limit is usually 20 lines (configurable via global settings)');
lines.push('- Use `maxOutputLines` parameter to override the limit for a specific command');
lines.push('- If output is truncated, use the `get_command_output` tool to retrieve full output');
lines.push('- When file logging is enabled, logs are also saved to disk');
```

### Files to Modify

1. **`src/types/config.ts`**
   - Add new fields to `LoggingConfig` interface

2. **`src/index.ts`**
   - Add `get_command_output` tool to tools list
   - Add handler for `get_command_output` tool execution

3. **`src/utils/logStorage.ts`**
   - Add file writing capability
   - Add cleanup mechanism for old log files
   - Store file path in log entry

4. **`src/utils/truncation.ts`**
   - Update `buildTruncationMessage` to accept optional `filePath`
   - Update message format based on file logging config

5. **`src/utils/toolDescription.ts`**
   - Add `buildGetCommandOutputDescription()` function
   - Update Output Truncation section

6. **`src/utils/toolSchemas.ts`**
   - Add `buildGetCommandOutputSchema()` function

7. **`tests/unit/truncation.test.ts`**
   - Update tests to reflect new message format

8. **`tests/unit/logStorage.test.ts`**
   - Add tests for file logging

9. **New test file: `tests/handlers/getCommandOutputHandler.test.ts`**
   - Tests for the new `get_command_output` tool

### Example Output After Changes

**With file logging enabled:**

```text
[Output truncated: Showing last 20 of 1247 lines]
[1227 lines omitted]
[Full log saved to: C:\Users\username\.wcli0\logs\20251125-143022-a8f3.log]
[Alternative: use get_command_output tool with executionId "20251125-143022-a8f3"]

<truncated output here>
```

**Without file logging:**

```text
[Output truncated: Showing last 20 of 1247 lines]
[1227 lines omitted]
[Full log id: 20251125-143022-a8f3]
[To retrieve: use get_command_output tool with executionId "20251125-143022-a8f3"]

<truncated output here>
```

## Questions for Review - RESOLVED

1. **Default directory**: ✅ Dedicated `.wcli0/logs` folder in user's home directory
2. **Default retention**: ✅ 7 days
3. **File format**: ✅ Plain text `.log` files
4. **Should file logging be enabled by default?**: ✅ No - only enabled when `logDirectory` is explicitly configured
5. **Tool name**: ✅ `get_command_output`

## Final Design Decisions

### Configuration

```json
{
  "global": {
    "logging": {
      "enableLogResources": true,
      "logDirectory": "C:\\Users\\username\\.wcli0\\logs",
      "logRetentionDays": 7
    }
  }
}
```

- File logging is **only enabled when `logDirectory` is set**
- Default retention: 7 days
- Log files are plain text (`.log` extension)
- Default log directory (when configured): `~/.wcli0/logs`

### Tool Name

The tool will be named `get_command_output` (clearer than `get_log`).

### Truncation Message Format

**When `logDirectory` is configured:**

```text
[Output truncated: Showing last 20 of 1247 lines]
[1227 lines omitted]
[Full log saved to: C:\Users\username\.wcli0\logs\20251125-143022-a8f3.log]
[Alternative: use get_command_output tool with executionId "20251125-143022-a8f3"]
```

**When `logDirectory` is NOT configured (memory only):**

```text
[Output truncated: Showing last 20 of 1247 lines]
[1227 lines omitted]
[Full log id: 20251125-143022-a8f3]
[To retrieve: use get_command_output tool with executionId "20251125-143022-a8f3"]
```

## Next Steps

Once you approve this proposal (or provide modifications), I will:

1. Create a detailed implementation plan document
2. Add the `get_log` tool to `index.ts`
3. Add schema and description functions
4. Update `truncation.ts` message format
5. Add comprehensive tests
6. Update relevant documentation
