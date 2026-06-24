# Analysis 77 - Do not let stdio transport flags prove a server suffix

## Decision: Valid — fix applied

A stdio entry's `type` is authoritative, so `parseServerArgs({stdio:true})` deliberately leaves
`--transport`/`--http-*`/`--sse-*` flags in `extraArgs` verbatim and never models them (P30). But
the suffix detector (`serverFlagSuffixStart` -> `isPureServerFlagRun`) still treated any
`VALUE_OPTIONS` flag — transport flags included — as modeled evidence. So a wrapper like
`wrapper target --transport fast` was split as if `--transport fast` were an editable wcli0 suffix,
even though nothing there is editable. After any real form edit, the regenerated flags were emitted
between the wrapper's positional and its option (`target --shell cmd --transport fast`), reordering
the wrapper invocation.

The fix threads a `stdio` flag through `serverFlagSuffixStart`, `isPureServerFlagRun`, and
`isRecognizedServerFlag` (the custom-launcher branch only ever parses stdio entries, so it passes
`stdio=true`). In stdio context a transport flag still consumes its value structurally (so it is not
mistaken for an orphan that disqualifies a run) but does NOT set `seenModeled`. A transport-only
suffix therefore fails the wrapper's `requireModeled` check and stays in `customArgs`; a suffix that
also contains a real wcli0 flag (`--shell`) still splits, with the transport flag riding along in
`extraArgs`.

**Why:** The suffix detector must mirror what the parser models. Since stdio never models transport
flags, they cannot be evidence that a suffix belongs to wcli0. Keeping the value-consumption while
dropping the `seenModeled` credit is the minimal change that both stops the false split for wrappers
and leaves the wcli0-binary case (which preserves the transport flags as `extraArgs` regardless)
unchanged.

**Commit:** bb6fe6c — fix(vscode): round-15 codex review follow-ups for PR #89 (P74-P78)
