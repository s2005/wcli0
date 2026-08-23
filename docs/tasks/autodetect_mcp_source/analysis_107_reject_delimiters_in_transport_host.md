# Analysis 107 - Reject delimiters in edited transport hosts

## Decision: Valid — fix applied

The host field is pasted straight between `http://` and `:port`, with no check that it is an
authority host. `gateway.example/api` produced `http://gateway.example/api:9444/mcp`, which reparses
as host `gateway.example` with no explicit port — so the save reported success, the endpoint path was
malformed, and the user's edit was silently lost on reload. The same shape applies to userinfo
(`user@host`) and to a port typed into the host field (`example.com:8080` → `...:8080:9444`).

`unusableTransportHost` now rejects a host carrying `/`, `?`, `#`, `@` or whitespace, and one
carrying a single colon (an embedded port). An IPv6 literal is unaffected: it is bracketed by
`fileSourceUrlHost` and carries two or more colons. The check runs only when the URL will actually be
REBUILT from the fields — a URL preserved verbatim never interpolates them, so it cannot be blocked
by a host value that is inert for it.

**Why:** Refusing matches every other unsavable-edit guard in this feature (P55, P81, P88): the save
writes nothing and says why, instead of reporting success for an edit the reparse discards. Bounding
it to the rebuild path keeps the P5/P8/P10 preservation cases free of a check that has no bearing on
them. See [[analysis_81_reject_host_port_edits_for_opaque_urls]] and [[analysis_67_rebuild_default_port_url_on_port_change]].

**Commit:** cd74db6 - fix(vscode): address the five P2 findings missed by the #89 merge (P106-P110)
