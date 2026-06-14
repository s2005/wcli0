# P28 - Validate logDirectory before emitting generated configs

In `buildConfigFile` (vscode-extension/src/configFile.ts:325) a Windows-invalid log directory such
as `C:\logs\a?b` resolves successfully and is written verbatim, but the server's
`validateLoggingConfig` rejects Windows-invalid characters (and `..` traversal) and exits at startup.
The provider launch path catches this through `validateLaunchSpec`, but the Generate Config File
command calls `buildConfigFile` directly and can therefore produce an unusable config. Apply the same
server-validity check before emitting `logDirectory`.
