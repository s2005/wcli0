# Analysis 9 - Preserve non-string env values on file saves

## Decision: Valid — fix applied

When saving a file source, the stdio entry's `env` is now taken verbatim from the loaded
raw entry (`baseEntry.env`) rather than the string-filtered settings env. Because `env` is
not form-editable, this round-trips VS Code-allowed non-string values (numbers, `null`)
unchanged, while the existing "Include/Omit environment" prompt still lets the user strip
it (the omit path drops `env` entirely).

**Why:** `asStringMap` drops non-string values when building the settings baseline, so an
unrelated save rewrote the entry without them (e.g. `env: { PORT: 3000 }` lost `PORT`) and
showed no env prompt because the baseline looked empty. Sourcing env from the raw entry
fixes both. Covered by unit tests asserting non-string env round-trips and that the omit
choice still drops it.

**Commit:** 87784c3 — fix(vscode): address review feedback for PR #89 (round 2)
