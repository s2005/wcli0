# Analysis 82 - Preserve npx's installation confirmation behavior

## Decision: Valid — fix applied

The npx fast path accepted an entry with or without the leading `-y` (`npxPackageAt`), while
`buildLaunchSpec` unconditionally emits `['-y', packageSpec, ...flags]`. A hand-authored
`command: "npx", args: ["wcli0@1.2.3"]` was therefore modeled as the npx launch method, and any
unrelated save added `-y` — converting a launch that asks before installing a missing package into
one that accepts the download automatically. npm documents exactly that: npx prompts before
installing, and `-y`/`--yes` suppresses the prompt.

The fix requires `args[0] === '-y'` for the fast path. Without it the entry falls through to custom
parsing, the same treatment `npx --package=x -- wcli0` already gets (P17): `customCommand` is `npx`,
the package token stays in `customArgs`, and `serverFlagSuffixStart` still recovers the wcli0 flags
after it, so `--shell` and friends remain editable and a no-op save re-emits `npx wcli0@1.2.3 ...`
byte-for-byte. A parse note explains why the entry shows as a custom command. The same change drops
the invented package spec for a bare `command: "npx"` entry with no args, which previously would have
been saved as `npx -y wcli0@latest`.

**Why:** The launch method is a lossy model — choosing it asserts "this entry is `npx -y <pkg>`" —
so it may only be applied to entries that really are that. Falling through to custom is the
project's established lossless escape for a launcher shape the form cannot represent, and it costs
nothing here: the server flags stay modeled and only the launcher tokens become read-only text.
Adding a "no -y" flag to the settings model instead would put a persisted, form-visible option into
every scope to serve one hand-authored edge case. See [[analysis_17_preserve_npx_launcher_options]].

**Commit:** e7a73ce - fix(vscode): round-16 codex review follow-ups for PR #89 (P79-P82)
