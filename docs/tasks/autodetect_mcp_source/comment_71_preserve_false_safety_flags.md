# P71 - Preserve false safety flags in conflict round-trips

In `vscode-extension/src/configSource.ts:474` (`parseServerArgs`), a loaded stdio entry such
as `--yolo false --unsafe` or `--no-yolo --unsafe` is still rejected by the server because
`src/index.ts` declares `.conflicts('unsafe','yolo')` and yargs' conflict check fails whenever
both keys are defined (yargs-parser sets an explicit boolean `false` for `--yolo false` and
`--no-yolo`). The `safetyConflict` helper only treats both *positive* flags as a conflict, so
it counts the false/negated side as absent, models the entry as plain `unsafe`, and a no-op
save rewrites the args to only `--unsafe` — silently turning a previously rejected hand-authored
launch into a valid unsafe launch. The conflict must be detected whenever both safety keys are
present in any form, and all safety-family tokens must round-trip verbatim.
