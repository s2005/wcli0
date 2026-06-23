# Analysis 58 - Don't strand file saves on a sub-1-second commandTimeout/maxCommandLength

## Decision: Valid — fix pending

The `commandTimeout` / `maxCommandLength` number inputs are rendered with `min="1"`
(webview.ts:1074-1075), and the save handler gates on `validateNumbers()` (which
`checkValidity()`-rejects every enabled `input[type=number]`, webview.ts:1752-1761) before
posting `saveToFile`. A loaded `.vscode/mcp.json` stdio entry carrying a server-valid
sub-1-second value (`--commandTimeout 0.5`) is parsed into the typed field as `0.5`; for a
stdio file source the Limits & Safety panel is not locked, so the untouched input fails
`rangeUnderflow` and blocks EVERY file-source save — including edits to unrelated fields — until
the user changes the value to >= 1, which they never intended and which corrupts a valid value.

The host accepts the value: the file-source save validates with `managed = false`, whose
`validateLaunchSpec` branch blocks only `!(value > 0)` (argsBuilder.ts:1047), `buildServerArgs`
emits `--commandTimeout` when `> 0` (argsBuilder.ts:372), and the server's
`applyCliSecurityOverrides` applies any value > 0. `validateLaunchSpec` already splits the bound
by path (managed requires >= 1 because the value is written into a config file that
`validateConfig` re-validates; non-managed CLI flags require only `> 0`, argsBuilder.ts:1033-1053),
but the client-side `min="1"` does not — it applies the managed bound to every source.

**Why:** The client number-input constraints must match the host's acceptance for the active
source, or a hand-authored, server-valid value the form can display but not re-submit strands
the round trip. This is the wrongful-refusal class behind P34 (an unparseable numeric value
falls to `extraArgs` rather than blocking saves) and P50 (an out-of-range port is recovered
rather than stranding the form), but the root cause is distinct: `0.5` is a parseable,
host-accepted value modeled into the typed field, and the defect is a client/host bound mismatch
(`min="1"` vs `> 0`), not an unparseable value or an out-of-range-recovery case. Related to P59,
the host-side counterpart for the log-limit fields. See [[analysis_34_invalid_numeric_blocks_save]]
and [[analysis_50_treat_oversized_ports_invalid]].

**Proposed fix:** Relax the `min`/`step` on `commandTimeout` / `maxCommandLength` (or skip the
managed-bound client check for a file/stdio source) so a server-valid `> 0` value passes
`validateNumbers`, matching the host's non-managed acceptance; keep the managed-mode (>= 1)
enforcement on the host. Add a webview test that loads `--commandTimeout 0.5` and asserts an
unrelated edit can be saved.

**Commit:** (pending)
