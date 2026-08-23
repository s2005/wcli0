# P96 - Preserve an explicit `--shell all` argument

In `vscode-extension/src/configSource.ts:135`, a hand-authored entry containing `--shell all` has the
CLI value mapped onto the form's `all` sentinel, but the forward builder interprets that sentinel as
"omit `--shell`"; these are not equivalent, because the server enables a shell only when its name
equals the supplied value, so the explicit CLI value `all` disables every known shell whereas dropping
the flag restores the configured/default enabled shells. A no-op file save therefore turns an entry
with no usable shells into one that can execute through all default shells, so the explicit value must
be preserved verbatim rather than modeled as the omission sentinel.
