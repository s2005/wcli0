# Analysis 104 - Preserve blank allowed-directory rows in the webview

## Decision: Rejected — the premise does not hold; regression tests added instead

The normalization the review describes is real: `collect()` does turn a blank textarea into `[]`
(and then into `null` via the Inherit checkbox). The conclusion drawn from it is not, because the
dirty baseline is produced by the SAME function. After the form is populated,
`initial = collect()` runs, so the baseline for `allowedDirectories` is the identical normalized
value. `collectChanged()` compares `collect()` against `initial`, finds no difference, and never
submits the field. The form is not "immediately dirty", and an unrelated save carries no
`allowedDirectories` key at all — so `overlaySettings` leaves the parsed `['']` in place and the
builder re-emits `--allowedDir ""` (P103).

Verified against the shipped client rather than by reading it: the webview test harness runs the
real browser-side script, and with a loaded `allowedDirectories: ['']` plus an unrelated
`commandTimeout` edit, the posted `saveToFile` payload is exactly `{"commandTimeout": 45}`. Editing
the textarea to `/ws/a` submits `{"allowedDirectories": ["/ws/a"]}`, which is the correct behavior
for a real edit — the authored empty entry is replaced because the user replaced it.

Three tests were added to pin this down, since the reasoning is subtle enough to be re-reported:
two in `webviewButtons.test.cjs` covering the client contract (untouched list not submitted; an
edited list still submitted), and one end-to-end test in `webview.test.cjs` that loads an entry with
`--allowedDir ""`, saves an unrelated field, and asserts the written args still carry the empty
entry.

**Why:** The finding is a single-function reading of a two-function invariant — the client's
normalization is only a bug if the baseline escapes it, and it does not. Adding a "lossless
representation" for blank rows would introduce a real hazard in exchange: a trailing newline or a
cleared textarea would then be submitted as an authored deny-all, turning an ordinary edit into a
restriction the user never asked for. See [[analysis_103_preserve_empty_allowed_dir]].

**Commit:** 0e0834b - test(vscode): pin the empty allowed-dir round-trip; reject P104 for PR #89
