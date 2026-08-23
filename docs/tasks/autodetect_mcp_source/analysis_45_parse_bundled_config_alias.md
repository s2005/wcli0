# Analysis 45 - Parse bundled config aliases as configFile

## Decision: Valid — fix applied

`VALUE_OPTIONS` recognized only `-c`, `--c`, and `--config` (plus the `=` forms),
but yargs reads the single-character `c` alias anywhere in a single-dash bundle, so
`-c/other.json`, `-cX`, `-xc/other.json`, and `-dc /other.json` all set the server's
config. A loaded entry using a bundled alias kept the real config pin in `extraArgs`,
so the Config file field showed nothing and the loadability/`--config` checks
believed there was no config file while the server would still load one. The fix
adds a short-option bundle handler in `parseServerArgs` (single-dash, no `=`,
containing `c`) that takes the value attached after the `c` or, when `c` is the
bundle's last character, the following non-flag token — mirroring
`argsBuilder.stripConfigArgs`.

**Why:** The forward stripper and the reverse parser must be symmetric: the forward
direction strips any single-dash bundle containing `c` to avoid the silent
config-fallback bug, so the reverse direction must model the same forms as
`configFile`. wcli0's only single-character option is `c`, so this cannot collide
with another modeled short flag. A trailing `c` with no value (or a following flag)
is preserved verbatim in `extraArgs` rather than fabricating a value (consistent with
P44/P86).

**Proposed fix:** Insert a bundle branch in `parseServerArgs` after the `=` form
handling that sets `configFile` from the attached value or the next non-flag token.

**Commit:** 3c4a087 — fix(vscode): round-7 codex review follow-ups for PR #89 (parser + save round-trip)
