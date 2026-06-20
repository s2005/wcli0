# P111 - Check only own profile names

If a client passes an unknown profile name inherited from `Object.prototype` such
as `toString` or `constructor`, the `available[profileName]` lookup returns that
built-in function instead of `undefined`, so the unknown-profile branch is skipped
and the resolver later throws a `TypeError` instead of the intended `InvalidParams`
error. The input schema's enum is advisory, so use an own-property check before
reading the profile.

File: `src/utils/envProfiles.ts` (line 61)
