# Advanced Plan: Addressing Discovered Gaps in Truncation Fallback (2025-11-26)

## Context

This document addresses critical gaps and issues discovered during the PR #62 review cycle. Despite 10 commits over ~12 hours, several fundamental issues remain unresolved or were addressed with "band-aid" fixes rather than comprehensive solutions.

### Review Cycle Summary

| Metric | Value |
|--------|-------|
| Total commits | 10 |
| Automated review cycles | 6 |
| Manual review triggers | 7 |
| Lines added | 862+ |
| Outstanding P1 issues | 1 |
| Outstanding P2 issues | 2 |
| Pattern | Reactive whack-a-mole fixing |

---

## Outstanding Issues from PR #62

### Issue 1: Path Traversal Guard Incomplete (P1 - Security)

**Status**: ❌ Still vulnerable

**Problem**: The current sanitization in `sanitizeLogDirectory()` validates AFTER `path.normalize()` which removes `..` segments. Input like `"..\\secret"` resolves silently and is accepted.

**Current flawed approach**:

```typescript
// Current code (vulnerable)
const originalNormalized = path.normalize(expanded);
if (originalNormalized.includes(`..${path.sep}`) ...) { ... }
const resolved = path.resolve(expanded);  // This removes .. anyway
```

**Root cause**: Checking the normalized path instead of the original input.

**Required fix**:

```typescript
/**
 * Sanitize log directory with proper traversal protection
 */
private sanitizeLogDirectory(logDir: string): string {
  // STEP 1: Check ORIGINAL input before ANY transformation
  if (logDir.includes('..')) {
    throw new Error(`Log directory must not contain path traversal: ${logDir}`);
  }

  let expanded = logDir.trim();

  // STEP 2: Expand ~ and environment variables
  expanded = expanded.replace(/^~(?=$|[\\/])/, os.homedir());
  expanded = expanded.replace(/%([A-Za-z0-9_]+)%|\$([A-Za-z0-9_]+)/g, (_, winVar, unixVar) => {
    const key = (winVar || unixVar) as string;
    const value = process.env[key] ?? '';
    // Check expanded value for traversal
    if (value.includes('..')) {
      throw new Error(`Environment variable ${key} contains path traversal`);
    }
    return value;
  });

  // STEP 3: Resolve to absolute path
  const resolved = path.resolve(expanded);

  // STEP 4: Validate absolute path
  if (!path.isAbsolute(resolved)) {
    throw new Error(`Log directory must resolve to absolute path: ${logDir}`);
  }

  return resolved;
}
```

**Tests required**:

```typescript
describe('path traversal prevention', () => {
  test('should reject ".." in original input', () => {
    expect(() => new LogStorageManager({ logDirectory: '../secret' }))
      .toThrow('path traversal');
  });

  test('should reject "..\\secret" on Windows', () => {
    expect(() => new LogStorageManager({ logDirectory: '..\\secret' }))
      .toThrow('path traversal');
  });

  test('should reject $VAR that expands to traversal path', () => {
    process.env.MALICIOUS = '../hack';
    expect(() => new LogStorageManager({ logDirectory: '$MALICIOUS' }))
      .toThrow('path traversal');
  });

  test('should accept valid absolute paths', () => {
    expect(() => new LogStorageManager({ logDirectory: 'C:\\logs' }))
      .not.toThrow();
  });

  test('should accept ~ expansion', () => {
    expect(() => new LogStorageManager({ logDirectory: '~/.wcli0/logs' }))
      .not.toThrow();
  });
});
```

---

### Issue 2: Config Validation Not Called at Startup

**Status**: ⚠️ Partially addressed

**Problem**: `validateConfig()` exists but is never invoked during server initialization. The path sanitization in `LogStorageManager` is the only runtime guard.

**Required fix** in `src/index.ts`:

```typescript
constructor(config: ServerConfig) {
  // Validate configuration BEFORE using it
  validateConfig(config);  // Add this call
  
  this.config = config;
  // ... rest of initialization
}
```

**Or** add validation in config loading:

```typescript
// In src/utils/config.ts - loadConfig()
export function loadConfig(configPath?: string): ServerConfig {
  // ... load config ...
  
  // Validate before returning
  validateConfig(config);
  
  return config;
}
```

---

### Issue 3: Inconsistent Memory vs Disk Limits

**Status**: ⚠️ Confusing naming and behavior

**Problem**: The codebase has multiple overlapping size limits with unclear semantics:

- `maxTotalStorageSize` - in-memory limit (50MB default)
- `maxTotalLogSize` - disk limit (100MB default)
- `maxLogSize` - per-entry limit (1MB default)

**Current behavior issues**:

1. `getMaxMemoryBytes()` uses `maxTotalStorageSize`
2. `getMaxDiskBytes()` falls back to `maxTotalStorageSize` if `maxTotalLogSize` not set
3. The 02-implementation-plan.md specified `maxTotalLogSize` default as 100MB but actual default for memory is 50MB

**Recommended clarification**:

```typescript
export interface LoggingConfig {
  // Per-entry limits
  maxLogSize?: number;           // Max bytes per log entry (default: 1MB)
  
  // In-memory limits
  maxStoredLogs?: number;        // Max entries in memory (default: 100)
  maxTotalStorageSize?: number;  // Max total bytes in memory (default: 50MB)
  
  // Disk limits (independent)
  maxTotalLogSize?: number;      // Max total bytes on disk (default: 100MB)
  logRetentionDays?: number;     // Days to keep files (default: 7)
  
  // Retrieval limits
  maxReturnLines?: number;       // Max lines from get_command_output (default: 500)
  maxReturnBytes?: number;       // Max bytes from get_command_output (default: 1MB)
}
```

**Add explicit documentation comment**:

```typescript
/**
 * Memory vs Disk Limits:
 * 
 * Memory (in-memory log storage):
 *   - maxStoredLogs: Maximum number of log entries
 *   - maxTotalStorageSize: Maximum total bytes (default 50MB)
 * 
 * Disk (file logging when logDirectory set):
 *   - maxTotalLogSize: Maximum total file size (default 100MB)
 *   - logRetentionDays: Automatic cleanup period
 * 
 * Retrieval (get_command_output tool):
 *   - maxReturnLines: Max lines per response (default 500)
 *   - maxReturnBytes: Max bytes per response (default 1MB)
 */
```

---

### Issue 4: get_command_output Tool Availability Logic

**Status**: ✅ Fixed but needs test coverage

**Problem**: Tool was previously gated on `enableLogResources`, but should be available whenever logging is enabled (even if MCP resources are disabled).

**Current fix** (verified in code):

```typescript
// Add get_command_output tool whenever logging is enabled (resources optional)
if (this.logStorage) {
  tools.push({
    name: "get_command_output",
    // ...
  });
}
```

**Required tests**:

```typescript
describe('get_command_output tool availability', () => {
  test('should be available when logDirectory set and enableLogResources=false');
  test('should be available when enableLogResources=true');
  test('should NOT be available when logging completely disabled');
  test('should store logs even when resources are disabled');
});
```

---

### Issue 5: Truncation Message Conditional Logic

**Status**: ✅ Fixed but complex

**Current behavior**:

- Shows file path only if `exposeFullPath=true`
- Shows resource URI only if `enableLogResources=true`
- Always shows `get_command_output` fallback when executionId present

**Recommended simplification** - Consider a single truncation message factory:

```typescript
interface TruncationMessageOptions {
  executionId: string;
  omittedLines: number;
  totalLines: number;
  returnedLines: number;
  filePath?: string;
  enableLogResources: boolean;
  exposeFullPath: boolean;
  customTemplate?: string;
}

export function buildTruncationMessage(options: TruncationMessageOptions): string {
  const parts: string[] = [];
  
  // Main truncation notice
  const template = options.customTemplate ?? 
    '[Output truncated: Showing last {returnedLines} of {totalLines} lines]';
  parts.push(template
    .replace('{returnedLines}', options.returnedLines.toString())
    .replace('{totalLines}', options.totalLines.toString())
    .replace('{omittedLines}', options.omittedLines.toString()));
  
  parts.push(`[${options.omittedLines} lines omitted]`);
  
  // File path (only if enabled AND exposeFullPath)
  if (options.filePath && options.exposeFullPath) {
    parts.push(`[Full log saved to: ${options.filePath}]`);
  }
  
  // Resource URI (only if enabled)
  if (options.enableLogResources) {
    parts.push(`[Access full output: cli://logs/commands/${options.executionId}]`);
  }
  
  // Tool fallback (always shown as universal option)
  parts.push(`[Fallback: use get_command_output with executionId "${options.executionId}"]`);
  
  return parts.join('\n');
}
```

---

### Issue 6: Byte Limit Header Accounting

**Status**: ✅ Fixed in commit 0980e20

The fix properly accounts for headers in the byte budget by using `appendWithLimit()` for both headers and content lines.

---

### Issue 7: totalLines Metadata Accuracy

**Status**: ✅ Fixed in commit 0fbb220

Now captures `originalTotalLines` before slicing/filtering:

```typescript
const originalTotalLines = normalizedOutput.split('\n').length;
```

---

### Issue 8: logRetentionMinutes Override Ignored (P2)

**Status**: ❌ Bug - user configuration ignored

**Problem**: `getRetentionMs()` always picks `logRetentionDays` when defined, but `DEFAULT_LOGGING_CONFIG` now hard-codes `logRetentionDays: 7`. This means any user-provided `logRetentionMinutes` is completely ignored - log cleanup is forced to a 7-day window even when the config tries to shorten retention.

**Current flawed code** in `src/utils/logStorage.ts`:

```typescript
private getRetentionMs(): number {
  if (this.config.logRetentionDays !== undefined) {
    return this.config.logRetentionDays * 24 * 60 * 60 * 1000;
  }
  return (this.config.logRetentionMinutes ?? 60) * 60 * 1000;
}
```

**Root cause**: The default config in `src/utils/config.ts` sets both values:

```typescript
const DEFAULT_LOGGING_CONFIG = {
  logRetentionMinutes: 60,  // Never used!
  logRetentionDays: 7,      // Always takes precedence
  // ...
};
```

**Impact**:

- Users cannot configure minute-level retention (e.g., 30 minutes for testing)
- Logs are retained for 7 days minimum even when shorter retention is desired
- This breaks the minute-level control described in truncation fallback plan

**Required fix** - Option A (prefer user-explicit values):

```typescript
private getRetentionMs(): number {
  // Only use days if user explicitly set it (not from defaults)
  // Check if user provided logRetentionDays in their config
  if (this.userProvidedConfig?.logRetentionDays !== undefined) {
    return this.config.logRetentionDays! * 24 * 60 * 60 * 1000;
  }
  // Fall back to minutes (which includes the default)
  return (this.config.logRetentionMinutes ?? 60) * 60 * 1000;
}
```

**Required fix** - Option B (remove days from defaults):

```typescript
// In src/utils/config.ts
const DEFAULT_LOGGING_CONFIG = {
  logRetentionMinutes: 60,
  // logRetentionDays: 7,  // REMOVE - let it be undefined by default
  // ...
};
```

**Required fix** - Option C (document precedence and use minutes as base):

```typescript
private getRetentionMs(): number {
  // If user explicitly sets minutes AND no days, use minutes
  // Days always override when set (including default)
  const days = this.config.logRetentionDays;
  const minutes = this.config.logRetentionMinutes;
  
  if (days !== undefined && days > 0) {
    return days * 24 * 60 * 60 * 1000;
  }
  return (minutes ?? 60) * 60 * 1000;
}
```

**Recommended solution**: Option B - Remove `logRetentionDays` from defaults so users can choose between minute-level (default 60 min) or day-level (explicit) retention.

**Tests required**:

```typescript
describe('log retention configuration', () => {
  test('should use logRetentionMinutes when logRetentionDays not set', () => {
    const manager = new LogStorageManager({ logRetentionMinutes: 30 });
    expect(manager.getRetentionMs()).toBe(30 * 60 * 1000);
  });

  test('should prefer logRetentionDays when explicitly set', () => {
    const manager = new LogStorageManager({ 
      logRetentionMinutes: 30,
      logRetentionDays: 1 
    });
    expect(manager.getRetentionMs()).toBe(24 * 60 * 60 * 1000);
  });

  test('should use default 60 minutes when neither set', () => {
    const manager = new LogStorageManager({});
    expect(manager.getRetentionMs()).toBe(60 * 60 * 1000);
  });
});
```

---

### Issue 9: Inconsistent filePath Handling in Metadata (P2)

**Status**: ❌ Bug - inconsistent behavior across endpoints

**Problem**: The `filePath` in response metadata is handled differently in three places:

1. **`execute_command` metadata** (`src/index.ts:480-484`): Uses `path.basename()` when `exposeFullPath=false`
2. **`get_command_output` metadata** (`src/index.ts:1190-1192`): Returns `undefined` when `exposeFullPath=false`
3. **Truncation message** (`src/utils/truncation.ts:115-118`): Uses `path.win32.basename()` for Windows paths

**Current inconsistent code**:

```typescript
// execute_command - shows basename
filePath: logFilePath
  ? (this.config.global.logging?.exposeFullPath
    ? logFilePath
    : path.basename(logFilePath))
  : undefined

// get_command_output - hides completely
const filePath = log.filePath
  ? (loggingConfig.exposeFullPath ? log.filePath : undefined)
  : undefined;

// truncation message - uses win32.basename for Windows
const displayPath = exposeFullPath
  ? filePath
  : (filePath.includes('\\') || filePath.includes(':')
      ? path.win32.basename(filePath)
      : path.basename(filePath));
```

**Impact**:

- `execute_command` leaks filename when `exposeFullPath=false`
- `get_command_output` shows nothing (different behavior)
- Truncation message correctly handles cross-platform but behavior differs

**Required fix**: Standardize behavior - either always show basename or always hide:

```typescript
// Option A: Always hide when exposeFullPath=false (consistent with get_command_output)
filePath: this.config.global.logging?.exposeFullPath ? logFilePath : undefined

// Option B: Always show basename when exposeFullPath=false (if basename is acceptable)
// Use consistent cross-platform basename extraction everywhere
function getDisplayPath(filePath: string, exposeFullPath: boolean): string | undefined {
  if (!filePath) return undefined;
  if (exposeFullPath) return filePath;
  // Cross-platform basename
  return filePath.includes('\\') || filePath.includes(':')
    ? path.win32.basename(filePath)
    : path.basename(filePath);
}
```

**Tests required**:

```typescript
describe('filePath exposure consistency', () => {
  test('execute_command and get_command_output should return same filePath format');
  test('filePath should be undefined when exposeFullPath=false'); // or basename
  test('filePath should be full path when exposeFullPath=true');
});
```

---

## New Requirements Discovered

### Requirement A: Startup Validation

**Problem**: Configuration errors are only discovered when the affected code path is executed, not at startup.

**Solution**: Add comprehensive startup validation:

```typescript
// src/index.ts
async function run(): Promise<void> {
  const config = loadConfig(configPath);
  
  // Validate all configuration upfront
  const validationErrors = validateConfigComprehensive(config);
  if (validationErrors.length > 0) {
    console.error('Configuration errors:');
    validationErrors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }
  
  const server = new CLIServer(config);
  // ...
}
```

### Requirement B: Graceful Degradation

**Problem**: If file logging fails (permissions, disk full), the system should continue operating with in-memory only.

**Solution**: Add fallback mode:

```typescript
class LogStorageManager {
  private fileLoggingEnabled: boolean = true;
  private fileLoggingError?: string;

  private async writeLogToFileAsync(id: string, entry: CommandLogEntry): Promise<string | undefined> {
    if (!this.fileLoggingEnabled) {
      return undefined;  // Silently skip
    }

    try {
      // ... write file ...
      return filePath;
    } catch (err) {
      // Disable file logging after repeated failures
      this.fileLoggingFailCount++;
      if (this.fileLoggingFailCount > 3) {
        this.fileLoggingEnabled = false;
        this.fileLoggingError = `File logging disabled after ${this.fileLoggingFailCount} failures: ${err.message}`;
        debugWarn(this.fileLoggingError);
      }
      return undefined;
    }
  }
}
```

### Requirement C: Health Check Endpoint

**Problem**: No way to verify logging subsystem health.

**Solution**: Add diagnostic capability:

```typescript
// In get_config tool or new health_check tool
{
  logging: {
    enabled: true,
    fileLogging: {
      enabled: true,
      directory: '/home/user/.wcli0/logs',
      status: 'healthy',  // or 'degraded', 'disabled'
      lastError: null,
      filesCount: 42,
      totalSize: '15.2 MB'
    },
    memoryStorage: {
      entriesCount: 12,
      totalSize: '2.3 MB',
      oldestEntry: '2025-11-26T05:00:00Z'
    }
  }
}
```

---

## Missing Test Coverage

The following test scenarios are missing or incomplete:

### Security Tests

```typescript
describe('Security', () => {
  describe('path traversal', () => {
    test('should reject .. in logDirectory');
    test('should reject .. in environment variable expansion');
    test('should reject symlink traversal attacks');
    test('should validate resolved path is within expected directory');
  });

  describe('resource exhaustion', () => {
    test('should enforce memory limits under high load');
    test('should enforce disk limits under high load');
    test('should handle concurrent writes correctly');
  });
});
```

### Integration Tests

```typescript
describe('End-to-end logging flow', () => {
  test('execute_command → truncation → get_command_output retrieval');
  test('file logging disabled → memory fallback works');
  test('resources disabled → tool still works');
  test('large output handling (>10MB)');
  test('concurrent command executions');
});
```

### Edge Case Tests

```typescript
describe('Edge cases', () => {
  test('empty output handling');
  test('binary output handling');
  test('very long single line');
  test('unicode content preservation');
  test('null bytes in output');
  test('output exceeding all limits');
});
```

---

## Refactoring Recommendations

### 1. Extract Truncation Logic

The truncation logic is spread across multiple files. Consider consolidating:

```tree
src/
  utils/
    truncation/
      index.ts           # Main exports
      message.ts         # Message building
      output.ts          # Output truncation
      types.ts           # Types/interfaces
      constants.ts       # Default values
```

### 2. Log Storage as Plugin

Consider making log storage pluggable for different backends:

```typescript
interface LogStorageBackend {
  store(entry: CommandLogEntry): Promise<string>;
  retrieve(id: string): Promise<CommandLogEntry | null>;
  list(): Promise<string[]>;
  cleanup(): Promise<number>;
}

class MemoryLogStorage implements LogStorageBackend { }
class FileLogStorage implements LogStorageBackend { }
class CombinedLogStorage implements LogStorageBackend { }
```

### 3. Configuration Schema Validation

Use a proper schema validation library instead of manual checks:

```typescript
import { z } from 'zod';

const LoggingConfigSchema = z.object({
  logDirectory: z.string().optional().refine(
    val => !val?.includes('..'),
    'logDirectory must not contain path traversal'
  ),
  logRetentionDays: z.number().int().min(1).max(365).optional(),
  maxReturnLines: z.number().int().min(1).max(10000).optional(),
  maxReturnBytes: z.number().int().min(1024).max(10 * 1024 * 1024).optional(),
  // ...
});

// Use in config loading
const validated = LoggingConfigSchema.parse(rawConfig.logging);
```

---

## Implementation Priority

| Priority | Issue | Effort | Risk |
|----------|-------|--------|------|
| P0 | Path traversal fix (Issue 1) | 1 hour | Security vulnerability |
| P0 | Startup validation (Issue 2) | 2 hours | Configuration errors go unnoticed |
| P1 | Missing test coverage | 4 hours | Regression risk |
| P1 | Limit naming clarification (Issue 3) | 1 hour | User confusion |
| P2 | logRetentionMinutes ignored (Issue 8) | 30 min | User config silently overridden |
| P2 | filePath metadata inconsistent (Issue 9) | 30 min | Inconsistent API behavior |
| P2 | Graceful degradation (Req B) | 2 hours | Reliability |
| P3 | Health check (Req C) | 2 hours | Observability |
| P3 | Refactoring | 4 hours | Maintainability |

---

## Immediate Action Items

1. **Fix path traversal** - Check original input before any transformation
2. **Fix logRetentionMinutes** - Remove `logRetentionDays` from defaults or track user-explicit values
3. **Fix filePath inconsistency** - Standardize metadata behavior across `execute_command` and `get_command_output`
4. **Add startup validation** - Call `validateConfig()` in constructor
5. **Add comprehensive tests** - Cover security and edge cases
6. **Clarify configuration docs** - Document memory vs disk limits clearly
7. **Squash commits** - Clean up the 10-commit mess into logical units

---

## Appendix: PR #62 Commit Analysis

| Commit | Purpose | Issue Addressed | Quality |
|--------|---------|-----------------|---------|
| 5f7470d | Initial implementation | Original plan | ⚠️ Large, mixed concerns |
| 280186d | Memory cap fix | Review P1 | ✅ Focused |
| de1e6b1 | Add tool fallback msg | Review P2 | ✅ Focused |
| efed7cb | Align defaults | Review feedback | ⚠️ Mixed changes |
| a5926b0 | Windows path handling | Edge case | ✅ Focused |
| f5af230 | Decouple from resources | Review P1 | ✅ Focused |
| 2ec1605 | Type safety | Code quality | ✅ Focused |
| f7a6fd2 | Gate resource link | Review P2 | ✅ Focused |
| 0980e20 | Byte limit accounting | Review P2 | ✅ Focused |
| 0fbb220 | totalLines + traversal | Review P2+P1 | ⚠️ Incomplete |

**Pattern**: Reactive fixes to individual review comments rather than comprehensive solutions.

**Recommendation**: Next iteration should:

1. Fix remaining P1 (path traversal) properly
2. Add comprehensive test coverage
3. Squash related commits
4. Do a single comprehensive review before merge
