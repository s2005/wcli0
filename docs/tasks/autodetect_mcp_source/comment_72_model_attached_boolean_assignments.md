# P72 - Model attached boolean assignments before saving

In `vscode-extension/src/configSource.ts:591` (`parseServerArgs`), the attached-form branch
treats a yargs boolean assignment such as `--debug=true` or `--enableTruncation=false` (both
declared `type:'boolean'` in `src/index.ts`) as an unknown extra arg instead of modeling it.
The form then shows the option's default value, and if the user changes that same setting the
builder emits its own flag while the preserved `--debug=false` / `--enableTruncation=false`
remains later in argv; yargs last-wins lets the stale attached value override the edit, so the
setting cannot be changed from the form. The parser must model attached boolean assignments
(`--debug=true/false`, the tri-states, `--allowAllDirs`, and the safety flags) the same way it
models their bare spellings.
