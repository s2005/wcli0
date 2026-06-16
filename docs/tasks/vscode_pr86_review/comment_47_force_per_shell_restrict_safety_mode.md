# P47 - Force per-shell directory restrictions to match safety mode

When managed mode combines `safetyMode: "yolo"` with a per-shell
`restrictWorkingDirectory: false`, the cleanup forces injection protection and
blocklists off but leaves the per-shell directory override unchanged. The server
resolves that shell override over the global `restrictWorkingDirectory: true`, so
yolo mode silently allows commands in any directory; likewise an explicit
per-shell `true` survives unsafe mode. Force the per-shell value to `true` for
yolo and `false` for unsafe. Reported on
`vscode-extension/src/configFile.ts:410`.
