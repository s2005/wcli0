# Analysis 103 - Preserve empty allowed-directory entries

## Decision: Valid — fix applied

`--allowedDir ""` is not a no-op for the server. yargs supplies `allowedDir: ['']`, and
`applyCliShellAndAllowedDirs` gates on `allowedDirs.length > 0`, so it sets
`restrictWorkingDirectory = true` with an empty allowlist — the entry denies every working
directory. The parser kept the empty element in `allowedDirectories`, but the builder ran it through
`pathValue`, which returns undefined for a blank value, so the flag vanished from the rebuilt args.
A no-op save therefore turned OFF the restriction and let the server fall back to the config or
default allowed paths, permitting commands in directories the authored entry refused. That is the
same widening shape as P96, P98 and P100.

A blank entry is now emitted verbatim on a file-source save. The settings and provider paths keep
dropping blanks, gated on `preserveRelativePaths` exactly as the P57 `--allowAllDirs` suppression
above it is: there a blank line is editor noise rather than an authored deny-all, and the form
already filters blanks when collecting the textarea, so an empty entry could only arrive from
hand-written JSON — where silently switching the server to deny-everything would be a worse failure
than dropping it.

**Why:** The file source's contract is that a value the server acts on round-trips unchanged, and
this value has a large, security-relevant effect. Restricting the change to the round-trip path keeps
the export path's meaning of "blank line" intact, so the fix cannot surprise a settings user whose
`wcli0.allowedDirectories` happens to contain an empty string. See
[[analysis_57_preserve_allow_all_dirs]] and [[analysis_64_preserve_nonpositive_security_limits]].

**Commit:** 6655602 - fix(vscode): round-24 codex review follow-up for PR #89 (P103)
