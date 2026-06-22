# Analysis 32 - The short-form `-c` / `--c` config alias is not recognized when loading an entry

## Decision: Valid — fix applied

The server exposes `config` with alias `c`. The forward builder's
`stripConfigArgs` strips every yargs form (`-c X`, `--c X`, `-c=X`, `--c=X`,
`-cX` bundling, `--no-c`). The reverse parser's `VALUE_OPTIONS` table lists only
`'--config'`, so a short-form `-c config.json` (or `--c`) in a loaded entry is
not modeled: `-c` and its value fall into `extraArgs` and `configFile` stays
empty. The data round-trips via `extraArgs`, but three user-visible things go
wrong: the Config-file field renders empty (misleading — the entry does
reference a config file); the "references a config file via --config" note
(configSource.ts:428) does not fire (it keys on `s.configFile.trim()`); and the
`configFileLoadable` validation is skipped because `resolvedConfigFilePath`
returns undefined for an empty `configFile`, so a `-c` that pins a
missing/malformed file saves without the P85-style warning a `--config` pin
would get.

**Why:** The reverse parser and the forward builder must agree on the grammar of
every flag, or the form/validation diverges from what the server actually
receives. The config alias is the one short form the server defines, and the
forward side already exhausts it.

**Proposed fix:** Add `'-c'` and `'--c'` (and handle `-cX` bundling) to
`VALUE_OPTIONS` for `configFile`, or normalize `-c`/`--c` to `--config` before
the parse loop, so the alias maps to `configFile` like the long form.

**Commit:** ceefe56 — fix(vscode): round-6 codex review follow-ups for PR #89 (parser + save round-trip)
