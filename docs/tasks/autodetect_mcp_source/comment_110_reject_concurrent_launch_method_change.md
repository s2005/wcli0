# P110 - Reject incompatible concurrent launch-method changes

In `vscode-extension/src/webview.ts:439`, when another editor changes the entry's launch method while
the panel is open, the overlay can silently discard a method-specific edit from the form: if the panel
loaded an npx entry and the user edits only `launch.packageSpec`, but the file concurrently changes to
a node entry, `currentFileParsed.settings` supplies `launchMethod: 'node'` while the submitted package
value is overlaid onto it; the writer then emits the node launch unchanged, reports success, and the
user's package edit disappears on reparse. The existing transport-mode conflict guard handles the
analogous incompatibility, so the save should likewise reject a changed launch method when the
submitted fields belong to the previously loaded method.
