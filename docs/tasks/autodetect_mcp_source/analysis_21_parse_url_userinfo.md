# Analysis 21 - Parse URL userinfo before extracting host and port

## Decision: Valid — fix applied

`parseHttpUrl`'s regex now skips an optional `userinfo@` segment
(`^[a-z]+:\/\/(?:[^@/]*@)?(host)(:port)?`), so credentials in a URL such as
`https://user:pass@example.com:9444/mcp` no longer get mistaken for the host and the
explicit port behind them is read correctly.

**Why:** Without skipping userinfo, `user` was parsed as the host and the port was missed,
so the form showed the wrong host/default port, a port edit was ignored, and a host edit
dropped the credentials. Covered by a `parseMcpEntry` test asserting the host/port are read
past the credentials and the verbatim URL is preserved.

**Commit:** 3eccda7 — fix(vscode): address review feedback for PR #89 (round 3)
