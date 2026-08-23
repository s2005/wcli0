# P109 - Preserve valueless array flags before later positionals

In `vscode-extension/src/configSource.ts:943`, the same guard separates valueless ARRAY flags from
later positional tokens: `node dist/index.js --allowedDir --debug C:\work` initially gives yargs an
empty `allowedDir` array and leaves `C:\work` positional (`allowedDir` is declared as an array at
`src/index.ts`), but a no-op save emits `--debug --allowedDir C:\work`; yargs then consumes the path
as an allowed directory, and `applyCliShellAndAllowedDirs` enables working-directory restriction and
disables injection protection. The original sequence must be preserved or rejected instead of moving
the valueless array flag next to a positional.
