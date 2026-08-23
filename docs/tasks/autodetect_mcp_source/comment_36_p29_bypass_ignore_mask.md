# P36 - The ignore-inherited masks bypass the P29 refusal and silently drop shells/profiles on a file save

On a file source the "Inherited per-shell config" / "Inherited profiles"
selects stay editable: `applyScopeAvailability` disables them only for User
scope, and `setActiveSource` never touches them, so at Workspace scope (the
retained scope while the radio is hidden) the user can set either to Ignore. The
P29 refusal calls `hasPerShellConfig(settings)` / `hasProfilesConfig(settings)`,
both of which short-circuit to `false` when the corresponding mask is set. So a
file-source save that adds per-shell settings or profiles AND enables the mask
passes the gate: the entry is written without shells/profiles (an mcp.json
`servers.wcli0` entry cannot carry them), the edits are silently dropped, and
the save reports success ("saved to .vscode/mcp.json"). Setting either mask
alone is also silently dropped — the entry format has no field for it and
`parseMcpEntry` never reads it back. The masks are a scope-merge affordance
with no meaning for a scope-less file source, so the form should not let them
affect (or bypass) a file save.
Reference: `vscode-extension/src/commands.ts:389` (via
`vscode-extension/src/settings.ts:328,393`) and
`vscode-extension/src/webview.ts:1806-1823,1898-1944`.
