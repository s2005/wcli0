# P60 - Display unset scoped settings as inherited

When a Workspace value is unset but User scope has a non-default value, the form
substitutes the schema default rather than representing the field as Inherit. For
example, a User `safetyMode: unsafe` with no Workspace override makes the Workspace
form display `safe`, even though the provider's effective settings launch in unsafe
mode; because `safe` is also the form baseline, saving another field does not create a
safe override. Although Inherit options were added, unset enum and boolean fields still
need their set/unset state communicated so the displayed safety state is accurate.

File: `vscode-extension/src/settings.ts:269`
