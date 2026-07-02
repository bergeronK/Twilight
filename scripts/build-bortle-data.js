#!/usr/bin/env node
'use strict';
/*
 * Regenerates bortle-cities.bin, the compact city+population dataset used to
 * estimate a Bortle dark-sky class from a device's raw lat/lon (see
 * estimateBortle() in index.html). Not run in CI — it's a manual maintenance
 * step for when the source data should be refreshed.
 *
 * Input: worldcities.csv from https://github.com/condwanaland/worldcities
 * (data-raw/worldcities.csv), itself sourced from the SimpleMaps Basic World
 * Cities Database (CC BY 4.0, https://simplemaps.com/data/world-cities).
 *
 * Usage: node scripts/build-bortle-data.js /path/to/worldcities.csv
 *
 * Output format (little-endian):
 *   uint32   cityCount
 *   int16[]  lat * 100, one per city
 *   int16[]  lon * 100, one per city
 *   uint32[] population, one per city
 * Cities below POP_MIN contribute negligibly at any distance worth modeling
 * and are dropped to keep the asset small (~100KB for a 30,000 threshold).
 */
const fs = require('fs');
const path = require('path');

const POP_MIN = 30000;
const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/build-bortle-data.js /path/to/worldcities.csv');
  process.exit(1);
}

function parseCSVLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

const lines = fs.readFileSync(input, 'utf8').split('\n');
const cities = [];
for (let i = 1; i < lines.length; i++) {
  const l = lines[i];
  if (!l.trim()) continue;
  const f = parseCSVLine(l);
  const pop = parseInt(f[9], 10) || 0;
  const lat = parseFloat(f[2]), lng = parseFloat(f[3]);
  if (pop < POP_MIN || Number.isNaN(lat) || Number.isNaN(lng)) continue;
  cities.push({ lat, lng, pop });
}

const n = cities.length;
const buf = Buffer.alloc(4 + n * 2 + n * 2 + n * 4);
let off = 0;
buf.writeUInt32LE(n, off); off += 4;
for (const c of cities) { buf.writeInt16LE(Math.round(c.lat * 100), off); off += 2; }
for (const c of cities) { buf.writeInt16LE(Math.round(c.lng * 100), off); off += 2; }
for (const c of cities) { buf.writeUInt32LE(Math.min(c.pop, 0xffffffff), off); off += 4; }

const out = path.join(__dirname, '..', 'bortle-cities.bin');
fs.writeFileSync(out, buf);
console.log(`wrote ${out}: ${n} cities (pop >= ${POP_MIN}), ${buf.length} bytes`);
