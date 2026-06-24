# Analysis 53 - Preserve current wslMountPoint on file saves

## Decision: Valid — fix applied

`--wslMountPoint` round-trips through `parseMcpEntry`/`buildServerArgs` but has no form
control, so it belongs to the same class as `customArgs`, the blocked lists,
`--maxReturnLines`, and the transport allowed-origins: uneditable argv fields that the
file-source save re-derives from the CURRENT on-disk entry and splices back (P40). It
was simply missing from that carry-forward list, so an unrelated save rebuilt `args`
from the stale loaded `settings.wslMountPoint` and dropped a `--wslMountPoint` that
another process had added or changed after the panel loaded.

The fix adds `wslMountPoint: onDisk.wslMountPoint` to the stdio carry-forward
`buildSettings`, alongside the other uneditable argv fields.

**Why:** The carry-forward's stated purpose is to preserve every argv-derived field the
form does not edit; `--wslMountPoint` is one of them, so omitting it was an oversight
that breaks the same guarantee P40 establishes for the other flags.

**Proposed fix:** Add `wslMountPoint` to the on-disk carry-forward in
`writeMcpJsonFromSettings`.

**Commit:** 378cffb — fix(vscode): round-8 codex review follow-ups for PR #89 (file-source save round-trip)
