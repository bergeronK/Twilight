#!/usr/bin/env node
'use strict';
/*
 * Builds stars.bin — the background star catalogue Sky View draws behind the
 * 57 navigational stars.
 *
 * Source: the HYG database (https://github.com/astronexus/HYG-Database),
 * licensed CC BY-SA 4.0. That licence is why this is a build step against a
 * file you download rather than a vendored copy: the derived stars.bin ships
 * under CC BY-SA 4.0 too (see stars.LICENSE.txt, written alongside it), while
 * the app's own code is unaffected. Keep the attribution in index.html's
 * footer if you regenerate this.
 *
 * Usage:
 *   curl -L -o /tmp/hyg.csv \
 *     https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv
 *   node scripts/generate-star-catalog.js /tmp/hyg.csv
 *
 * Format (all little-endian), chosen to stay small enough to fetch on a phone:
 *   u32  count
 *   u16  ra[count]       RA  scaled by 65536/360   (~20" resolution)
 *   i16  dec[count]      dec scaled by 32767/90    (~10" resolution)
 *   i8   mag[count]      visual magnitude x10
 *   u8   nameLen[count]  0 when the star has no proper name
 *   ...  UTF-8 name bytes, concatenated in row order
 *
 * Both resolutions are far finer than a phone screen can show: a 63-degree
 * field over ~800px is ~0.08 deg/px, roughly 15x coarser than the RA step.
 */
const fs = require('fs');
const path = require('path');

const MAG_LIMIT = 5.0;          // naked-eye-ish; 1637 stars, ~12 KB encoded
const DEDUPE_ARCMIN = 3;        // drop catalogue stars that are a nav star

const src = process.argv[2];
if (!src) { console.error('usage: generate-star-catalog.js <hygdata.csv>'); process.exit(1); }

const root = path.join(__dirname, '..');

// Pull NAV_STARS straight out of index.html so the two lists can't drift:
// anything already drawn (and labelled) as a navigational star must not be
// drawn a second time from the catalogue.
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const navBlock = html.match(/const NAV_STARS = \[([\s\S]*?)\n\];/);
if (!navBlock) throw new Error('NAV_STARS not found in index.html');
const nav = [...navBlock[1].matchAll(/\["([^"]+)",([-\d.]+),([-\d.]+),([-\d.]+)\]/g)]
  .map(m => ({ name: m[1], ra: parseFloat(m[2]) * 15, dec: parseFloat(m[3]) }));
if (!nav.length) throw new Error('parsed zero NAV_STARS');

const D2R = Math.PI / 180;
const sepDeg = (a1, d1, a2, d2) => {
  const c = Math.sin(d1 * D2R) * Math.sin(d2 * D2R) +
            Math.cos(d1 * D2R) * Math.cos(d2 * D2R) * Math.cos((a1 - a2) * D2R);
  return Math.acos(Math.max(-1, Math.min(1, c))) / D2R;
};

// Minimal CSV field splitter — HYG quotes only some fields and never embeds
// newlines, so a full parser would be overkill.
function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const lines = fs.readFileSync(src, 'utf8').split('\n');
const cols = splitCsv(lines[0]).map(s => s.replace(/"/g, '').trim());
const iId = cols.indexOf('id'), iRa = cols.indexOf('ra'), iDec = cols.indexOf('dec');
const iMag = cols.indexOf('mag'), iProper = cols.indexOf('proper');
if ([iId, iRa, iDec, iMag, iProper].some(i => i < 0)) throw new Error('unexpected HYG columns');

const stars = [];
let dropped = 0;
for (let i = 1; i < lines.length; i++) {
  if (!lines[i]) continue;
  const f = splitCsv(lines[i]);
  if (f[iId] === '0') continue;                    // the Sun
  const mag = parseFloat(f[iMag]);
  if (!(mag <= MAG_LIMIT)) continue;
  const ra = parseFloat(f[iRa]) * 15;              // HYG stores RA in hours
  const dec = parseFloat(f[iDec]);
  if (!isFinite(ra) || !isFinite(dec)) continue;
  if (nav.some(n => sepDeg(ra, dec, n.ra, n.dec) * 60 < DEDUPE_ARCMIN)) { dropped++; continue; }
  stars.push({ ra, dec, mag, name: (f[iProper] || '').trim() });
}
// Brightest first: the renderer draws faintest-first for correct overlap, but
// a stable known order makes the file diffable between regenerations.
stars.sort((a, b) => a.mag - b.mag || a.ra - b.ra);

const n = stars.length;
const nameBufs = stars.map(s => Buffer.from(s.name, 'utf8'));
nameBufs.forEach((b, i) => { if (b.length > 255) nameBufs[i] = b.slice(0, 255); });
const namesTotal = nameBufs.reduce((s, b) => s + b.length, 0);

const buf = Buffer.alloc(4 + n * 2 + n * 2 + n + n + namesTotal);
let o = 0;
buf.writeUInt32LE(n, o); o = 4;
stars.forEach(s => { buf.writeUInt16LE(Math.round(s.ra / 360 * 65536) & 0xFFFF, o); o += 2; });
stars.forEach(s => { buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(s.dec / 90 * 32767))), o); o += 2; });
stars.forEach(s => { buf.writeInt8(Math.max(-128, Math.min(127, Math.round(s.mag * 10))), o); o += 1; });
nameBufs.forEach(b => { buf.writeUInt8(b.length, o); o += 1; });
nameBufs.forEach(b => { b.copy(buf, o); o += b.length; });
if (o !== buf.length) throw new Error('size mismatch: wrote ' + o + ' of ' + buf.length);

fs.writeFileSync(path.join(root, 'stars.bin'), buf);
fs.writeFileSync(path.join(root, 'stars.LICENSE.txt'),
`stars.bin — background star catalogue for Twilight's Sky View

Derived from the HYG database (https://github.com/astronexus/HYG-Database),
compiled by David Nash from the Hipparcos, Yale Bright Star and Gliese
catalogues.

Because it is a filtered subset of a CC BY-SA database, this data file is
itself licensed:

    Creative Commons Attribution-ShareAlike 4.0 International
    https://creativecommons.org/licenses/by-sa/4.0/

This licence applies to stars.bin only. Twilight's own source is unaffected.

Contents: stars to visual magnitude ${MAG_LIMIT.toFixed(1)}, excluding the 57
navigational stars already carried in index.html. Regenerate with
scripts/generate-star-catalog.js.
`);

console.log(`${n} stars (mag <= ${MAG_LIMIT}), ${dropped} deduped against NAV_STARS`);
console.log(`${stars.filter(s => s.name).length} with proper names`);
console.log(`stars.bin: ${(buf.length / 1024).toFixed(1)} KB`);
