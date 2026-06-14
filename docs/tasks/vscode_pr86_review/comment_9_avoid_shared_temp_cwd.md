# P9 - Avoid using the shared temp directory as the server cwd

When private storage creation fails or no private cwd is injected, the provider
fallback launches from `os.tmpdir()`, even though `loadConfig` reads `config.json`
from the process cwd. On a multi-user system another user can plant
`/tmp/config.json` before launch and make wcli0 load attacker-controlled safety
settings or shell executables. Use a uniquely created private temporary directory
(e.g. `fs.mkdtempSync`) rather than the shared temp root. Source:
`vscode-extension/src/mcpProvider.ts:152`.
