# Analysis 71 - Preserve false safety flags in conflict round-trips

## Decision: Valid — fix applied

`parseServerArgs` detected a `--yolo`/`--unsafe` conflict only when BOTH flags
resolved to a *positive* last value (`lastSafetyPositive`). But the server's
`.conflicts('unsafe','yolo')` (in `src/index.ts`) fails whenever both keys are
merely *defined*, regardless of value — and yargs-parser defines the key for
`--yolo false`, `--no-yolo`, and `--yolo=false` exactly as it does for `--yolo`. I
verified this against the project's yargs: `--yolo false --unsafe`, `--no-yolo
--unsafe`, `--yolo=false --unsafe`, and even `--no-yolo --no-unsafe` are all
REJECTED. The old detector counted the false/negated side as absent, modeled such
an entry as a plain `unsafe` (or `yolo`) launch, and a no-op save rewrote the args
to a single valid safety flag — silently turning a server-rejected hand-authored
entry into a working unsafe launch.

The fix replaces `lastSafetyPositive` with a presence check: the conflict fires
whenever both families appear in any form (`--yolo` / `--no-yolo` / `--yolo=…`
and the `--unsafe` equivalents). Under a conflict every safety-family token —
including the bare positives (already handled by P70), the consumed `true`/`false`
values, the `--no-yolo`/`--no-unsafe` negations (newly preserved), and the attached
`--yolo=…`/`--unsafe=…` forms — round-trips verbatim in `extraArgs`, and
`safetyMode` is left at its default. A no-op save therefore reproduces the exact
rejected entry rather than a valid single-mode launch.

**Why:** The parser's contract is that anything it cannot faithfully model
round-trips verbatim instead of being silently transformed. Collapsing a
server-rejected conflict to one mode violated that and changed the entry's security
posture without the user's choice. Two existing tests (P63 case `c`, P70 case `c`)
asserted the old behavior precisely because earlier rounds mis-modeled yargs'
conflict semantics as last-wins; both are corrected here, and the P63 first case
was narrowed to a single safety family (its `--no-yolo --no-unsafe` pair was itself
a now-recognized conflict). A single safety family — `--yolo false` or `--no-yolo`
alone, with no `--unsafe` — is not a conflict and is still modeled normally.

**Commit:** ce1a2b3 — fix(vscode): round-14 codex review follow-ups for PR #89 (P71-P73)
