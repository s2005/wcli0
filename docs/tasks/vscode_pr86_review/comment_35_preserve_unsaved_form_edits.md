# P35 - Preserve unsaved form edits on external configuration changes

If any `wcli0` setting changes externally while the user has unsaved edits in the configuration form,
the `onDidChangeConfiguration` handler immediately posts a new `init` message
(vscode-extension/src/webview.ts:128) and the webview's `setVal` replaces every field and re-baselines
`initial`, silently discarding those edits. This can happen when settings.json is saved, another
extension updates a setting, or the other wcli0 configuration view saves. Defer reloading while the
form is dirty rather than overwriting unsaved contents.
