# Analysis 108 - Avoid treating dropped profiles as managed config

## Decision: Valid — fix applied

Extended `isMeaningfulProfile` (the predicate behind `hasProfilesConfig`) so it
mirrors every drop condition `buildProfiles` now applies after the round-17 fixes:
a non-empty `allowedShells` with no valid shell names makes the profile not
meaningful (P107), and an env value whose extension-owned token cannot be resolved
no longer counts toward an emittable env (P106) — a profile left with no resolvable
env values is treated as not meaningful, matching the server's empty-env rejection.

**Why:** `hasProfilesConfig` is the single gate the provider, `showLaunchCommand`
and `writeWorkspaceMcpJson` consult to decide between the managed `--config` launch
and the plain/`wcli0.configFile` launch. Profiles are config-file-only, so a true
result forces the managed config and ignores `wcli0.configFile`. Before this fix
the gate counted a profile that `buildProfiles` would silently drop (unresolved
`${workspaceFolder}` env, or all-invalid `allowedShells`), so the extension would
switch to a managed config that contains no `profiles` — removing both the selected
profile and the user's referenced config file. Mirroring buildProfiles' drop logic
keeps the gate and the generated file in agreement, so a profile only forces
managed mode when it will actually appear in the config. The mirror follows the
existing pattern documented on `isMeaningfulProfile`/`isMeaningfulShellConfig`
rather than importing `buildProfiles` (which would create a settings↔configFile
import cycle).

**Commit:** df26e28 — fix(profiles): address PR87 round-18 review (P108-P112)
