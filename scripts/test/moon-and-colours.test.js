'use strict';
/*
 * The Moon's face and the stars' colours.
 *
 * Both are easy to get plausibly wrong: a Moon with its maria upside down
 * still looks like a Moon, and a sky with every star tinted the same pale
 * blue still looks like a sky. So the Moon's orientation is checked against
 * where the celestial pole actually is (up on the meridian from the north,
 * down from the south, tipped at moonrise), and the colours against stars
 * whose colours everyone knows.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'asin', 'atan2', 'rev', 'NAV_STARS',
  'MOON_MARIA', 'skyBearing', 'bearingOnScreen', 'drawMoonDisc', 'chartXY', 'STAR_CI', 'starColor',
  'HZ_SPAN', 'panoX', 'panoY', 'hzRandom', 'COMPASS16', 'compass16', 'heroMoonDisc', 'starGlow',
  'drawHorizonScene', 'drawHorizonSky', 'drawHorizonGround']);

// The real loader, fed stars.bin from disk.
async function catalog() {
  const buf = fs.readFileSync(path.join(__dirname, '..', '..', 'stars.bin'));
  const fetchStub = () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)) });
  return new Function('fetch', `let starCatalogPromise = null;\n${declSource('loadStarCatalog')}\nreturn loadStarCatalog;`)(fetchStub)();
}
const rgb = s => s.slice(4, -1).split(',').map(Number);
const near = (a, b, eps = 1e-6) => Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) < eps;

test('skyBearing: 0 toward the zenith, 90 toward increasing azimuth', () => {
  assert.ok(Math.abs(m.skyBearing(180, 30, 180, 50)) < 1e-9);
  assert.ok(Math.abs(m.skyBearing(180, 0, 200, 0) - 90) < 1e-6);
  assert.ok(Math.abs(Math.abs(m.skyBearing(180, 50, 180, 20)) - 180) < 1e-9);
});

// The painting's direction for a bearing, as drawHorizonSky computes it.
function paintedNorth(moon, lat, w = 400, hy = 236) {
  const onCanvas = th => Math.atan2(-m.cos(th) * (hy - 22) / 75, m.sin(th) / Math.max(0.05, m.cos(moon.alt)) * w / m.HZ_SPAN);
  return onCanvas(m.skyBearing(moon.az, moon.alt, 0, lat));
}

test('the Moon is the right way up for where it is in the sky', () => {
  // On the meridian from the north: lunar north straight up the page.
  assert.ok(near(paintedNorth({ az: 180, alt: 40 }, 44), -Math.PI / 2));
  // On the meridian from the south, looking north: upside down.
  assert.ok(near(paintedNorth({ az: 0, alt: 40 }, -34), Math.PI / 2));
  // Rising in the south-east from the north: tipped toward the pole, left.
  const a = paintedNorth({ az: 120, alt: 10 }, 44);
  assert.ok(a < -Math.PI / 2 && a > -Math.PI, `north at ${a}`);
});

function recCtx() {
  const calls = [];
  const grad = { addColorStop() {} };
  const g = new Proxy({ createRadialGradient: () => grad, createLinearGradient: () => grad }, {
    get(t, k) { if (k in t) return t[k]; return (...a) => calls.push([k, a]); },
    set() { return true; }
  });
  return { calls, g };
}

test('drawMoonDisc: lit side toward the Sun, face turned to lunar north', () => {
  const { calls, g } = recCtx();
  const sun = 0.7, north = 2.1;
  m.drawMoonDisc(g, 50, 50, 20, 0.6, false, sun, north);
  const rots = calls.filter(c => c[0] === 'rotate').map(c => c[1][0]);
  assert.ok(near(rots[0], sun), 'first the lit shape turns to the Sun');
  // Then the face is turned from the Sun's frame to north: net rotation
  // north + 90° (the map is drawn north-up).
  assert.ok(near(rots[0] + rots[1], north + Math.PI / 2), 'then the face to north');
  assert.ok(near(rots[0] + rots[1] + rots[2], sun), 'and back to the Sun for the shading');
  // Every mare is drawn, plus the two bright craters.
  assert.strictEqual(calls.filter(c => c[0] === 'ellipse').length, 1 + m.MOON_MARIA.length);
  // litLeft is a half turn, not a mirror: a mirror would flip the face.
  const r2 = recCtx();
  m.drawMoonDisc(r2.g, 50, 50, 20, 0.6, true, 0);
  assert.ok(!r2.calls.some(c => c[0] === 'scale'));
  assert.ok(near(r2.calls.find(c => c[0] === 'rotate')[1][0], Math.PI));
});

test('the maria sit where they are on the Moon', () => {
  // Mare Crisium is on the east limb, right of centre with north up;
  // Imbrium north-west, Tycho far south.
  const at = (la, lo) => ({ x: m.cos(la) * m.sin(lo), y: -m.sin(la) });
  const byName = { crisium: m.MOON_MARIA[3], imbrium: m.MOON_MARIA[0], tycho: m.MOON_MARIA[17] };
  assert.ok(at(byName.crisium[0], byName.crisium[1]).x > 0.7);
  const imb = at(byName.imbrium[0], byName.imbrium[1]);
  assert.ok(imb.x < 0 && imb.y < 0);
  assert.ok(byName.tycho[3] < 0 && at(byName.tycho[0], byName.tycho[1]).y > 0.6, 'Tycho, bright, far south');
});

test('bearingOnScreen follows a projection, even at the edge of the chart', () => {
  const P = (az, alt) => { const p = m.chartXY(az, alt, 100); return p && { x: 200 + p.x, y: 200 + p.y }; };
  // On the chart (north up, east left), straight up from a body on the
  // southern meridian is toward the centre: up the page.
  assert.ok(near(m.bearingOnScreen(P, 180, 30, 0), -Math.PI / 2, 1e-3));
  // On the horizon a step downward falls off the chart; it steps up instead
  // and reverses, still giving "down the page".
  assert.ok(near(m.bearingOnScreen(P, 180, 0.1, 180), Math.PI / 2, 1e-2));
});

test('stars are the colours they are', async () => {
  const cat = await catalog();
  assert.ok(Array.isArray(cat.navCi), 'the colour section is read');
  assert.strictEqual(cat.navCi.length, m.NAV_STARS.length);
  const ci = name => cat.navCi[m.NAV_STARS.findIndex(s => s[0] === name)];
  const col = name => rgb(m.starColor(ci(name), m.NAV_STARS.find(s => s[0] === name)[3]));
  const [br, bg, bb] = col('Betelgeuse');
  assert.ok(ci('Betelgeuse') >= 1.45 && br > bg && bg > bb + 40, 'Betelgeuse orange');
  assert.ok(ci('Antares') > 1.5 && col('Antares')[2] < 180, 'Antares orange');
  const [rr, , rb] = col('Rigel');
  assert.ok(ci('Rigel') < 0.1 && rb > rr, 'Rigel blue-white');
  assert.ok(Math.abs(ci('Sirius')) < 0.1, 'Sirius white');
  // Most catalogue stars carry a colour.
  const known = cat.filter(s => s.ci !== null && s.ci !== undefined).length;
  assert.ok(known / cat.length > 0.99, `${known} of ${cat.length} with colours`);
});

test('faint stars fade to white; unknown colours are white', () => {
  const white = [238, 242, 255];
  assert.deepStrictEqual(rgb(m.starColor(null, 0)), white);
  assert.deepStrictEqual(rgb(m.starColor(1.8, 5)), white, 'magnitude 5: no colour to the eye');
  const bright = rgb(m.starColor(1.8, 0)), mid = rgb(m.starColor(1.8, 3));
  assert.ok(bright[2] < mid[2] && mid[2] < 255, 'colour grows with brightness');
});

test('the brightest stars get a halo, fainter ones do not', () => {
  const { calls, g } = recCtx();
  m.starGlow(g, 10, 10, 2, -1.4, 'rgb(202,215,255)');
  assert.ok(calls.some(c => c[0] === 'arc' && c[1][2] > 6), 'Sirius glows');
  const r2 = recCtx();
  m.starGlow(r2.g, 10, 10, 2, 2.5, 'rgb(202,215,255)');
  assert.strictEqual(r2.calls.length, 0);
});
