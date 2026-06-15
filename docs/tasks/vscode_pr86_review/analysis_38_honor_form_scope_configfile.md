# Analysis 38 - Honor the selected scope when setting configFile

## Decision: Valid — fix applied

`generateConfigFile` already accepted the form's scope argument for *reading* settings (round-4 P29
threaded `formScopeArg` into `readExportSettings`), but the "Set wcli0.configFile" follow-up still
chose the write target solely from `folder` presence, ignoring the form's scope. The result: selecting
"User" in the form and saving the configFile reference wrote to Workspace scope because a folder was
open. Now the write target is `Workspace` only when (a) the form explicitly selected Workspace and a
folder exists, or (b) no form scope was provided (command-palette invocation) and a folder exists.
Otherwise it writes to Global. The portable-path computation is unchanged (only emitted for Workspace
targets).

**Why:** The form's documented contract (round-4 P29) is that exports and follow-up writes apply to
the scope the user is editing. Bypassing that for the configFile reference re-introduced the exact
"hidden Workspace override" leak P29 fixed. Falling back to the folder-based heuristic for palette
invocations preserves the original behavior when there is no form context to honor.

**Commit:** b56a677 — fix(vscode): address Codex round-5 review feedback for PR #86
