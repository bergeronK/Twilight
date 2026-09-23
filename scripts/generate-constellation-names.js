#!/usr/bin/env node
'use strict';
/*
 * Builds constellation-names.json — the names Sky View writes across the sky,
 * one label per constellation (two for Serpens, whose halves are apart).
 *
 * Source: d3-celestial by Olaf Frohn (https://github.com/ofrohn/d3-celestial),
 * data/constellations.json, at the same pinned commit as the lines, so names
 * and lines come from one dataset under one licence (BSD 3-Clause; the notice
 * already travels in constellations.LICENSE.txt, which this script extends).
 *
 * Usage:
 *   curl -L -o /tmp/const.json \
 *     https://raw.githubusercontent.com/ofrohn/d3-celestial/7e720a3de062059d4c5400a379146a601d9010e0/data/constellations.json
 *   node scripts/generate-constellation-names.js /tmp/const.json
 *
 * Output: a JSON array of [id, name, rank, ra, dec] — IAU abbreviation, the
 * name as d3-celestial gives it ("Ursa Major", "Serpens Caput"), rank 1-3 as
 * for the lines, and the label position in degrees (ra 0..360). d3-celestial
 * places each label by hand near the figure's middle, which is better than
 * any centroid of the stick figure.
 */
const fs = require('fs');
const path = require('path');

const [src] = process.argv.slice(2);
if (!src) { console.error('usage: generate-constellation-names.js <constellations.json>'); process.exit(1); }
const geo = JSON.parse(fs.readFileSync(src, 'utf8'));
if (geo.type !== 'FeatureCollection') throw new Error('expected a GeoJSON FeatureCollection');
const r2 = x => Math.round(x * 100) / 100;
const out = geo.features.map(f => {
  if (!/^[A-Za-z]{3}$/.test(f.id)) throw new Error(`unexpected id ${JSON.stringify(f.id)}`);
  if (!f.geometry || f.geometry.type !== 'Point') throw new Error(`${f.id}: expected a Point`);
  const [ra, dec] = f.geometry.coordinates;
  const name = f.properties && f.properties.name;
  if (!name) throw new Error(`${f.id}: no name`);
  return [f.id, name, parseInt(f.properties.rank, 10) || 3, r2(((ra % 360) + 360) % 360), r2(dec)];
});
const root = path.join(__dirname, '..');
fs.writeFileSync(path.join(root, 'constellation-names.json'), JSON.stringify(out) + '\n');
console.log(`constellation-names.json: ${out.length} labels`);
