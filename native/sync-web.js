#!/usr/bin/env node
'use strict';
/*
 * Stages the web app into www/ for Capacitor. The PWA is authored one
 * directory up as a flat set of static files; this copies exactly what the
 * app needs at runtime (not repo tooling, store screenshots, or CI files),
 * so www/ can be regenerated at any time and stays out of version control.
 *
 * Run via `npm run sync` (which also runs `cap sync`) after any web change.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'www');

const FILES = [
  'index.html',
  'manifest.json',
  'bortle-cities.bin',
  'icon-192.png',
  'icon-512.png',
  'icon-512-maskable.png',
  'apple-touch-icon.png',
  'fonts/inter-var.woff2',
  'fonts/cormorant.woff2',
  'fonts/cormorant-i.woff2',
  'fonts/spacegrotesk.woff2',
  'fonts/spectral-300.woff2',
  'fonts/spectral-400.woff2',
  'fonts/spectral-500.woff2'
];
// sw.js is deliberately NOT staged: index.html skips service-worker
// registration under Capacitor (assets are bundled, so there is nothing
// for a SW to cache), and omitting the file makes that explicit.

fs.rmSync(OUT, { recursive: true, force: true });
for (const f of FILES) {
  const src = path.join(ROOT, f);
  const dst = path.join(OUT, f);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}
console.log(`staged ${FILES.length} files into ${OUT}`);
