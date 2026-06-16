# P48 - Preserve explicit empty workspace string overrides

For optional string settings such as `configFile`, `initialDir`, `logDirectory`,
and `launch.cwd`, an empty workspace value is meaningful because it can disable a
non-empty User-scope default. `applySettings` always normalizes an empty value to
undefined, removing the workspace setting instead, so clearing a workspace config
file unexpectedly re-enables the user's global config file. The form must
distinguish an explicit empty override from selecting Inherit. Reported on
`vscode-extension/src/webview.ts:174`.
