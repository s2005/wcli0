# P12 - Treat explicit empty per-shell arrays as configured

When the only per-shell setting is an explicit empty array such as
`blockedOperators: []` or `allowedPaths: []`, the `length` checks in
`isMeaningfulShellConfig` classify `wcli0.shells` as meaningless, so the provider
stays on the normal CLI launch path and ignores the override entirely. Empty
arrays are meaningful - the server uses them to clear operators or replace
inherited allowed paths - so this can leave command operators enabled or
directories allowed contrary to the configured per-shell restriction. Source:
`vscode-extension/src/settings.ts:213`.
