# P41 - Preserve current custom URLs on file saves

The http/sse URL preservation decision (`preservedFileUrl`) still uses the
`baseEntry` snapshot captured when the panel loaded, even though the current
on-disk entry has already been re-read for the merge. If another editor changes
only an unmodeled part of the URL after load (the scheme, path, or default-port
form) while leaving the same host/port the form shows, a later no-op or
unrelated save writes the old `baseEntry.url` back and discards the current
on-disk change. Use the current on-disk entry for URL preservation when its
modeled host/port still match the form (the URL-equivalent of the P20 on-disk
merge).
Reference: `vscode-extension/src/commands.ts:653` (the http/sse file-source
URL preservation and `servers.wcli0` assignment).
