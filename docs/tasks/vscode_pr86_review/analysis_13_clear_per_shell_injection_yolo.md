# Analysis 13 - Clear per-shell injection overrides in yolo and unsafe modes

## Decision: Valid - fix applied

Confirmed in the server's `applyCliUnsafeMode` (`src/utils/config.ts`) that
`--yolo`/`--unsafe` set `shell.overrides.security.enableInjectionProtection = false`
for every shell that has a security override, in addition to clearing the blocked
lists. `buildConfigFile`'s yolo/unsafe cleanup only cleared the restriction lists,
so a per-shell `enableInjectionProtection: true` survived and the server's deep
merge kept protection on for that shell. Extended the cleanup to set
`overrides.security.enableInjectionProtection = false` when present.

**Why:** The generated config must match the CLI `--yolo`/`--unsafe` semantics;
otherwise a shell silently keeps injection protection the user disabled globally.

**Commit:** 07629c2 - fix(vscode): address Codex round-2 review feedback for PR #86
