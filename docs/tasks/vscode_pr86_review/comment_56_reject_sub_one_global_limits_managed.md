# P56 - Reject sub-one global limits in managed mode

When any per-shell setting enables managed mode, global `commandTimeout` and
`maxCommandLength` are written into the generated config rather than applied as
post-load CLI overrides. `buildConfigFile` drops values between 0 and 1 because the
server rejects them in config files, but `validateLaunchSpec` only rejects
non-positive values, so a setting such as `commandTimeout: 0.5` silently launches with
the server default instead of the configured value. Apply the managed-mode `>= 1` rule
to these global limits.

File: `vscode-extension/src/argsBuilder.ts:669`
