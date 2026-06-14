# Analysis 4 - Preserve valid fractional maxOutputLines values

## Decision: Valid - fix applied

Confirmed in the server's `src/utils/config.ts` `validateLoggingConfig` that
`maxOutputLines` is only range-checked (`< 1 || > 10000`) with no integer
requirement, while `maxReturnLines` additionally requires `Number.isInteger`.
The extension's shared `isValidLogLimit` (integer + range) was applied to both,
so a fractional `maxOutputLines` such as `1.5` - which the `number` setting
permits and the server accepts - produced a blocking problem and the provider
registered no server. Fixed by adding `isValidMaxOutputLines` (range-only) and
using it for `maxOutputLines` in both `buildServerArgs` and `validateLaunchSpec`,
while `maxReturnLines` keeps the integer `isValidLogLimit`.

**Why:** The extension's validation must mirror the server's actual per-field
constraints; being stricter than the server blocks a configuration that would run
correctly, with a misleading "must be an integer" message.

**Commit:** 6017df8 - fix(vscode): address Codex review feedback for PR #86
