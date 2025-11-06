# Task 2: Integrate Shell Type into Server Logic

## Priority

HIGH - Necessary to actually support new shell entries.

## Description

Update runtime logic so the server determines path rules and validation behavior based on the `type` property rather than hard coded shell names. Validation context and helper utilities must reference this field.

## Scope

- Change `createValidationContext` in `src/utils/validationContext.ts` to derive `isWindowsShell`, `isUnixShell` and `isWslShell` from the `type` field.
- Update all utilities under `src/utils/` that switch on shell name to instead consult the new type information.
- Adjust `CLIServer` in `src/index.ts` to store the type when resolving shell configs.

## Files to Modify/Create

- `src/utils/validationContext.ts`
- `src/utils/pathValidation.ts`
- `src/index.ts`

## Acceptance Criteria

1. Validation logic works for both built‑in and custom shells.
2. Tests confirm that commands execute with correct path normalization depending on shell type.
