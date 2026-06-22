# P17 - Preserve npx launcher options before the package

Existing mcp.json entries can use npx launcher options before the package (e.g.
`npx --package=<pkg> -- <cmd>`). The parser only skipped a literal `-y`, so loading
`npx --package=wcli0 -- wcli0 --shell cmd` treated `--package=wcli0` as the package spec
and moved the rest into server/extra args; a Save rewrote a valid launcher command into a
different argument order that may not run wcli0. Preserve leading npx options or fall back
to custom parsing instead of assuming arg 0 is the package.
File: `vscode-extension/src/configSource.ts:364`.
