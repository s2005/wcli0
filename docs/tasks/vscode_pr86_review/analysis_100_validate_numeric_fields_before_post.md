# Analysis 100 - Validate every numeric field before posting form values

## Decision: Valid — fix applied

Confirmed bug. The webview Save handler validated only `transport.port` via `checkValidity()`; the
other constrained number inputs (global `commandTimeout`/`maxCommandLength`/`maxOutputLines` and the
per-shell timeout/length inputs) were posted regardless, and the export actions
(`generateConfig`/`writeMcpJson`/`showCommand`) bypassed even the port check. Saving
`commandTimeout = 0` or `maxOutputLines = 10001` therefore persisted an invalid value, after which the
host-side `validateLaunchSpec` blocks the launch and the provider registers no server — a confusing
silent failure — while an export would emit a config the server rejects at startup.

Fix (`webview.ts`): add a shared `validateNumbers()` guard that runs `checkValidity()` over every
`input[type=number]` (skipping disabled and empty controls), calls `reportValidity()` on the first
offender and aborts. Both the save click handler and `exportAction` now return early if it fails. Also
added `max="10000"` to the `maxOutputLines` input so its HTML validity matches the server's
`validateLoggingConfig` bound (the global limits already carry `min="1"`, and the port keeps
`1..65535`).

**Why:** the form should fail fast with native validity UI rather than persist a value the host will
silently reject. Bounding the controls client-side mirrors `validateLaunchSpec` so the error is shown
at the point of edit. Covered by two unit tests in `webview.test.cjs` (P100): one asserts the
`maxOutputLines` input carries `min=1`/`max=10000`, one asserts the script defines `validateNumbers`
and gates both save and export on it.

**Commit:** 9d969bf — fix(vscode): address PR86 round-15 review (P99-P102)
