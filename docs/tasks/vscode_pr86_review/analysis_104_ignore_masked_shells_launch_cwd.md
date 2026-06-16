# Analysis 104 - Ignore masked shells when checking launch cwd

## Decision: Valid — fix applied

Short-circuited `launchCwdAffectsConfig()` to return `false` when
`s.ignoreInheritedShells` is set, before scanning `s.shells`.

**Why:** `buildConfigFile()` masks inherited per-shell config when
`ignoreInheritedShells` is true (`const s = sInput.ignoreInheritedShells ? {
...sInput, shells: {} } : sInput;`), so no per-shell relative executable is emitted
to anchor against the launch cwd. But `launchCwdAffectsConfig()` scanned the
unmasked `s.shells`, so an inherited User-scope shell with a relative executable made
the helper report that `launch.cwd` matters. When that cwd was unresolved,
`generateConfigFile()` kept the cwd validation error and refused to write a config
whose contents do not actually depend on the cwd. Returning false under the mask
mirrors what `buildConfigFile` will emit and unblocks generation, consistent with the
P81 rationale that the cwd must not block config generation when it does not appear
in the file.

**Commit:** b967450 — fix(vscode): address PR86 round-16 review (P103-P105)
