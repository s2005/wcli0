# Analysis 21 - Drop relative config paths when no workspace can anchor them

## Decision: Valid - fix applied

`resolveConfigPath` returned a bare relative value when no workspace folder was
open (`return base ? path.resolve(base, resolved) : resolved`), so the Generate
Config File command and managed config could emit a relative allowed/initial/log
or per-shell path that the server C-roots via `normalizeWindowsPath` (e.g.
`src` -> `C:\src`). Changed it to return `undefined` when `base` is absent,
matching `argsBuilder.resolvedPath` (P15).

**Why:** The config-file generator must drop unanchorable relative paths for the
same reason the launch path does - emitting them allows or uses an unrelated
directory. Direct sibling of the P15 launch-path fix.

**Commit:** cf7e17e - fix(vscode): address Codex round-3 review feedback for PR #86
