# Analysis 63 - Consume negated boolean flags before preserving extras

## Decision: Valid — fix applied

`parseServerArgs` only modeled the positive boolean flags (`--allowAllDirs`,
`--debug`, `--yolo`, `--unsafe`) and the tri-state negations, leaving the
server's other boolean negations (`--no-allowAllDirs`/`--no-allow-all-dirs`,
`--no-debug`, `--no-yolo`, `--no-unsafe`) to fall through to `extraArgs`. A
preserved negation then survived a save and yargs collapsed `--debug --no-debug`
to `debug: false`, discarding the user's form edit. The fix adds these tokens to
`BOOLEAN_FLAGS` (so the suffix detector treats them as modeled wcli0 flags, like
their positive forms) and adds explicit handlers in `parseServerArgs` that
consume and model them: `allowAllDirs`/`debug` are set to `false`, while
`--no-yolo`/`--no-unsafe` clear `safetyMode` only when it currently matches the
negated mode (mirroring yargs last-wins for `--yolo --no-yolo` => safe without
clobbering an independent `--unsafe`).

**Why:** The reverse parser already round-trips every other flavor of flag the
forward builder and the server understand; leaving these negations in `extraArgs`
re-emitted them after the form's positive flag and let yargs silently win.
Consuming them makes a loaded entry's boolean state editable and prevents the
duplicate-flag corruption. The server declares all four as boolean options
(`src/index.ts`) and `.conflicts('unsafe','yolo')` forbids both positives at
once, so modeling the negations cannot introduce an impossible safety state.

**Commit:** 18dc478 — fix(vscode): round-12 codex review follow-ups for PR #89 (P63-P66)
