# Progress: Named Environment Profiles for execute_command

## Status Legend

| Marker | Meaning                   |
| ------ | ------------------------- |
| `[ ]`  | Not started               |
| `[x]`  | Complete                  |
| `[~]`  | In progress               |
| `[!]`  | Blocked or needs decision |
| `[-]`  | Skipped / not applicable  |

## Planning Checklist

- [x] Analyze current behavior.
- [x] Create analysis.md
- [x] Create PRD.md
- [x] Create implementation_plan.md
- [x] Create verification.md
- [x] Create progress.md

## Phase 1: Types and resolver

- [x] Add `EnvProfileConfig` interface to src/types/config.ts
- [x] Add `profiles?` to `ServerConfig`
- [x] Create src/utils/envProfiles.ts with `interpolateEnvValue`
- [x] Add `resolveProfileEnv` with typed `ProfileSelectionError`
- [x] Create tests/envProfiles.test.ts (interpolation and resolution)
- [x] Verify build and unit tests pass

## Phase 2: Config validation

- [x] Default `profiles` to `{}` when absent in src/utils/config.ts
- [x] Validate `env` is non-empty string-to-string map
- [x] Validate `allowedShells` entries are valid ShellType
- [x] Add config validation test cases
- [x] Verify unit tests pass

## Phase 3: Runtime wiring

- [x] Add `profile?` parameter to `executeShellCommand`
- [x] Pass `args.profile` at the handler call site (src/index.ts:1103)
- [x] Merge `resolveProfileEnv(...)` into `envVars`
- [x] Convert `ProfileSelectionError` to `McpError(InvalidParams)`
- [x] Add integration tests (env value, PATH prepend, unknown profile, no-profile baseline)
- [x] Verify integration tests pass

## Phase 4: Schema and description

- [x] Add optional `profile` to `buildExecuteCommandSchema`
- [x] List configured profiles in tool description
- [x] Add schema/description unit tests
- [x] Verify unit tests pass

## Phase 5: Docs and examples

- [x] Create config.examples/profiles.json
- [x] Update README.md
- [x] Update docs/CONFIGURATION_EXAMPLES.md
- [x] Update docs/defaults.md
- [x] Verify markdown lint and `npm run lint` clean

## Review Feedback (PR #87) - round 17

Source: Codex review round 17 on PR #87 (named environment profiles), reviewed branch commit `f6bcf57`.
Two unresolved Codex threads in `vscode-extension/src/configFile.ts` `buildProfiles`.

- [x] P106: Reject unresolved workspace tokens in profiles (fixed - new `hasUnresolvedExtensionVariables` helper detects leftover `${workspaceFolder}`/`${workspaceFolder:name}`/`${userHome}` tokens, and `buildProfiles` drops an env value that still carries one instead of emitting it; server-owned tokens like `${PATH}` are still preserved, so the server can no longer expand an unresolved `${workspaceFolder}` to an empty string)
- [x] P107: Avoid broadening invalid allowedShells to every shell (fixed - `buildProfiles` drops a profile whose `allowedShells` was provided with entries but none valid, instead of omitting the field and letting the server treat it as unrestricted across every shell)

## Review Feedback (PR #87) - round 18

Source: Codex review round 18 on PR #87, reviewed branch commit `8aca806`. Five unresolved Codex
threads spanning the extension (`configFile`/`settings`) and the server (`envProfiles`/`config`).

- [x] P108: Avoid treating dropped profiles as managed config (fixed - `isMeaningfulProfile` now mirrors every `buildProfiles` drop condition, so a profile with all-invalid `allowedShells` or only unresolvable `${workspaceFolder}` env values no longer forces a managed `--config` that omits `profiles` and overrides `wcli0.configFile`)
- [x] P109: Treat empty allowedShells as unrestricted (fixed - `resolveProfileEnv` enforces the shell restriction only when `allowedShells.length > 0`, so the documented "empty means all shells" form is usable instead of rejecting every shell)
- [!] P110: Add a way to mask inherited profiles (deferred - feature-sized mirror of `ignoreInheritedShells`; tracked as a dedicated task at `docs/tasks/ignore_inherited_profiles/`, PR thread left open with a pointer)
- [x] P111: Check only own profile names (fixed - `resolveProfileEnv` uses an own-property check before reading a profile, so an inherited `Object.prototype` name like `toString`/`constructor` throws `ProfileSelectionError`/`InvalidParams` instead of a later `TypeError`)
- [x] P112: Reject array-valued profile maps (fixed - `validateProfiles` rejects a non-object or array `profiles` value at load, so a typo like `"profiles": []` is reported at startup instead of silently starting with no profiles)
