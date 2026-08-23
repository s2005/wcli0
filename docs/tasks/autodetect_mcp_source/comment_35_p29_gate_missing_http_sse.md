# P35 - The P29 refusal is nested inside the stdio branch, so http/sse file sources silently drop shells/profiles

`writeMcpJsonFromSettings` gates the P29 refusal
(`fileSource && (hasPerShellConfig(settings) || hasProfilesConfig(settings))`)
inside the `if (settings.transportMode === 'stdio')` block, alongside the
second guard and the sync warning. The http/sse `else` branch only validates the
port and never checks for per-shell/profile config. So when a file source is set
to http or sse and the user configures per-shell settings or environment
profiles in the form, the save is not refused: it writes an entry containing
only `{ type, url }` (plus preserved `headers`/`oauth`), the shells/profiles the
user added have nowhere to live (an http/sse entry carries no `--config` and no
shells/profiles), and the function returns success while silently dropping them.
Profiles are not academic here — the server still honors a selected profile's
`env` over http/sse transport — yet nothing in the entry can carry them. The
refusal (or a transport-aware variant) should cover every file-source save, not
only stdio.
Reference: `vscode-extension/src/commands.ts:365,389,464`.
