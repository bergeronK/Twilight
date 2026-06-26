#!/usr/bin/env node
'use strict';
/*
 * Build guard for the Twilight single-file PWA.
 *
 * The page ships a strict Content-Security-Policy with no 'unsafe-inline' for
 * scripts: every executable inline <script> must be allow-listed by its
 * SHA-256 hash in the CSP <meta> tag. If index.html is edited but the hashes
 * are not recomputed, the browser silently refuses to run the app. This script
 * fails CI when that drift exists, so a broken build can never ship.
 *
 * It also syntax-checks every inline script and asserts the expected count, to
 * catch a stray inline <script> that wasn't intended to be there.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'index.html');
const EXPECTED_SCRIPT_COUNT = 5;

let html;
try {
  html = fs.readFileSync(FILE, 'utf8');
} catch (e) {
  fail(`cannot read ${FILE}: ${e.message}`);
}

const errors = [];
function fail(msg) { console.error('✗ ' + msg); process.exit(1); }
function bad(msg) { errors.push(msg); }

// Executable inline scripts are attribute-less <script> ... </script> blocks.
// (e.g. <script type="application/ld+json"> data blocks are NOT executable and
// are correctly excluded by requiring the bare `<script>` open tag.)
const re = /<script>([\s\S]*?)<\/script>/g;
const blocks = [];
let m;
while ((m = re.exec(html)) !== null) blocks.push(m[1]);

if (blocks.length !== EXPECTED_SCRIPT_COUNT) {
  bad(`expected ${EXPECTED_SCRIPT_COUNT} inline <script> blocks, found ${blocks.length}`);
}

// Syntax-check each block.
blocks.forEach((src, i) => {
  try { new Function(src); }
  catch (e) { bad(`inline <script> #${i + 1} has a syntax error: ${e.message}`); }
});

// Compute the hashes the CSP must contain.
const expected = blocks.map(
  src => `'sha256-${crypto.createHash('sha256').update(src, 'utf8').digest('base64')}'`
);

// Extract the script-src directive from the CSP meta tag.
const cspMatch = html.match(/Content-Security-Policy"\s+content="([^"]*)"/);
if (!cspMatch) {
  bad('no Content-Security-Policy <meta> tag found');
} else {
  const directive = (cspMatch[1].match(/script-src([^;]*)/) || [])[1] || '';
  const present = directive.match(/'sha256-[A-Za-z0-9+/=]+'/g) || [];
  const presentSet = new Set(present);
  for (const h of expected) {
    if (!presentSet.has(h)) bad(`CSP is missing hash for an inline script: ${h}`);
  }
  for (const h of present) {
    if (!expected.includes(h)) bad(`CSP has a stale hash not matching any inline script: ${h}`);
  }
}

if (errors.length) {
  errors.forEach(e => console.error('✗ ' + e));
  console.error(`\nBuild guard FAILED. Recompute the CSP hashes after editing inline scripts.`);
  process.exit(1);
}

console.log(`✓ ${blocks.length} inline scripts parse cleanly and all CSP SHA-256 hashes match.`);
