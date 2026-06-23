# P46 - Merge from a single file snapshot

For file-source saves, the early `readWcli0Entry` supplies the env/argv/url
preservation data, but the merge base is read again later (from the full-file read)
after validation and user-facing modals. If `.vscode/mcp.json` changes between those
awaits, the generated `args`/`env` are built from the stale up-front snapshot and
then merged onto the newer entry from the later read, producing an incoherent mix
that can drop externally added env or flags. Derive the preservation data and the
merge base from the same parsed file snapshot (the single up-front read).
Reference: `vscode-extension/src/commands.ts:461-462` (the up-front read) and
`:756-758` (the merge base re-read at write).
