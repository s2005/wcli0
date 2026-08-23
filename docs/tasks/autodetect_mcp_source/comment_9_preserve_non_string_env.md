# P9 - Preserve non-string env values on file saves

VS Code MCP entries allow `env` values such as numbers or `null`, but `asStringMap`
drops every non-string value before the loaded file baseline is stored. If an existing
stdio entry has `env: { PORT: 3000 }`, an unrelated Save to file rewrites the entry
without `PORT` and shows no environment prompt because the baseline now appears empty.
The save path should preserve the raw env values rather than filtering them out.
File: `vscode-extension/src/configSource.ts:287`.
