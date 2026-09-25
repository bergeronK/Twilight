#!/usr/bin/env node
/*
 * Builds MOON_FEATURES in index.html from the IAU's Gazetteer of Planetary
 * Nomenclature (USGS Astrogeology), so no coordinate is typed by hand:
 *
 *   curl -O https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.zip
 *   unzip MOON_nomenclature_center_pts.zip
 *   node scripts/generate-moon-features.js MOON_nomenclature_center_pts.dbf
 *
 * Each entry is [shown name, what it is, selenographic longitude (east +,
 * -180..180), latitude, diameter km], in the order they're worth
 * mentioning. The gazetteer's names and positions are public domain (USGS).
 */
'use strict';
const fs = require('fs');
const path = require('path');

// [IAU name, name shown, what you see when the Sun is low on it]
const PICKS = [
  ['Copernicus', 'Copernicus', 'a great crater with terraced walls and peaks in the middle'],
  ['Tycho', 'Tycho', 'a sharp young crater, the hub of the bright rays at full Moon'],
  ['Montes Apenninus', 'the Apennine Mountains', 'the Moon’s grandest mountain range'],
  ['Plato', 'Plato', 'a crater with a dark, flat floor'],
  ['Clavius', 'Clavius', 'one of the largest craters, with a curve of smaller ones inside'],
  ['Sinus Iridum', 'the Bay of Rainbows', 'a bay whose curved mountain rim catches the sunrise'],
  ['Rupes Recta', 'the Straight Wall', 'a cliff 110 km long, a thin dark line in morning light and bright in the evening'],
  ['Theophilus', 'Theophilus', 'a deep crater with mountains in the middle, one of a trio with Cyrillus and Catharina'],
  ['Archimedes', 'Archimedes', 'a flat-floored crater at the edge of the Sea of Rains'],
  ['Ptolemaeus', 'Ptolemaeus', 'a huge, flat, walled plain, first of a chain of three with Alphonsus and Arzachel'],
  ['Gassendi', 'Gassendi', 'a crater on the edge of the Sea of Moisture, its floor cracked by rilles'],
  ['Vallis Alpes', 'the Alpine Valley', 'a straight cleft cut through the lunar Alps'],
  ['Aristarchus', 'Aristarchus', 'the brightest spot on the Moon'],
  ['Posidonius', 'Posidonius', 'a crater on the edge of the Sea of Serenity'],
  ['Petavius', 'Petavius', 'a big crater with a cleft running from its centre'],
  ['Langrenus', 'Langrenus', 'a large crater near the eastern edge'],
  ['Eratosthenes', 'Eratosthenes', 'the crater at the end of the Apennine Mountains'],
  ['Schickard', 'Schickard', 'a huge, low-walled crater near the south-west edge'],
  ['Grimaldi', 'Grimaldi', 'the darkest floor on the Moon, near the western edge'],
  ['Kepler', 'Kepler', 'a small bright crater with rays'],
  ['Hipparchus', 'Hipparchus', 'an old, worn crater near the centre'],
  ['Maurolycus', 'Maurolycus', 'a large crater in the crowded southern highlands'],
  ['Proclus', 'Proclus', 'a small, brilliant crater'],
  ['Messier', 'Messier', 'a pair of small craters with twin rays like a comet’s tail']
];

function readDbf(file) {
  const b = fs.readFileSync(file);
  const n = b.readUInt32LE(4), hl = b.readUInt16LE(8), rl = b.readUInt16LE(10);
  const fields = [];
  for (let o = 32, off = 1; b[o] !== 0x0d; o += 32) {
    const len = b[o + 16];
    fields.push({ name: b.toString('latin1', o, o + 11).replace(/\0.*/, ''), off, len });
    off += len;
  }
  const rows = [];
  for (let i = 0; i < n; i++) {
    const at = hl + i * rl;
    rows.push(Object.fromEntries(fields.map(f => [f.name, b.toString('utf8', at + f.off, at + f.off + f.len).trim()])));
  }
  return rows;
}

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/generate-moon-features.js MOON_nomenclature_center_pts.dbf'); process.exit(1); }
const rows = readDbf(file);
const out = PICKS.map(([iau, shown, what]) => {
  const r = rows.filter(x => x.clean_name === iau && /^Adopted/.test(x.approval));
  if (r.length !== 1) throw new Error(`${iau}: ${r.length} matches`);
  let lon = +r[0].center_lon;
  if (lon > 180) lon -= 360;
  return [shown, what, +lon.toFixed(2), +(+r[0].center_lat).toFixed(2), Math.round(+r[0].diameter)];
});
const line = 'const MOON_FEATURES = ' + JSON.stringify(out) + ';';
const html = path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(html, 'utf8');
const re = /^const MOON_FEATURES = .*;$/m;
if (!re.test(src)) { console.log(line); process.exit(0); }
fs.writeFileSync(html, src.replace(re, line));
console.log(`MOON_FEATURES: ${out.length} features written to index.html`);
