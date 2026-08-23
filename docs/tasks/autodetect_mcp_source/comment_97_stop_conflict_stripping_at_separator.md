# P97 - Stop conflict stripping at the option separator

In `vscode-extension/src/argsBuilder.ts:312` (`stripValueFlag`, and likewise `stripConfigArgs` and
`stripTransportArgs`), the reverse parser now preserves `--` and its remainder, but these conflict
strippers still scan through that preserved positional region: for `--shell cmd -- --shell bash`
parsing correctly leaves the second `--shell bash` positional, yet because the modeled shell is
emitted `stripValueFlag` deletes those positional tokens and a no-op save writes only
`--shell cmd --`. Each stripper must copy `--` and the entire remainder verbatim without matching
reserved flags there.
