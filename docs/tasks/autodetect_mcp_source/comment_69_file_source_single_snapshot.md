# P69 - Keep file-source saves on one file snapshot

In `vscode-extension/src/commands.ts:507` (`writeMcpJsonFromSettings`), a file-source save
reads only `servers.wcli0` up front (before the env/comment warning modals), but the
function later rereads the whole file and treats `FileNotFound` as a fresh file. If the user
or another editor deletes or recreates `.vscode/mcp.json` while a modal is open, the save
still merges from the stale up-front entry and writes a new file containing only
`servers.wcli0`, dropping every other server that was present in the originally loaded file.
The save must use one full-file snapshot for both the merge base and `existing.servers` (or
abort when the loaded file disappears during a file-source save) so a concurrent
delete/recreate cannot silently drop the other servers.
