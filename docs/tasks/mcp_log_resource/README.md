# MCP Log Resource Feature - Planning Documentation

## Overview

This directory contains comprehensive planning documentation for implementing the MCP log resource feature in wcli0. The feature addresses two main objectives:

1. **Output Management**: Limit command output to prevent overwhelming responses (default: last 20 lines)
2. **Log Resources**: Provide MCP resources for accessing and querying historical command outputs with advanced filtering

## Document Structure

### [01-overview.md](./01-overview.md)
**Purpose**: High-level feature overview and business context

**Contents**:
- Executive summary
- Problem statement and motivation
- Proposed solution overview
- Success criteria
- Timeline estimates
- Risk analysis

**Audience**: Product owners, stakeholders, developers

---

### [02-technical-specification.md](./02-technical-specification.md)
**Purpose**: Detailed technical design and architecture

**Contents**:
- Data structures and interfaces
- Storage system design
- Output truncation algorithm
- Resource URI specification
- Query parameter processing
- Configuration schema
- Error handling
- Performance considerations

**Audience**: Developers, architects

---

### [03-implementation-plan.md](./03-implementation-plan.md)
**Purpose**: Step-by-step implementation roadmap

**Contents**:
- 8 implementation phases with detailed tasks
- Phase 1: Foundation (types, config)
- Phase 2: Output Truncation
- Phase 3: Log Storage
- Phase 4: Basic Resources
- Phase 5: Range Queries
- Phase 6: Search Functionality
- Phase 7: Testing & Documentation
- Phase 8: Optimization & Polish

**Audience**: Developers, project managers

---

### [04-api-design.md](./04-api-design.md)
**Purpose**: Complete API specification and examples

**Contents**:
- Tool response format changes
- Resource URI patterns
- Query parameter specifications
- Response formats (JSON and text)
- Error response formats
- Usage examples and workflows
- Backward compatibility notes

**Audience**: Developers, API consumers, documentation writers

---

### [05-testing-strategy.md](./05-testing-strategy.md)
**Purpose**: Comprehensive testing approach

**Contents**:
- Testing levels (unit, integration, E2E, performance)
- Test specifications for each component
- Edge cases and error scenarios
- Test data and fixtures
- Coverage goals (>85% overall)
- Test execution plan

**Audience**: Developers, QA engineers

---

## Quick Start

### For Implementers

1. **Start Here**: Read [01-overview.md](./01-overview.md) to understand the feature
2. **Design Review**: Study [02-technical-specification.md](./02-technical-specification.md)
3. **Implementation**: Follow [03-implementation-plan.md](./03-implementation-plan.md) phase by phase
4. **API Reference**: Refer to [04-api-design.md](./04-api-design.md) for exact specifications
5. **Testing**: Use [05-testing-strategy.md](./05-testing-strategy.md) to guide test development

### For Reviewers

1. Review [01-overview.md](./01-overview.md) for context and goals
2. Evaluate [02-technical-specification.md](./02-technical-specification.md) for design quality
3. Check [03-implementation-plan.md](./03-implementation-plan.md) for completeness
4. Verify [04-api-design.md](./04-api-design.md) meets requirements
5. Assess [05-testing-strategy.md](./05-testing-strategy.md) for test coverage

### For Users/Documentation

1. See [04-api-design.md](./04-api-design.md) for:
   - Resource URI patterns
   - Query parameters
   - Response formats
   - Usage examples

## Feature Summary

### What's Being Built

#### 1. Output Truncation
- Command responses show last N lines (configurable, default: 20)
- Full output stored for later access
- Truncation message includes resource URI for full output
- Can be disabled via configuration

#### 2. Log Storage
- Stores command execution history
- Includes stdout, stderr, metadata
- Automatic cleanup based on age and size limits
- Configurable retention policies

#### 3. MCP Resources

| Resource | Purpose |
|----------|---------|
| `cli://logs/list` | List all stored logs |
| `cli://logs/recent?n=10` | Get N most recent logs |
| `cli://logs/commands/{id}` | Get full command output |
| `cli://logs/commands/{id}/range?start=1&end=100` | Get specific line range |
| `cli://logs/commands/{id}/search?q=error&context=3` | Search with context |

#### 4. Query Features
- **Line ranges**: Positive and negative indices (e.g., `-10` for last 10 lines)
- **Search**: Regex patterns with case-sensitive/insensitive options
- **Occurrence navigation**: Navigate between multiple search matches
- **Context**: Include lines before/after matches
- **Line numbers**: Optional line numbering

## Configuration

```json
{
  "global": {
    "logging": {
      "maxOutputLines": 20,
      "enableTruncation": true,
      "maxStoredLogs": 50,
      "maxLogSize": 1048576,
      "maxTotalStorageSize": 52428800,
      "enableLogResources": true,
      "logRetentionMinutes": 60,
      "cleanupIntervalMinutes": 5
    }
  }
}
```

## Implementation Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1: Foundation | 1 day | Planned |
| Phase 2: Output Truncation | 2 days | Planned |
| Phase 3: Log Storage | 2 days | Planned |
| Phase 4: Basic Resources | 2 days | Planned |
| Phase 5: Range Queries | 1-2 days | Planned |
| Phase 6: Search Functionality | 2-3 days | Planned |
| Phase 7: Testing & Documentation | 2 days | Planned |
| Phase 8: Optimization & Polish | 1 day | Planned |
| **Total** | **9-14 days** | **Planned** |

## Key Design Decisions

### 1. In-Memory Storage
- **Decision**: Store logs in memory with size limits
- **Rationale**: Simpler implementation, faster access, automatic cleanup on restart
- **Trade-off**: Logs lost on server restart (acceptable for this use case)

### 2. Tail-based Truncation
- **Decision**: Show last N lines instead of first N
- **Rationale**: Most relevant information (results, errors) typically at end
- **Trade-off**: Need full log resource for complete context

### 3. Regex Search
- **Decision**: Support full regex patterns in search
- **Rationale**: Maximum flexibility for users
- **Trade-off**: Potential performance impact (mitigated with optimizations)

### 4. URI-based Query Interface
- **Decision**: Use query parameters for filtering instead of separate resources
- **Rationale**: RESTful design, flexible, extensible
- **Trade-off**: More complex URI parsing

### 5. Occurrence-based Navigation
- **Decision**: Support occurrence parameter to navigate between matches
- **Rationale**: Better UX for multiple matches
- **Trade-off**: Requires finding all matches first

## Dependencies

### Required
- None (uses existing MCP SDK, Node.js built-ins)

### Optional
- None

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Memory usage for large outputs | High | Implement size limits, circular buffer |
| Performance on large searches | Medium | Efficient algorithms, early termination |
| Breaking existing behavior | High | Backward compatible, feature flags |
| Complex URI parsing | Medium | Use proven parsing libraries |

## Success Metrics

- [ ] Feature complete and tested
- [ ] >85% test coverage
- [ ] Performance benchmarks met (<10ms truncation, <100ms search)
- [ ] Documentation complete
- [ ] Zero breaking changes
- [ ] User feedback positive

## Next Steps

1. ✅ Review planning documents (this directory)
2. ✅ Approve design and approach
3. ⏳ Begin Phase 1 implementation
4. ⏳ Incremental development following implementation plan
5. ⏳ Testing throughout development
6. ⏳ Documentation updates
7. ⏳ Release preparation

## Questions or Feedback

For questions, clarifications, or feedback on these plans:

1. Review the relevant document first
2. Check if your question is answered in another document
3. Open an issue or PR with specific questions/suggestions
4. Reference document name and section number

## Document Maintenance

These documents are living artifacts and should be updated as:
- Design decisions change
- Implementation reveals new requirements
- Testing uncovers issues
- User feedback suggests improvements

**Last Updated**: 2025-11-05
**Status**: Draft for Review
**Next Review**: Before Phase 1 implementation

---

## Document Change Log

| Date | Document | Changes | Author |
|------|----------|---------|--------|
| 2025-11-05 | All | Initial creation | Claude |

## Related Documentation

- [../ARCHITECTURE.md](../../ARCHITECTURE.md) - Overall wcli0 architecture
- [../API.md](../../API.md) - Current API documentation
- [../CONFIGURATION_EXAMPLES.md](../../CONFIGURATION_EXAMPLES.md) - Configuration examples
- [../../README.md](../../README.md) - Main project README
