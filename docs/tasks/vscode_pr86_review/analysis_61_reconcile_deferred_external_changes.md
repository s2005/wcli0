# Analysis 61 - Reconcile deferred external changes after saving

## Decision: Valid — fix applied

When an external configuration change arrived while the form was dirty, the webview
skipped the field refresh (to protect unsaved edits) and never reconciled afterward: the
`saved` handler re-baselined the stale displayed values, so an external
`safetyMode: safe -> unsafe` stayed effective while the now-clean form kept showing
`safe`. The host now re-posts fresh settings (`post()`) immediately after `applySettings`
on a save (and on an export-with-save), so the form re-syncs to the persisted state —
including any external change to fields the user did not touch — before the `saved`
indicator re-baselines.

**Why:** a Save submits every changed field (`collectChanged`), so after it nothing the
user edited remains dirty; re-posting cannot lose an edit but does pick up external
values for untouched fields. This is the "force a refresh after the pending edit is
saved" option the reviewer suggested, and it keeps the displayed safety state honest.
Verified by a `P61` test in `webview.test.cjs` (an external `safetyMode` change is
reflected in the post-save `init`).

**Commit:** 34888ec — fix(vscode): address Codex round-8 review feedback for PR #86
