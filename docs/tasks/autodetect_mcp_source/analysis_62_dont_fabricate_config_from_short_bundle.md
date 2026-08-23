# Analysis 62 - Don't fabricate config paths from short bundles

## Decision: Valid — fixed

`parseServerArgs` (configSource.ts) models a single-dash bundle carrying the `c` config
alias so a hand-written `-c<value>` entry round-trips as `configFile` instead of hiding in
`extraArgs` (P45). The attached-value branch took everything after the first `c`
(`token.slice(token.indexOf('c') + 1)`) as the config path. But the server's yargs `config`
alias (`src/index.ts`, `alias: 'c'`, type string, default parser settings) does NOT read an
arbitrary remainder as the value. Verified empirically against the installed yargs-parser:

- `-cfoo` => `config: ""` (parsed as `-c -f -o -o` boolean short flags)
- `-cX` => `config: ""`
- `-cC:/x.json` => `config: ""` (a word-character start, even a Windows drive letter)
- `-cfoo.json` => `config: ""`
- `-c.foo` / `-c./rel.json` => `config: {…}` (dot-notation object, not a path)
- `-c/` => `config: ""` (a lone non-word char is read as a boolean)
- `-c/other.json` => `config: "/other.json"` (non-word first char, length >= 2)
- `-c~/x.json` => `config: "~/x.json"`
- `-c123` / `-c5.5` / `-c-5` => `config: "123" / "5.5" / "-5"` (fully numeric remainder)

So for the common `-cfoo` / `-cX` shapes the parser filled `wcli0.configFile` with a file the
server never loaded; a subsequent no-op save then emitted a spurious `--config foo`, changing
the launched configuration (or failed the loadability check on a non-existent path).

**Why:** Loading then re-saving an unedited entry must not change the launched configuration
(the round-trip-fidelity invariant behind P44/P45/P86). The fix has to mirror the server's
actual yargs parse, not a superset of it. The `=` form (`-c=foo`) and the space-separated form
(`-c foo`, `-dc /x.json`) already set config for word-character values and are handled by the
other branches; only the attached single-dash bundle without `=` is restricted here. See
[[comment_45_parse_bundled_config_alias]] and [[analysis_45_parse_bundled_config_alias]].

**Fix applied:** a new `yargsBundleConfigValue(remainder)` helper returns the config string
only in the shapes yargs actually attaches it — a fully numeric remainder, or a remainder
whose first character is a non-word, non-dot character with at least one more character
following. The bundle branch models `configFile` only when the helper returns a value;
otherwise it preserves the token verbatim in `extraArgs` so the entry round-trips unchanged.
The existing P45 path cases (`-c/ws/a.json`, `-xc/ws/c.json`) still resolve. Unit tests added
in `configSource.test.cjs` (P62).

**Commit:** 65e018d — fix(vscode): round-11 codex review follow-ups for PR #89 (P61-P62)
