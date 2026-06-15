# Progress - VS Code extension PR #86 review

## Review Feedback (PR #86)

- [x] P1: Resolve relative paths in generated MCP entries (fixed - `pathValue` converts plain relative paths to `${workspaceFolder}` tokens when `resolvePaths` is false)
- [x] P2: Fall back when the private cwd cannot be created (fixed - `safeCwd` is set to `undefined` on mkdir failure so the provider's temp-dir fallback applies)
- [x] P2: Reject unresolved variables in custom launcher arguments (fixed - `validateLaunchSpec` now blocks unresolved `customArgs` tokens)
- [x] P2: Preserve valid fractional maxOutputLines values (fixed - `isValidMaxOutputLines` range-only check; `maxReturnLines` keeps the integer check)
- [x] P2: Refresh the provider when workspace folders change (fixed - subscribed to `onDidChangeWorkspaceFolders`)

## Review Feedback (PR #86) - round 2

- [x] P6: Preserve per-shell settings in mcp.json exports (fixed - `writeWorkspaceMcpJson` refuses when `wcli0.shells` is configured)
- [x] P7: Preserve fractional maxOutputLines in generated configs (fixed - `maxOutputLinesValue` range-only check in `buildConfigFile`)
- [x] P8: Fall back after managed storage creation fails (fixed - `managedConfigDir` cleared on mkdir failure)
- [x] P9: Avoid using the shared temp directory as the server cwd (fixed - `privateDir()` creates a unique `mkdtemp` dir)
- [x] P10: Reject unresolved per-shell paths before managed launch (fixed - managed-mode per-shell path validation)
- [x] P11: Honor empty per-shell executable argument lists (fixed - `args !== undefined` guard)
- [x] P12: Treat explicit empty per-shell arrays as configured (fixed - `isMeaningfulShellConfig` uses `!== undefined`)
- [x] P13: Clear per-shell injection overrides in yolo/unsafe modes (fixed - clears `enableInjectionProtection`)
- [x] P14: Reject invalid per-shell security limits (fixed - managed-mode per-shell limit validation)
- [x] P15: Reject relative paths when no workspace can anchor them (fixed - `resolvedPath` drops them, `isUnanchorablePath` blocks)
- [x] P16: Reject unresolved log directories (fixed - blocking `logDirectory` check)
- [x] P17: Allow literal shell variables in custom arguments (fixed - `hasUnresolvedExtensionVariable` refines the round-1 check)
- [x] P18: Reject unknown per-shell configuration keys (fixed - `propertyNames.enum` in the schema)

## Review Feedback (PR #86) - round 3

- [x] P19: Refuse to launch from the shared temp root (fixed - `privateDir()` returns undefined, provider registers no server)
- [x] P20: Preserve explicit empty per-shell allowed paths in the form (fixed - `loadedShells` + `arr()` helper)
- [x] P21: Drop relative config paths when no workspace can anchor them (fixed - `resolveConfigPath` returns undefined)
- [x] P22: Count per-shell paths before honoring allowAllDirs (fixed - `hasPerShellPaths` in `buildConfigFile`)
- [x] P23: Restore the required MIT copyright notice (fixed - restored `Copyright (c) 2024 Simon Benedict`)
- [x] P24: Validate log directories rejected by the server (fixed - mirror `..`/Windows-char rules)
- [x] P25: Default whitespace-only HTTP hosts to loopback (fixed - trim before defaulting in `clientHost`)
- [x] P26: Show the provider's fallback managed-config path (fixed - `managedConfigTargetDir()` shared with `showLaunchCommand`)

## Review Feedback (PR #86) - round 4

- [x] P27: Exclude disabled-shell paths from the allowAllDirs check (fixed - `isShellEnabled` gates `hasPerShellPaths`)
- [x] P28: Validate logDirectory before emitting generated configs (fixed - shared `isServerInvalidLogPath` applied in `buildConfigFile`)
- [x] P29: Export the scope shown by the configuration form (fixed - selected scope threaded into the export commands)
- [x] P30: Resolve relative node script paths before launch (fixed - `pathValue` anchors the node script path; validation blocks unanchorable)
- [x] P31: Isolate fallback managed configs between windows (fixed - managed config falls back to a per-window unique temp dir, never the shared safeCwd)
- [x] P32: Preserve empty positional executable arguments in the form (fixed - dedicated `argLines` helper with lossless round-trip)
- [x] P33: Correct the SSE automatic-provider documentation (fixed - README states only HTTP auto-registers)
- [x] P34: Do not show a global launch when managed storage is unavailable (fixed - `showLaunchCommand` reports no launch instead of a mismatched command)
- [x] P35: Preserve unsaved form edits on external configuration changes (fixed - external reload deferred while the form is dirty)
- [x] P36: Resolve per-shell executable command variables (fixed - `applyPerShellOverrides` resolves vars; validation rejects unresolved)

## Review Feedback (PR #86) - round 5

- [x] P37: Preserve inheritance when users clear per-shell lists (fixed - `arr()` keeps `[]` only when loaded was already empty; a cleared non-empty list removes the override so the server doesn't replace global `blockedOperators`/`allowedPaths` with nothing)
- [x] P38: Honor the selected scope when setting configFile (fixed - `generateConfigFile` uses `formScopeArg` to pick the write target, falling back to the folder-based heuristic for palette invocations)
- [x] P39: Refresh the configuration form when workspace folders change (fixed - subscribed to `onDidChangeWorkspaceFolders`; normalizes `currentScope` to Global when no folder remains and re-posts the form state)
- [x] P40: Allow the form to configure an empty executable argument list (fixed - `argLines()` returns `[]` when a custom command is set and the args textarea is blank, so the server doesn't fill in default args like `/c` or `-c`)
- [x] P41: Provide a way to remove non-empty scope overrides (fixed - enum selects gained an `Inherit` option and `allowAllDirs`/`debug` became tri-state selects; Inherit submits `''`/`null` which `applySettings` maps to undefined, clearing the override)

## Review Feedback (PR #86) - round 6

- [x] P42: Recognize Windows absolute paths on non-Windows hosts (fixed - shared `isAbsolutePath` checks both `path.win32` and `path.posix`, used by `resolvedPath`/`pathValue`/`resolveConfigPath`)
- [x] P43: Re-enable workspace controls when a folder is added (fixed - `applyWorkspaceAvailability` toggles the Workspace radio, mcp.json button, and no-workspace hint in both directions)
- [x] P44: Apply workspace-removal state even while the form is dirty (fixed - scope availability/selection applied before the dirty guard; only the field-value refresh stays deferred)
- [x] P45: Add an Inherit option for logging tri-state settings (fixed - `enableTruncation`/`enableLogResources` selects gained an `Inherit` option that clears the scope override)
- [x] P46: Resolve relative custom executable paths before provider launch (fixed - `customCommandValue` anchors a path-like relative command to the workspace when no cwd is set; validation blocks unanchorable)
- [x] P47: Force per-shell directory restrictions to match safety mode (fixed - yolo/unsafe cleanup forces a present per-shell `restrictWorkingDirectory` to `true`/`false`)
- [x] P48: Preserve explicit empty workspace string overrides (fixed - Inherit checkboxes plus `explicitlySetKeys`/`setKeys`; `null` clears, `''` persists for `configFile`/`initialDir`/`logDirectory`/`launch.cwd`)
- [x] P49: Show the provider's fallback cwd with the launch command (fixed - `resolveLaunchCwd` shares `privateDir()` with `showLaunchCommand`, which now displays the private launch dir)

## Review Feedback (PR #86) - round 7

- [x] P50: Convert workspace paths for WSL shell overrides (fixed - `applyPerShellOverrides` converts resolved Windows drive paths in a wsl shell's `allowedPaths`/`initialDir` to `/mnt/<drive>` form via `convertWindowsToWslPath`, matching what the server's WSL validator compares against)
- [x] P51: Anchor relative per-shell executable commands (fixed - `resolvePerShellCommand` anchors a path-like relative command to the workspace when no `launch.cwd` is set; `validateLaunchSpec` blocks an unanchorable one)
- [x] P52: Resolve relative Node scripts against the configured cwd (fixed - `nodeScriptArg` resolves a relative script against `launch.cwd` when set, leaving it relative for mcp.json; `isUnanchorableNodeScript` treats a resolvable cwd as an anchor)
- [x] P53: Skip validation for shells that are effectively disabled (fixed - the managed loop skips shells that fail `isShellEnabledForValidation`)
- [x] P54: Do not treat per-shell initialDir as an allowed path (fixed - `hasPerShellPaths` counts only resolved per-shell `allowedPaths`, so `allowAllDirs` lifts the restriction for an initialDir-only shell)
- [x] P55: Preserve whitespace in per-shell executable arguments (fixed - webview `argLines` no longer trims each line)
- [x] P56: Reject sub-one global limits in managed mode (fixed - managed `validateLaunchSpec` requires global `commandTimeout`/`maxCommandLength` >= 1, matching the config-file rule)
- [x] P57: Prevent extraArgs from defeating forced stdio (fixed - `stripTransportArgs` drops a conflicting `--transport` from `extraArgs` whenever the extension emits its own)
- [x] P58: Preserve portability for dot-dot-prefixed workspace children (fixed - `toPortablePath` checks for an actual `..`/`../` traversal component instead of any `..` prefix)

## Review Feedback (PR #86) - round 8

- [x] P59: Block extra config flags in managed mode (fixed - `stripConfigArgs` drops a conflicting `--config`/`-c` from `extraArgs` whenever the extension emits its own `--config`, so a repeated flag can't make yargs parse `args.config` as an array and bypass the managed/referenced config)
- [x] P60: Display unset scoped settings as inherited (fixed - `explicitlySetSelectKeys` reports which inheritable enum/boolean keys are set at the scope; the webview posts `setSelectKeys` and forces unset selects to Inherit so an unset `safetyMode` isn't shown as `safe`)
- [x] P61: Reconcile deferred external changes after saving (fixed - the host re-posts persisted settings after `applySettings` on save/export, so an external change to an untouched field is reflected instead of left stale by the `saved` re-baseline)
- [x] P62: Preserve monotonic versions when the local date goes backward (fixed - `computeNextVersion` never moves the date slot backward; a backward local date keeps `prevDate` and bumps the build counter)
- [x] P63: Prevent implicit home configs from overriding safe mode (fixed - `validateLaunchSpec` warns, via a `homeConfigPresent` flag supplied by `homeConfigExists()`, when a safe non-managed launch with no `configFile` would still load `~/.win-cli-mcp/config.json`)

## Review Feedback (PR #86) - round 9

- [x] P64: Strip config overrides from managed launch extra arguments (already fixed in P59 - `buildManagedServerArgs` strips a conflicting `--config`/`-c` from `extraArgs`; thread was re-raised on an outdated line, no code change)
- [x] P65: Force stdio despite transport values in extra arguments (fixed - `buildServerArgs` now strips `--transport` from `extraArgs` for every stdio launch, not only when the extension emits its own, so an `extraArgs --transport http` can't turn a provider stdio registration into a network listener)
- [x] P66: Prevent implicit config files from overriding safe settings (fixed - the provider pins settings by generating a managed config and launching with `--config` when a plain launch has no per-shell config, no `wcli0.configFile`, but the implicit `~/.win-cli-mcp/config.json` exists; the home-config check is injectable for deterministic tests, and `showLaunchCommand` mirrors the pinning)
- [x] P67: Anchor relative per-shell executables to the launch cwd (fixed - `resolvePerShellCommand` resolves a path-like relative per-shell command to an absolute path against the configured `launch.cwd` when set, since the server spawns it with the command's requested cwd rather than the launch cwd)
- [x] P68: Do not expose a per-shell initial directory that is ignored (fixed - removed the per-shell `overrides.paths.initialDir` surface from the schema, type, webview, config emission, validation and meaningful-check; the server only honors the global `initialDir`)
- [x] P69: Preserve unset state in the scoped configuration form (fixed - `OPTIONAL_ARRAY_KEYS`/`explicitlySetArrayKeys` plus a `setArrayKeys` post and an Inherit checkbox let an explicit empty `allowedDirectories` override mask a non-empty value from the other scope)
- [x] P70: Prompt before discarding edits on scope changes (fixed - the scope radio reverts and posts `scopeChangeRequest` when the form is dirty; the host shows a modal and only reloads the other scope on confirmation)

## Review Feedback (PR #86) - round 10

- [x] P71: Strip every yargs config-alias form (fixed - `stripConfigArgs` now also drops the long single-char alias `--c`/`--c=`, short-option bundling `-cVALUE`, and the boolean negation `--no-config`, while keeping unrelated `--config*` long flags and the plain-launch escape hatch)
- [x] P72: Prevent implicit configs from overriding exported mcp.json (fixed - `writeWorkspaceMcpJson` warns modally before exporting a configFile-less stdio entry over a committed `<workspace>/config.json`, since a portable mcp.json cannot pin an absolute generated config; recommends setting `wcli0.configFile`)
- [x] P73: Materialize the managed config before showing its command (fixed - `showLaunchCommand` calls the now-public `provider.writeManagedConfig` so the displayed `--config` path references a file that exists and matches the shown settings)
- [x] P74: Pin launches that use a configured cwd (fixed - the provider also pins, via an injectable `cwdConfigExists`, when a configured `launch.cwd` contains a `config.json` that `loadConfig` would load before the home config; `showLaunchCommand` mirrors it)
- [x] P75: Validate settings before generating config.json (fixed - `generateConfigFile` runs `validateLaunchSpec(settings, true)` and refuses to write when a config-relevant blocking problem remains, filtering out launch-method-only problems)
- [x] P76: Resolve userHome with the platform home directory (fixed - `resolveVariables` uses `os.homedir()` instead of preferring `process.env.HOME`, so `${userHome}` no longer resolves to a Unix-style path on Windows)

## Review Feedback (PR #86) - round 11

- [x] P77: Check the exported entry's configured cwd for config.json (fixed - `writeWorkspaceMcpJson` resolves the entry's launch cwd via `launchCwdUri` and checks `<cwd>/config.json` there, not only the workspace root)
- [x] P78: Strip the negated transport option from extraArgs (fixed - `stripTransportArgs` drops `--no-transport`, which yargs would parse as `transport=false` and crash the server)
- [x] P79: Strip the negated config alias from extraArgs (fixed - `stripConfigArgs` drops `--no-c` alongside `--no-config`)
- [x] P80: Reject unresolved variables in per-shell executable commands (fixed - the command check flags any `${...}` left after resolving extension tokens, since the server spawns it without shell expansion)
- [x] P81: Ignore launch cwd when it cannot affect generated config (fixed - `generateConfigFile` filters the `launch.cwd` problem unless a per-shell relative command anchors to it via `launchCwdAffectsConfig`)
- [x] P82: Ignore paths on shells with directory restriction disabled (fixed - `hasPerShellPaths` skips shells whose `restrictWorkingDirectory` is explicitly false so they do not block the `allowAllDirs` lift)
- [x] P83: Apply the global WSL mount point to bash inheritance (fixed - `buildConfigFile` seeds the global mount on both `wsl` and `bash`, matching `applyCliWslMountPoint`)

## Review Feedback (PR #86) - round 12

- [x] P84: Include every per-shell setting in the isolation status (fixed - `updateIsolation` derives from `collectShells()` and listens on all per-shell fields, so executable args, overrides and WSL options mark the launch `Isolated` and the chip refreshes while typing)
- [x] P85: Reject config files that cannot actually be loaded (fixed - `validateLaunchSpec` blocks a non-managed launch whose referenced `wcli0.configFile` is missing/unreadable/a directory/malformed, via a `configFileLoadable` flag computed by `configFileIsLoadable` in the provider and export commands)
- [x] P86: Preserve options following stripped raw flags (fixed - `stripTransportArgs`/`stripConfigArgs` consume the token after a value-less `--config`/`--transport` only when it is a real value, so a following option like `--debug` survives)
- [-] P87: Let workspaces mask inherited per-shell settings (deferred - VS Code deep-merges object settings so neither clearing nor `{}` can mask an inherited User `wcli0.shells`; a correct fix needs a dedicated UI affordance and a product decision, and the test stub cannot reproduce the real merge)
- [x] P88: Strip config aliases inside short-option bundles (fixed - `stripConfigArgs` strips any single-dash bundle containing the `c` alias, e.g. `-dc /other.json` and `-xc/other.json`, consuming a trailing value token when `c` is last)
- [x] P89: Do not retarget dirty workspace edits to User scope (fixed - a dirty Workspace form keeps its loaded scope on folder removal, the dirty guard runs before the scope-radio switch, and the host refuses a Workspace save with no folder open)
- [x] P90: Correct the documented default working directory (fixed - the `wcli0.launch.cwd` description documents the private extension-owned default instead of claiming the first workspace folder)

## Review Feedback (PR #86) - round 13 (analyzed, not implemented)

Source: Codex review round 13 (pullrequestreview-4499884537), reviewed commit `b583a78614`. These were
collected and analyzed on request but deliberately NOT implemented — see the `analysis_91..93` files.

- [ ] P91: Reject non-object JSON configuration files (valid, stashed - `configFileIsLoadable` accepts any parseable JSON, so `null` makes the server crash on `Object.keys(null)` and arrays/scalars silently bypass the P85 pin; proposed fix requires a non-null non-array object)
- [-] P92: Allow workspaces to mask inherited per-shell settings (valid concern, deferred - re-raise of P87 at the read site `settings.ts:157`; same root cause - VS Code deep-merges `wcli0.shells` - and same blockers needing `inspect()` reads, a UI affordance, and a product decision)
- [ ] P93: Do not overwrite the provider config when showing scoped commands (valid, stashed - `showLaunchCommand` reuses `writeManagedConfig`, which targets the provider's live managed-config path, so a scoped display overwrites the running server's config; proposed fix writes the display command to a separate file)
