# Analysis 29 - Refuse file-source shell/profile edits that cannot be saved

## Decision: Valid — fix applied

When editing a `.vscode/mcp.json` source that references a loadable `--config`, per-shell
(`wcli0.shells`) or profile (`wcli0.profiles`) edits made on the Shells/Profiles tabs were
overlaid onto the loaded settings and passed the existing "Write anyway" warning, but
`writeMcpJsonFromSettings` only writes the mcp.json entry and leaves the referenced config
file untouched. Since `parseMcpEntry` never reads shells/profiles back from that file, the
post-write reparse dropped those edits while still reporting a successful save — a silent
data loss. The file-source branch of `writeMcpJsonFromSettings` now refuses the save when
the form carries per-shell or profile config, with a message directing the user to edit the
referenced `--config` file directly and reload the source.

**Why:** The pre-existing "Write anyway" warning is correct for a settings export — there
shells/profiles persist in `wcli0.*` settings and the provider builds its own managed config
from them, so a pinned `configFile` is a best-effort sync, not the only copy. For a file
source there is no such persistence: the form values exist only in the form and have nowhere
to go, so a hard refuse (mirroring the existing block at commands.ts when no loadable config
file exists) is the safe behavior rather than a silent drop. The refusal is gated on
`fileSource && (hasPerShellConfig || hasProfilesConfig)`, so a normal file save with no
shell/profile edits is unaffected. Covered by commands.test.cjs P29 (a file save with
profile edits is refused and writes nothing; a file save without them still succeeds).

**Commit:** a233fef — fix(vscode): address review feedback for PR #89 (round 5)
