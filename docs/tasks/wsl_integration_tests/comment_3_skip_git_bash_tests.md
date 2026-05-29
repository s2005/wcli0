# P3 - Skip Git Bash tests instead of returning early

On Windows machines where Git Bash is not installed at exactly `C:\Program Files\Git\bin\bash.exe`, the `beforeEach` in `tests/windows/shellExecution.test.ts:243` leaves `server` unset and each test returns before making any assertions, so Jest reports the Git Bash coverage as passing even though nothing ran. This should use an explicit skipped/conditional suite or assert the prerequisite so missing Git Bash is visible rather than a false pass.
