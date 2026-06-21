# P21 - Parse URL userinfo before extracting host and port

For HTTP/SSE URLs with credentials, such as `https://user:pass@example.com:9444/mcp`, the
regex treated `user` as the host and missed the explicit port because it did not skip the
`userinfo@` portion. The file-source form then displayed the wrong host/default port, a
port-only edit was ignored while preserving the old URL, and a host edit rewrote the URL
without the credentials. Skip the userinfo before deriving the editable host and port.
File: `vscode-extension/src/configSource.ts:412`.
