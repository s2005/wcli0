# Modular Shell Architecture Documentation

This folder contains comprehensive documentation for implementing a modular shell architecture in the WCLI0 MCP server.

## Purpose

The modular shell architecture enables build-time inclusion/exclusion of specific shells (PowerShell, CMD, Git Bash, Bash, WSL), allowing for:

- **Smaller bundle sizes**: 30-65% reduction for specialized builds
- **Simplified codebases**: Only include shells you actually use
- **Better maintainability**: Clear separation of shell implementations
- **Easier testing**: Test only the shells you need

## Documents

### 1. [ARCHITECTURE.md](./ARCHITECTURE.md)

**Start here for the big picture.**

Comprehensive architecture document covering:

- Current state analysis of the WCLI0 codebase
- Goals and objectives of the modular approach
- Proposed modular architecture with plugin system
- Module structure and organization
- Build configuration system
- Shell plugin interface design
- Expected outcomes and benefits
- Migration strategy overview

**Who should read this**: Architects, technical leads, anyone wanting to understand the overall design.

### 2. [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)

**Step-by-step implementation guide.**

Detailed implementation plan organized into 7 phases:

- **Phase 1**: Foundation & Infrastructure (1 week)
- **Phase 2**: Shell Module Extraction (2-3 weeks)
- **Phase 3**: Registry & Dynamic Loading (1 week)
- **Phase 4**: Build Configuration System (1 week)
- **Phase 5**: Testing & Validation (1-2 weeks)
- **Phase 6**: Documentation & Migration (1 week)
- **Phase 7**: Cleanup & Optimization (1 week)

Each phase includes:

- Specific tasks with code examples
- Test requirements
- Deliverables checklist
- Duration estimates

**Who should read this**: Developers implementing the changes, project managers tracking progress.

### 3. [TESTING_GUIDE.md](./TESTING_GUIDE.md)

**Comprehensive testing strategy and migration guide.**

Detailed testing documentation covering:

- Current test structure and target organization
- Test migration strategy (extracting shell-specific tests)
- Testing individual shell modules with examples
- Integration and build-specific testing
- Test utilities and helpers
- Performance testing approaches
- CI/CD integration with GitHub Actions
- Coverage requirements (≥95% for modules)

Each shell gets dedicated test files:

- Implementation tests
- Validation tests
- Path handling tests
- Integration tests

**Who should read this**: Developers writing tests, QA engineers, anyone implementing the modular architecture.

## Quick Start

### For Architects/Reviewers

1. Read [ARCHITECTURE.md](./ARCHITECTURE.md) to understand the design
2. Review the proposed module structure and plugin interface
3. Consider the migration strategy and risk mitigation

### For Developers

1. Skim [ARCHITECTURE.md](./ARCHITECTURE.md) for context
2. Follow [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) phase by phase
3. Reference [TESTING_GUIDE.md](./TESTING_GUIDE.md) when writing tests
4. Implement each phase with the provided code examples
5. Complete deliverables checklist for each phase

### For Project Managers

1. Review [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for timeline
2. Use the 7 phases to create project milestones
3. Track deliverables for each phase
4. Monitor success metrics (bundle size, performance)

## Timeline

**Total estimated time**: 8-10 weeks

The implementation is designed to be incremental with no breaking changes until the final phase.

## Key Benefits

### For Users

| Use Case | Build Preset | Bundle Size Reduction | Shells Included |
|----------|--------------|----------------------|-----------------|
| Windows Developer (All) | `windows` | ~40% | PowerShell, CMD, Git Bash |
| Git Bash User | `gitbash-only` | ~60% | Git Bash only |
| CMD User | `cmd-only` | ~65% | CMD only |
| Linux/WSL User | `unix` | ~60% | Bash |
| General Purpose | `full` | - | All shells |

### Developer Benefits

- **Clearer code organization**: Each shell is self-contained
- **Easier testing**: Test shells independently
- **Better type safety**: Types match included shells
- **Faster builds**: Smaller codebases build faster
- **Easier maintenance**: Changes to one shell don't affect others

## Build Examples

Once implemented, you'll be able to build specialized versions:

```bash
# Build with all shells (default)
npm run build

# Build for Windows users only (PowerShell, CMD, Git Bash)
npm run build:windows

# Build for Git Bash users only
npm run build:gitbash

# Build for CMD users only
npm run build:cmd

# Build for Unix/Linux users only
npm run build:unix

# Custom build with specific shells
INCLUDED_SHELLS=gitbash,powershell npm run build:custom
```

## Architecture Highlights

### Plugin-Based Design

Each shell is a plugin implementing the `ShellPlugin` interface:

```typescript
interface ShellPlugin {
  readonly shellType: string;
  readonly displayName: string;
  readonly defaultConfig: ShellConfig;

  validateCommand(command: string, context: ValidationContext): ValidationResult;
  validatePath(path: string, context: ValidationContext): ValidationResult;
  getBlockedCommands(): string[];
  mergeConfig(base: ShellConfig, override: Partial<ShellConfig>): ShellConfig;
}
```

### Dynamic Registration

```typescript
// Shells register themselves at startup
import { shellRegistry } from './core/registry';
import { GitBashPlugin } from './shells/gitbash';

shellRegistry.register(new GitBashPlugin());
```

### Build-Time Selection

```bash
# Only Git Bash code is included in the bundle
SHELL_BUILD_PRESET=gitbash-only npm run build
```

## Success Criteria

### Technical Metrics

- ✅ Bundle size reduction: 30-65% for specialized builds
- ✅ Zero runtime overhead for excluded shells
- ✅ 100% type safety maintained
- ✅ No breaking changes for existing users
- ✅ Test coverage ≥ 90%

### Business Metrics

- ✅ Easier onboarding for single-shell users
- ✅ Reduced support burden (fewer unused features)
- ✅ Better developer experience
- ✅ Clearer upgrade/migration path

## Status

**Current Status**: Planning & Documentation Phase

The architecture and implementation plan are complete and ready for review.

## Next Steps

1. **Review**: Stakeholder review of architecture and plan
2. **Approval**: Get approval to proceed with implementation
3. **Setup**: Create GitHub issues/project board for tracking
4. **Kickoff**: Begin Phase 1 implementation

## Questions?

For questions about the architecture or implementation plan, please refer to the detailed documents or reach out to the project team.

## Related Documentation

- Main codebase documentation: `/docs`
- Shell exploration reports: See root directory for `SHELL_*.md` files
- Current configuration: `src/utils/config.ts`
- Current shell types: `src/types/config.ts`

## Contributing

When implementing phases:

1. Follow the implementation plan sequence
2. Complete all deliverables for each phase
3. Ensure all tests pass before moving to next phase
4. Update this README with progress
5. Document any deviations from the plan

---

**Last Updated**: 2025-11-08
**Version**: 1.0
**Status**: Ready for Implementation
