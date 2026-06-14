# Analysis 29 - Export the scope shown by the configuration form

## Decision: Valid — fix applied

The form edits one scope at a time and displays only that scope's stored values
(`readSettingsForScope`), but the three export commands read the merged effective settings
(`readSettings`), so hidden overrides from the other scope (e.g. a workspace `safetyMode: unsafe`)
leaked into an export the form claimed matched what was visible. Threaded the form's selected scope
through `executeCommand` into `generateConfigFile`, `writeWorkspaceMcpJson`, and `showLaunchCommand`;
when a scope is supplied they read via `readSettingsForScope`, otherwise (command-palette invocation)
they keep reading the effective settings.

**Why:** The form's documented promise is that exported output matches what is on screen. Reading the
same scope the form shows makes that true, while preserving the effective-config behavior for direct
command-palette use where no form scope context exists.
