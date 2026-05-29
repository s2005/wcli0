# Analysis 3 - Avoid advertising unauthenticated bind-all-interfaces example

## Decision: Valid -- fix applied

The README's "custom host and port" snippet used `--sse-host 0.0.0.0`, which a
reader can copy onto an untrusted network and unwittingly expose the
command-execution tools with no authentication. The fix changes the documented
example to bind `127.0.0.1` on a custom port and adds a prominent security
callout warning that binding to `0.0.0.0` (or any non-loopback address) exposes
the tools to every host that can reach the port and must be fronted by
authenticated access control. The callout also notes the new `Origin` validation
so readers understand the built-in mitigation and its limits.

**Why:** Documentation that demonstrates an insecure default is itself a security
defect because copy-paste usage is the norm. Keeping the happy-path example on
localhost and gating the bind-all guidance behind an explicit warning aligns the
docs with the transport's intended local-first threat model.

**Commit:** 57358aa -- fix(transport): address Codex review feedback for PR #83
