# Analysis 23 - Restore the required MIT copyright notice

## Decision: Valid - fix applied

Confirmed via git history that commit be3a61f removed the
`Copyright (c) 2024 Simon Benedict` line from `LICENSE` while the MIT permission
text (which requires the copyright notice be retained in copies) remained.
Restored the line. Added a meta-test asserting the notice is present.

**Why:** The MIT license's own terms require the copyright notice; distributing
the repo/extension without it would breach the existing license. Legal-correctness
P1, independent of the VS Code extension code.

**Commit:** cf7e17e - fix(vscode): address Codex round-3 review feedback for PR #86
