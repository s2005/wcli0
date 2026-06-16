# P37 - Preserve inheritance when users clear per-shell lists

When a previously configured per-shell list (e.g. `blockedOperators`) is erased in the form, `loadedVal` is still an array, so `collectShells` returns `[]` instead of removing the override. The server's `mergeRestrictions` treats an explicit empty operator list as a replacement, so clearing the textarea to inherit the safe global operators instead silently disables all operator blocking for that shell. The form must distinguish an unchanged originally-empty list from a non-empty list the user cleared.

Reference: `vscode-extension/src/webview.ts:475` — <https://github.com/s2005/wcli0/pull/86#discussion_r3410248383>
