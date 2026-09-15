#!/usr/bin/env node
'use strict';
/*
 * Turns NOAA's World Magnetic Model coefficient file into the compact string
 * constant embedded in index.html as WMM_COF.
 *
 * Usage:
 *   node scripts/generate-wmm.js path/to/WMM2025.COF
 *
 * Where to get the file: https://www.ncei.noaa.gov/products/world-magnetic-model
 * (the "WMM2025COF.zip" download). The WMM is a US/UK government product in
 * the public domain — no attribution obligation, unlike the HYG star
 * catalogue, though the model and epoch are credited in the app footer
 * anyway because a user in the field may want to know which one they have.
 *
 * Output format: one space-separated run of integers, in (n,m) order with
 * n = 1..12 and m = 0..n, four per pair — g, h, g-dot, h-dot — each scaled
 * by 10 so the file's single decimal place survives as an integer. A leading
 * token carries the epoch. Chosen over JSON for size: the model is 90 pairs,
 * which is ~2.4 KB this way against ~5 KB as a JSON array of floats, and it
 * parses with one split.
 *
 * WHEN THIS EXPIRES: the WMM is re-issued every five years and WMM2025 is
 * valid 2025.0-2030.0. Past that the secular-variation extrapolation drifts
 * and declination can be off by a degree or more. Re-run this script with the
 * new .COF and paste the result in; magneticDeclination() clamps the date to
 * the model's validity window and reports when it is doing so, so an expired
 * model degrades visibly rather than silently.
 */

const fs = require('fs');

const NMAX = 12;

function parseCOF(path) {
  const text = fs.readFileSync(path, 'utf8');
  const g = [], h = [], gd = [], hd = [];
  let epoch = null;

  for (const line of text.split('\n')) {
    const t = line.trim().split(/\s+/);
    // Header: "2025.0  WMM-2025  11/13/2024"
    if (t.length === 3 && /^\d{4}\.\d+$/.test(t[0])) {
      epoch = parseFloat(t[0]);
      continue;
    }
    if (t.length !== 6) continue; // terminator lines are all 9s
    const n = +t[0], m = +t[1];
    if (!Number.isInteger(n) || !Number.isInteger(m) || n < 1 || n > NMAX || m > n) continue;
    g[n] = g[n] || []; h[n] = h[n] || []; gd[n] = gd[n] || []; hd[n] = hd[n] || [];
    g[n][m] = +t[2]; h[n][m] = +t[3]; gd[n][m] = +t[4]; hd[n][m] = +t[5];
  }

  if (epoch === null) throw new Error('no epoch header found — is this a WMM .COF file?');
  for (let n = 1; n <= NMAX; n++) {
    for (let m = 0; m <= n; m++) {
      if (!Number.isFinite(g[n] && g[n][m])) throw new Error(`missing coefficient g(${n},${m})`);
    }
  }
  return { epoch, g, h, gd, hd };
}

function encode(model) {
  const out = [String(model.epoch)];
  for (let n = 1; n <= NMAX; n++) {
    for (let m = 0; m <= n; m++) {
      // x10 so one decimal place becomes an integer; Math.round rather than
      // truncation so -1410.8 does not become -14107.
      out.push(Math.round(model.g[n][m] * 10));
      out.push(Math.round(model.h[n][m] * 10));
      out.push(Math.round(model.gd[n][m] * 10));
      out.push(Math.round(model.hd[n][m] * 10));
    }
  }
  return out.join(' ');
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: node scripts/generate-wmm.js path/to/WMM2025.COF');
    process.exit(2);
  }
  const model = parseCOF(path);
  const encoded = encode(model);
  const pairs = (encoded.split(' ').length - 1) / 4;

  console.error(`epoch ${model.epoch}, ${pairs} coefficient pairs, ${encoded.length} bytes`);
  console.error('paste the line below into index.html as the value of WMM_COF:');
  console.log(encoded);
}

if (require.main === module) main();
module.exports = { parseCOF, encode, NMAX };
