# P32 - Preserve empty positional executable arguments in the form

The per-shell executable-arguments parser in the webview trims every line and removes empty lines
(vscode-extension/src/webview.ts:448), so an args list containing an empty positional argument such
as `['--flag', '']` becomes `['--flag']` whenever the user saves any per-shell form change and the
entire `shells` object is reconstructed. The server passes `executable.args` verbatim to `spawn`, so
dropping the empty argument can change or break the custom executable invocation. Executable
arguments need lossless round-tripping rather than the empty-filtering used for path/restriction
lists.
