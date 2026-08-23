# P95 - Use the same snapshot for overlaying and writing file edits

In `vscode-extension/src/webview.ts:418` (the `saveToFile` handler), one current entry is read and
parsed for unchanged modeled fields, but `writeMcpJsonFromSettings` immediately reads the file again
at `commands.ts:518` and uses that second snapshot as the merge base; if another editor changes a
modeled argument between those reads -- for example `--shell cmd` to `--shell bash` while this form
changes only Debug -- the settings passed to the writer still contain `cmd`, so rebuilding `args` onto
the newer snapshot silently overwrites `bash`. The first full snapshot must be passed into the
writer, or the save must be rejected if the entry changes before writing.
