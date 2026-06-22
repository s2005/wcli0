# P42 - Parse modeled flags before multiple valued extras

`isPureServerFlagRun` only lets the FINAL unknown flag consume a following bare
value (the P24 trailing-value rule). When a custom wrapper's server suffix
contains more than one unknown value-bearing flag — e.g.
`wcli0 --shell cmd --future x --another y` — the detector therefore fails to
recognize the suffix that starts at `--shell`, splits later (at `--another`),
and leaves `--shell cmd` stranded in `customArgs`. The form then shows the
default shell, and a later shell edit appends a SECOND `--shell` instead of
updating the existing one. The suffix parser must let each unknown `--flag`
consume one following non-flag value, so multiple unknown flag/value pairs do
not hide the modeled flags before them.
Reference: `vscode-extension/src/configSource.ts:178-180`
(`isPureServerFlagRun`).
