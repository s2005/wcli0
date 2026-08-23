# P76 - Count attached boolean flags as modeled suffixes

In `vscode-extension/src/configSource.ts:229` (`isRecognizedServerFlag`), for custom wrapper
entries `requireModeled` only treats attached `--opt=value` tokens as modeled when the flag is in
`VALUE_OPTIONS`, so boolean forms like `wrapper target --debug=true` or `--enableTruncation=false`
stay in `customArgs` instead of being parsed. The form then shows the default value and saving an
attempted change leaves the original attached boolean in the launcher args, so the user cannot
reliably disable or edit that flag from the loaded file source. The suffix detector must recognize
attached boolean assignments (literal `=true`/`=false`) just like their bare spellings.
