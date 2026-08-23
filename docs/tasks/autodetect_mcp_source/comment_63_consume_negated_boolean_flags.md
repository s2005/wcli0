# P63 - Consume negated boolean flags before preserving extras

In `vscode-extension/src/configSource.ts` (around line 446), `parseServerArgs`
does not recognize the yargs negations of the server's boolean options
(`--no-debug`, `--no-allowAllDirs`, `--no-yolo`, `--no-unsafe`), so they fall
through to `extraArgs`. When the user then enables the same option in the form,
`buildServerArgs` emits the positive flag before the preserved negation, and
yargs applies the later negation (`--debug --no-debug` parses as `debug: false`),
silently ignoring the user's edit. The negated forms must be consumed/modeled.
