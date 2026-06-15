# Analysis 91 - Reject non-object JSON configuration files

## Decision: Valid — stashed, not implemented

Confirmed against the code. `configFileIsLoadable` (`vscode-extension/src/mcpProvider.ts:59-69`)
returns true whenever `JSON.parse` succeeds, regardless of the parsed value's type. The server's
`loadConfig` (`src/utils/config.ts:135-164`) assigns `loadedConfig = JSON.parse(fileContent)` and then
evaluates `Object.keys(loadedConfig).length` at line 160:

- `null` parses successfully, so the provider passes `--config`, then `Object.keys(null)` throws a
  `TypeError` that is NOT caught inside `loadConfig` (the try/catch only wraps the read/parse loop), so
  the spawned server exits immediately — exactly the "loadable but crashes" case the reviewer
  describes.
- An array `[]` or a scalar (`42`, `"x"`) yields zero own-enumerable keys, so `userProvidedConfig` is
  false and the server silently falls through to `DEFAULT_CONFIG` / implicit-config discovery — the
  same pin-bypass class P85 ([[analysis-85-reject-unloadable-config-file]]) was meant to close.

The round-12 P85 fix made the existence/parse check mirror `loadConfig`, but stopped at "parses as
JSON" instead of "parses as a usable config object". The concern is real and is a genuine completeness
gap in that fix.

**Proposed fix (not applied):** in `configFileIsLoadable`, after `JSON.parse`, require the value to be
a non-null, non-array object before returning true:
`const v = JSON.parse(...); return typeof v === 'object' && v !== null && !Array.isArray(v);`
Add P91 cases to `mcpProvider.test.cjs` (provider registers nothing and logs for `null`/array/scalar
config files) and to `argsBuilder.test.cjs` if the validator path is exercised.

**Status:** implemented. `configFileIsLoadable` now requires a non-null, non-array object; provider
unit tests cover `null`/array/scalar rejection and the broken-pin (`null` configFile) launch. See
[[comment_91_reject_non_object_json_config]].
