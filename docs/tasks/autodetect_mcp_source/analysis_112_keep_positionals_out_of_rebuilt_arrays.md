# Analysis 112 - Keep positionals out of rebuilt allowed-directory arrays

## Decision: Valid - fix applied

`buildServerArgs` appends `extraArgs` after the flags it generates from the typed fields, so a
bare positional preserved at the head of `extraArgs` landed directly behind the yargs ARRAY
options (`--allowedDir`, `--blockedCommand`, `--blockedArgument`, `--blockedOperator`) and was
consumed as another value: verified against the installed yargs-parser,
`marker --allowedDir C:/trusted` yields one allowed directory plus the positional `marker`, while
the rebuilt `--allowedDir C:/trusted marker` yields two. `vscode-extension/src/argsBuilder.ts` now
records the indices of the tokens it emits for those array options and, when `extraArgs` begins
with a run of value-like tokens, re-emits the array flags after that run - reproducing the
authored order.

**Why:** The alternative of diverting the array option into `extraArgs` would have kept the
directory out of the form and still lost the guarantee as soon as the user edited the allowed
list, whereas hoisting keeps the field editable and holds for an edited list too. Only the
LEADING run needs it: any later positional already has a `-`-prefixed token in front of it, which
is exactly where yargs stops consuming array values, so the normal emission order is unchanged for
every other entry. The run is measured with the builder's existing `isOptionValueToken`, so a
negative-number positional is covered like P93. This completes the reordering family started by
P106/P109, which fixed the same builder-appends-extras hazard for valueless scalar and array
flags.

**Commit:** 75d6868 - fix(vscode): address review feedback for PR #93 (P111-P112)
