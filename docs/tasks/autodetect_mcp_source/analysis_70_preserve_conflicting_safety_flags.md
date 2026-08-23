# Analysis 70 - Preserve mutually exclusive safety flags

## Decision: Valid — fix applied

`parseServerArgs` mapped `--yolo` to `safetyMode='yolo'` and `--unsafe` to
`safetyMode='unsafe'`, so an entry containing both collapsed to whichever appeared
last. The server declares the pair conflicting (`.conflicts('unsafe','yolo')` in
`src/index.ts`) and refuses to launch with both, so a no-op or unrelated save of
such an entry silently rewrote a previously-failing entry into a valid single-mode
launch the user never chose. The fix detects the conflict up front
(`lastSafetyPositive` mirrors yargs last-wins, so a trailing `--no-yolo` or
`--yolo false` is not counted as positive) and, when both positives are present,
preserves both flags verbatim in `extraArgs` rather than modeling either into
`safetyMode`, leaving the conflicting (server-rejected) state intact.

**Why:** The parser's preservation contract is that anything it cannot faithfully
model round-trips verbatim instead of being silently transformed; collapsing the
conflict violated that and changed the entry's security posture without the user's
choice. Leaving `safetyMode` at its default 'safe' while round-tripping both flags
means a no-op save reproduces the same rejected entry (the forward builder emits no
yolo/unsafe for 'safe' and does not strip them from `extraArgs`), so the server
still rejects it exactly as before — no silent invalid-to-valid normalization. An
entry with only one positive flag, or `--yolo false` alongside `--unsafe`, is not a
conflict and is still modeled normally.

**Commit:** de5c856 — fix(vscode): round-13 codex review follow-ups for PR #89 (P67-P70)
