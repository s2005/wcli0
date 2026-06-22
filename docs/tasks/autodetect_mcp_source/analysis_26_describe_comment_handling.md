# Analysis 26 - Describe the comment handling accurately

## Decision: Valid — fix applied

The README claimed "comments/non-object files are refused rather than clobbered", but the
writer only refuses non-object/malformed files; a file containing comments triggers a
modal warning and, on confirmation, is rewritten as plain JSON (comments removed). The
README now states that a non-object or malformed file is refused, while a file containing
comments is rewritten as plain JSON only after the user confirms (the comments are
removed).

**Why:** Accurate docs about a destructive-on-confirm behavior matter: a user relying on
the old text might assume comments are always protected. The new wording matches the
actual code path in `writeMcpJsonFromSettings` (`containsJsoncComments` -> modal "Write
anyway"). Documentation-only change; no test needed.

**Commit:** 7d5c8e2 — fix(vscode): address review feedback for PR #89 (round 4)
