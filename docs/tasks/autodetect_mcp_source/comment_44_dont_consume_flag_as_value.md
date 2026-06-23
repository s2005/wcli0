# P44 - Do not consume another flag as a missing option value

For a loaded hand-written entry where a value option is missing its value and is
followed by another flag, the space-separated parse path consumes that flag as the
value. For example, yargs parses `--blockedCommand --debug` as `blockedCommand=[]`
with `debug=true`, but this code models `blockedCommands=["--debug"]` and drops
`debug`; a no-op save then rewrites it as `--blockedCommand=--debug`, changing the
server behavior. The space-separated value path should preserve the option when the
next token is another flag, like `argsBuilder.stripConfigArgs` already does.
Reference: `vscode-extension/src/configSource.ts:389-401`
(`parseServerArgs`, the space-separated value branch).
