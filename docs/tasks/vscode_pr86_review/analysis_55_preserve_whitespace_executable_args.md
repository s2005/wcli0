# Analysis 55 - Preserve whitespace in per-shell executable arguments

## Decision: Valid — fix applied

The webview `argLines` helper no longer trims each line of the per-shell executable
arguments textarea. An all-blank textarea is still treated as "no args" (or unset),
but a non-empty textarea now splits on newlines verbatim, preserving leading/trailing
and whitespace-only positional arguments.

**Why:** Executable arguments are passed straight to `spawn`, so whitespace can be
meaningful. The trim ran while establishing the form baseline, so the first save after
editing any other per-shell field silently rewrote the whole `shells` object with the
altered arguments — changing or breaking the configured invocation. Verified by `P55`
test in `webviewShells.test.cjs` (whitespace-significant args round-trip through a save
triggered by an unrelated field change).

**Commit:** 838acc4 — fix(vscode): address Codex round-7 review feedback for PR #86
