# integration/shellExecution

- **should reject commands with blocked operators** – executing a command containing `;` results in an `McpError`.
- **should enforce working directory restrictions** – commands fail when executed from disallowed directories.
- **should execute when working directory allowed** – succeeds when the directory is permitted by the configuration.
