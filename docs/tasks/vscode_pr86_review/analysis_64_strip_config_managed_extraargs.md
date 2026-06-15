# Analysis 64 - Strip config overrides from managed launch extra arguments

## Decision: Valid — already fixed (P59)

`buildManagedServerArgs` already strips a conflicting `--config`/`-c` from `extraArgs` via
`stripConfigArgs(stripTransportArgs(s.extraArgs))` (argsBuilder.ts), so a managed launch can never
duplicate the managed `--config`. This concern was implemented in round 8 (P59); Codex re-raised it
on an outdated line. No code change is required — the behavior Codex requests is already in place.

**Why:** The thread is marked outdated — the reviewed line moved when `stripConfigArgs` was added.
The current managed path is exactly the behavior Codex requests. Already verified by the existing
`P59` tests in `argsBuilder.test.cjs` ("a managed launch strips a conflicting --config/-c from
extraArgs" and the attached `--config=`/`-c=` form), so no new test was added for P64.

**Commit:** 4c5a136 — fix(vscode): address Codex round-9 review feedback for PR #86
