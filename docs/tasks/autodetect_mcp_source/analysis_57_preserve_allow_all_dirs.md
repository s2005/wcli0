# Analysis 57 - Preserve --allowAllDirs on a file save when --initialDir is set

## Decision: Valid — fix pending

`buildServerArgs` emits `--allowAllDirs` only when `!dirsConfigured`, where
`dirsConfigured = s.allowedDirectories.some((d) => d.trim()) || s.initialDir.trim().length > 0`
(argsBuilder.ts:415-416). For a loaded `.vscode/mcp.json` stdio file source, this silently
drops a user-authored `--allowAllDirs` whenever the entry also sets `--initialDir`, because
`allowAllDirs` is a modeled, form-editable field excluded from the on-disk uneditable-argv
carry-forward (commands.ts:632-646), and `validateLaunchSpec` has no guard for it. The save
reports "Saved" and the post-write reparse flips the "Allow all directories" tri-select off.

The drop is not server-equivalent for the `--initialDir` combination. The server applies
`--allowAllDirs` as `loadConfig`'s `disableIfEmpty`, which clears `restrictWorkingDirectory`
(src/utils/config.ts:186-193) BEFORE the CLI `--initialDir` is merged by `applyCliInitialDir`
(src/index.ts ordering; src/utils/config.ts:802-812). With the restriction already off,
`applyCliInitialDir` does not add the initial directory to `allowedPaths`, so the server stays
unrestricted; the round-tripped entry without the flag keeps the restriction and confines the
server to the initial directory. The `--allowedDir` case is server-inert
(`applyCliShellAndAllowedDirs` forces `restrictWorkingDirectory = true` regardless), but the
round trip still flips the tri-select from enabled to disabled.

**Why:** An mcp.json entry's authored flags are authoritative — a flag the form displays as
set must round-trip, and the working-directory restriction is security-relevant. The
`argsBuilder` comment ("meaningless once paths are configured") conflates `--initialDir` with
`--allowedDir`; only the latter forces the restriction back on. This is the same
preserve-the-authored-entry invariant behind P40/P-staleargs (preserve uneditable argv) and
P30 (don't let a flag in the args silently change the server's posture), but the mechanism is
distinct: `allowAllDirs` is an editable modeled boolean dropped by `buildServerArgs`'s emit
condition, which the carry-forward never reaches. See [[analysis_40_preserve_uneditable_argv]]
and [[analysis_30_transport_flags_corrupt_stdio_entry]].

**Proposed fix:** For a file source (where `preserveRelativePaths`/`preserveExtraTransport` is
already set), gate the `--allowAllDirs` suppression on `allowedDirectories` only, not
`initialDir` — or carry `allowAllDirs` forward from the on-disk entry like the other uneditable
argv fields. Add a round-trip unit test for `--allowAllDirs --initialDir /work`. The existing
forward-builder test (`argsBuilder.test.cjs`) currently encodes the buggy assumption and must
be updated.

**Commit:** (pending)
