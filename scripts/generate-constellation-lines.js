#!/usr/bin/env node
'use strict';
/*
 * Builds constellations.bin — the stick-figure lines Sky View draws between
 * the stars, so the sky reads as constellations rather than a scatter of dots.
 *
 * Source: d3-celestial by Olaf Frohn (https://github.com/ofrohn/d3-celestial),
 * data/constellations.lines.json, BSD 3-Clause. The licence asks that the
 * copyright notice travel with redistributions, so this writes
 * constellations.LICENSE.txt beside the output, and index.html's footer
 * credits it. It places no conditions on the app's own code.
 *
 * Usage (pin the commit, so a regenerate reads the same input):
 *   curl -L -o /tmp/lines.json \
 *     https://raw.githubusercontent.com/ofrohn/d3-celestial/7e720a3de062059d4c5400a379146a601d9010e0/data/constellations.lines.json
 *   curl -L -o /tmp/d3c-LICENSE \
 *     https://raw.githubusercontent.com/ofrohn/d3-celestial/7e720a3de062059d4c5400a379146a601d9010e0/LICENSE
 *   node scripts/generate-constellation-lines.js /tmp/lines.json /tmp/d3c-LICENSE
 *
 * The source is GeoJSON: one MultiLineString per constellation, vertices as
 * [ra, dec] in degrees with ra in -180..180. Each polyline is drawn as-is;
 * Sky View's pinhole projection maps great circles to straight lines, so a
 * straight segment between two projected vertices is exact.
 *
 * Format (all little-endian):
 *   u16  nConst, u16 nPoly, u16 nPts
 *   nConst x { 3 ASCII bytes IAU abbreviation, u8 rank, u8 polylines }
 *   u8   polylineLength[nPoly]           vertices per polyline, in order
 *   u16  ra[nPts]    RA  scaled by 65536/360   (same scaling as stars.bin)
 *   i16  dec[nPts]   dec scaled by 32767/90
 * rank is d3-celestial's: 1 = prominent, 2, 3 = faint constellations.
 */
const fs = require('fs');
const path = require('path');

const [src, licence] = process.argv.slice(2);
if (!src || !licence) {
  console.error('usage: generate-constellation-lines.js <constellations.lines.json> <d3-celestial LICENSE>');
  process.exit(1);
}
const root = path.join(__dirname, '..');
const geo = JSON.parse(fs.readFileSync(src, 'utf8'));
if (geo.type !== 'FeatureCollection') throw new Error('expected a GeoJSON FeatureCollection');

const consts = [];
const lengths = [];
const pts = [];
for (const f of geo.features) {
  if (!f.geometry || f.geometry.type !== 'MultiLineString') throw new Error(`${f.id}: expected MultiLineString`);
  if (!/^[A-Za-z]{3}$/.test(f.id)) throw new Error(`unexpected constellation id ${JSON.stringify(f.id)}`);
  const lines = f.geometry.coordinates;
  if (lines.length > 255) throw new Error(`${f.id}: too many polylines`);
  consts.push({ id: f.id, rank: parseInt(f.properties && f.properties.rank, 10) || 3, n: lines.length });
  for (const line of lines) {
    if (line.length < 2 || line.length > 255) throw new Error(`${f.id}: polyline of ${line.length} vertices`);
    lengths.push(line.length);
    for (const [ra, dec] of line) pts.push([((ra % 360) + 360) % 360, dec]);
  }
}
if (consts.length > 65535 || lengths.length > 65535 || pts.length > 65535) throw new Error('too large for u16 counts');

const size = 6 + consts.length * 5 + lengths.length + pts.length * 4;
const buf = Buffer.alloc(size);
let o = 0;
buf.writeUInt16LE(consts.length, o); o += 2;
buf.writeUInt16LE(lengths.length, o); o += 2;
buf.writeUInt16LE(pts.length, o); o += 2;
for (const c of consts) {
  buf.write(c.id, o, 3, 'ascii'); o += 3;
  buf.writeUInt8(c.rank, o++);
  buf.writeUInt8(c.n, o++);
}
for (const n of lengths) buf.writeUInt8(n, o++);
for (const [ra] of pts) { buf.writeUInt16LE(Math.round(ra * 65536 / 360) % 65536, o); o += 2; }
for (const [, dec] of pts) { buf.writeInt16LE(Math.round(dec * 32767 / 90), o); o += 2; }
if (o !== size) throw new Error(`wrote ${o} bytes, expected ${size}`);

fs.writeFileSync(path.join(root, 'constellations.bin'), buf);
fs.writeFileSync(
  path.join(root, 'constellations.LICENSE.txt'),
  'constellations.bin is derived from data/constellations.lines.json in\n' +
  'd3-celestial (https://github.com/ofrohn/d3-celestial), commit\n' +
  '7e720a3de062059d4c5400a379146a601d9010e0, by scripts/generate-constellation-lines.js.\n' +
  'It is redistributed under the original licence, reproduced below.\n\n' +
  fs.readFileSync(licence, 'utf8').replace(/\r\n/g, '\n').trimEnd() + '\n'
);
console.log(`constellations.bin: ${consts.length} constellations, ${lengths.length} polylines, ` +
  `${pts.length} vertices, ${size} bytes`);
