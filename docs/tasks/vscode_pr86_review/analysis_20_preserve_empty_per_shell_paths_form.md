# Analysis 20 - Preserve explicit empty per-shell allowed paths

## Decision: Valid - fix applied

The webview form renders array fields as newline-separated textareas, so an
explicit `[]` and an unset value both appear empty; `collectShells()` dropped
empty arrays, and saving the reconstructed `shells` object after any edit lost the
explicit `[]` (re-inheriting global paths). Captured the loaded per-shell config
(`loadedShells`) in `setShellsVal`, and added an `arr()` helper in `collectShells`
that, when a textarea is empty, emits `[]` only if the loaded value was an array
and omits it otherwise. Applied to `executable.args`, the three `blocked*` lists,
and `allowedPaths`.

**Why:** Round-2 (P11/P12) made explicit empty arrays meaningful server-side, so
the editor must round-trip them. The one residual limitation - clearing a
previously non-empty list to `[]` is treated as "unset" - is a pre-existing UI
constraint best handled by editing settings.json directly, noted here.

**Commit:** cf7e17e - fix(vscode): address Codex round-3 review feedback for PR #86
