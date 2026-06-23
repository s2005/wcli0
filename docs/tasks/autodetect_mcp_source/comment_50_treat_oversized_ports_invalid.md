# P50 - Treat oversized URL ports as invalid

For a file entry such as `url: "http://localhost:70000/mcp"`, the parser treats the
explicit port as fully modeled because it is `> 0`, so the webview loads `70000` into
an `<input max="65535">`. From there any unrelated save is blocked by client-side
number validation until the user notices and edits the port; the recovery behavior
only handles `:0`. Treat ports outside `1..65535` like the unusable-port case so
loading a malformed URL does not strand the form in an invalid state.
Reference: `vscode-extension/src/configSource.ts:536` (`parseMcpEntry` http/sse branch).
