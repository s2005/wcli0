# P47 - Recognize yargs kebab-case option aliases

The server uses yargs camel-case expansion, so a hand-written entry with
`--max-command-length 1000` populates `args.maxCommandLength` and is applied by the
server, but the reverse `VALUE_OPTIONS` table only recognizes `--maxCommandLength`.
Loading such an entry hides the existing value in `extraArgs`; if the user then sets
Max command length in the form, the save emits both spellings and yargs parses the
scalar as an array, causing the server to ignore the override. Add the kebab-case
aliases for the camelCase options (and boolean flags) the form models.
Reference: `vscode-extension/src/configSource.ts:124-160`
(`VALUE_OPTIONS` and `BOOLEAN_FLAGS`).
