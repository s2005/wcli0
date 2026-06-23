# P57 - Preserve --allowAllDirs on a file save when --initialDir (or --allowedDir) is set

A hand-authored `.vscode/mcp.json` stdio entry that carries both `--allowAllDirs` and
`--initialDir` loses the `--allowAllDirs` flag on an unrelated save, silently tightening the
server from "all directories allowed" to "restricted to the initial directory".

`parseServerArgs` models `--allowAllDirs` as `allowAllDirs = true` (a `BOOLEAN_FLAG`, so it is
NOT kept in `extraArgs`) and `--initialDir /work` as `initialDir = '/work'`. On save,
`buildServerArgs` computes
`dirsConfigured = s.allowedDirectories.some((d) => d.trim()) || s.initialDir.trim().length > 0`
and emits `--allowAllDirs` only when `!dirsConfigured`, so with an initialDir set the flag is
dropped. `allowAllDirs` is a modeled, form-editable field that is NOT in the file-source
on-disk carry-forward list, so it follows the regenerated value and disappears behind a
misleading "Saved"; the post-write reparse then flips the "Allow all directories" tri-select
off.

The two arg lists are not equivalent at the server. With no config file,
`loadConfig(config, disableIfEmpty = Boolean(--allowAllDirs))` clears `restrictWorkingDirectory`
BEFORE the CLI `--initialDir` is applied (the config-file `initialDir` is still unset at that
point), and `applyCliInitialDir` then skips adding `/work` to `allowedPaths` because the
restriction is already off. So the ORIGINAL entry runs unrestricted; the ROUND-TRIPPED entry
(no `--allowAllDirs`) keeps the restriction and confines the server to `/work`. An unrelated
edit (e.g. toggling Debug) silently changes the working-directory security posture.

The `dirsConfigured` suppression is only correct for `--allowedDir` (where the server's
`applyCliShellAndAllowedDirs` re-enables the restriction regardless, making the drop
server-inert but still flipping the form's tri-select on reparse); the
`|| s.initialDir.trim().length > 0` clause is the defect. A flag present in the loaded entry
that the form shows as set must survive an unrelated save.
File: `vscode-extension/src/argsBuilder.ts:415-418` (`buildServerArgs` `dirsConfigured`).
