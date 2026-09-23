'use strict';
/*
 * Sky View's constellation lines: constellations.bin, the app's decoder
 * (loadConstellationLines) and the segment builder (constellationSegments).
 *
 * The failure worth guarding against is silent: a decoder that reads RA with
 * the wrong scale or sign still returns 88 tidy constellations, just drawn
 * across the wrong stars. So the main test checks the lines against the
 * stars Sky View actually draws — NAV_STARS plus stars.bin, decoded by the
 * app's own loadStarCatalog — rather than against the file's own header.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extract, declSource } = require('./extract.js');

const ROOT = path.join(__dirname, '..', '..');
const { NAV_STARS, constellationSegments, constellationLabelSpots } = extract(['NAV_STARS', 'constellationSegments', 'constellationLabelSpots']);

// Run one of the app's fetch-on-first-use loaders against a file on disk.
function loader(name, promiseVar, file, { fail = false } = {}) {
  const fetchStub = () => fail
    ? Promise.resolve({ ok: false })
    : Promise.resolve({
        ok: true,
        arrayBuffer: () => {
          const b = fs.readFileSync(path.join(ROOT, file));
          return Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
        }
      });
  return new Function('fetch', `let ${promiseVar} = null;\n${declSource(name)}\nreturn ${name};`)(fetchStub);
}

const D2R = Math.PI / 180;
function sepArcmin(a, b) {
  const c = Math.sin(a.dec * D2R) * Math.sin(b.dec * D2R) +
            Math.cos(a.dec * D2R) * Math.cos(b.dec * D2R) * Math.cos((a.ra - b.ra) * D2R);
  return Math.acos(Math.min(1, Math.max(-1, c))) / D2R * 60;
}

test('decodes all 88 IAU constellations, every polyline drawable', async () => {
  const lines = await loader('loadConstellationLines', 'constellationLinesPromise', 'constellations.bin')();
  assert.strictEqual(new Set(lines.map(l => l.id)).size, 88);
  assert.strictEqual(lines.length, 150);
  for (const l of lines) {
    assert.ok(l.pts.length >= 2, `${l.id}: a polyline needs two vertices`);
    assert.ok([1, 2, 3].includes(l.rank), `${l.id}: rank ${l.rank}`);
    for (const v of l.pts) {
      assert.ok(v.ra >= 0 && v.ra < 360, `${l.id}: ra ${v.ra}`);
      assert.ok(v.dec >= -90 && v.dec <= 90, `${l.id}: dec ${v.dec}`);
    }
  }
});

test('the lines join the stars Sky View draws', async () => {
  const lines = await loader('loadConstellationLines', 'constellationLinesPromise', 'constellations.bin')();
  const catalog = await loader('loadStarCatalog', 'starCatalogPromise', 'stars.bin')();
  const stars = NAV_STARS.map(s => ({ ra: s[1] * 15, dec: s[2] })).concat(catalog);
  const verts = lines.flatMap(l => l.pts);
  const near = verts.filter(v => stars.some(s => sepArcmin(v, s) <= 1)).length;
  // Measured 97.1% when this was written. The rest are real stars fainter
  // than stars.bin's magnitude-5 cut (Mensa, Horologium, Sextans, ...); Sky
  // View draws a faint dot at every vertex for them. A decoding error puts
  // this near 0%, not 94%.
  assert.ok(near / verts.length >= 0.95, `only ${(100 * near / verts.length).toFixed(1)}% of vertices are on a drawn star`);
});

test('named figures pass through the right stars', async () => {
  const lines = await loader('loadConstellationLines', 'constellationLinesPromise', 'constellations.bin')();
  const star = name => { const s = NAV_STARS.find(x => x[0] === name); return { ra: s[1] * 15, dec: s[2] }; };
  const touches = (id, name) => lines.filter(l => l.id === id).some(l => l.pts.some(v => sepArcmin(v, star(name)) <= 1));
  assert.ok(touches('Ori', 'Betelgeuse') && touches('Ori', 'Rigel'), 'Orion');
  assert.ok(touches('UMa', 'Dubhe') && touches('UMa', 'Alioth'), 'Ursa Major');
  assert.ok(touches('Cru', 'Acrux'), 'Crux');
  assert.ok(touches('Lyr', 'Vega') && !touches('Ori', 'Vega'), 'Lyra, and Vega is not in Orion');
});

test('a missing file degrades to no lines, not an error', async () => {
  const lines = await loader('loadConstellationLines', 'constellationLinesPromise', 'constellations.bin', { fail: true })();
  assert.deepStrictEqual(lines, []);
});

// constellationSegments with a flat stand-in projection: x = az, y = -alt,
// and anything with az >= 1000 counts as behind the camera.
const flat = (az, alt) => (az >= 1000 ? null : { x: az, y: -alt });

test('segments stop short of the stars they join', () => {
  const [s] = constellationSegments([{ rank: 1, pts: [{ az: 0, alt: 10 }, { az: 100, alt: 10 }] }], flat, 4);
  assert.deepStrictEqual([s.x1, s.x2, s.y1, s.y2], [4, 96, -10, -10]);
});

test('on a short segment the gap is capped, so it never inverts', () => {
  const [s] = constellationSegments([{ rank: 1, pts: [{ az: 0, alt: 0 }, { az: 10, alt: 0 }] }], flat, 4);
  assert.deepStrictEqual([s.x1, s.x2], [3, 7]);
});

test('a segment with an end behind the camera is dropped, its neighbours kept', () => {
  const segs = constellationSegments([{ rank: 1, pts: [
    { az: 0, alt: 5 }, { az: 50, alt: 5 }, { az: 1000, alt: 5 }, { az: 60, alt: 5 }, { az: 90, alt: 5 }
  ] }], flat, 0);
  assert.deepStrictEqual(segs.map(s => [s.x1, s.x2]), [[0, 50], [60, 90]]);
});

test('below-horizon is judged at the midpoint; rank carries through', () => {
  const segs = constellationSegments([{ rank: 3, pts: [{ az: 0, alt: 4 }, { az: 50, alt: -2 }, { az: 90, alt: -8 }] }], flat, 0);
  assert.deepStrictEqual(segs.map(s => s.below), [false, true]);
  assert.ok(segs.every(s => s.rank === 3));
});

test('a zero-length segment is skipped', () => {
  assert.deepStrictEqual(constellationSegments([{ rank: 1, pts: [{ az: 5, alt: 5 }, { az: 5, alt: 5 }] }], flat, 4), []);
});

// ---- Constellation names (constellation-names.json, loadConstellationNames,
// constellationLabelSpots). The file comes from the same d3-celestial commit
// as the lines; these check it against the lines rather than against itself,
// so a wrong RA convention or a shuffled table cannot pass.
function namesLoader({ fail = false } = {}) {
  const fetchStub = () => fail
    ? Promise.resolve({ ok: false })
    : Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, 'constellation-names.json'), 'utf8'))) });
  return new Function('fetch', `let constellationNamesPromise = null;\n${declSource('loadConstellationNames')}\nreturn loadConstellationNames;`)(fetchStub);
}

test('every constellation has a name, and every name belongs to a figure', async () => {
  const names = await namesLoader()();
  const lines = await loader('loadConstellationLines', 'constellationLinesPromise', 'constellations.bin')();
  assert.deepStrictEqual([...new Set(names.map(n => n.id))].sort(), [...new Set(lines.map(l => l.id))].sort());
  assert.strictEqual(names.length, 89, '88 constellations, Serpens labelled twice (Caput and Cauda)');
  const byId = id => names.filter(n => n.id === id).map(n => n.name);
  assert.deepStrictEqual(byId('Ori'), ['Orion']);
  assert.deepStrictEqual(byId('UMa'), ['Ursa Major']);
  assert.deepStrictEqual(byId('Ser').sort(), ['Serpens Caput', 'Serpens Cauda']);
  for (const n of names) assert.ok([1, 2, 3].includes(n.rank) && n.name.length > 2, n.id);
});

test('each name sits on its own figure', async () => {
  const names = await namesLoader()();
  const lines = await loader('loadConstellationLines', 'constellationLinesPromise', 'constellations.bin')();
  // Measured: every label within 7.9 degrees of its figure's nearest vertex
  // (Puppis the furthest). A label in the wrong place is tens of degrees out.
  for (const n of names) {
    const own = Math.min(...lines.filter(l => l.id === n.id).flatMap(l => l.pts).map(v => sepArcmin(n, v))) / 60;
    assert.ok(own < 10, `${n.name} is ${own.toFixed(1)} degrees from its own figure`);
  }
});

test('a missing names file degrades to no names, not an error', async () => {
  assert.deepStrictEqual(await namesLoader({ fail: true })(), []);
});

// constellationLabelSpots with the same flat projection: x = az, y = 200 - alt.
const flatLabel = (az, alt) => (az >= 1000 ? null : { x: az, y: 200 - alt });
const L = (name, rank, az, alt) => ({ name, rank, az, alt });

test('names below the horizon, off screen or behind the camera are not written', () => {
  const spots = constellationLabelSpots([
    L('Up', 1, 100, 40), L('Down', 1, 200, -5), L('Low', 1, 300, 1),
    L('Offscreen', 1, 900, 40), L('Behind', 1, 1000, 40)
  ], flatLabel, 500, 400, 60);
  assert.deepStrictEqual(spots.map(s => s.name), ['Up']);
});

test('names stay clear of the overlay\'s buttons and caption', () => {
  // A projection where screen y is simply the altitude, so every name here is
  // well above the horizon and only its screen position decides.
  const byAlt = (az, alt) => ({ x: az, y: alt });
  const spots = constellationLabelSpots([L('UnderButtons', 1, 100, 50), L('Clear', 1, 200, 200), L('UnderCaption', 1, 300, 350)], byAlt, 500, 400, 60, 72, 76);
  assert.deepStrictEqual(spots.map(s => s.name), ['Clear']);
});

test('crowded names: the prominent one wins, whatever the input order', () => {
  const spots = constellationLabelSpots([L('Faint', 3, 100, 40), L('Bright', 1, 130, 40), L('Apart', 3, 300, 40)], flatLabel, 500, 400, 60);
  assert.deepStrictEqual(spots.map(s => s.name), ['Bright', 'Apart']);
  assert.deepStrictEqual([spots[0].x, spots[0].y], [130, 160]);
});
