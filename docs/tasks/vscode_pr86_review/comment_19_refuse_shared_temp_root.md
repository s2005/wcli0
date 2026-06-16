# P19 - Refuse to launch from the shared temp root

When creation of both the configured safe cwd and the private `mkdtempSync`
directory fails, the round-2 fallback restored the exact multi-user vulnerability
the private directory was meant to prevent: the provider launched with the shared
`os.tmpdir()` root as cwd, and `loadConfig` reads `config.json` from that cwd,
letting another user plant safety settings or shell executables. In this failure
case, register no server rather than using the shared temp root. Source:
`vscode-extension/src/mcpProvider.ts:67`.
