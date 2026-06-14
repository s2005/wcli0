# P14 - Reject invalid per-shell security limits instead of dropping them

When a managed per-shell configuration sets `commandTimeout` or `maxCommandLength`
below 1, the `posNum` checks silently omit the value and the provider still
registers the server using an inherited/default limit. The equivalent invalid
global settings are blocking in `validateLaunchSpec`, so per-shell mode
misleadingly accepts a setting that does not take effect. Validate these per-shell
values before writing the managed config. Source:
`vscode-extension/src/configFile.ts:137`.
