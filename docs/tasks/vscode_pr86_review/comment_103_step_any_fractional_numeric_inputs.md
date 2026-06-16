# P103 - Allow valid fractional numeric settings in the form

The numeric inputs in the config webview omit a `step`, so Chromium applies the
default step of 1; because `validateNumbers()` calls `checkValidity()` before every
save/export, a valid persisted value such as `maxOutputLines: 1.5` or
`commandTimeout: 1.5` is treated as invalid and blocks all form actions until the
user rounds it. The launch/config builders deliberately accept fractional values for
these fields, so the form should set `step="any"` for the fields that support
fractions (commandTimeout, maxCommandLength, maxOutputLines, and their per-shell
equivalents), while integer-only fields such as the transport port keep `step="1"`.

File: `vscode-extension/src/webview.ts` (lines 308, 309, 586, 587, 588)
