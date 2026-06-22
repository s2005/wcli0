# P38 - `sourceReset` unconditionally arms the P28 flag, producing a false confirmation on a clean form

When the primary workspace folder changes, `wsSub` sends `post(true)` (an
external init) and THEN the `sourceReset` message. For a DIRTY form the external
init is skipped (the dirty guard), so `sourceReset` arming
`resetFromFileSource = true` is correct (P28). But for a CLEAN form the external
init is applied: it re-baselines the form to real settings values and sets
`resetFromFileSource = false`, whereupon the immediately-following `sourceReset`
handler unconditionally sets it back to `true`. The form now holds settings
values against a settings baseline yet is flagged as file-derived, so the next
"Save settings" trips the P28 modal ("these values came from a .vscode/mcp.json
source that is no longer active ... save them anyway?") — a false positive. If
the user trusts the warning and declines, a legitimate settings edit is
abandoned. The existing P28 test dispatches `sourceReset` before a non-external
init on a dirty form, so it does not exercise the real init-then-sourceReset
ordering on a clean form. Gate the flag on whether the form is still dirty.
Reference: `vscode-extension/src/webview.ts:2017` (handler) versus
`vscode-extension/src/webview.ts:561,567-568` (ordering) and `:2054` (init clears
the flag).
