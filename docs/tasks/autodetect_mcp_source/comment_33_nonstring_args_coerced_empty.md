# P33 - Non-string `args` elements are silently coerced to empty string

`parseMcpEntry` normalizes each arg with `asString`, which returns `''` for any
non-string: `entry.args.map((a) => asString(a))`. So an entry with a numeric arg
such as `args: ["--inspect", 9229]` becomes `["--inspect", ""]`, and the next
save writes `"--inspect", ""` — the `9229` is corrupted to an empty string.
This is inconsistent with how `env` is handled: P9 fixed the file-source save to
round-trip the raw on-disk `env` verbatim (including numbers/null), but `args`
are always rebuilt from the coerced settings. Node's own `child_process.spawn`
stringifies numbers via `String()`, so `asString` returning `''` is strictly
more lossy than what the server would do with the original value.
Reference: `vscode-extension/src/configSource.ts:383` (and `asString` at
`:304-306`).
