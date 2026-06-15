# P69 - Preserve unset state in the scoped configuration form

When a key is unset at the selected scope, `readSettingsForScope` replaces it with its schema
default, making the form baseline indistinguishable from an explicit default-valued override. The
enum/boolean/optional-string fields are handled via `INHERITABLE_SELECT_KEYS` / `OPTIONAL_STRING_KEYS`,
but an array field such as `allowedDirectories` still cannot mask a non-default User value with an
explicit empty override: the empty textarea reads identically to "unset", so saving it produces no
change and the User value remains effective. Track the unset state for the array field too so an
explicit empty override can be persisted.

File: `vscode-extension/src/settings.ts:269` (readSettingsForScope)
