# Analysis 6 - Avoid OS-dependent UNC rejection in Windows tests

## Decision: Valid — fix applied

Changed the UNC tests to pass `allowedPaths` so `restrictWorkingDirectory` is enabled and the validation layer rejects UNC paths deterministically, instead of relying on Node's spawn to fail on a non-existent network path. The error matcher now checks for "allowed paths" to confirm the rejection comes from validation.

**Why:** Without `allowedPaths`, the test exercised spawn failure rather than path validation, making it fragile and environment-dependent. With deterministic validation, the test verifies the intended security behavior regardless of host network configuration.

**Commit:** 8d7c451 — fix(validation): address review feedback round 2 for PR #82
