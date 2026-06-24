# P58 - Don't strand file saves on a sub-1-second commandTimeout/maxCommandLength

A hand-authored stdio entry with `--commandTimeout 0.5` (the server accepts any value > 0)
cannot be round-tripped: every "Save to file" is refused because the form's number input
carries `min="1"`.

`parseServerArgs` models `--commandTimeout 0.5` into the typed `commandTimeout` field as `0.5`.
The `commandTimeout` input is rendered with `min="1"` (`webview.ts:1074`; `maxCommandLength`
the same at `1075`), and the save handler runs `validateNumbers()` first, which calls
`checkValidity()` on every enabled `input[type=number]`. For a stdio file source the Limits &
Safety panel is not locked, so the untouched `0.5` value fails `rangeUnderflow`,
`reportValidity()` fires, and `validateNumbers()` returns false — the `saveToFile` message is
never posted. An unrelated edit (e.g. changing the Config file path) cannot be saved until the
user changes `commandTimeout` to >= 1, altering a field they never intended to touch and
corrupting a valid value.

The host write path would accept `0.5`: for a non-managed/file launch `validateLaunchSpec`
blocks only `!(value > 0)`, `buildServerArgs` emits the flag when `> 0`, and the server's
`applyCliSecurityOverrides` applies any value > 0. The form's `min="1"` is the
managed/config-file bound (`validateConfig` rejects values between 0 and 1) wrongly applied to a
CLI-flag/file entry, whose bound is `> 0`. The same mismatch strands `--maxCommandLength 0.5`.
File: `vscode-extension/src/webview.ts:1074-1075` (the `commandTimeout` / `maxCommandLength`
number inputs `min="1"`) and `webview.ts:1752-1761` (`validateNumbers` gating `save` /
`saveToFile`).
