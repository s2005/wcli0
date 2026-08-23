# P79 - Stop conflict scanning at the option separator

In `vscode-extension/src/configSource.ts:582` (`parseServerArgs`), the `--yolo` / `--unsafe` presence
scans run over the whole `args` array, so an entry such as `args: ["--unsafe", "--", "--yolo"]` is
flagged as a safety conflict even though yargs treats the token after the `--` separator as a
positional and runs the server in unsafe mode; the parser consequently preserves the safety tokens
verbatim and leaves `safetyMode` at `safe`, so the form misreports the active protection level and
selecting another safety mode from that form can introduce a real `--yolo`/`--unsafe` conflict the
server rejects. Both presence scans must be limited to the tokens before the first `--`.
