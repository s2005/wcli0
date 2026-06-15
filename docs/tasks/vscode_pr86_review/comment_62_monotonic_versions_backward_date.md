# P62 - Preserve monotonic versions when the local date goes backward

When `npm run build` runs on a machine whose local calendar date is earlier than the
committed version date - for example, a US-timezone release build shortly after a
version was committed after UTC midnight - the bump script resets the build counter and
emits a lower version such as `0.20260614.1` from `0.20260615.1`. That contradicts the
script's monotonic-version guarantee and can make a Marketplace publish fail because the
generated package version is older than an already-published build. Keep `prevDate` when
it is later than `today`, incrementing its build counter instead of moving backward.

File: `vscode-extension/scripts/bump-version.js:44`
