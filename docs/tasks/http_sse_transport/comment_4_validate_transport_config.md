# P4 - Validate transport config before use

When `transport` comes from a JSON config file, the raw values overwrite the
defaults in `mergeConfigs()` (`src/utils/config.ts:490`) but `validateConfig()`
never checks the new section. A typo such as `{ "mode": "sse", "ssePort": "3000" }`
leaves `ssePort` as a string, which Node treats as a Unix/named-pipe path instead
of a TCP port, while `run()` still logs `http://host:3000`, so configured SSE
clients cannot connect. Validate `mode`, `sseHost`, and the numeric port range
during config loading, not only for CLI flags.
