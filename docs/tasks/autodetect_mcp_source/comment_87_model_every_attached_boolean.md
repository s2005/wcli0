# P87 - Model every attached boolean assignment

In `vscode-extension/src/configSource.ts:770` (the attached `--opt=value` path in
`parseServerArgs`), a loaded stdio entry using another yargs-valid attached value such as `--debug=0`
or `--enableTruncation=0` has its token preserved in `extraArgs` instead of being modeled; the
installed yargs parser's `processValue` maps every string other than exactly `"true"` to `false`
(`node_modules/yargs-parser/build/lib/yargs-parser.js:566-570`), so enabling the field later emits
`--debug` before the preserved `--debug=0` and the later false value still defeats the edit. These
assignments must be modeled according to yargs semantics, or the preserved assignment must be
stripped when that boolean is emitted.
