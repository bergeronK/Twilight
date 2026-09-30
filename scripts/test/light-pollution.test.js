'use strict';
/*
 * Light pollution from satellite night lights (2026-09-29). The Bortle class
 * came from nearby town populations, which put Cherry Springs, a Bortle 2
 * dark-sky park, at 4. scripts/light-pollution/lp.py builds tiles from what
 * the VIIRS satellite measures; the app reads the one tile a place needs.
 *
 * These read a fixture the Python pipeline wrote (`lp.py fixture`: one town,
 * through the real light-spread model and tile writer) with the app's own
 * reader, so the two sides can't drift apart: the byte layout, the q scale,
 * the class boundaries. Then the real tiles, read the same way at the
 * reference sites the pipeline was calibrated against.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extract, declSource } = require('./extract.js');

const m = extract(['LP_SQM', 'LP_RATIO', 'lpBortle', 'decodeLpTile', 'lpRatioAt', 'skyBortle']);
const FIX = path.join(__dirname, 'fixtures', 'lp');
const expect = JSON.parse(fs.readFileSync(path.join(FIX, 'expect.json'), 'utf8'));
const files = (dir, fail = () => false) => async (p, kind) => {
  if (fail(p)) return null;
  const f = path.join(dir, p.replace(/^lp\//, ''));
  if (!fs.existsSync(f)) return null;
  const b = fs.readFileSync(f);
  return kind === 'json' ? JSON.parse(b.toString('utf8')) : b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
};
const qOf = r => r > 0 ? Math.round(20 * (Math.log10(r) + 3)) : 0;

test('the class boundaries are the pipeline’s: the same SQM table, over the same natural sky', () => {
  const py = fs.readFileSync(path.join(__dirname, '..', 'light-pollution', 'lp.py'), 'utf8');
  const bounds = JSON.parse(py.match(/^SQM_BOUNDS = (\[[^\]]+\])/m)[1]);
  assert.deepStrictEqual(m.LP_SQM, bounds);
  assert.match(py, /^NAT_SQM = 22\.0/m);
  // Just under and just over each boundary.
  m.LP_RATIO.forEach((r, i) => {
    assert.strictEqual(m.lpBortle(r * 0.99), i + 1, `below ${m.LP_SQM[i]}`);
    assert.strictEqual(m.lpBortle(r * 1.01), i + 2, `above ${m.LP_SQM[i]}`);
  });
  assert.strictEqual(m.lpBortle(0), 1);
  assert.strictEqual(m.lpBortle(1e6), 9);
  // A 20.49 reading is the 4|5 edge: 3 times the natural brightness added.
  assert.ok(Math.abs(m.LP_RATIO[3] - 3.018) < 0.001);
});

test('the fixture town reads back as the pipeline wrote it, class by class, out from its centre', async () => {
  const get = files(FIX);
  for (const p of expect.points) {
    const r = await m.skyBortle(p.lat, p.lon, get);
    assert.ok(r, `${p.km} km`);
    assert.strictEqual(qOf(r.ratio), p.q, `${p.km} km north: q`);
    assert.strictEqual(r.bortle, p.bortle, `${p.km} km north: class`);
  }
  // It falls away from the town: 9 in it, 1 by 100 km.
  const cls = expect.points.map(p => p.bortle);
  assert.strictEqual(cls[0], 9);
  for (let i = 1; i < cls.length; i++) assert.ok(cls[i] <= cls[i - 1]);
  assert.strictEqual(expect.points.find(p => p.km === 100).bortle, 1);
});

test('a cell’s value is at its centre, both ways, and edges hold their cell', () => {
  // A 2 x 2 tile, one cell per degree, south-west corner at (10, 20):
  // q 0 | 40 on the south row, 20 | 60 on the north.
  const t = { W: 2, H: 2, v: Uint8Array.from([0, 40, 20, 60]) };
  const q = (lat, lon) => { const r = m.lpRatioAt(t, 1, 10, 20, lat, lon); return r > 0 ? Math.round(20 * (Math.log10(r) + 3)) : 0; };
  assert.strictEqual(q(10.5, 20.5), 0, 'south-west centre');
  assert.strictEqual(q(10.5, 21.5), 40, 'south-east centre');
  assert.strictEqual(q(11.5, 20.5), 20, 'north-west centre');
  assert.strictEqual(q(11.5, 21.5), 60, 'north-east centre');
  assert.strictEqual(q(10.5, 21.0), 20, 'halfway east');
  assert.strictEqual(q(11.0, 20.5), 10, 'halfway north');
  assert.strictEqual(q(10.1, 21.9), 40, 'past the last centre, the edge cell');
});

test('between cell centres the reading is between its neighbours', async () => {
  const get = files(FIX);
  const [a, b] = [expect.points[1], expect.points[2]]; // 10 and 25 km north
  const mid = await m.skyBortle((a.lat + b.lat) / 2, a.lon, get);
  const q = 20 * (Math.log10(mid.ratio) + 3);
  assert.ok(q < a.q && q > b.q, `${q.toFixed(1)} between ${a.q} and ${b.q}`);
});

test('natural sky where no tile is listed; the town estimate (null) where the tiles can’t say', async () => {
  const get = files(FIX);
  assert.deepStrictEqual(await m.skyBortle(45, 5, get), { bortle: 1, ratio: 0 }, 'a tile with no light');
  assert.strictEqual(await m.skyBortle(55, -100, get), null, 'north of the latitudes covered');
  assert.strictEqual(await m.skyBortle(50, -100, get), null, 'the north edge is outside');
  assert.strictEqual(await m.skyBortle(40.25, -99.75, files(FIX, p => p.endsWith('index.json'))), null, 'no index');
  assert.strictEqual(await m.skyBortle(40.25, -99.75, files(FIX, p => p.endsWith('.bin'))), null, 'a tile that won’t load');
  const broken = async (p, kind) => kind === 'json' ? { tile: 10, res: 30, lat: [30, 50], tiles: ['40_-100'] } : new Uint8Array([44, 1, 44, 1, 0, 5]).buffer;
  assert.strictEqual(await m.skyBortle(40.25, -99.75, broken), null, 'runs that don’t fill the tile');
});

test('longitudes wrap, and each place finds its own tile', async () => {
  const seen = [];
  const get = async (p, kind) => { seen.push(p); return kind === 'json' ? { tile: 10, res: 30, lat: [-65, 75], tiles: [] } : null; };
  await m.skyBortle(40.25, -99.75, get);
  await m.skyBortle(-33.9, 151.2, get);
  await m.skyBortle(10, 180, get);
  await m.skyBortle(10, -180, get);
  await m.skyBortle(-0.5, -0.5, get);
  assert.deepStrictEqual(seen.filter(p => p.endsWith('.bin')), [], 'unlisted tiles are never fetched');
  const listed = async (p, kind) => { seen.push(p); return kind === 'json' ? { tile: 10, res: 30, lat: [-65, 75], tiles: ['40_-100', '-40_150', '10_-180', '-10_-10'] } : null; };
  seen.length = 0;
  for (const [la, lo] of [[40.25, -99.75], [-33.9, 151.2], [10, 180], [10, -180], [-0.5, -0.5]]) await m.skyBortle(la, lo, listed);
  assert.deepStrictEqual(seen.filter(p => p.endsWith('.bin')),
    ['lp/40_-100.bin', 'lp/-40_150.bin', 'lp/10_-180.bin', 'lp/10_-180.bin', 'lp/-10_-10.bin']);
});

test('the Console asks the satellite tiles first, the towns where they can’t say, and says which', () => {
  const rt = declSource('RealtimeTwilight');
  assert.match(rt, /skyBortle\(loc\.lat, loc\.lon\)\s*\.then\(r => r \? \{ b: r\.bortle, from: 'satellite' \}\s*: loadBortleCities\(\)\.then\(data => \(\{ b: estimateBortle\(loc\.lat, loc\.lon, data\), from: 'towns' \}\)\)\)/);
  assert.match(rt, /React\.createElement\(SkyDarkness, \{ bortle, auto: bortleMode === 'auto', from: bortleFrom \}\)/);
  const R = { createElement: (t, p, ...c) => ({ t, p, c: c.flat().filter(x => x != null && x !== false) }) };
  const x = extract(['BORTLE_WORD', 'skyWord', 'BORTLE_SEE']);
  const SD = new Function('React', 'C', 'skyWord', 'BORTLE_SEE', `${declSource('SkyDarkness')}; return SkyDarkness;`)(R, {}, x.skyWord, x.BORTLE_SEE);
  const last = props => { const t = SD(props); const n = t.c[t.c.length - 1]; return n.c.join(''); };
  assert.match(last({ bortle: 2, auto: true, from: 'satellite' }), /Estimated from satellite measurements of the lights around you\.$/);
  assert.match(last({ bortle: 2, auto: true, from: 'towns' }), /Estimated from the towns around you\.$/);
  assert.match(last({ bortle: 2, auto: true, from: null }), /Estimated from the lights around you\.$/);
  assert.match(last({ bortle: 2, auto: false, from: 'satellite' }), /Set by you in settings\.$/);
});

test('the native apps carry the tiles, the service worker keeps the index, and the footer credits the data', () => {
  assert.ok(fs.readFileSync(path.join(__dirname, '..', '..', 'sw.js'), 'utf8').includes("'/lp/index.json'"), 'sw.js ASSETS');
  const sync = fs.readFileSync(path.join(__dirname, '..', '..', 'native', 'sync-web.js'), 'utf8');
  assert.match(sync, /path\.join\(ROOT, 'lp'\)/);
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  assert.match(html, /blackmarble\.gsfc\.nasa\.gov/);
});

// ---- The real tiles (lp/, from NASA Black Marble by the Light pollution
// tiles workflow), read with the app's own reader at the reference sites the
// pipeline calibrated against. lp.py calibrates by reading each site as the
// app reads the tiles (app_read, app_ratio), so its report is what the app
// shows: the same class, and the sky reading to the report's two decimals.
const LP = path.join(__dirname, '..', '..', 'lp');
const SITES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'light-pollution', 'reference-sites.json'), 'utf8')).sites;
const REPORT = fs.readFileSync(path.join(__dirname, '..', 'light-pollution', 'calibration.txt'), 'utf8');

test('the real tiles: an index the app can read, and every tile it lists decodes', () => {
  const idx = JSON.parse(fs.readFileSync(path.join(LP, 'index.json'), 'utf8'));
  assert.strictEqual(idx.tile, 10);
  assert.strictEqual(idx.res, 30);
  assert.match(idx.source, /Black Marble VNP46A4/);
  assert.ok(idx.tiles.length > 50, `${idx.tiles.length} tiles`);
  for (const name of idx.tiles) {
    const b = fs.readFileSync(path.join(LP, `${name}.bin`));
    const t = m.decodeLpTile(new Uint8Array(b));
    assert.ok(t && t.W === 300 && t.H === 300, name);
  }
});

test('the real tiles put each reference site where the pipeline did, and in its range', async () => {
  const get = files(LP);
  for (const s of SITES) {
    const r = await m.skyBortle(s.lat, s.lon, get);
    assert.ok(r, s.name);
    const line = REPORT.split('\n').find(l => l.trim().startsWith(s.name));
    assert.ok(line, `${s.name} in calibration.txt`);
    assert.ok(r.bortle >= s.bortle[0] && r.bortle <= s.bortle[1], `${s.name}: ${r.bortle}, range ${s.bortle}`);
    const [, py, sqm] = line.match(/Bortle (\d)\s+SQM ([\d.]+)/);
    assert.strictEqual(r.bortle, +py, `${s.name}: app ${r.bortle}, pipeline ${py}`);
    const appSqm = 22 - 2.5 * Math.log10(1 + r.ratio);
    assert.ok(Math.abs(appSqm - +sqm) <= 0.006, `${s.name}: app SQM ${appSqm.toFixed(3)}, pipeline ${sqm}`);
  }
});

test('the real tiles: the dark-sky park the town estimate got wrong is dark, city centres are bright', async () => {
  const get = files(LP);
  const at = async name => { const s = SITES.find(x => x.name.startsWith(name)); return (await m.skyBortle(s.lat, s.lon, get)).bortle; };
  assert.ok(await at('Cherry Springs') <= 3, 'Cherry Springs, which the towns put at 4');
  for (const c of ['Manhattan', 'Chicago', 'Los Angeles', 'Tokyo', 'Hong Kong']) assert.ok(await at(c) >= 8, c);
  // Brighter toward Boston: the park, a college town, a suburb, downtown.
  const run = [await at('Cherry Springs'), await at('Amherst'), await at('Lexington'), await at('Boston')];
  for (let i = 1; i < run.length; i++) assert.ok(run[i] >= run[i - 1], `${run}`);
});
