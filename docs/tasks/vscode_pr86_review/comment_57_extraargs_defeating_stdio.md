# P57 - Prevent extraArgs from defeating forced stdio

When `wcli0.configFile` selects HTTP/SSE but the provider setting selects stdio, the
generated arguments correctly add `--transport stdio`; however, an `extraArgs` entry
containing another `--transport` is appended afterward. Yargs parses repeated string
options as an array, while `applyCliTransport` in `src/utils/config.ts` only matches
scalar strings, so it applies neither value and leaves the referenced config's
HTTP/SSE mode active. The provider then registers a stdio server whose process only
opens a network listener and never speaks over stdio.

File: `vscode-extension/src/argsBuilder.ts:295`
