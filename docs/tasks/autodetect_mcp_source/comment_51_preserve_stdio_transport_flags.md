# P51 - Preserve stdio transport flags on file saves

For a stdio file source whose `args` include a hand-written `--transport http` (or
`--transport=sse`), `parseMcpEntry` now keeps that token in `extraArgs`, but the save
path feeds it through `buildLaunchSpec`; `buildServerArgs` always strips `--transport`
from stdio `extraArgs`. A no-op Save to file therefore rewrites the entry and drops
that authored flag, leaving any companion `--http-*` arguments orphaned instead of
round-tripping the file verbatim.
Reference: `vscode-extension/src/commands.ts:618` (`buildLaunchSpec` call) and
`vscode-extension/src/argsBuilder.ts:420` (`stripExtraTransport`).
