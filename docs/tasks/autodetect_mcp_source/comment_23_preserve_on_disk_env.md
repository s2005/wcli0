# P23 - Preserve current on-disk env on file saves

When a file source is open and another process adds or changes `servers.wcli0.env`
before the user saves, the save still takes `env` from the stale `baseEntry` loaded
when the panel opened. The later current-on-disk merge treats `env` as a form-owned
stdio key and deletes the on-disk value before applying the stale/empty one, so newly
added environment variables are silently dropped without even showing the environment
warning. Reference: vscode-extension/src/commands.ts:488.
