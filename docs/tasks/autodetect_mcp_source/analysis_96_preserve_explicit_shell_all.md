# Analysis 96 - Preserve an explicit `--shell all` argument

## Decision: Valid — fix applied

The form's `shell: 'all'` is an OMISSION sentinel: `buildServerArgs` emits no `--shell` for it, and
the server then loads `buildConfig.includedShells` — every default shell. The server's own
`--shell all` means something entirely different: `src/index.ts` builds `shellsToLoad` as
`[args.shell]`, so it tries to load a shell module literally named "all", which does not exist,
leaving the entry with no usable shells. Mapping the CLI value onto the sentinel conflated a
locked-down entry with a fully-enabled one, and a no-op save dropped the flag and enabled every
default shell — a privilege escalation from an unrelated edit, which is why this is the round's P1.

The fix diverts the exact value `all` to `extraArgs` verbatim (both the `--shell all` and
`--shell=all` spellings) and leaves the form's shell field at its default, so a no-op save re-emits
the entry unchanged. Choosing a real shell in the form still wins: the emission then strips the
preserved copy (P61) and writes only the selected value. Any other spelling is a normal shell name
and round-trips through the field as before.

**Why:** Preserve-verbatim is the established answer for a CLI value the form cannot represent
(P10, P59, P64, P70), and `all` is precisely that — the field has a slot named `all` but it means
the opposite of what the server does with it. Diverting only the exact string keeps the change
surgical, and routing it through `extraArgs` means the existing strip-on-emit rule already handles
the "user picked a real shell" case with no extra logic. See
[[analysis_64_preserve_nonpositive_security_limits]] and [[analysis_61_strip_preserved_value_flags]].

**Commit:** bfa5c70 - fix(vscode): round-20 codex review follow-ups for PR #89 (P93-P97)
