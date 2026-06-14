# P8 - Fall back after managed storage creation fails

When `context.storageUri` exists but its directory cannot be created, the catch
in `activate` leaves the unusable path in `managedConfigDir` and passes it to the
provider. `writeManagedConfig` always selects that non-empty path and returns
`undefined` after the write fails, so any configuration using `wcli0.shells`
registers no server even if `safeCwd` or the temp directory is writable. Clear or
replace `managedConfigDir` in this failure path so the documented fallback is
actually used. Source: `vscode-extension/src/extension.ts:36`.
