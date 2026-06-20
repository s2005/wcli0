# Analysis: Named Environment Profiles for execute_command

## Goal

Let one wcli0 server instance run a CLI tool under several operator-defined environment variable sets (each with its own `PATH`), chosen per call through an optional `profile` parameter on `execute_command`.

## Current Behavior

- Every command is spawned by `CLIServer.executeShellCommand` (`src/index.ts:477`). It builds the child environment as `let envVars = { ...process.env };` (`src/index.ts:499`) and passes it to `spawn(..., { cwd, stdio, env: envVars })` (`src/index.ts:525`).
- The only environment mutation is WSL-specific: `envVars.WSL_ORIGINAL_PATH = workingDir` (`src/index.ts:519`).
- `ShellExecutableConfig` carries only `command` and `args` (`src/types/config.ts:166`). `ServerConfig` (`src/types/config.ts:287`) has `global`, `shells`, and `transport` — no environment concept.
- The tool handler reads `args.shell`, `args.command`, `args.workingDir`, `args.maxOutputLines`, `args.timeout` and finally calls `this.executeShellCommand(args.shell, shellConfig, args.command, workingDir, args.maxOutputLines, args.timeout)` (`src/index.ts:1103`).
- The input schema is built by `buildExecuteCommandSchema` (`src/utils/toolSchemas.ts:13`); the description by the builder invoked at `src/index.ts:900`.
- Default `blockedOperators` is `['&', '|', ';', '` `']` (`src/utils/config.ts:55`), so inline `cmd` `&&` / `powershell` `;` env chaining is blocked by default — confirming why a structured profile is preferable to inline env in the command string.

There is no existing test exercising the child process environment, so a baseline must be established.

## Feasibility

Straightforward. The entire environment is produced at a single choke point (`envVars` in `executeShellCommand`), so the merge is a one-line change plus a resolver. The schema, description, config type, and config validator each have a clear, existing extension point. The change is purely additive and backward compatible: no `profiles` and no `profile` argument reproduce today's behavior byte-for-byte.

## Approach

Recommended: a small standalone resolver module plus additive wiring at the four existing extension points.

| Advantages | Disadvantages |
| ---------- | ------------- |
| Single merge point already exists (`envVars`) | Adds a new optional field that must be documented |
| Purely additive, fully backward compatible | Profile env is shell-format-sensitive (PATH separators), needs `allowedShells` guard |
| Resolver is pure and unit-testable in isolation | Tool must surface profiles or the client cannot discover them |

Alternative considered and rejected: a `profile` map keyed per shell inside `shells.*`. Rejected because the same logical profile (for example `ora19`) is conceptually one thing; duplicating it under each shell complicates config and discovery. A top-level `profiles` map with an optional `allowedShells` restriction captures the shell-format constraint without duplication.

Alternative considered and rejected: resolve `${VAR}` against a merged view that includes earlier profile keys. Rejected for ordering ambiguity; resolving only against `process.env` is deterministic and sufficient for the `PATH`-prepend use case.

## Implementation Notes

- New module `src/utils/envProfiles.ts` exporting:
  - `interpolateEnvValue(value: string, base: NodeJS.ProcessEnv): string` — replaces `${NAME}` with `base[NAME] ?? ''`, leaving other text intact. Only the `${NAME}` form is supported (no `$NAME`), to avoid clashing with literal shell text.
  - `resolveProfileEnv(profiles, profileName, shellType, base): Record<string,string>` — returns `{}` for an absent/empty name; throws a typed error for unknown name or disallowed shell; otherwise returns the interpolated env map.
- Wire the resolver in `executeShellCommand`: `let envVars = { ...process.env, ...resolveProfileEnv(...) };` keeping the WSL line after it. Thread a new `profile?: string` argument from the handler call at `src/index.ts:1103` into `executeShellCommand`.
- Convert the resolver's typed errors into `McpError(ErrorCode.InvalidParams, ...)` in the handler so the client sees the valid-profiles list.
- Config: add `EnvProfileConfig` interface and `profiles?: Record<string, EnvProfileConfig>` to `ServerConfig`. Validate in the config loader alongside existing validation in `src/utils/config.ts`.
- Schema: add optional `profile` string to `buildExecuteCommandSchema`, not in `required`.
- Description: append a "Available env profiles" block listing name and description when `config.profiles` is non-empty.
- Markdown deliverables must respect repo rules: disable line-length (MD013), keep unique headings (MD024), and pad table pipes (MD060).

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| `PATH` override could load an unexpected binary | Profiles are operator-defined in config only; the tool cannot pass arbitrary env. `blockedCommands` matches the command name string, not the resolved binary, so blocking still applies. |
| Windows-format `PATH` used under WSL/bash | Optional `allowedShells` restricts a profile to compatible shells; disallowed combinations error out. |
| Undefined `${VAR}` silently empties `PATH` | Resolve missing vars to empty string and emit a debug log; document the behavior. |
| Backward-compatibility regression | Add a test asserting that with no profile the child env equals `process.env` plus existing WSL handling. |
| Profile leaks secrets into logs | Do not log resolved env values at non-debug levels; document that profiles may contain sensitive values. |

## Test Strategy

- Unit (`tests/envProfiles.test.ts`): `interpolateEnvValue` for present/absent/multiple/no-placeholder values; `resolveProfileEnv` for empty name, unknown name (throws with names listed), disallowed shell (throws), happy path with interpolation and merge precedence (profile overrides `process.env`).
- Unit (config): valid profiles load; invalid `allowedShells`, non-string env, and empty env are rejected with descriptive errors; missing `profiles` yields empty set.
- Unit (schema/description): schema exposes optional `profile`; description lists configured profiles; both unchanged when no profiles configured.
- Integration (`tests/integration/endToEnd.test.ts`): run a command that prints an env var (for example `echo $ORACLE_HOME` under gitbash) with a profile set and assert the value; assert `PATH` prepend ordering; assert unknown-profile call returns an InvalidParams error.
