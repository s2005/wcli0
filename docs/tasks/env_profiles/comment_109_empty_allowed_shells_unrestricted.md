# P109 - Treat empty allowedShells as unrestricted

When a profile is configured with `"allowedShells": []`, the config passes
validation and the VS Code setting describes an empty list as allowing every
shell, but the truthy-array check in `resolveProfileEnv` rejects the profile for
every shell because `[].includes(shellType)` is always false. This makes the
profile unusable whenever a user or generated config includes the empty-array
form. Check `profile.allowedShells.length > 0` before enforcing the restriction.

File: `src/utils/envProfiles.ts` (line 69)
