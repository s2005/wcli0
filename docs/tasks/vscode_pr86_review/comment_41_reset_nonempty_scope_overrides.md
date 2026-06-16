# P41 - Provide a way to remove non-empty scope overrides

The scoped configuration form clears settings only when the submitted value is an empty string, null, or empty object. Enum and boolean controls always submit concrete values, so after a Workspace override such as `launch.method`, `safetyMode`, or `debug` is set, the form cannot remove it and restore inheritance from User scope; selecting the apparent default merely persists another Workspace override. Add an explicit inherit/reset state instead of treating every selected enum or boolean as a permanent scoped value.

Reference: `vscode-extension/src/webview.ts:163` — <https://github.com/s2005/wcli0/pull/86#discussion_r3410248396>
