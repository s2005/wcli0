# P70 - Preserve mutually exclusive safety flags

In `vscode-extension/src/configSource.ts:482` (`parseServerArgs`), a hand-authored stdio
entry that contains both `--yolo` and `--unsafe` is rejected by the server, which declares
those options conflicting (`.conflicts('unsafe','yolo')` in `src/index.ts`). The reverse
parser, however, collapses the pair to whichever flag appears last and drops the other, so a
no-op or unrelated save turns a previously failing entry into a valid unsafe/yolo launch the
user never chose. When both positive flags are present the parser must preserve (or refuse)
the conflicting state — round-tripping both flags verbatim — instead of silently normalizing
it to a single working safety mode.
