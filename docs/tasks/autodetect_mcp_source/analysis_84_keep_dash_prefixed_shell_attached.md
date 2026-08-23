# Analysis 84 - Keep dash-prefixed shell values attached

## Decision: Valid â€” fix applied

`buildServerArgs` emitted the shell with a plain `args.push('--shell', s.shell)` while every other
scalar whose value can start with a dash goes through `pushOption`, which switches to the attached
`--flag=value` form for exactly this reason (P73). A loaded entry can carry a dash-prefixed shell
value the form's select cannot represent: yargs reads `--shell=--unsafe` as the shell name
`"--unsafe"`, but reads the two-token `--shell --unsafe` as an empty shell value PLUS an active
`unsafe` boolean. A no-op save therefore converted a broken-but-harmless hand-authored launch into a
working one with every safety restriction disabled â€” the most dangerous shape of silent rewrite in
this feature.

The fix routes `--shell` through `pushOption` like the other dash-capable scalars. An ordinary shell
name still emits as two tokens, so nothing about the common case changes.

**Why:** Of the review's two options, the attached-value helper is strictly better than
preserve/refuse here: it round-trips the value AND keeps the field editable, where preservation in
`extraArgs` would leave the shell field empty and let a later edit fight the preserved token. It also
removes an inconsistency rather than adding a special case â€” `--shell` was simply the one dash-capable
scalar that had been missed when P73 introduced the helper. See
[[analysis_73_keep_dash_prefixed_paths_attached]].

**Commit:** 869edb8 - fix(vscode): round-17 codex review follow-ups for PR #89 (P83-P86)
