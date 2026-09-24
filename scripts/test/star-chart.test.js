'use strict';
/*
 * Star Finder's sky chart: the projection, and what the painter actually
 * draws.
 *
 * The projection has a handedness that is easy to get backwards and
 * impossible to see in a screenshot without knowing the sky: north at the
 * top with EAST ON THE LEFT, the mirror of the compass dial it replaced.
 * That is pinned here.
 *
 * drawSkyChart is exercised against a recording stand-in for the canvas
 * context — no browser needed — so the things a reader would trust can be
 * asserted: that a star below the horizon never appears, that nothing is
 * painted outside the disc, and that the three stars of the recommended fix
 * are marked and named.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'chartXY', 'MOON_MARIA', 'skyBearing', 'drawMoonDisc', 'starGlow', 'drawSkyChart']);
const R_OF = size => size / 2 - 17;

// Records every drawing call. Coordinates are taken as given, which is what
// the chart uses everywhere except the Moon disc (translate + rotate).
function stubCtx() {
  const calls = [], arcs = [], texts = [], lines = [];
  const grad = { addColorStop() {} };
  // The Moon disc is drawn after translate(), in its own frame, so the stub
  // tracks the offset — otherwise it looks like it is painted at (0, 0).
  let tx = 0, ty = 0;
  const stack = [];
  const rec = name => (...args) => { calls.push({ name, args }); };
  return {
    calls, arcs, texts, lines,
    canvas: {},
    createRadialGradient: () => grad,
    createLinearGradient: () => grad,
    beginPath: rec('beginPath'), closePath: rec('closePath'),
    fill: rec('fill'), stroke: rec('stroke'), clip: rec('clip'),
    save() { stack.push([tx, ty]); calls.push({ name: 'save', args: [] }); },
    restore() { const p = stack.pop(); if (p) { tx = p[0]; ty = p[1]; } calls.push({ name: 'restore', args: [] }); },
    setLineDash: rec('setLineDash'), fillRect: rec('fillRect'),
    ellipse: rec('ellipse'), scale: rec('scale'),
    translate(x, y) { tx += x; ty += y; calls.push({ name: 'translate', args: [x, y] }); },
    rotate(a) { calls.push({ name: 'rotate', args: [a] }); },
    arc(x, y, r) { arcs.push({ x: x + tx, y: y + ty, r }); calls.push({ name: 'arc', args: [x, y, r] }); },
    moveTo(x, y) { lines.push(['moveTo', x, y]); },
    lineTo(x, y) { lines.push(['lineTo', x, y]); },
    fillText(t, x, y) { texts.push({ t, x, y }); },
    measureText: t => ({ width: t.length * 6 }),
    set fillStyle(v) {}, get fillStyle() { return ''; },
    set strokeStyle(v) {}, get strokeStyle() { return ''; },
    set lineWidth(v) {}, get lineWidth() { return 1; },
    set lineCap(v) {}, get lineCap() { return 'butt'; },
    set font(v) {}, get font() { return ''; },
    set textAlign(v) {}, get textAlign() { return 'left'; },
    set textBaseline(v) {}, get textBaseline() { return 'alphabetic'; },
    set globalAlpha(v) {}, get globalAlpha() { return 1; }
  };
}

test('chartXY: zenith at the centre, horizon at the rim', () => {
  const z = m.chartXY(123, 90, 100);
  assert.ok(Math.abs(z.x) < 1e-12 && Math.abs(z.y) < 1e-12, 'the zenith is the centre');
  const n = m.chartXY(0, 0, 100);
  assert.ok(Math.abs(n.x) < 1e-9 && Math.abs(n.y + 100) < 1e-9, 'north on the horizon is straight up the page');
});

test('chartXY: north up, east LEFT — a chart you hold overhead, not a map', () => {
  const e = m.chartXY(90, 0, 100), w = m.chartXY(270, 0, 100), s = m.chartXY(180, 0, 100);
  assert.ok(e.x < -99, `east should be at the left edge, got x=${e.x.toFixed(1)}`);
  assert.ok(w.x > 99, `west should be at the right edge, got x=${w.x.toFixed(1)}`);
  assert.ok(s.y > 99, 'south at the bottom');
});

test('chartXY: stereographic, so shapes hold near the horizon', () => {
  // r = R·tan((90−alt)/2): 30° sits at 0.577R, 60° at 0.268R. An equidistant
  // dial would put them at 0.667R and 0.333R.
  const r = alt => Math.hypot(m.chartXY(0, alt, 100).x, m.chartXY(0, alt, 100).y);
  assert.ok(Math.abs(r(30) - 57.735) < 0.01, `30° at ${r(30).toFixed(2)}`);
  assert.ok(Math.abs(r(60) - 26.795) < 0.01, `60° at ${r(60).toFixed(2)}`);
});

test('chartXY: nothing below the horizon has a place on the chart', () => {
  assert.strictEqual(m.chartXY(180, -0.5, 100), null);
  assert.strictEqual(m.chartXY(180, undefined, 100), null);
});

const SIZE = 300;
const baseData = () => ({
  stars: [
    { name: 'Vega', mag: 0.03, az: 270, alt: 58, nav: true },
    { name: 'Deneb', mag: 1.25, az: 300, alt: 82, nav: true },
    { name: 'Altair', mag: 0.76, az: 218, alt: 51, nav: true },
    { name: 'Sunk', mag: 2.0, az: 90, alt: -20, nav: true }
  ],
  lines: [{ pts: [{ az: 270, alt: 58 }, { az: 300, alt: 82 }, { az: 90, alt: -20 }] }],
  planets: [{ name: 'Saturn', az: 117, alt: 30 }],
  moon: { az: 181, alt: 31, illum: 0.88 },
  sunAz: 285,
  fix: [{ name: 'Vega', az: 270, alt: 58 }, { name: 'Deneb', az: 300, alt: 82 }, { name: 'Altair', az: 218, alt: 51 }],
  polaris: { az: 0, alt: 42 }
});

test('the chart names the fix stars, the planets and the Moon', () => {
  const g = stubCtx();
  m.drawSkyChart(g, SIZE, baseData());
  const said = g.texts.map(t => t.t);
  for (const want of ['Vega', 'Deneb', 'Altair', 'Saturn', 'Moon', 'Polaris', 'N', 'E', 'S', 'W']) {
    assert.ok(said.includes(want), `chart should label "${want}" — it drew: ${said.join(', ')}`);
  }
});

test('nothing below the horizon is drawn, on the chart or in its lines', () => {
  const g = stubCtx();
  const d = baseData();
  m.drawSkyChart(g, SIZE, d);
  assert.ok(!g.texts.some(t => t.t === 'Sunk'), 'a star below the horizon must not be labelled');
  // The line segment to the sunk star must be dropped: two vertices are up,
  // so exactly one segment can be drawn.
  const segs = g.lines.filter(l => l[0] === 'moveTo').length;
  assert.strictEqual(segs, 1 + 1 + 2, 'one constellation segment, the fix triangle, and the two strokes of the zenith cross');
});

test('everything lands inside the disc', () => {
  const g = stubCtx();
  m.drawSkyChart(g, SIZE, baseData());
  const R = R_OF(SIZE), c = SIZE / 2;
  const outside = g.arcs.filter(a => Math.hypot(a.x - c, a.y - c) > R + 0.5 && a.r < R);
  assert.deepStrictEqual(outside, [], 'a body was placed outside the horizon circle');
  assert.ok(g.arcs.some(a => Math.abs(a.r - R) < 1e-9), 'the horizon rim is drawn');
});

test('the three fix stars are ringed and joined, so the cut can be judged', () => {
  const g = stubCtx();
  const d = baseData();
  m.drawSkyChart(g, SIZE, d);
  const rings = g.arcs.filter(a => Math.abs(a.r - 7) < 1e-9);
  assert.strictEqual(rings.length, 3, 'one ring per fix star');
  const triangle = g.lines.filter(l => l[0] === 'lineTo').length;
  assert.ok(triangle >= 2, 'the fix triangle is drawn');
  const g2 = stubCtx();
  m.drawSkyChart(g2, SIZE, { ...d, fix: [d.fix[0]] });
  assert.strictEqual(g2.arcs.filter(a => Math.abs(a.r - 7) < 1e-9).length, 1, 'fewer than three: rings but no triangle');
});

test("the Moon's lit limb turns toward the Sun", () => {
  const g = stubCtx();
  const d = baseData();
  m.drawSkyChart(g, SIZE, d);
  const rot = g.calls.find(c => c.name === 'rotate');
  assert.ok(rot, 'the Moon disc should be rotated');
  const moon = m.chartXY(d.moon.az, d.moon.alt, R_OF(SIZE));
  const sun = m.chartXY(d.sunAz, 0, R_OF(SIZE));
  const want = Math.atan2(sun.y - moon.y, sun.x - moon.x);
  assert.ok(Math.abs(rot.args[0] - want) < 1e-9, `rotated ${rot.args[0]}, expected ${want}`);
});

test('a chart with nothing up still draws its frame', () => {
  const g = stubCtx();
  m.drawSkyChart(g, SIZE, { stars: [], lines: [], planets: [], moon: null, sunAz: 0, fix: [], polaris: null });
  assert.ok(g.texts.some(t => t.t === 'N'), 'the compass rose is always there');
  assert.ok(g.arcs.some(a => Math.abs(a.r - R_OF(SIZE)) < 1e-9), 'and the horizon');
});

test('galaxies and clusters on the chart: violet outlines, the famous ones named', () => {
  const g = stubCtx();
  const d = baseData();
  d.deep = [
    { name: 'Andromeda Galaxy', id: 'M31', type: 's', mag: 3.4, size: 190, az: 60, alt: 50 },
    { name: 'M35', id: 'M35', type: 'oc', mag: 5.1, size: 28, az: 100, alt: 40 },
    { name: 'Eagle Nebula', id: 'M16', type: 'sfr', mag: 6.0, size: 7, az: 200, alt: 30 }
  ];
  m.drawSkyChart(g, SIZE, d);
  const R = R_OF(SIZE), at = m.chartXY(60, 50, R), gx = SIZE / 2 + at.x, gy = SIZE / 2 + at.y;
  const ell = g.calls.filter(c => c.name === 'ellipse' && Math.hypot(c.args[0] - gx, c.args[1] - gy) < 0.5);
  assert.strictEqual(ell.length, 1, 'the galaxy is an ellipse');
  // Its size from arcminutes, at the chart's scale (enlarged 1.6x: it is
  // 3° across, a couple of pixels on a whole-sky disc).
  assert.ok(Math.abs(ell[0].args[2] - (190 / 60) * (R / 90) / 2 * 1.6) < 0.01, `radius ${ell[0].args[2]}`);
  assert.ok(g.calls.some(c => c.name === 'setLineDash' && c.args[0].length), 'the cluster is dashed');
  const names = g.texts.map(t => t.t);
  assert.ok(names.includes('Andromeda Galaxy'));
  assert.ok(!names.includes('M35'), 'no catalogue numbers');
  assert.ok(!names.includes('Eagle Nebula'), 'magnitude 6: marked, not named');
  // And the Stars tab hands them over, from the catalogue Sky View loads.
  assert.match(declSource('StarFinder'), /planets: chartPlanets, deep: chartDeep,/);
  assert.match(declSource('StarFinder'), /deepSky\.filter\(o => o\.mag <= 6\)/);
  // Named after every star, so none of theirs is pushed off.
  assert.ok(names.indexOf('Andromeda Galaxy') > Math.max(...names.map((n, i) => (d.stars.some(s => s.name === n) ? i : -1))));
});
