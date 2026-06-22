# P24 - Parse custom suffixes with valued extraArgs

For custom stdio entries whose wcli0 flag suffix ends with an unrecognized extra
argument that has a separate value, e.g. `['wcli0', '--shell', 'cmd', '--futureFlag', 'x']`,
the `return false` for the bare `x` token rejects the whole suffix. `serverFlagSuffixStart`
then treats the modeled flags (`--shell cmd`) as launcher arguments instead of parsing
them, so the form loads default values and a later edit can save stale launcher flags
plus newly generated flags rather than preserving `extraArgs` as intended.
Reference: vscode-extension/src/configSource.ts:158.
