# P94 - Recognize all attached boolean values in wrapper suffixes

In `vscode-extension/src/configSource.ts:247` (`isRecognizedServerFlag`), `parseServerArgs` now models
every attached value other than exactly `true` as false, but this suffix detector still recognizes
only the literals `true` and `false`, so a custom launch such as `wrapper target
--enableTruncation=0` leaves the flag in `customArgs` and the form displays the server default
(enabled) even though yargs disables truncation; values such as `yes` behave the same way. Every
attached assignment for a declared boolean must count as modeled evidence so wrapper-only suffixes
reach the boolean parser.
