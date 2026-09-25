'use strict';
/*
 * Galaxies, nebulae and clusters: deep-sky.json (the Messier catalogue, from
 * d3-celestial) and how Sky View and Find use it.
 *
 * The data is checked against positions everyone can look up (the Andromeda
 * Galaxy, the Orion Nebula, the Pleiades ...) rather than against the file's
 * own contents: a generator that swapped RA and Dec, or mishandled
 * d3-celestial's -180..180 longitudes, would still write 110 tidy rows.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extract, declSource } = require('./extract.js');

const ROOT = path.join(__dirname, '..', '..');
const DSO = JSON.parse(fs.readFileSync(path.join(ROOT, 'deep-sky.json'), 'utf8'));
const byId = Object.fromEntries(DSO.map(r => [r[0], r]));

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'asin', 'atan2', 'rev', 'COMPASS16', 'compass16',
  'quatAxis', 'quatMul', 'quatFromEuler', 'quatRotate', 'vecAz', 'viewBasis', 'toScreen', 'skyProject', 'screenDir',
  'sepAltAz', 'COMPASS_WORDS', 'compassWord', 'whereWords', 'PLANET_ORDER', 'DSO_KIND', 'dsoLabel', 'PLANET_MAG', 'findLimit', 'findList',
  'theName', 'capFirst', 'findGuide',
  'constellationSegments', 'constellationLabelSpots', 'MOON_MARIA', 'skyBearing', 'bearingOnScreen',
  'drawMoonDisc', 'starGlow', 'drawDeepSky', 'drawSkyView']);

test('the whole Messier catalogue, once each, in shape', () => {
  assert.strictEqual(DSO.length, 110);
  const ids = DSO.map(r => r[0]);
  for (let i = 1; i <= 110; i++) assert.ok(ids.includes('M' + i), 'M' + i);
  for (const [id, name, type, mag, ra, dec, size] of DSO) {
    assert.ok(type in m.DSO_KIND, `${id} type ${type}`);
    assert.ok(mag > 1 && mag < 12, `${id} mag ${mag}`);
    assert.ok(ra >= 0 && ra < 360 && dec >= -90 && dec <= 90, `${id} position`);
    assert.ok(size >= 0 && size < 200, `${id} size`);
    assert.ok(!/['´]/.test(name), `${id}: curly apostrophes only`);
  }
});

test('famous objects are where the sky has them', () => {
  // [ra, dec] in degrees, from their standard catalogue positions (J2000).
  const known = {
    M31: [10.68, 41.27],   // Andromeda Galaxy, 00h42.7m +41°16′
    M42: [83.82, -5.39],   // Orion Nebula, 05h35.3m −05°23′
    M45: [56.75, 24.12],   // Pleiades, 03h47.0m +24°07′
    M13: [250.42, 36.46],  // Hercules globular, 16h41.7m +36°28′
    M57: [283.40, 33.03],  // Ring Nebula, 18h53.6m +33°02′
    M1: [83.63, 22.01],    // Crab Nebula, 05h34.5m +22°01′
    M44: [130.10, 19.67]   // Beehive, 08h40.4m +19°40′
  };
  for (const [id, [ra, dec]] of Object.entries(known)) {
    const r = byId[id];
    const sep = Math.acos(Math.min(1, m.sin(dec) * m.sin(r[5]) + m.cos(dec) * m.cos(r[5]) * m.cos(ra - r[4]))) * 180 / Math.PI;
    assert.ok(sep < 0.5, `${id} is ${sep.toFixed(2)}° from its catalogue position`);
  }
  assert.strictEqual(byId.M31[1], 'Andromeda Galaxy');
  assert.strictEqual(byId.M44[1], 'Beehive Cluster');
  assert.strictEqual(byId.M31[2], 's');
  assert.ok(byId.M31[6] > 150, 'Andromeda is big: several Moons across');
});

const body = (name, id, type, mag, az, alt, size = 20) => ({ name, id, kind: 'dso', type, mag, az, alt, size });

test('Find offers the ones worth going out for, and says what they are', () => {
  const bodies = [
    body('Andromeda Galaxy', 'M31', 's', 3.4, 80, 60, 190),
    body('Pleiades', 'M45', 'oc', 1.2, 70, 15, 110),
    body('Whirlpool Galaxy', 'M51', 's', 8.1, 330, 40, 11),   // too faint without a telescope
    body('Orion Nebula', 'M42', 'sfr', 4, 110, 5, 66),        // too low
    body('M35', 'M35', 'oc', 5.1, 60, 30, 28)
  ];
  const g = m.findList(bodies, []).find(x => x.title === 'Galaxies, nebulae and clusters');
  assert.deepStrictEqual(g.items.map(i => i.name), ['Pleiades', 'Andromeda Galaxy', 'M35'], 'brightest first');
  assert.strictEqual(g.items[1].where, 'galaxy, high in the east');
  assert.strictEqual(g.items[0].where, 'star cluster, low in the east');
});

test('in twilight only the brightest clusters are offered, and none by day', () => {
  const sun = alt => ({ name: 'Sun', kind: 'sun', az: 280, alt, mag: -26 });
  const deep = [body('Andromeda Galaxy', 'M31', 's', 3.4, 80, 60, 190), body('Pleiades', 'M45', 'oc', 1.2, 70, 30, 110)];
  const group = alt => (m.findList([sun(alt)].concat(deep), []).find(x => x.title === 'Galaxies, nebulae and clusters') || { items: [] }).items.map(i => i.name);
  assert.deepStrictEqual(group(-20), ['Pleiades', 'Andromeda Galaxy']);
  assert.deepStrictEqual(group(-9), ['Pleiades'], 'nautical twilight: the Pleiades, not yet a galaxy');
  assert.deepStrictEqual(group(-4), []);
  assert.deepStrictEqual(group(10), []);
});

test('a galaxy’s name steps round a constellation’s', () => {
  const draw = boxes => { const c = ctx(); m.drawDeepSky(c.g, body('Triangulum Galaxy', 'M33', 's', 5.7, 0, 40, 60), { x: 200, y: 300 }, false, 844, 63, null, 390, [], boxes); return c.texts; };
  const free = draw([]);
  assert.ok(free.length === 1 && free[0].y > 300, 'below the outline when there’s room');
  const under = draw([{ x1: 150, x2: 250, y1: free[0].y - 7, y2: free[0].y + 7 }]);
  assert.ok(under.length === 1 && under[0].y < 300, 'above it when a constellation’s name is below');
  const both = draw([{ x1: 150, x2: 250, y1: free[0].y - 7, y2: free[0].y + 7 }, { x1: 150, x2: 250, y1: 260, y2: 300 }]);
  assert.strictEqual(both.length, 0, 'left off when both are taken');
});

test('Sky View passes the constellation names it wrote to the galaxy labels', () => {
  const basis = m.viewBasis(m.quatFromEuler(360 - 80, 90 + 55, 0), 0);
  const scene = withName => {
    const c = ctx();
    m.drawSkyView(c.g, 390, 844, { basis, fov: 63, cam: false, lines: [{ id: 'Tri', rank: 1, pts: [{ az: 70, alt: 40 }, { az: 71, alt: 41 }] }], showLines: true, reticle: false,
      names: withName ? [{ id: 'Tri', name: 'Triangulum', rank: 1, az: 80, alt: 55 }] : [],
      bodies: [body('Triangulum Galaxy', 'M33', 's', 5.7, 80, 56.27, 20)] });
    return c.texts.find(t => t.t === 'Triangulum Galaxy');
  };
  const alone = scene(false), crowded = scene(true);
  assert.ok(alone && crowded && crowded.y < alone.y - 20, `moved above: ${alone && alone.y} -> ${crowded && crowded.y}`);
});

test('the guide says "the" where English does', () => {
  assert.strictEqual(m.theName('Andromeda Galaxy'), 'the Andromeda Galaxy');
  assert.strictEqual(m.theName('Orion Nebula'), 'the Orion Nebula');
  assert.strictEqual(m.theName('Pleiades'), 'the Pleiades');
  assert.strictEqual(m.theName('Sagittarius Star Cloud'), 'the Sagittarius Star Cloud');
  assert.strictEqual(m.theName('M35'), 'M35');
  assert.strictEqual(m.theName('Jupiter'), 'Jupiter');
  assert.strictEqual(m.findGuide({ az: 80, alt: 60 }, { name: 'Andromeda Galaxy', az: 81, alt: 60 }).text, 'That’s the Andromeda Galaxy, in the ring.');
});

function ctx() {
  const shapes = [], texts = [];
  let dash = [];
  const g = {
    strokeStyle: '', fillStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1, lineCap: '',
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    measureText: t => ({ width: t.length * 6 }), fillText(t, x, y) { texts.push({ t, x, y, color: this.fillStyle }); },
    setLineDash(d) { dash = d; },
    ellipse(x, y, rx, ry) { shapes.push({ kind: 'ellipse', rx, ry, dash: dash.slice(), color: this.strokeStyle }); },
    arc(x, y, r) { shapes.push({ kind: 'arc', r, dash: dash.slice(), color: this.strokeStyle }); },
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, clip() {}, closePath() {}
  };
  return { g, shapes, texts };
}

test('Sky View draws them their real size, by kind, and names only the findable ones', () => {
  const basis = m.viewBasis(m.quatFromEuler(360 - 80, 90 + 55, 0), 0);
  const o = (bodies, targetName = null) => ({ basis, fov: 63, cam: false, bodies, lines: [], names: [], showLines: false, targetName, reticle: false });
  const r = ctx();
  m.drawSkyView(r.g, 390, 844, o([body('Andromeda Galaxy', 'M31', 's', 3.4, 80, 57, 190)]));
  const e = r.shapes.find(s => s.kind === 'ellipse');
  assert.ok(e, 'a galaxy is an ellipse');
  const pxPerDeg = 844 / 63;
  assert.ok(Math.abs(e.rx - (190 / 60) * pxPerDeg / 2) < 1, `drawn ${e.rx.toFixed(1)} px across its half-width`);
  assert.ok(r.texts.some(t => t.t === 'Andromeda Galaxy'));
  // A cluster is dashed; a faint unnamed object gets a mark but no label.
  const c = ctx();
  m.drawSkyView(c.g, 390, 844, o([body('M35', 'M35', 'oc', 5.1, 85, 50, 28), body('M97', 'M97', 'pn', 11.2, 75, 52, 3)]));
  assert.ok(c.shapes.some(s => s.kind === 'arc' && s.dash.length), 'a cluster is dashed');
  assert.ok(c.shapes.some(s => s.kind === 'arc' && !s.dash.length && s.r === 4), 'a small nebula is a small solid mark');
  assert.deepStrictEqual(c.texts.map(t => t.t).filter(t => /^M\d/.test(t)), [], 'no catalogue numbers written across the sky');
  // Picked: named, in the target's amber.
  const t = ctx();
  m.drawSkyView(t.g, 390, 844, o([body('M97', 'M97', 'pn', 11.2, 80, 55, 3)], 'M97'));
  assert.ok(t.texts.some(x => x.t === 'M97' && x.color === '#e8b563'));
  assert.ok(t.shapes.some(x => x.r === 4 && x.color === '#e8b563'), 'its outline too');
  assert.ok(c.shapes.every(x => x.color !== '#e8b563'), 'and nothing else is amber');
});

test('the app loads them, adds them to the sky, and ships the file', () => {
  const src = declSource('StarFinder');
  assert.match(src, /loadDeepSky\(\)\.then/);
  assert.match(src, /kind: 'dso', type: o\.type, mag: o\.mag, size: o\.size/);
  assert.match(declSource('drawSkyView'), /if \(bd\.kind === 'dso'\) \{ drawDeepSky\(/);
  assert.match(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), /'\/deep-sky\.json'/);
  assert.match(fs.readFileSync(path.join(ROOT, 'native/sync-web.js'), 'utf8'), /'deep-sky\.json'/);
  assert.match(fs.readFileSync(path.join(ROOT, 'constellations.LICENSE.txt'), 'utf8'), /deep-sky\.json from data\/messier\.json/);
});

test('a name near the edge of the view is pulled in whole', () => {
  const bd = body('Wild Duck Cluster', 'M11', 'oc', 5.8, 0, 30, 14);
  for (const x of [386, 4]) {
    const c = ctx();
    m.drawDeepSky(c.g, bd, { x, y: 400 }, false, 844, 63, null, 390, [], []);
    const t = c.texts.find(q => q.t === 'Wild Duck Cluster');
    assert.ok(t, 'named');
    const half = 'Wild Duck Cluster'.length * 6 / 2;
    assert.ok(t.x - half >= 0 && t.x + half <= 390, `x ${t.x} keeps ${half * 2} px inside 390`);
  }
});
