# P55 - Preserve whitespace in per-shell executable arguments

Per-shell executable arguments are passed directly to `spawn`, so leading/trailing
whitespace and whitespace-only positional arguments can be meaningful. The `argLines`
trim transforms those arguments while establishing the form baseline; after the user
changes any other per-shell field, saving rewrites the whole `shells` object with the
altered arguments and can change or break the configured executable invocation.

File: `vscode-extension/src/webview.ts:535`
