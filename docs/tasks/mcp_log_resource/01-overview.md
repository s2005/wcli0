# MCP Log Resource Feature - Overview

## Executive Summary

This document outlines the plan for implementing a comprehensive logging and output management system for the wcli0 MCP server. The feature addresses two primary concerns:

1. **Output Size Management**: Limit command execution output to prevent overwhelming responses
2. **Log Resource Access**: Provide flexible MCP resources for accessing historical command output with advanced filtering capabilities

## Problem Statement

### Current State

Currently, when executing commands via `execute_command` tool:

- All stdout/stderr output is captured and returned in full
- Large outputs (e.g., verbose builds, extensive file listings) can overwhelm the response
- No mechanism to paginate or search through previous command outputs
- No way to retrieve specific portions of output after execution

### Pain Points

1. **Performance Issues**: Large outputs increase response time and token usage
2. **Context Window Limits**: Verbose outputs consume valuable context space
3. **Poor User Experience**: Users cannot efficiently search or navigate large outputs
4. **No Historical Access**: Once a command completes, the full output is lost

## Proposed Solution

### Feature 1: Configurable Output Truncation

**Objective**: Return only the tail of command output by default, with full output stored for later access.

**Key Requirements**:

- Default to last 20 lines of output (configurable)
- Store complete output in memory/disk for resource access
- Include metadata indicating truncation (e.g., "Showing last 20 of 1,247 lines")
- Allow configuration per shell or globally

**User Benefits**:

- Faster responses for commands with verbose output
- Reduced token consumption
- Better context management
- Full output still accessible via resources

### Feature 2: MCP Log Resources

**Objective**: Expose command outputs as MCP resources with flexible query parameters.

**Key Requirements**:

1. **Line Range Access**:
   - Parameters: `start_line`, `end_line`
   - Return specific line ranges from stored output
   - Support negative indices (e.g., -10 for last 10 lines)

2. **Search with Context**:
   - Parameter: `search` (regex pattern)
   - Parameter: `context_lines` (lines before/after match)
   - Return matching lines with surrounding context
   - Report total occurrences found

3. **Occurrence Selection**:
   - Parameter: `occurrence` (which match to return, default: 1)
   - Allow users to navigate between multiple search matches
   - Provide occurrence count in response

4. **Resource URI Structure**:

   ```text
   cli://logs/commands/{execution_id}
   cli://logs/commands/{execution_id}/search?q={pattern}&context={n}&occurrence={m}
   cli://logs/commands/{execution_id}/range?start={n}&end={m}
   cli://logs/recent
   cli://logs/list
   ```

## Architecture Overview

### Components to Add/Modify

1. **Output Storage System**:
   - In-memory circular buffer for recent executions
   - Optional disk persistence for long-running sessions
   - Automatic cleanup of old entries

2. **Resource Handlers**:
   - List available log resources
   - Read log content with query parameters
   - Handle search and range queries

3. **Configuration Extensions**:
   - `maxOutputLines`: Number of lines to return in execute_command response
   - `maxStoredLogs`: Maximum number of command outputs to store
   - `maxLogSize`: Maximum size per stored log entry
   - `enableLogResources`: Feature flag to enable/disable

4. **Tool Response Enhancement**:
   - Add truncation indicator to execute_command responses
   - Include resource URI for full output access
   - Add summary statistics (total lines, truncated count)

### Integration Points

- **Execute Command Handler** (`src/index.ts:291-405`): Modify to truncate output and store full version
- **Resource Handlers** (`src/index.ts:417-559`): Add new log resource types
- **Configuration System** (`src/utils/config.ts`): Add new configuration options
- **Type Definitions** (`src/types/config.ts`): Add new interfaces for log storage

## Success Criteria

1. **Functional Requirements**:
   - ✅ Command output truncated to configurable limit by default
   - ✅ Full output accessible via MCP resources
   - ✅ Search functionality returns matches with context
   - ✅ Line range queries work with positive and negative indices
   - ✅ Occurrence counting and selection functional

2. **Performance Requirements**:
   - ✅ Output truncation adds < 10ms overhead
   - ✅ Resource queries respond in < 100ms for typical logs
   - ✅ Memory usage stays under 100MB for 50 stored logs

3. **Usability Requirements**:
   - ✅ Clear documentation for all resource URIs
   - ✅ Helpful error messages for invalid queries
   - ✅ Backward compatible with existing execute_command usage

4. **Testing Requirements**:
   - ✅ Unit tests for all new functions
   - ✅ Integration tests for resource handlers
   - ✅ Performance tests for large outputs
   - ✅ Edge case coverage (empty output, no matches, etc.)

## Timeline Estimate

- **Phase 1**: Output truncation implementation (2-3 days)
- **Phase 2**: Basic log storage and list resources (2-3 days)
- **Phase 3**: Range query implementation (1-2 days)
- **Phase 4**: Search functionality with occurrence handling (2-3 days)
- **Phase 5**: Testing and documentation (2-3 days)

**Total**: 9-14 days

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Memory usage for large outputs | High | Implement size limits and circular buffer |
| Performance degradation on search | Medium | Use efficient search algorithms, limit result size |
| Breaking existing behavior | High | Make feature opt-in initially, thorough testing |
| Complex URI query parsing | Medium | Use proven query string parsing libraries |

## Dependencies

- No new external dependencies required
- Uses existing MCP SDK resource patterns
- Leverages current configuration system

## Next Steps

1. Review and approve this overview
2. Proceed to detailed technical specification
3. Create implementation plan with task breakdown
4. Define API contracts and interfaces
5. Develop testing strategy
6. Begin Phase 1 implementation

---

**Document Version**: 1.0
**Last Updated**: 2025-11-05
**Status**: Draft for Review
