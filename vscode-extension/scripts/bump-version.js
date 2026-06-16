#!/usr/bin/env node
// Bumps the extension version to the date-based build scheme:
//
//   0.<YYYYMMDD>.<build>
//
// VS Code requires a valid 3-part semver, so the four logical parts the project
// wants (main, minor, date, build) are mapped onto the three available slots:
//   major = main (kept at 0)
//   minor = YYYYMMDD (today's date)
//   patch = build counter
//
// The build counter increments on every build and resets to 1 each new day.
// This keeps versions monotonically increasing: a newer date raises the minor
// slot, and same-day rebuilds raise the patch slot.
//
// Run via `npm run version:bump` (invoked by `npm run build`).

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

// Pack a local date into a single YYYYMMDD integer (e.g. 20260614).
function packDate(d) {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// Compute the next 0.<YYYYMMDD>.<build> version from the previous version string and
// today's packed date. The date slot NEVER moves backward: if the local calendar date
// is earlier than the committed version's date (e.g. a US-timezone build right after a
// post-UTC-midnight commit), keep the previous date and just bump the build counter so
// the version stays monotonically increasing — a lower minor could fail a Marketplace
// publish for being older than an already-published build. A genuinely newer date
// resets the build counter to 1; the same date increments it.
function computeNextVersion(prevVersion, today) {
  const [majorRaw, prevDateRaw, prevBuildRaw] = String(prevVersion || '0.0.0').split('.');
  const major = Number(majorRaw) || 0;
  const prevDate = Number(prevDateRaw) || 0;
  const prevBuild = Number(prevBuildRaw) || 0;

  const date = today > prevDate ? today : prevDate;
  const build = date === prevDate ? prevBuild + 1 : 1;
  return `${major}.${date}.${build}`;
}

function main() {
  const today = packDate(new Date());
  const pkg = readJson(pkgPath);
  const next = computeNextVersion(pkg.version, today);

  pkg.version = next;
  writeJson(pkgPath, pkg);

  // Keep package-lock.json's mirrored version fields in sync so they don't drift
  // from package.json between installs.
  if (fs.existsSync(lockPath)) {
    const lock = readJson(lockPath);
    if (lock.version) {
      lock.version = next;
    }
    if (lock.packages && lock.packages[''] && lock.packages[''].version) {
      lock.packages[''].version = next;
    }
    writeJson(lockPath, lock);
  }

  console.log(`wcli0-vscode version -> ${next}`);
}

// Only touch the filesystem when run as a script; requiring this module (e.g. from a
// unit test) just exposes the pure computation without side effects.
if (require.main === module) {
  main();
}

module.exports = { computeNextVersion, packDate };
