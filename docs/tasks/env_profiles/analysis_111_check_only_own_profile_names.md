# Analysis 111 - Check only own profile names

## Decision: Valid — fix applied

`resolveProfileEnv` now looks up the requested profile with
`Object.prototype.hasOwnProperty.call(available, profileName)` before reading it,
falling back to `undefined` (and the existing unknown-profile branch) when the name
is not an own property.

**Why:** The `profile` parameter's enum in the input schema is advisory — a client
can send any string. A plain `available[profileName]` resolves inherited
`Object.prototype` members, so a name like `toString`, `constructor` or
`hasOwnProperty` returned the built-in function instead of `undefined`. That
skipped the unknown-profile guard and let execution reach `Object.entries(profile.env)`,
throwing a `TypeError` (surfaced as a generic internal error) instead of the
intended `ProfileSelectionError` → `McpError(InvalidParams)`. The own-property
check routes these names through the proper validation error. Added a unit test
asserting `toString`/`constructor`/`hasOwnProperty` throw `ProfileSelectionError`
with the "Unknown profile" message.

**Commit:** df26e28 — fix(profiles): address PR87 round-18 review (P108-P112)
