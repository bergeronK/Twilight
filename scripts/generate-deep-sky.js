#!/usr/bin/env node
'use strict';
/*
 * Builds deep-sky.json: the Messier catalogue (galaxies, nebulae, star
 * clusters) for Sky View and Find.
 *
 * Source: d3-celestial by Olaf Frohn (https://github.com/ofrohn/d3-celestial),
 * data/messier.json, at the same pinned commit as the constellations and the
 * Milky Way, under the same BSD 3-Clause licence (constellations.LICENSE.txt,
 * which names this output too).
 *
 * Usage:
 *   curl -L -o /tmp/messier.json \
 *     https://raw.githubusercontent.com/ofrohn/d3-celestial/7e720a3de062059d4c5400a379146a601d9010e0/data/messier.json
 *   node scripts/generate-deep-sky.js /tmp/messier.json
 *
 * Output: a JSON array of [id, name, type, mag, ra, dec, size]. id "M31";
 * name the common name, or "" where there isn't one; type one of the
 * d3-celestial codes (gc globular cluster, oc open cluster, sfr star-forming
 * nebula, pn planetary nebula, snr supernova remnant, rn reflection nebula,
 * s/e/i spiral/elliptical/irregular galaxy, pos star group); integrated
 * magnitude; ra 0..360 and dec in degrees; the larger dimension in
 * arcminutes (0 if not given).
 */
const fs = require('fs');
const path = require('path');

// Names as a casual stargazer knows them. d3-celestial's are catalogue-style
// ("Andromeda", "Praesepe") or use a spacing accent for the apostrophe.
const NAMES = {
  M24: 'Sagittarius Star Cloud', M31: 'Andromeda Galaxy', M33: 'Triangulum Galaxy',
  M44: 'Beehive Cluster', M51: 'Whirlpool Galaxy', M64: 'Black Eye Galaxy',
  M73: '', M77: '', M101: 'Pinwheel Galaxy', M102: 'Spindle Galaxy', M104: 'Sombrero Galaxy'
};

const [src] = process.argv.slice(2);
if (!src) { console.error('usage: generate-deep-sky.js <messier.json>'); process.exit(1); }
const geo = JSON.parse(fs.readFileSync(src, 'utf8'));
if (geo.type !== 'FeatureCollection') throw new Error('expected a GeoJSON FeatureCollection');
const r2 = x => Math.round(x * 100) / 100;
const out = geo.features.map(f => {
  if (!/^M\d{1,3}$/.test(f.id)) throw new Error(`unexpected id ${JSON.stringify(f.id)}`);
  const p = f.properties || {};
  const [ra, dec] = f.geometry.coordinates;
  let name = f.id in NAMES ? NAMES[f.id] : (p.alt || '');
  name = name.replace(/[´']/g, '’').trim();
  const size = Math.max(0, ...String(p.dim || '').split('x').map(Number).filter(Number.isFinite));
  return [f.id, name, p.type, Number(p.mag), r2(((ra % 360) + 360) % 360), r2(dec), size];
});
if (out.length !== 110) throw new Error(`expected 110 Messier objects, got ${out.length}`);
fs.writeFileSync(path.join(__dirname, '..', 'deep-sky.json'), JSON.stringify(out) + '\n');
console.log(`wrote deep-sky.json: ${out.length} objects, ${out.filter(o => o[1]).length} named`);
