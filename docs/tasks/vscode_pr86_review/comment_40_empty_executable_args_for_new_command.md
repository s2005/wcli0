# P40 - Allow the form to configure an empty executable argument list

When a user enters a new per-shell executable command and leaves its arguments blank to request no prefix arguments, `loadedVal` is undefined, so `argLines` returns undefined rather than `[]`. The saved shell config then overrides only the command, and `applyPerShellOverrides` retains the default arguments such as `cmd.exe /c` or `bash -c`, causing the custom executable to be invoked with unwanted arguments. The form needs a way to distinguish an explicit empty argument list from an unset one.

Reference: `vscode-extension/src/webview.ts:485` — <https://github.com/s2005/wcli0/pull/86#discussion_r3410248393>
