# Progress: Named Environment Profiles for execute_command

## Status Legend

| Marker | Meaning |
| ------ | ------- |
| `[ ]`  | Not started |
| `[x]`  | Complete |
| `[~]`  | In progress |
| `[!]`  | Blocked or needs decision |
| `[-]`  | Skipped / not applicable |

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

- [ ] Default `profiles` to `{}` when absent in src/utils/config.ts
- [ ] Validate `env` is non-empty string-to-string map
- [ ] Validate `allowedShells` entries are valid ShellType
- [ ] Add config validation test cases
- [ ] Verify unit tests pass

## Phase 3: Runtime wiring

- [ ] Add `profile?` parameter to `executeShellCommand`
- [ ] Pass `args.profile` at the handler call site (src/index.ts:1103)
- [ ] Merge `resolveProfileEnv(...)` into `envVars`
- [ ] Convert `ProfileSelectionError` to `McpError(InvalidParams)`
- [ ] Add integration tests (env value, PATH prepend, unknown profile, no-profile baseline)
- [ ] Verify integration tests pass

## Phase 4: Schema and description

- [ ] Add optional `profile` to `buildExecuteCommandSchema`
- [ ] List configured profiles in tool description
- [ ] Add schema/description unit tests
- [ ] Verify unit tests pass

## Phase 5: Docs and examples

- [ ] Create config.examples/profiles.json
- [ ] Update README.md
- [ ] Update docs/CONFIGURATION_EXAMPLES.md
- [ ] Update docs/defaults.md
- [ ] Verify markdown lint and `npm run lint` clean

## Review Feedback

(Section appears when PR review feedback arrives. Each comment gets a checkbox.)
