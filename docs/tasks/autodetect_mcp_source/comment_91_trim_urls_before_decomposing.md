# P91 - Trim URLs consistently before decomposing them

In `vscode-extension/src/configSource.ts:926` (`parseMcpEntry`), a network entry whose URL has leading
whitespace, such as `" http://gateway.example:8443/mcp"`, fails to parse and leaves the form showing
the default host and port, while the save path's `preservedFileUrl` trims the same raw URL before
parsing it, sees `gateway.example:8443`, and declines preservation because that differs from the
displayed defaults -- so an otherwise no-op Save rewrites the endpoint to `http://127.0.0.1:9444/mcp`.
The same trimmed value must be parsed here, or both paths must preserve the original URL using the
same decomposition rules.
