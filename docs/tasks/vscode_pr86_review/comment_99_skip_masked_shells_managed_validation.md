# P99 - Skip masked shells during managed validation

When `ignoreInheritedShells` is true, `buildConfigFile` deliberately removes all
merged `wcli0.shells`, but the managed-validation loop in `argsBuilder.ts`
(`validateLaunchSpec`, around line 817) still validates those ignored entries. This
breaks the opt-out whenever an inherited shell holds an invalid value: the provider
writes a valid masked config yet rejects the definition over a shell that will never
be emitted, and it blocks `Generate Config File` (which always calls
`validateLaunchSpec(..., true)`) from producing the same masked config. Skip
per-shell validation when `s.ignoreInheritedShells` is set.
