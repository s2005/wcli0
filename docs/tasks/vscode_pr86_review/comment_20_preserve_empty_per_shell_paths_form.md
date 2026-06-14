# P20 - Preserve explicit empty per-shell allowed paths

When a settings file contains the meaningful override
`overrides.paths.allowedPaths: []`, the form renders it as an empty textarea and
`collectShells()` omits the property. If the user then changes any other per-shell
field, `collectChanged()` saves the whole reconstructed `shells` object without
the empty override, causing that shell to inherit the global allowed paths instead
of retaining its explicitly empty path list. The form needs to distinguish an
unset array from an explicitly empty one. Source: `vscode-extension/src/webview.ts:479`.
