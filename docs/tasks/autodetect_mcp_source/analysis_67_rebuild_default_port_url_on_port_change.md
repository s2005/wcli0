# Analysis 67 - Rebuild default-port URLs when the port changes

## Decision: Valid — fix applied

`preservedFileUrl`'s default-port branch returned the loaded URL verbatim whenever
`parsed.host === settings.transportHost`, ignoring the port field entirely. A
default-port URL such as `https://gateway.example/custom/mcp` loads with
`transportHost` set and `transportPort` left at the form default (9444), so a
port-only edit was silently discarded: the save reported success, wrote the
original URL back unchanged, and the next reparse dropped the user's edited port.
The fix preserves the verbatim URL only while the host is unchanged AND the port
is still the form default; once the port is edited away from the default, the
branch falls back to canonical reconstruction (`http://host:port/<mcp|sse>`),
mirroring the existing host-edit behavior. The parse note in `parseMcpEntry` was
updated from "the port field does not affect it" to "editing the host or port
rewrites it" to match.

**Why:** The codebase's contract is that a file-source save round-trips a loaded
URL verbatim only while the modeled fields (host/port) are untouched, and rebuilds
the canonical form once they change (P5/P8 for host edits). Treating a port edit
the same way as a host edit makes the behavior consistent and honors the user's
edit instead of silently dropping it and reporting a false "Saved". Comparing
against `defaultSettings().transportPort` is the exact signal of "the port field
is still the default the parser left for a default-port URL", so an untouched save
still preserves the verbatim URL (P8) while a real port edit rebuilds it.

**Commit:** de5c856 — fix(vscode): round-13 codex review follow-ups for PR #89 (P67-P70)
