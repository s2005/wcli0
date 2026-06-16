# P88 - Strip config aliases inside short-option bundles

In `vscode-extension/src/argsBuilder.ts:217`, managed or referenced-config mode only strips
short-option bundles that begin with `-c`. The server's yargs declaration (`src/index.ts:73-76`)
recognizes the embedded `c` alias anywhere in a bundle, so an extra arg such as `-xc/other.json` or
`-dc /other.json` still yields two config values; `loadConfig` rejects the resulting array and falls
back to an implicit cwd/home config, bypassing the managed or referenced file. Strip `c` wherever
yargs can parse it in a short-option bundle.
