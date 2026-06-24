# P68 - Honor explicit false values for boolean flags

In `vscode-extension/src/configSource.ts:474` (`parseServerArgs`), a loaded entry that uses
a yargs-accepted explicit boolean value such as `--debug false` is mis-modeled: the parser
records `debug=true` and leaves the `false` token as an extra arg. yargs declares
`allowAllDirs`/`debug`/`yolo`/`unsafe`/`enableTruncation`/`enableLogResources` as
`type:'boolean'` (`src/index.ts`), and a boolean option consumes a following bare
`true`/`false` token as its value (verified: `--debug false` parses to `debug=false`). The
form therefore shows the opposite of what the server will run, and the preserved extra value
can defeat a later edit. The parser must consume and model these explicit boolean values
instead of treating every bare flag as true.
