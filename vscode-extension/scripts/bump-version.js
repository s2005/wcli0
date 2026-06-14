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

// Pack today's local date into a single YYYYMMDD integer (e.g. 20260614).
const now = new Date();
const today = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

const pkg = readJson(pkgPath);
const [majorRaw, prevDateRaw, prevBuildRaw] = String(pkg.version || '0.0.0').split('.');
const major = Number(majorRaw) || 0;
const prevDate = Number(prevDateRaw) || 0;
const prevBuild = Number(prevBuildRaw) || 0;

const build = prevDate === today ? prevBuild + 1 : 1;
const next = `${major}.${today}.${build}`;

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
