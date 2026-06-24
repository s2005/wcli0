# P59 - Don't refuse file-source saves over an out-of-range CLI log limit (maxReturnLines)

A hand-authored stdio entry with `--maxReturnLines 50000` (server-valid) makes every "Save to
file" fail, and the value cannot be fixed from the form because `maxReturnLines` has no control.

`parseServerArgs` models `--maxReturnLines 50000` into the typed `maxReturnLines` field as
`50000` (a finite number, so P34's "unparseable -> extraArgs" route does NOT apply). On save,
`writeMcpJsonFromSettings` runs `validateLaunchSpec(validateSettings, false, false, cfgLoadable)`,
and `validateLaunchSpec` pushes a blocking problem because `isValidLogLimit(50000)` is false:
`wcli0.maxReturnLines (50000) must be an integer between 1 and 10000; the server rejects other
values at startup.` The save is refused. `maxReturnLines` is not in `FIELD_KEYS`/`FIELD_TO_PROP`
and has no form input, so `overlaySettings` keeps the loaded value on any unrelated edit and the
user cannot correct it — the entry is permanently unsavable from the panel. The same gate blocks
`--maxReturnLines 0` (which the server simply ignores).

The "rejects at startup" claim is false for the CLI/mcp.json path. The server validates logging
ranges only inside `loadConfig` -> `validateLoggingConfig`, which runs on the file/default config
BEFORE `applyCliLogging` applies the CLI override, and `applyCliLogging` applies any
`maxReturnLines > 0` with no upper-bound/integer check and no re-validation. So
`--maxReturnLines 50000` runs (the server uses 50000) and `--maxReturnLines 0` is ignored
(default 500) — both are server-valid. The 1..10000-integer bound is the config-file
(`managed`) bound; `validateLaunchSpec` applies it unconditionally for `maxReturnLines` /
`maxOutputLines`, ignoring `managed`, even on the non-managed file-source path
(`commands.ts:550` passes `managed = false`).
File: `vscode-extension/src/argsBuilder.ts:1021-1026` (`maxReturnLines`; `1015-1019`
`maxOutputLines`), triggered from `vscode-extension/src/commands.ts:550-556`.
