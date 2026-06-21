# Analysis 3 - Preserve dash-prefixed custom launcher args

## Decision: Valid — fix applied

`parseMcpEntry`'s custom branch split a custom command's args at the first
dash-prefixed token, assuming everything from there is wcli0 server flags. That
broke launchers whose own arguments are options (e.g. `uvx --from ... wcli0`),
moving them into `extraArgs` after the generated server flags and reordering the
command on save. Fixed by making the boundary the first *recognized* wcli0 server
flag instead of the first dash: added a `BOOLEAN_FLAGS` set and an `isServerFlag`
helper (covering `VALUE_OPTIONS`, the boolean/tri-state flags, and the `--opt=value`
form) and using `args.findIndex(isServerFlag)`. The forward builder emits
`[...customArgs, ...serverFlags]`, so this recovers the split faithfully and the
load/save round-trip preserves argument order.

**Why:** The forward emission order is the contract the reverse parser must
invert. Keying on recognized wcli0 flags — not on any dash — matches that
contract and keeps unknown launcher options in `customArgs` where they belong.
A residual ambiguity (a launcher arg that literally equals a wcli0 flag name) is
acceptably rare and already warned about for `--config` / `--transport`.

**Commit:** 81ab523 — fix(vscode): address review feedback for PR #89
