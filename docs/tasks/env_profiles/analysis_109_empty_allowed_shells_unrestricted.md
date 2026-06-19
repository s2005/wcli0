# Analysis 109 - Treat empty allowedShells as unrestricted

## Decision: Valid — fix applied

Added a `profile.allowedShells.length > 0` guard to the shell-restriction check in
`resolveProfileEnv`, so an empty `allowedShells` array no longer rejects the
profile for every shell.

**Why:** `EnvProfileConfig.allowedShells` is documented (and described in the VS
Code setting) as "omitted/empty means all shells", and `validateProfiles` accepts
`allowedShells: []`. But `profile.allowedShells && !profile.allowedShells.includes(shellType)`
treats the truthy empty array as a restriction: `[].includes(x)` is always false,
so every shell was rejected and the profile became unusable wherever the
empty-array form appeared (including configs the extension generates). Enforcing
the restriction only when the list has entries makes runtime behavior match both
the documented semantics and the validator. Added a unit test for selection from
multiple shells with `allowedShells: []`, plus a validateConfig acceptance test.
