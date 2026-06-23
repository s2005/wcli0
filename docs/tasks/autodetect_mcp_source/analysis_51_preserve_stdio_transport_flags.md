# Analysis 51 - Preserve stdio transport flags on file saves

## Decision: Valid — fix applied

`parseMcpEntry` keeps a hand-authored `--transport http`/`--transport=sse` in a stdio
entry's `extraArgs` rather than flipping the transport mode (P30). But the file-source
save fed those `extraArgs` through `buildLaunchSpec` → `buildServerArgs`, whose
`stripExtraTransport` was unconditionally true for every stdio launch. A no-op Save to
file therefore dropped the authored `--transport` token and left its companion
`--http-*` options orphaned — the opposite of the file source's verbatim round-trip
guarantee.

The fix adds a `preserveExtraTransport` build option, set only for the file-source save.
When set AND no `--config` is emitted, the stdio path no longer strips an `extraArgs`
`--transport`, so the user's authored token (and its companions) round-trip verbatim.
The safety strip still applies to the provider and settings-export paths (so a stray
`--transport http` can never turn a stdio registration into a network listener), and it
still applies here when a `--config` is emitted, because the builder also pushes
`--transport stdio` and two `--transport` tokens yargs-merge into an array the server
applies neither of.

**Why:** A file source is the source of truth; an unrelated edit must not silently
mutate the user's argv. The safety strip exists to protect the provider/export paths,
not the file round-trip, so scoping the preservation to `preserveExtraTransport`
keeps both behaviors intact.

**Proposed fix:** Add `BuildOptions.preserveExtraTransport`; pass it from
`writeMcpJsonFromSettings` for a file source.

**Commit:** 378cffb — fix(vscode): round-8 codex review follow-ups for PR #89 (file-source save round-trip)
