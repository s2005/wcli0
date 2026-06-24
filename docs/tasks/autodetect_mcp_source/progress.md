# Progress: Auto-detect and load .vscode/mcp.json as an editable configuration source

## Status Legend

| Marker | Meaning |
| ------ | ------- |
| `[ ]` | Not started |
| `[x]` | Complete |
| `[~]` | In progress |
| `[!]` | Blocked or needs decision |
| `[-]` | Skipped / not applicable |

## Planning Checklist

- [x] Analyze current behavior.
- [x] Create analysis.md
- [x] Create PRD.md
- [x] Create implementation_plan.md
- [x] Create verification.md
- [x] Create progress.md

## Phase 1: Source model and reverse parser

- [x] Create `src/configSource.ts` with source kinds and `ConfigSource` descriptor.
- [x] Implement `detectWorkspaceMcpJson(folder)` (JSONC-tolerant, never throws).
- [x] Implement `parseServerArgs(args)` inverse of `buildServerArgs` (=-form, repeated, negations).
- [x] Implement `parseMcpEntry(entry)` (transport, launch method, cwd/env, notes).
- [x] Create `test/unit/configSource.test.cjs` (detection, parser, round-trip).
- [x] `tsc --noEmit` clean; phase tests pass (22 new tests).

## Phase 2: Webview source bar and messaging

- [x] Render the source bar (active-source chip, switcher, detection banner) in `renderHtml`.
- [x] Nest the scope radio under the settings source; file source shows Save to file / Revert / dirty.
- [x] Webview script: render `init.source` / `init.detected`, build switcher menu, post messages.
- [x] Unsaved-changes guard on source switch (reuse `scopeChangeRequest` pattern).
- [x] Update `test/unit/webview.test.cjs` for source bar / banner / messages.
- [x] `tsc --noEmit` clean; phase tests pass.

## Phase 3: Host load and save wiring

- [x] Extract `writeMcpJsonFromSettings(settings, folder, ...)` from `writeWorkspaceMcpJson`.
- [x] `setupWebview`: add `currentSource`; detect on `ready`; include `source`/`detected` in `init`.
- [x] Handle source switch (read + `parseMcpEntry` + populated `init` + notes).
- [x] Handle `saveToFile` (overlay form values onto loaded baseline -> file writer; no `config.update`).
- [x] Reject home/read-only source as a load or save target.
- [x] Keep external re-post synchronous; refresh detection cache without racing a save (P96).
- [x] Update `test/unit/commands.test.cjs` and `test/unit/webview.test.cjs`.
- [x] `tsc --noEmit` clean; full unit suite passes (431).

## Phase 4: Integration and documentation

- [x] Integration test merges the wcli0 entry into an existing file and preserves other servers
  (the shared `writeMcpJsonFromSettings` save path the file source also uses).
- [x] Update `test/integration/mcpJson.test.js`; full integration suite passes (16).
- [x] Update `README.md` (source switcher, auto-detect, round trip, home read-only, side-by-side future).
- [x] `vscode-test` passes; markdownlint clean.

## Notes

- The webview is the only surface for load/save (no command), so detection/load/save are covered by
  unit tests against the host message handlers; the integration test covers the shared file-write
  merge path in a real Extension Host.
- Deferred (non-requirements, per the PRD): arbitrary file browse, in-place `config.json` editing,
  and the side-by-side settings/file view.

## Review Feedback

(Section appears when PR review feedback arrives. Each comment gets a checkbox.)

### Review Feedback (PR #89)

- [x] P1: Prevent export actions from persisting file-source edits (fixed — host
  export handler refuses while `currentSource === 'mcpJson'`; webview disables the
  export buttons in file mode)
- [x] P2: Reset file source when the primary folder changes (fixed — track
  `loadedFileFolder` and reset the file source whenever the primary folder's fsPath
  no longer matches it)
- [x] P3: Preserve dash-prefixed custom launcher args (fixed — split custom args at
  the first recognized wcli0 flag via `isServerFlag`, not the first dash)
- [x] P4: Clear omitted env from the saved file baseline (fixed — re-baseline
  `saveToFile` from the entry re-read off disk after writing)
- [x] P5: Preserve full HTTP/SSE URLs when round-tripping (fixed — preserve the
  verbatim `transportUrl` and write it back unless host/port were edited; note
  non-canonical URLs)

### Review Feedback (PR #89, round 2)

- [x] P6: Reject stale file-source saves after workspace changes (fixed — `saveToFile`
  proceeds only while still in `mcpJson` mode for the same `loadedFileFolder` with the
  loaded entry intact)
- [x] P7: Preserve HTTP/SSE auth fields when saving (fixed — merge the regenerated
  fields onto the loaded raw entry via `mergeEntryOntoBase`, keeping `headers`/`oauth`)
- [x] P8: Avoid loading default-port URLs as invalid port 0 (fixed — keep the valid
  default port, preserve the verbatim URL, and note the port field is inert for it)
- [x] P9: Preserve non-string env values on file saves (fixed — round-trip the loaded
  entry's raw `env` verbatim instead of the string-filtered settings env)
- [x] P10: Preserve socket and pipe URLs (fixed — retain the verbatim `transportUrl`
  when it cannot be decomposed; `preservedFileUrl` writes it back unchanged)
- [x] P11: Clear stale file-source notes after clean reloads (fixed — carry notes in
  every file-source `init` and clear them when empty)
- [x] P12: Preserve stdio-only VS Code fields (fixed — `mergeEntryOntoBase` keeps
  `envFile`/`dev`/`sandboxEnabled` and removes the opposite mode's keys)
- [x] P13: Allow VS Code input variables in loaded --config paths (fixed — validate
  file-source saves with a VS Code-variable `--config` path blanked; emit it verbatim)

### Review Feedback (PR #89, round 3)

- [x] P14: Preserve node runtime arguments (fixed — gate the node fast path on a
  non-option first arg; node-with-options parses as custom)
- [x] P15: Avoid stealing wrapper options that look like server flags (fixed — split
  custom args at the start of the longest pure server-flag suffix)
- [x] P16: Re-post source detection after workspace changes (fixed — push a dedicated
  `detected` message after the async detection refresh)
- [x] P17: Preserve npx launcher options (fixed — gate the npx fast path on a
  non-option package token; npx-with-options parses as custom)
- [x] P18: Allow VS Code variables in all file-source launch fields (fixed —
  `neutralizeVscodeVariableLaunchFields` bypasses validation for every preserved field)
- [x] P19: Drop stale transport-only fields on mode changes (fixed — remove the other
  transport's full field set, including `headers`/`oauth` and `envFile`/`dev`)
- [x] P20: Merge against the current on-disk entry before saving (fixed — re-derive the
  merge base from the re-read entry so external additions survive)
- [x] P21: Parse URL userinfo before host/port (fixed — `parseHttpUrl` skips an optional
  `userinfo@` segment)

### Review Feedback (PR #89, round 4)

- [x] P22: Toggle the dirty indicator on edits (fixed — `reflectDirty` toggles `#dirtyMsg`
  on a dirty file form, hidden on the settings source)
- [x] P23: Preserve current on-disk env on file saves (fixed — round-trip `env` from the
  current on-disk entry via `readWcli0Entry`, not the panel snapshot)
- [x] P24: Parse custom suffixes with valued extraArgs (fixed — `isPureServerFlagRun`
  consumes a trailing bare token as the value of a valued extraArg)
- [x] P25: Push source resets through dirty file forms (fixed — host posts a dedicated
  `sourceReset` message the webview applies even while dirty)
- [x] P26: Describe the comment handling accurately (fixed — README says commented files
  are rewritten as plain JSON only after confirmation, not refused)

### Review Feedback (PR #89, round 5)

- [x] P27: Preserve cwd-relative --config when saving file sources (fixed — a
  `preserveRelativePaths` build option keeps a file source's relative path args and `cwd`
  verbatim instead of anchoring them to `${workspaceFolder}`)
- [x] P28: Avoid retargeting dirty file edits to settings (fixed — a settings save whose
  baseline came from a reset file source is flagged `fromResetFileSource`; the host
  confirms before writing, and the flag clears on any re-baseline)
- [x] P29: Refuse file-source shell/profile edits that cannot be saved (fixed —
  `writeMcpJsonFromSettings` refuses a file-source save carrying `wcli0.shells` /
  `wcli0.profiles`, which the entry cannot persist, instead of dropping them on reparse)

### Review Feedback (PR #89, round 6)

P30-P38 were found by re-auditing the round trip; P39-P42 are the matching
unresolved Codex review threads (P39 is the same root issue as P36). Each has an
`analysis_N_*.md` + `comment_N_*.md` pair in this folder.

Note: a concurrent session landed its own round-6 commits on the branch first
(the hoisted refusal with `hasRawPerShellConfig`/`hasRawProfilesConfig` for
P35/P36/P39, the http/sse non-transport tab lock, the `parseHttpUrl`
port-`undefined` distinction, and the index-0 wrapper-flag guard). This batch was
rebased on top of that work, so the entries below reflect the MERGED state: some
were satisfied by the prior commits and the rest are added here.

- [x] P30: Transport flags in a stdio entry's args flip the type and delete
  command/args on save (fixed — `parseServerArgs` takes a `stdio` option that
  routes `--transport`/`--http-*`/`--sse-*` to `extraArgs` so the authoritative
  `type` wins and the flags round-trip verbatim)
- [x] P31: An unrecognized transport `type` is silently rewritten to stdio
  (fixed — `type` is matched case-insensitively; an unrecognized non-empty type
  is noted rather than silently coerced)
- [x] P32: The short-form `-c`/`--c` config alias is not recognized on load
  (fixed — the alias forms are added to the reverse parser's option table,
  matching the forward `stripConfigArgs`)
- [x] P33: Non-string `args` elements are coerced to empty string (fixed — args
  are stringified via `String()` like node's spawn, so a numeric arg survives)
- [x] P34: An invalid numeric flag value blocks every save (fixed — an
  unparseable numeric value falls through to `extraArgs` instead of poisoning the
  typed field)
- [x] P35: The P29 refusal is nested in the stdio branch (fixed by the prior
  round-6 commit — the file-source refusal is hoisted above the stdio/http split
  so http/sse sources are covered)
- [x] P36: The ignore-inherited masks bypass P29 on a file source (fixed by the
  prior round-6 commit — the hoisted gate uses `hasRawPerShellConfig` /
  `hasRawProfilesConfig`, which ignore the masks, so a mask cannot suppress the
  refusal)
- [x] P37: TOCTOU — env and merge base from two file reads (addressed — the
  on-disk entry is read once up front and reused for the env round-trip, the
  uneditable-argv carry-forward, and URL preservation, removing the separate
  pre-modal env read)
- [x] P38: `sourceReset` unconditionally arms the P28 flag (fixed — the flag is
  armed only when the form is still dirty, so a clean re-baseline is not falsely
  flagged)
- [x] P39: Don't report inherited-mask edits as saved to mcp.json (fixed by the
  same `hasRaw*` refusal as P36 — a mask edit on a file source is blocked rather
  than misreported as saved)
- [x] P40: Preserve current uneditable argv settings on file saves (fixed —
  extends the prior commit's `extraArgs`-only carry-forward to ALL uneditable
  argv fields: customArgs, blocked lists, `--maxReturnLines`, allowed-origins)
- [x] P41: Preserve current custom URLs on file saves (fixed — URL preservation
  uses the current on-disk entry read up front, so a concurrent URL edit survives
  when its modeled host/port still match)
- [x] P42: Parse modeled flags before multiple valued extras (fixed —
  `isPureServerFlagRun` lets every unknown `--flag` consume one following value
  once the modeled portion has begun, so a suffix with several `--unknown value`
  pairs no longer hides the modeled flags)

### Review Feedback (PR #89, round 7)

P43-P48 are the unresolved Codex review threads from the round-6 re-review. Each
has an `analysis_N_*.md` + `comment_N_*.md` pair in this folder.

- [x] P43: Keep scanning after ambiguous launcher-only flags (fixed —
  `serverFlagSuffixStart` takes `allowIndexZero` and skips index 0 for non-wcli0
  commands, so a wrapper flag before the modeled flags no longer strands the
  server suffix in `customArgs`)
- [x] P44: Don't consume another flag as a missing option value (fixed — the
  space-separated value path consumes the next token only when it is not another
  flag, so `--blockedCommand --debug` preserves both instead of swallowing
  `--debug`)
- [x] P45: Parse bundled config aliases as configFile (fixed — `parseServerArgs`
  handles single-dash bundles carrying the `c` alias, e.g. `-c/other.json` /
  `-xc /other.json`, mirroring the forward `stripConfigArgs`)
- [x] P46: Merge from a single file snapshot (fixed — the write-step merge base
  is the same up-front on-disk read used for env/argv/url preservation, so a
  concurrent edit cannot pair a fresh base with stale generated env/args)
- [x] P47: Recognize yargs kebab-case option aliases (fixed — kebab-case aliases
  for the modeled camelCase value options and boolean flags are added to the
  reverse parser tables, so `--max-command-length` etc. are modeled, not hidden)
- [x] P48: Compare file source transport types case-insensitively (fixed —
  `preservedFileUrl` lowercases `base.type` before comparing, so a no-op save of
  an uppercase `HTTP`/`SSE` entry preserves its URL instead of rebuilding it)

### Review Feedback (PR #89, round 8)

P49-P54 are the unresolved Codex review threads from the round-7 re-review. Each
has an `analysis_N_*.md` + `comment_N_*.md` pair in this folder.

- [x] P49: Disable settings-only masks for file sources (fixed —
  `applyScopeAvailability` disables `ignoreInheritedShells`/`ignoreInheritedProfiles`
  on any file source, and `writeMcpJsonFromSettings` refuses a file save carrying a
  non-default mask, so a stdio file source can no longer "Save" a dropped mask edit)
- [x] P50: Treat oversized URL ports as invalid (fixed — `parseMcpEntry` gates the
  fully-modeled branch on `1..65535`, so a `:70000` URL falls to the unusable-port
  recovery like `:0` instead of stranding the form's number input)
- [x] P51: Preserve stdio transport flags on file saves (fixed — a new
  `preserveExtraTransport` build option skips the stdio `--transport` strip for a
  file-source round-trip when no `--config` is emitted, so a hand-authored
  `--transport http` and its companion `--http-*` args round-trip verbatim)
- [x] P52: Refuse saves for unknown transport types (fixed —
  `writeMcpJsonFromSettings` refuses a file save when the merge-base entry's `type`
  is not stdio/http/sse, so a `websocket` entry is not silently normalized to stdio)
- [x] P53: Preserve current wslMountPoint on file saves (fixed — `wslMountPoint` is
  added to the on-disk uneditable-argv carry-forward, so an externally changed
  `--wslMountPoint` survives an unrelated save instead of reverting to the stale load)
- [x] P54: Reject all profile edits for file sources (fixed — the file-source guard
  gates on any non-empty `settings.profiles` instead of only launch-meaningful ones,
  so a non-emittable profile is refused rather than reported Saved and dropped)
- [x] P55: Refuse stale edits before locking network file fields (fixed — the
  `saveToFile` handler refuses a file save when the transport mode is http/sse and
  `collectChanged()` carries any non-transport key, so a safety/config/launch edit made
  while the entry was stdio is no longer dropped behind a misleading Saved)
- [x] P56: Keep unknown-only suffix flags with wrapper args (fixed —
  `serverFlagSuffixStart` now requires a modeled wcli0 flag in a non-wcli0 wrapper
  suffix, so `wrapper target --verbose` keeps `--verbose` in customArgs instead of
  reordering it after the generated server flags on save)

### Review Feedback (PR #89, round 10)

P57-P60 were found by an exhaustive multi-agent re-audit of the load -> edit ->
save round trip (five finders across the parser / forward-builder / save-path /
webview / url surfaces, each candidate adversarially double-verified for reality
and novelty against the P1-P56 + P-named baseline, and cross-checked against the
server's own CLI/config behavior). Each has an `analysis_N_*.md` + `comment_N_*.md`
pair in this folder. All four are now fixed; each fix's load-bearing claim about the
server's CLI/config behavior was independently re-verified against `src/utils/config.ts`
and `src/index.ts`.

- [x] P57: Preserve --allowAllDirs on a file save when --initialDir is set (fixed —
  `buildServerArgs` emits `--allowAllDirs` whenever the form shows it set on a file-source
  round trip (`opts.preserveRelativePaths`), so a hand-authored flag survives an unrelated
  save instead of being dropped; the server applies `--allowAllDirs` before the CLI
  `--initialDir`, so dropping it had silently re-restricted an unrestricted server. The
  provider/settings-export paths keep the suppression)
- [x] P58: Don't strand file saves on a sub-1-second commandTimeout/maxCommandLength
  (fixed — the `commandTimeout`/`maxCommandLength` number inputs use `min="0"` instead of
  `min="1"`, so a loaded server-valid `> 0` value passes the client `validateNumbers` guard;
  the host `validateLaunchSpec` still enforces the per-mode bound (`> 0` CLI / `>= 1`
  managed), so an actually-invalid value is rejected with a precise message)
- [x] P59: Don't refuse file saves over an out-of-range CLI log limit (fixed —
  `parseServerArgs` diverts a finite-but-out-of-range `maxReturnLines`/`maxOutputLines` to
  `extraArgs` verbatim (`divertNumber`), so it round-trips without poisoning the typed field
  or tripping `validateLaunchSpec`; `buildServerArgs` strips a duplicate diverted flag via
  `stripValueFlag` when it emits the same log limit from the typed field, avoiding a
  yargs-array hazard for the form-editable `maxOutputLines`)
- [x] P60: Preserve a user-authored wildcard URL host on a port-only file save (fixed — the
  file-source URL rebuild uses `fileSourceUrlHost` (the verbatim connect host, IPv6-bracketed)
  instead of `clientHost`, so editing only the port keeps `0.0.0.0`/`[::]` instead of
  rewriting it to `127.0.0.1`/`[::1]`; the settings-driven export keeps the `clientHost`
  bind->connect mapping)

### Review Feedback (PR #89, round 11)

P61-P62 are round-11 Codex review comments on the load -> edit -> save round trip. Each has
an `analysis_N_*.md` + `comment_N_*.md` pair in this folder. The P62 fix's load-bearing claim
about yargs short-bundle parsing was verified empirically against the installed yargs-parser.

- [x] P61: Strip preserved value flags when replacing them (fixed — `buildServerArgs` now
  strips from `extraArgs` every modeled SCALAR value flag it emits from a typed field
  (`--shell`, `--initialDir`, `--commandTimeout`, `--maxCommandLength`, `--wslMountPoint`,
  `--maxOutputLines`, `--maxReturnLines`, `--logDirectory`, and the emitted transport
  host/port/origin), not just the two log-limit lines. The parser diverts a malformed modeled
  value (`--commandTimeout bad`, `--logDirectory --debug`) verbatim into `extraArgs`, so once
  the field is set the form value wins instead of yargs merging duplicates into an array the
  server's `applyCli*` helpers apply none of. Each strip is guarded by the emit condition so an
  UNSET field still round-trips its preserved value; array options stay exempt)
- [x] P62: Don't fabricate config paths from short bundles (fixed — `parseServerArgs` models a
  single-dash `-c<remainder>` bundle as `configFile` only in the shapes yargs actually reads as
  the config string (a fully numeric remainder, or a non-word non-dot path char with at least
  one more char), via the new `yargsBundleConfigValue` helper. A word-character bundle like
  `-cfoo`/`-cX` — which yargs parses as separate short boolean flags, leaving config empty — is
  preserved verbatim in `extraArgs` instead of fabricating a path a no-op save would emit as
  `--config <value>`. The P45 path cases still resolve)

### Review Feedback (PR #89, round 12)

P63-P66 are round-12 Codex review comments on the load -> edit -> save round trip, all about
yargs negation/limit forms a loaded `.vscode/mcp.json` may carry. Each has an
`analysis_N_*.md` + `comment_N_*.md` pair in this folder.

- [x] P63: Consume negated boolean flags before preserving extras (fixed — `parseServerArgs`
  now models the server's boolean negations (`--no-allowAllDirs`/`--no-allow-all-dirs`,
  `--no-debug`, `--no-yolo`, `--no-unsafe`) instead of letting them fall through to `extraArgs`,
  where a preserved `--no-debug` survived a save and yargs collapsed `--debug --no-debug` to
  `debug: false`, dropping the user's edit. `allowAllDirs`/`debug` are set false; `--no-yolo`/
  `--no-unsafe` clear `safetyMode` only when it matches, mirroring yargs last-wins without
  clobbering an independent `--unsafe`. The tokens were added to `BOOLEAN_FLAGS` so the suffix
  detector treats them like their positive forms)
- [x] P64: Preserve ignored security-limit values instead of blocking saves (fixed —
  `divertNumber` now diverts a non-positive `commandTimeout`/`maxCommandLength` to `extraArgs`
  like the other unrepresentable numerics. The server ignores such a value and runs on its
  default, but the form's number input rejects a negative and `validateLaunchSpec` blocks any
  value <= 0, so modeling a loaded `--commandTimeout 0`/`--maxCommandLength=-1` stranded every
  save; preserving it lets an unrelated edit round-trip the entry)
- [x] P65: Strip negated scalar aliases when replacing preserved flags (fixed — `stripValueFlag`
  now also drops the yargs negation of each scalar option it strips (`--no-shell`,
  `--no-logDirectory`, `--no-commandTimeout`, ...). A loaded negation that survived made yargs
  parse the option as an array (`shell: ['cmd', false]`) the server's scalar `applyCli*` helpers
  apply none of; the strip is guarded by the same emit condition, so an UNSET field still
  round-trips its preserved negation)
- [x] P66: Reject non-numeric URL ports instead of treating them as omitted (fixed —
  `parseHttpUrl` now captures an explicit port token even when malformed and reports `:abc`/`:-1`
  as `NaN` (distinct from an omitted `undefined`). That routes a malformed-port URL through the
  existing unusable-port branch — host modeled, default port kept, canonical URL rebuilt on save
  from the editable port field — instead of preserving it verbatim as a default-port URL a port
  edit could never fix. The port group stops at `/?#` so a valid numeric port is still read)

### Review Feedback (PR #89, round 13)

P67-P70 are round-13 Codex review comments on the load -> edit -> save round trip. Each has an
`analysis_N_*.md` + `comment_N_*.md` pair in this folder.

- [x] P67: Rebuild default-port URLs when the port changes (fixed — `preservedFileUrl`'s
  default-port branch now preserves the verbatim URL only while the host is unchanged AND the
  port field is still the form default (`defaultSettings().transportPort`). A port-only edit
  therefore rebuilds the canonical `http://host:port/<mcp|sse>` URL instead of writing the
  original back unchanged and dropping the edit on the next reparse. The `parseMcpEntry` note
  was updated from "the port field does not affect it" to "editing the host or port rewrites it")
- [x] P68: Honor explicit false values for boolean flags (fixed — `parseServerArgs` now consumes
  a following bare `true`/`false` for every positive boolean/tri-state/safety flag, matching
  yargs (`--debug false` => debug=false), instead of recording the flag as true and stranding
  `false` in `extraArgs` where the form showed the opposite of what the server runs. Only an
  exact `true`/`false` is consumed; any other following token stays a positional and the flag
  reads true. The `--no-*` spellings are unchanged (they already mean false and consume nothing))
- [x] P69: Keep file-source saves on one file snapshot (fixed — a file-source save now takes one
  full-file snapshot up front via the new `readExistingMcpJson` helper and reuses it for the
  merge base, the surrounding servers, and the comment-removal check. A concurrent
  delete/recreate of `.vscode/mcp.json` during a warning modal can no longer make the write
  start fresh and drop the file's other servers. The settings-driven export keeps its single
  bottom read, so its behavior is unchanged)
- [x] P70: Preserve mutually exclusive safety flags (fixed — when a loaded entry sets BOTH
  `--yolo` and `--unsafe` (which the server rejects via `.conflicts`), `parseServerArgs` now
  preserves both verbatim in `extraArgs` and leaves `safetyMode` at its default instead of
  collapsing to whichever appears last. A no-op save therefore reproduces the same
  server-rejected entry rather than silently turning it into a valid yolo/unsafe launch.
  Conflict detection mirrors yargs last-wins, so a trailing `--no-yolo` or `--yolo false`
  is not counted as positive)

### Review Feedback (PR #89, round 14)

P71-P73 are round-14 Codex review comments on the load -> edit -> save round trip. Each has an
`analysis_N_*.md` + `comment_N_*.md` pair in this folder. P71 corrects the conflict semantics
that the round-13 P70 fix modeled incorrectly (verified against the project's yargs).

- [x] P71: Preserve false/negated safety flags in conflict round-trips (fixed — the server's
  `.conflicts('unsafe','yolo')` rejects an entry whenever BOTH keys are defined, not just both
  positive: `--yolo false --unsafe`, `--no-yolo --unsafe`, `--yolo=false --unsafe`, and even
  `--no-yolo --no-unsafe` are all rejected (verified against yargs). `parseServerArgs` now detects
  the conflict by presence of both families in any form and round-trips every safety token
  verbatim — bare positives, consumed `true`/`false` values, `--no-*` negations, and attached
  `--yolo=…` forms — leaving `safetyMode` at default so a no-op save reproduces the rejected entry
  instead of collapsing it to a valid single-mode launch. The P63/P70 tests that asserted the old
  last-wins behavior were corrected)
- [x] P72: Model attached boolean assignments (fixed — the attached-form branch now models a yargs
  boolean assignment such as `--debug=true` / `--enableTruncation=false` via the new
  `applyAttachedBoolean` helper, instead of dumping it to `extraArgs` where the form showed the
  default and a stale `--debug=false` later in argv defeated the user's edit. Safety flags are
  modeled only when there is no conflict; a non-`true`/`false` attached value is still preserved
  verbatim)
- [x] P73: Keep dash-prefixed scalar path values attached (fixed — `buildServerArgs` now emits the
  scalar path options `--config`/`--allowedDir`/`--initialDir`/`--logDirectory`/`--wslMountPoint`
  through `pushOption`, so a dash-prefixed value such as a directory named `--unsafe` stays
  attached as `--logDirectory=--unsafe` instead of being re-emitted space-separated and parsed by
  yargs as a separate safety flag. Non-dash values are emitted unchanged)
