# Analysis 25 - Default whitespace-only HTTP hosts to loopback

## Decision: Valid - fix applied

`clientHost` did `(bindHost || '127.0.0.1').trim()`, so a whitespace-only host is
truthy and trims to an empty string, producing URLs like `http://:9444/mcp` in
both HTTP provider registration and the `.vscode/mcp.json` export. Changed it to
trim first and then default: `(bindHost ?? '').trim() || '127.0.0.1'`.

**Why:** A whitespace host should behave like an unset one and fall back to
loopback; an empty authority yields an unusable endpoint. Added a unit test for
the helper and the resulting HTTP definition URL.

**Commit:** cf7e17e - fix(vscode): address Codex round-3 review feedback for PR #86
