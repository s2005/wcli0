const test = require('node:test');
const assert = require('node:assert/strict');

// Requiring the script must not touch the filesystem (its main() is guarded by
// require.main === module); it only exposes the pure version computation.
const { computeNextVersion, packDate } = require('../../scripts/bump-version.js');

test('P62: a newer local date resets the build counter to 1', () => {
  assert.equal(computeNextVersion('0.20260614.3', 20260615), '0.20260615.1');
});

test('P62: the same local date increments the build counter', () => {
  assert.equal(computeNextVersion('0.20260615.1', 20260615), '0.20260615.2');
});

test('P62: a backward local date stays monotonic (keeps date, bumps build)', () => {
  // Local calendar date earlier than the committed version date (e.g. a US-timezone
  // build right after a post-UTC-midnight commit). The minor must NOT go backward.
  assert.equal(computeNextVersion('0.20260615.1', 20260614), '0.20260615.2');
});

test('P62: the major slot is preserved', () => {
  assert.equal(computeNextVersion('2.20260615.4', 20260615), '2.20260615.5');
});

test('P62: a missing/garbage previous version starts a fresh build for today', () => {
  assert.equal(computeNextVersion(undefined, 20260615), '0.20260615.1');
  assert.equal(computeNextVersion('0.0.0', 20260615), '0.20260615.1');
});

test('P62: packDate packs a Date into a YYYYMMDD integer', () => {
  // Month is zero-based in Date; June is index 5.
  assert.equal(packDate(new Date(2026, 5, 15)), 20260615);
  assert.equal(packDate(new Date(2026, 0, 1)), 20260101);
});
