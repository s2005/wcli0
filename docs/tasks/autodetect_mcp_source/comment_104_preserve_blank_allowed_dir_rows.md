# P104 - Preserve blank allowed-directory rows in the webview

In `vscode-extension/src/webview.ts:1483` (`collect()` in the browser-side script), the client
normalizes a loaded `allowedDirectories: ['']` to `[]`: the textarea renders the single empty value
as blank and `filter(Boolean)` removes it during `collectChanged()`. The review states that the form
is consequently immediately dirty, so saving any unrelated edit submits the empty array and removes
`--allowedDir ""`, after which the server falls back from an effectively empty allowlist to its
configured/default allowed paths, widening command access, and asks for a lossless representation of
authored empty entries in the file-source collector.

This finding arrived in the review BODY rather than as a review thread, so it has no thread to
resolve.
