# Analysis 3 - Skip Git Bash tests

## Decision: Valid — fix applied

The tests use `if (!server) return` guards which cause Jest to report them as passing with zero assertions, creating a false sense of coverage. The fix replaces the `beforeEach` early-return pattern with a `describe.skip` wrapper that checks for Git Bash availability once, making skipped tests visible in the Jest output. This follows the same pattern already used by `describeOnWindows` at line 9 which skips the entire suite on non-Windows platforms.

**Why:** Test transparency matters — silently passing tests that never ran hides missing prerequisites. Using `describe.skip` produces accurate coverage reporting and makes it immediately obvious when Git Bash is not installed.

**Commit:** 5c966c1 — fix(validation): address review feedback for PR #82
