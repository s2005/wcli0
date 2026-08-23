# Analysis 4 - Clear omitted env from the saved file baseline

## Decision: Valid — fix applied

`saveToFile` set the loaded baseline (`loadedFileSettings`) to the pre-write
`settings` object, which still carried `env` even when `writeMcpJsonFromSettings`
honored the user's "Omit environment" choice and wrote the entry without it.
Because `env` is not modeled by the form, the next `overlaySettings` re-applied
the stale `env`, reintroducing and re-prompting for a secret the user had
explicitly omitted. Fixed by re-baselining from disk after a successful write:
`saveToFile` now re-reads the entry via `readWcli0Entry` and re-parses it with
`parseMcpEntry`, so the baseline always matches exactly what was written
(env-less when omitted). This also keeps the baseline truthful for any other
write-time transform.

**Why:** The baseline must reflect the file on disk, not the form's intent. The
pre-write object diverges from disk whenever the write path drops or transforms a
field; reading back the authoritative state is the robust fix.

**Commit:** 81ab523 — fix(vscode): address review feedback for PR #89
