# Task 1: Add Shell Type Property to Configuration

## Priority

HIGH - Required foundation for custom shells.

## Description

Introduce a new `type` property for each shell configuration. This value defines whether a shell uses Windows, Unix, mixed (Git Bash) or WSL semantics. Existing built‑in shell entries must be updated to include the correct type and configuration loaders must preserve it.

## Scope

- Extend `BaseShellConfig` and `WslShellConfig` in `src/types/config.ts` with a required `type` field.
- Update `DEFAULT_CONFIG` in `src/utils/config.ts` with `type` for each shell.
- Modify `mergeConfigs`, `resolveShellConfiguration` and related helpers so the property is retained.
- Ensure `createDefaultConfig` writes the new property.

## Files to Modify/Create

- `src/types/config.ts`
- `src/utils/config.ts`
- `src/utils/configMerger.ts`

## Acceptance Criteria

1. Configuration interfaces compile with the new property.
2. Loading and merging configs keeps the `type` value intact.
3. Default config file generated with `--init-config` contains the new field for all shells.
