#!/usr/bin/env node
// Rasterize media/icon.svg -> media/icon.png for the VS Code Marketplace icon.
//
// The Marketplace `icon` field requires a PNG (>=128x128); SVG is not accepted
// there (unlike the activity-bar container icon). This script regenerates the
// PNG from the committed SVG source with no extra npm dependencies, using
// whichever rasterizer is available, preferred in this order:
//   1. Headless Chromium (Chrome / Edge / Chromium / chromium-browser)
//   2. ImageMagick (`magick` or `convert`)
//   3. Inkscape
//
// Usage:
//   node scripts/build-icon.mjs [--size 512] [--out media/icon.png] [--src media/icon.svg]
//
// Override the browser with the CHROME_PATH environment variable.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const opts = { size: 512, src: 'media/icon.svg', out: 'media/icon.png' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--size') opts.size = Number(argv[++i]);
    else if (a === '--src') opts.src = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!Number.isInteger(opts.size) || opts.size < 128) {
    throw new Error(`--size must be an integer >= 128 (Marketplace minimum), got ${opts.size}`);
  }
  return opts;
}

/** Find a usable Chromium binary, honoring CHROME_PATH first. */
function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    // Linux (resolved via PATH by spawn)
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'microsoft-edge',
  ].filter(Boolean);
  for (const c of candidates) {
    if (c.includes(path.sep) || c.includes('/')) {
      if (existsSync(c)) return c;
    } else if (spawnSync(c, ['--version'], { stdio: 'ignore' }).status === 0) {
      return c;
    }
  }
  return undefined;
}

/** Render via headless Chromium by screenshotting an HTML host of exact size. */
function renderWithChromium(browser, svg, size, outAbs) {
  const dir = mkdtempSync(path.join(tmpdir(), 'wcli0-icon-'));
  try {
    const host = path.join(dir, 'host.html');
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden;background:transparent}
svg{display:block;width:${size}px;height:${size}px}
</style></head><body>${svg}</body></html>`;
    writeFileSync(host, html, 'utf8');
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--default-background-color=00000000', // transparent corners
      `--screenshot=${outAbs}`,
      `--window-size=${size},${size}`,
      pathToFileURL(host).href,
    ];
    let res = spawnSync(browser, args, { stdio: 'ignore' });
    if (res.status !== 0 || !existsSync(outAbs)) {
      // Older Chromium uses --headless instead of --headless=new.
      args[0] = '--headless';
      res = spawnSync(browser, args, { stdio: 'ignore' });
    }
    return existsSync(outAbs);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Render via ImageMagick (magick/convert) if present. */
function renderWithImageMagick(srcAbs, size, outAbs) {
  for (const bin of ['magick', 'convert']) {
    const args =
      bin === 'magick'
        ? [srcAbs, '-background', 'none', '-resize', `${size}x${size}`, outAbs]
        : ['-background', 'none', srcAbs, '-resize', `${size}x${size}`, outAbs];
    const res = spawnSync(bin, args, { stdio: 'ignore' });
    if (res.status === 0 && existsSync(outAbs)) return true;
  }
  return false;
}

/** Render via Inkscape if present. */
function renderWithInkscape(srcAbs, size, outAbs) {
  const res = spawnSync(
    'inkscape',
    [srcAbs, '--export-type=png', `--export-filename=${outAbs}`, `--export-width=${size}`, `--export-height=${size}`],
    { stdio: 'ignore' },
  );
  return res.status === 0 && existsSync(outAbs);
}

/** Read a PNG's pixel dimensions from its IHDR chunk (offsets 16/20, big-endian). */
function pngSize(file) {
  const buf = readFileSync(file);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(sig)) {
    throw new Error('Output is not a valid PNG');
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const opts = parseArgs(process.argv.slice(2));
const srcAbs = path.resolve(root, opts.src);
const outAbs = path.resolve(root, opts.out);
if (!existsSync(srcAbs)) {
  console.error(`Source SVG not found: ${srcAbs}`);
  process.exit(1);
}
const svg = readFileSync(srcAbs, 'utf8');

let ok = false;
const browser = findBrowser();
if (browser) {
  console.log(`Rasterizing with Chromium: ${browser}`);
  ok = renderWithChromium(browser, svg, opts.size, outAbs);
}
if (!ok) {
  console.log('Chromium unavailable or failed; trying ImageMagick...');
  ok = renderWithImageMagick(srcAbs, opts.size, outAbs);
}
if (!ok) {
  console.log('ImageMagick unavailable or failed; trying Inkscape...');
  ok = renderWithInkscape(srcAbs, opts.size, outAbs);
}
if (!ok) {
  console.error(
    'No rasterizer succeeded. Install Chrome/Edge, ImageMagick, or Inkscape,\n' +
      'or set CHROME_PATH to a Chromium binary, then re-run `npm run build:icon`.',
  );
  process.exit(1);
}

const { width, height } = pngSize(outAbs);
if (width !== opts.size || height !== opts.size) {
  console.error(`Generated PNG is ${width}x${height}, expected ${opts.size}x${opts.size}.`);
  process.exit(1);
}
const bytes = statSync(outAbs).size;
console.log(`Wrote ${path.relative(root, outAbs)} (${width}x${height}, ${bytes} bytes)`);
