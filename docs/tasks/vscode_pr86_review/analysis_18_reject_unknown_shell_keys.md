# Analysis 18 - Reject unknown per-shell configuration keys

## Decision: Valid - fix applied

The `wcli0.shells` schema accepted arbitrary property names via
`additionalProperties`, so a typo like `wcli0.shells.powerhsell` was accepted but
ignored by `hasPerShellConfig`/`buildConfigFile` (which only inspect the five
known shells), silently launching all default shells. Added
`"propertyNames": { "enum": ["powershell","cmd","gitbash","wsl","bash"] }` to the
schema so VS Code reports the typo.

**Why:** Schema-level key restriction surfaces the misconfiguration at edit time
rather than letting it silently no-op. Covered by a manifest meta-test asserting
the `propertyNames.enum`.

**Commit:** 07629c2 - fix(vscode): address Codex round-2 review feedback for PR #86
