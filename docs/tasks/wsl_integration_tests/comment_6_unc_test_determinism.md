# P6 - Avoid OS-dependent UNC rejection in Windows tests

In the UNC tests at `tests/windows/pathHandling.test.ts:134-156`, `buildWindowsConfig('cmd')` is called without `allowedPaths`, so `restrictWorkingDirectory` is false and `_executeTool` skips working-directory validation entirely. The test only passes if Windows/Node fails spawning with `\\server\share` as `cwd` (ENOENT when `cwd` does not exist). It can fail or hang in environments where the UNC name resolves differently. Use a deterministic validation setup instead of relying on host network path lookup.
