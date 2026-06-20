# PRD: Named Environment Profiles for execute_command

## Objective

Add named environment profiles to the wcli0 MCP server so a single server instance can run the same CLI tool (for example `sqlplus`) under different environment variable sets — including a per-version `PATH` — selected per call via an optional `profile` parameter on `execute_command`.

## Background

Today the child process spawned for every command inherits exactly the server process environment: `envVars = { ...process.env }` (plus `WSL_ORIGINAL_PATH` for WSL) at `src/index.ts:499`/`src/index.ts:525`. There is no per-shell, per-command, or config-level environment injection anywhere — `ShellExecutableConfig` (`src/types/config.ts:166`) exposes only `command` and `args`, and neither the config loader nor the CLI flags touch environment variables.

This blocks a real workflow: testing the same SQL against different `sqlplus` versions, where each version needs its own `ORACLE_HOME`, `TNS_ADMIN`, and a `PATH` that points at that version's `bin`. The current workarounds are: (a) running one MCP server instance per version with a hardcoded `PATH` in the `.mcp.json` `env` block (cannot reference the existing `PATH`, so the full value must be hardcoded; N versions means N tool namespaces), or (b) inline POSIX env-prefix in the command string (bash-family only; `cmd`/`powershell` need the `&&`/`;` operators that are blocked by default per `src/utils/config.ts:55`).

Named profiles let one server expose several operator-defined environments and switch between them per call, keeping a single tool namespace and allowing `PATH` to be prepended via `${VAR}` interpolation.

## Requirements

### REQ-1: Profile configuration schema

A new optional top-level `profiles` map is accepted in `ServerConfig`. Each entry is an `EnvProfileConfig` with: optional `description` (string), optional `allowedShells` (array of `ShellType`), and required `env` (a `Record<string, string>`). Absence of `profiles` is valid and preserves current behavior.

Assertion: a config containing a valid `profiles` map loads without error; a config with no `profiles` key resolves to an empty profile set.

### REQ-2: Profile validation at load time

The config loader validates `profiles`: each profile must have a non-empty `env` object; every entry in `allowedShells` must be a known `ShellType` (`cmd`, `powershell`, `gitbash`, `wsl`, `bash`); `env` keys and values must be strings. Invalid profiles cause a clear load-time error naming the offending profile.

Assertion: a profile with an unknown shell in `allowedShells` or a non-string env value is rejected with a descriptive error message.

### REQ-3: `profile` parameter on execute_command

The `execute_command` input schema gains an optional `profile` string parameter. When omitted or empty, behavior is identical to today. When provided, it must name a configured profile.

Assertion: calling `execute_command` without `profile` yields the same spawned environment as before this feature; calling with a configured `profile` name succeeds.

### REQ-4: Environment merge and interpolation at spawn

When a valid profile is selected, the spawned environment is `{ ...process.env, ...interpolatedProfileEnv }`, applied before any shell-specific additions (for example `WSL_ORIGINAL_PATH`). Each profile env value supports `${VAR}` interpolation resolved against `process.env`; an undefined referenced variable resolves to an empty string and is debug-logged.

Assertion: a profile with `"PATH": "C:/oracle/19/bin;${PATH}"` produces a child `PATH` beginning with `C:/oracle/19/bin;` followed by the server's `PATH`.

### REQ-5: Profile selection errors

An unknown profile name returns an `McpError` with code `InvalidParams` listing the valid profile names. A profile whose `allowedShells` excludes the requested shell returns an `McpError` with code `InvalidParams` explaining the restriction.

Assertion: `profile: "does_not_exist"` returns an InvalidParams error naming the valid profiles; using a `cmd`-only profile with `shell: "gitbash"` returns an InvalidParams error.

### REQ-6: Profile discoverability in tool description

The `execute_command` tool description lists available profiles (name and, when present, description) so an MCP client can select one. When no profiles are configured, the description is unchanged.

Assertion: with two configured profiles, the rendered tool description text contains both profile names.

## Non-Requirements

- No CLI flag for defining profiles in this task; profiles are config-file only. (A `--profile` flag may be a later task.)
- No cross-profile interpolation: `${VAR}` resolves only against `process.env`, never against another profile's keys.
- No per-profile working-directory, timeout, blocked-command, or other non-environment overrides — `env` only.
- No secret management, encryption, or `.env` file loading.
- No change to `get_command_output`, `validate_directories`, or other tools.

## Acceptance Criteria

1. A config with `profiles` loads; a config without `profiles` behaves exactly as before.
2. Invalid profiles (bad `allowedShells`, non-string env, empty `env`) are rejected at load with a descriptive error.
3. `execute_command` accepts an optional `profile`; omission is fully backward compatible.
4. A selected profile merges `{ ...process.env, ...interpolatedEnv }` into the child, with `${VAR}` resolved against `process.env`.
5. `PATH` prepend via `${PATH}` works and is verified by an integration test reading the child environment.
6. Unknown profile and disallowed-shell selections return `InvalidParams` errors with helpful messages.
7. The tool description lists configured profiles.
8. New and existing unit and integration tests pass; `npm run lint` (tsc `--noEmit`) is clean.
9. README and configuration docs describe the `profiles` config and the `profile` parameter.

## Deliverables

| Deliverable | Type |
| ----------- | ---- |
| src/types/config.ts | Update |
| src/utils/config.ts | Update |
| src/utils/envProfiles.ts | Create |
| src/index.ts | Update |
| src/utils/toolSchemas.ts | Update |
| src/utils/toolDescription.ts | Update |
| tests/envProfiles.test.ts | Create |
| tests/integration/endToEnd.test.ts | Update |
| config.examples/profiles.json | Create |
| README.md | Update |
| docs/CONFIGURATION_EXAMPLES.md | Update |
| docs/defaults.md | Update |
