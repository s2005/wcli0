# Analysis 86 - Strip UTF-8 BOMs before parsing detected JSONC

## Decision: Valid â€” fix applied

VS Code can save `.vscode/mcp.json` with its "UTF-8 with BOM" encoding and reads such a file back
without complaint, but `Buffer.toString('utf8')` keeps the leading `U+FEFF` and `JSON.parse` rejects
it. Every caller of `parseJsonc` swallowed the throw as "malformed": `detectWorkspaceMcpJson`
reported the file as existing with no wcli0 entry (so no banner, no Load & edit),
`readWcli0Entry` returned undefined, and the save path refused the file as invalid JSON. The whole
load/edit feature was unavailable for a file VS Code itself considers fine.

The fix strips a leading BOM inside `parseJsonc`, which covers detection, the entry load and the
save's merge read at once, as the review suggested. The write path now re-attaches the BOM when the
file it read had one (`hadBom`), so saving does not silently re-encode a file whose BOM was
deliberate.

**Why:** Centralizing in the parser is the only place that fixes all three callers without repeating
the check, and it is where the impedance mismatch actually lives â€” the parser accepts a JSON *text*,
and a BOM is an encoding artifact, not part of that text. Preserving the BOM on write follows the
same principle as the rest of this feature's save path: change what the form owns and leave
everything else about the file exactly as it was found.

**Commit:** 869edb8 - fix(vscode): round-17 codex review follow-ups for PR #89 (P83-P86)
