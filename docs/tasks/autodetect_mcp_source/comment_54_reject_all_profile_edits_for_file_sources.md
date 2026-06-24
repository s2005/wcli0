# P54 - Reject all profile edits for file sources

The file-source guard only rejects profiles that `hasRawProfilesConfig` considers
launch-meaningful, but the Profiles editor accepts any JSON object. On a stdio file
source, entering a non-empty but non-emittable profile such as
`{"p":{"description":"x","env":{}}}` lets Save to file succeed; the entry cannot store
profiles, the reparse returns an empty profiles map, and the UI reports Saved while
discarding the edit. For file sources, reject any non-empty profiles object rather
than only meaningful ones.
Reference: `vscode-extension/src/commands.ts:450` (the P29 file-source guard).
