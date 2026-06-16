# Analysis 35 - Preserve unsaved form edits on external configuration changes

## Decision: Valid — fix applied

The `onDidChangeConfiguration` subscription posted a fresh `init` on any external `wcli0` change, and
the webview unconditionally applied it via `setVal`, discarding unsaved edits and re-baselining
`initial`. The external-change `post` now carries an `external: true` flag; the webview ignores such a
reload while the form is dirty (`collect()` differs from `initial`), and otherwise applies it as
before. Explicit `ready`/`scopeChange` reloads are unaffected.

**Why:** A background settings change (settings.json save, another extension, the other wcli0 view)
must not silently destroy in-progress edits; deferring the reload while dirty preserves the user's
work, and a clean form still picks up external changes immediately.

**Commit:** 174b9ce — fix(vscode): address Codex round-4 review feedback for PR #86
