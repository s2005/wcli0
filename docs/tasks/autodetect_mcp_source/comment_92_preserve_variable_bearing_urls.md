# P92 - Preserve variable-bearing network URLs

In `vscode-extension/src/configSource.ts:1119` (`parseHttpUrl`), a valid mcp.json URL using VS Code
substitution inside its authority, such as `http://${input:host}:8080/mcp` or
`http://host:${input:port}/mcp`, has the colon inside `${input:...}` treated as the host/port
delimiter and is reported as having a malformed port; the form then holds a truncated host and the
default port while `preservedFileUrl` refuses to retain the original URL, so a no-op Save can rewrite
the first example as `http://${input:9444/mcp`, destroying the launch-time variable and the endpoint.
These supported VS Code variable tokens must be detected and the URL preserved verbatim when its host
or port cannot be resolved until launch.
