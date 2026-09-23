#!/usr/bin/env node
'use strict';
/*
 * Builds milkyway.bin — how bright the Milky Way is across the whole sky,
 * as a 1° grid, for the Console painting and the Stars tab's sky chart.
 *
 * Source: d3-celestial by Olaf Frohn (https://github.com/ofrohn/d3-celestial),
 * data/mw.json, at the same pinned commit as the constellation lines and
 * names (BSD 3-Clause; constellations.LICENSE.txt, which already travels with
 * the data, names this output too). mw.json is five nested isophotes of the
 * Milky Way's surface brightness, ol1 (faint outer edge) to ol5 (the
 * brightest star clouds), as GeoJSON MultiPolygons in [RA, Dec] degrees with
 * RA from -180 to 180.
 *
 * Usage:
 *   curl -L -o /tmp/mw.json \
 *     https://raw.githubusercontent.com/ofrohn/d3-celestial/7e720a3de062059d4c5400a379146a601d9010e0/data/mw.json
 *   node scripts/generate-milky-way.js /tmp/mw.json
 *
 * Each cell's value is how many isophotes cover it, averaged over 4x4 samples
 * inside the cell and scaled to 0..250 (250 = inside all five). Filled column
 * by column with the even-odd rule, since the band's two edges run all the way
 * round the sky in RA: an edge that jumps from RA +180 to -180 crosses the
 * seam, and is taken the short way round.
 *
 * Format (little-endian): uint16 W (360), uint16 H (180), then run-length
 * pairs [value, count] (count 1..255) covering W*H cells, row by row from
 * Dec -90 upward; cell (i, j) is centred on RA i + 0.5, Dec j - 89.5.
 */
const fs = require('fs');
const path = require('path');

const [src] = process.argv.slice(2);
if (!src) { console.error('usage: generate-milky-way.js <mw.json>'); process.exit(1); }
const geo = JSON.parse(fs.readFileSync(src, 'utf8'));
if (geo.type !== 'FeatureCollection' || geo.features.length !== 5) throw new Error('expected five isophotes');

const W = 360, H = 180, SS = 4;
const levels = new Float32Array(W * H);
// Each isophote's edges as [lon0, lat0, lon1, lat1], in RA 0..360.
const edgesOf = f => {
  const out = [];
  for (const poly of f.geometry.coordinates) for (const ring of poly) {
    // Each vertex's RA is worked out once and carried along the ring, so the
    // end of one edge and the start of the next are the same number: two
    // roundings of one vertex let a column slip between them, or cross twice.
    let u = (ring[0][0] + 360) % 360;
    for (let k = 0; k + 1 < ring.length; k++) {
      let d = ring[k + 1][0] - ring[k][0];
      if (Math.abs(d) > 180) d -= 360 * Math.sign(d); // across RA ±180: the short way round
      out.push([u, ring[k][1], u + d, ring[k + 1][1]]);
      u += d;
    }
  }
  return out;
};
for (const f of geo.features) {
  const edges = edgesOf(f);
  for (let i = 0; i < W; i++) for (let si = 0; si < SS; si++) {
    const ra = i + (si + 0.5) / SS + 1e-7; // off the 0.125° lattice the data's vertices sit on
    // Where this column crosses the isophote's edges, as declinations.
    const xs = [];
    for (const [a0, b0, a1, b1] of edges) {
      for (const L of [ra, ra - 360, ra + 360]) {
        if ((a0 <= L && L < a1) || (a1 <= L && L < a0)) xs.push(b0 + (b1 - b0) * (L - a0) / (a1 - a0));
      }
    }
    xs.sort((p, q) => p - q);
    for (let j = 0; j < H; j++) for (let sj = 0; sj < SS; sj++) {
      const dec = j - 90 + (sj + 0.5) / SS;
      let n = 0;
      for (const x of xs) if (x < dec) n++;
      if (n % 2) levels[j * W + i] += 1 / (SS * SS);
    }
  }
}
const vals = Array.from(levels, v => Math.round(v / 5 * 250));
const bytes = [W & 255, W >> 8, H & 255, H >> 8];
for (let k = 0; k < vals.length;) {
  let n = 1;
  while (k + n < vals.length && vals[k + n] === vals[k] && n < 255) n++;
  bytes.push(vals[k], n);
  k += n;
}
const root = path.join(__dirname, '..');
fs.writeFileSync(path.join(root, 'milkyway.bin'), Buffer.from(bytes));
const lit = vals.filter(v => v > 0).length;
console.log(`milkyway.bin: ${bytes.length} bytes, ${lit} of ${W * H} cells lit (${(100 * lit / (W * H)).toFixed(1)}%)`);
