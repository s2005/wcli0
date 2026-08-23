# Analysis 113 - Track valueless init-config before reordering extras

## Decision: Valid - fix applied

The server declares `--init-config` as a string option, but the form models no field for it, so the
parser kept it verbatim in `extraArgs` and the P106 reorder guard - which consulted `VALUE_OPTIONS`
only - never learned the token had no value. Verified against the installed yargs:
`--init-config --debug path` yields an empty `init-config` plus the positional `path`, so the server
runs normally, while the rebuilt `--debug --init-config path` yields `init-config: "path"`, which
makes the server write a default config to that path and exit. `vscode-extension/src/configSource.ts`
now carries an `UNMODELED_VALUE_OPTIONS` set (`--init-config` and its yargs camel-case spelling
`--initConfig`, both verified as accepted aliases) behind a `valueOptionKind()` helper, and the three
places that reason about value-consuming options - the valueless bookkeeping in `parseServerArgs`,
the value-consumption scan in `makeExtrasReorderSafe`, and its rewrite - all go through it. A
valueless occurrence is re-emitted as `--init-config=`, which yargs parses exactly like the bare
valueless flag and which consumes nothing.

**Why:** Modeling `--init-config` as a settings field was rejected: it is a one-shot bootstrap
action that makes the server exit, not a launch setting, and surfacing it in the form would invite a
save that turns a working entry into a create-config-and-quit entry. Preserving it verbatim is the
right round-trip behavior; only the reordering metadata was missing. Routing every value-option
lookup through one helper keeps the parse side and the reorder guard from drifting apart again, and
the `string` kind is correct for the rewrite because a valueless string option and its `=` form both
yield `''` - unlike number and array options, which stay dropped as inert. This extends the
P106/P109 family from the options the form models to every value-consuming option the SERVER
declares.

**Commit:** af0d21e - fix(vscode): address review feedback for PR #93 (P113-P115)
