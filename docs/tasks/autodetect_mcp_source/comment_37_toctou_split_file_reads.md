# P37 - The env source and the merge base come from two separate file reads straddling the env-prompt modal

For a file-source stdio save, `writeMcpJsonFromSettings` reads the entry once
for the env (`await readWcli0Entry(folder)`) BEFORE the Include/Omit
`showWarningMessage` modal, then reads the whole file again (`readFile`) AFTER
the modal to build the merge base. If an external process (an editor auto-save,
git, another extension) changes `.vscode/mcp.json` during that modal window, the
two reads diverge. If env was added in between, the prompt counted keys from the
first read only and the second read's newer env is deleted by the merge (env is
an owned stdio key) — a silent loss of the kind P23 was meant to prevent,
re-introduced by the split read. If the file is deleted between the two reads,
`readFile` throws `FileNotFound`, `existing` becomes `{}`, the merge falls back
to `baseEntry`, and the write recreates the file with only `servers.wcli0` —
every other server present at the first read is lost with no warning. Read the
file once and derive both the env and the merge base from the same parsed
document.
Reference: `vscode-extension/src/commands.ts:516,523-535,576,633-636`.
