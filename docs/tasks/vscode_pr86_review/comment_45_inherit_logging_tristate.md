# P45 - Add an Inherit option for logging tri-state settings

Unlike the other scope-editable enums, the `enableTruncation` and
`enableLogResources` selects have no Inherit option. If a workspace currently
overrides one of them, choosing `default` persists the literal `"default"` value
instead of clearing the workspace override, so a non-default User-scope value
stays masked and cannot be restored from this form. Reported on
`vscode-extension/src/webview.ts:424`.
