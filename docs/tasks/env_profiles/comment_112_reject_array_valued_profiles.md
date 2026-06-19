# P112 - Reject array-valued profile maps

A direct config typo such as `"profiles": []` currently passes validation because
the top-level map is never checked and an empty array has no entries to inspect.
The server then starts with no profiles rather than reporting the malformed config,
making profile selection fail later even though startup validation is supposed to
catch invalid profile configuration. Reject non-object or array `profiles` values
before iterating entries.

File: `src/utils/config.ts` (line 685)
