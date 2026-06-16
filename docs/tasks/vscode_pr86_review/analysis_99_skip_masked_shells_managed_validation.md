# Analysis 99 - Skip masked shells during managed validation

## Decision: Valid — fix applied

Confirmed bug. `buildConfigFile` masks `shells` to `{}` when `ignoreInheritedShells` is set
(`configFile.ts:343`, P95), so no inherited per-shell entry reaches the generated config. But the
managed-validation loop in `validateLaunchSpec` (`argsBuilder.ts`, the `if (managed)` block around line
815) still iterated `s.shells` and pushed blocking problems for those masked entries — unanchorable
`allowedPaths`, sub-1 security limits, and unresolved executable commands. So an inherited shell with a
stale machine-specific value would make the provider reject a launch (and block `Generate Config File`,
which always calls `validateLaunchSpec(..., true)`) over a shell that will never be emitted, defeating
the opt-out.

Fix: gate the per-shell loop on `managed && !s.ignoreInheritedShells`. When the mask is on, the masked
shells are skipped, matching the masked config `buildConfigFile` actually writes. The global checks
that follow the block (log limits, commandTimeout/maxCommandLength, transport) are unchanged.

**Why:** validation must mirror what is emitted. Since the opt-out drops every inherited per-shell
entry from the generated config, validating those entries is both incorrect (they cannot affect the
launch) and harmful (it blocks the exact masked launch the opt-out promises). Covered by a unit test in
`argsBuilder.test.cjs` (P99) asserting the same shells block without the flag and do not block with it.

**Commit:** 9d969bf — fix(vscode): address PR86 round-15 review (P99-P102)
