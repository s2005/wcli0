# P115 - Stop wrapper suffix scanning at a leading separator

In `vscode-extension/src/configSource.ts` (line 394) `serverFlagSuffixStart` begins at index 1 and
therefore never observes a `--` options separator at index 0, so for a custom launcher such as
`command: "node", args: ["--", "wrapper.js", "--debug"]` - where node documents `--` as the end of
its own options and hands `--debug` to the wrapper - the parser removes `--debug` from `customArgs`
and presents it as wcli0's Debug setting, and turning that displayed setting off saves
`["--", "wrapper.js"]`, deleting the wrapper's own option.
