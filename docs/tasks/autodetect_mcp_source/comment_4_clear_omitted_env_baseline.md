# P4 - Clear omitted env from the saved file baseline

When editing a file entry that already has `env`, `writeMcpJsonFromSettings` lets
the user choose `Omit environment` and writes the entry without `env`, but the
`saveToFile` path still stores the pre-write settings (including `env`) as the
loaded baseline. On the next Save, because `env` is not modeled by the form,
`overlaySettings` resurrects that old environment and rewrites/prompts for it
again, so a secret the user explicitly omitted can be reintroduced by a later
unrelated edit.

Reference: `vscode-extension/src/webview.ts` around lines 327/360 (the
`saveToFile` handler).
