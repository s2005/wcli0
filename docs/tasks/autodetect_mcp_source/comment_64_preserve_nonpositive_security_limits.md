# P64 - Preserve ignored security-limit values instead of blocking saves

In `vscode-extension/src/configSource.ts` (around line 435), the `divertNumber`
helper returns false for finite `--commandTimeout`/`--maxCommandLength` values,
so a loaded `--commandTimeout 0` or `--maxCommandLength=-1` is modeled into the
typed field. The webview/host validation then rejects every save (a negative
fails the number input, zero fails `validateLaunchSpec`), even though the server
simply ignores those non-positive CLI overrides and keeps running. These values
should be diverted to `extraArgs` like the other unrepresentable numerics so an
unrelated edit can round-trip the existing entry.
