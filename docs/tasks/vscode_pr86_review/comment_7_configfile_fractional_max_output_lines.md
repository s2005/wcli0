# P7 - Preserve fractional maxOutputLines in generated configs

When `maxOutputLines` is a valid fractional value such as `1.5`, the round-1 fix
made `validateLaunchSpec` and the CLI-arg path accept it, but `buildConfigFile`
still applies the integer-only `posInt` check and silently omits it. Generated
config files then use the server default, and in per-shell managed mode the
provider launches with the wrong value because the generated config is the only
place the setting can be carried. Source: `vscode-extension/src/configFile.ts:279`.
