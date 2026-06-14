# Analysis 28 - Validate logDirectory before emitting generated configs

## Decision: Valid — fix applied

`buildConfigFile` emitted any resolvable `logDirectory`, but the server's `validateLoggingConfig`
additionally rejects `..` traversal and (on Windows) the characters `<>"|?*` and exits at startup.
The provider path was protected by `validateLaunchSpec`, but `generateConfigFile` calls
`buildConfigFile` directly. Extracted the server's log-path validity rule into a shared
`isServerInvalidLogPath` helper in argsBuilder, reused it in `validateLaunchSpec`, and applied it in
`buildConfigFile` so an invalid log directory is dropped from the generated config.

**Why:** The generated config should never contain a value that makes the server crash on launch;
mirroring the server's own validation keeps the file usable and matches the existing path-resolution
philosophy already applied to allowed/initial directories.
