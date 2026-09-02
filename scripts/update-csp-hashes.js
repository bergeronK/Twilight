#!/usr/bin/env node
'use strict';
/*
 * Rewrite the CSP script-src hashes in index.html to match its inline scripts.
 *
 * The counterpart to scripts/verify-build.js: that one fails when the hashes
 * have drifted, this one fixes them. Extraction is deliberately identical to
 * verify-build.js (bare `<script>` blocks only, so the ld+json data block is
 * excluded) — if the two ever disagree about what counts as an executable
 * script, the guard passes on a set of hashes the browser will reject.
 *
 * Run after ANY edit to an inline script, then run verify-build.js.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(path.resolve(__dirname, '..'), 'index.html');
const html = fs.readFileSync(FILE, 'utf8');

const blocks = [];
const re = /<script>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html)) !== null) blocks.push(m[1]);
if (blocks.length !== 5) {
  console.error(`✗ expected 5 inline <script> blocks, found ${blocks.length} — refusing to guess.`);
  process.exit(1);
}

const hashes = blocks.map(
  src => `'sha256-${crypto.createHash('sha256').update(src, 'utf8').digest('base64')}'`
);

const cspMatch = html.match(/(Content-Security-Policy"\s+content=")([^"]*)(")/);
if (!cspMatch) { console.error('✗ no Content-Security-Policy <meta> tag found'); process.exit(1); }

const csp = cspMatch[2];
const srcMatch = csp.match(/script-src ([^;]*)/);
if (!srcMatch) { console.error('✗ CSP has no script-src directive'); process.exit(1); }

// Keep every non-hash token (self, keywords, hosts) exactly as authored and in
// order; replace only the sha256 allow-list.
const kept = srcMatch[1].trim().split(/\s+/).filter(t => !/^'sha256-/.test(t));
const rebuilt = `script-src ${kept.concat(hashes).join(' ')}`;
const newCsp = csp.replace(/script-src [^;]*/, rebuilt);

if (newCsp === csp) { console.log('• hashes already current, nothing to do'); process.exit(0); }
fs.writeFileSync(FILE, html.replace(cspMatch[0], cspMatch[1] + newCsp + cspMatch[3]));
console.log(`✓ rewrote script-src with ${hashes.length} hashes`);
