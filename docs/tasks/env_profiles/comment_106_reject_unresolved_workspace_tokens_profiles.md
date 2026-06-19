# P106 - Reject unresolved workspace tokens in profiles

When a profile env value contains `${workspaceFolder}` or `${workspaceFolder:name}`
but no matching workspace is open, `resolveVariables` deliberately leaves that
extension-owned token unresolved, yet `buildProfiles` still writes it into the
managed config. The server then interpolates every `${VAR}` against `process.env`
and substitutes undefined refs with an empty string, so a value like
`${workspaceFolder}/bin;${PATH}` becomes `/bin;...` instead of being rejected or
dropped, silently changing the command environment. Detect unresolved
extension-owned tokens before emitting profile env values.

File: `vscode-extension/src/configFile.ts` (line 355)
