# P34 - An invalid numeric flag value is consumed into a typed field and blocks every save

`parseServerArgs` parses a number option with `const n = Number(value);
out[key] = Number.isFinite(n) ? n : value`. When the value is non-numeric (e.g.
`--commandTimeout abc`), it stores the raw string `'abc'` in the
`number | null` field and consumes the flag (it never reaches `extraArgs`).
`Object.assign` then puts a string into `s.commandTimeout`. On save,
`validateLaunchSpec` checks `!(value > 0)` → `!('abc' > 0)` → `!NaN` → blocking
problem, so the save is refused with "wcli0.commandTimeout (abc) must be a
positive number" — and because the flag was consumed rather than passed through,
the user cannot save ANY unrelated edit to the entry without first manually
clearing that field (clearing it works only because an empty number maps back to
null). A value the parser cannot model should round-trip verbatim via
`extraArgs`, the same escape hatch used for unknown flags, instead of poisoning
the typed field.
Reference: `vscode-extension/src/configSource.ts:233-236` and
`vscode-extension/src/argsBuilder.ts:1010-1030`.
