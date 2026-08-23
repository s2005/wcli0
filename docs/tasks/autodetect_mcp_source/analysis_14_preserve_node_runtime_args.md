# Analysis 14 - Preserve node runtime arguments when loading entries

## Decision: Valid — fix applied

`parseMcpEntry` now only uses the `node` fast path when `args[0]` is an actual script (not
an option). A `node` entry whose first arg starts with `-` (e.g. `--inspect`) falls through
to custom parsing, so `command: "node"` becomes the custom command and `--inspect
dist/index.js` is preserved in `customArgs` before the wcli0 server flags.

**Why:** Assuming `args[0]` is the script turned `--inspect` into the script path and
reordered the real script after the server flags, breaking the launch on a no-op Save.
Gating the node fast path on a non-option first arg preserves the launcher verbatim.
Covered by unit tests for both the node-with-options (custom) and plain-node cases.

**Commit:** 3eccda7 — fix(vscode): address review feedback for PR #89 (round 3)
