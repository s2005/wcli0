# Analysis 112 - Reject array-valued profile maps

## Decision: Valid — fix applied

`validateProfiles` now rejects a `profiles` value that is not a plain object
(non-object or array) before iterating, throwing
`Invalid profiles: must be an object mapping profile names to definitions`. The
early return was also tightened to `undefined`/`null` so a `null` profiles value is
still treated as absent rather than crashing `Object.entries`.

**Why:** The previous `if (!profiles) return;` let a truthy array through, and
`Object.entries([])` yields no entries, so a direct config typo such as
`"profiles": []` passed startup validation. The server then started with no
profiles and only failed later at selection time, defeating the purpose of
startup validation (which is meant to surface malformed profile configuration up
front). Rejecting non-object/array values here reports the error at load. Added
validateConfig tests for the array form and a non-object string form, plus an
acceptance test for the now-valid `allowedShells: []` case.
