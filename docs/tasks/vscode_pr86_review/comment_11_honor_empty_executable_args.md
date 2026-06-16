# P11 - Honor empty per-shell executable argument lists

When a user overrides a shell executable and explicitly sets `executable.args` to
`[]`, the `length > 0` check in `applyPerShellOverrides` treats the value as
absent and retains the shell's default arguments such as `cmd.exe /c` or `bash -c`.
Empty argument arrays are valid server configuration and are needed for
executables that require no prefix arguments, so the generated managed config
launches a different command than requested. Source:
`vscode-extension/src/configFile.ts:122`.
