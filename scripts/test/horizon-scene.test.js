'use strict';
/*
 * drawHorizonScene, the Console's painted sky, driven against a recording
 * stand-in for the canvas context (the same approach as star-chart.test.js).
 *
 * Three things a phone screenshot showed wrong on 2026-09-23 and a syntax
 * check could never see: planets painted and labelled in a blue daytime sky
 * (where no one can see them), a planet label printed over the place-name
 * header, and a city skyline of 70 px blocks that read as a bar chart.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'hx', 'toHex', 'lerpC', 'skyColors',
  'HZ_SPAN', 'panoX', 'panoY', 'hzRandom', 'drawMoonDisc', 'COMPASS16', 'compass16', 'drawHorizonScene']);

function stubCtx() {
  const texts = [], dots = [], ground = [];
  const grad = { addColorStop() {} };
  let path = [];
  return {
    texts, dots, ground,
    createRadialGradient: () => grad, createLinearGradient: () => grad,
    beginPath() { path = []; }, closePath() {}, fill() { if (path.length > 20) ground.push(path); },
    stroke() {}, clip() {}, save() {}, restore() {}, setLineDash() {}, fillRect() {},
    ellipse() {}, scale() {}, translate() {}, rotate() {},
    arc(x, y, r) { dots.push({ x, y, r }); },
    moveTo(x, y) { path.push([x, y]); }, lineTo(x, y) { path.push([x, y]); },
    fillText(t, x, y) { texts.push({ t, x, y }); },
    measureText: t => ({ width: t.length * 6 }),
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1
  };
}

const W = 400, H = 380;
const scene = over => Object.assign({
  sky: m.skyColors(20), sunAlt: 20, sun: { az: 150, alt: 20 },
  moon: { az: 300, alt: -20, illum: 0.5 }, facing: 180,
  stars: [], planets: [{ name: 'Jupiter', az: 180, alt: 40 }, { name: 'Mars', az: 220, alt: 30 }],
  bortle: 3, lat: 42, lon: -72
}, over);
const paint = o => { const g = stubCtx(); m.drawHorizonScene(g, W, H, o); return g; };
const names = g => g.texts.map(t => t.t);

test('no planets in a daylight sky: they are up, but no one can see them', () => {
  const g = paint(scene());
  assert.ok(!names(g).includes('Jupiter') && !names(g).includes('Mars'));
});

test('planets appear once the sky is dark enough, from mid civil twilight', () => {
  assert.ok(names(paint(scene({ sunAlt: -4, sky: m.skyColors(-4) }))).includes('Jupiter'));
  assert.ok(!names(paint(scene({ sunAlt: -2, sky: m.skyColors(-2) }))).includes('Jupiter'), 'not with the Sun just down');
});

test('a label that would cover the place-name header moves aside, or is left off', () => {
  const night = { sunAlt: -20, sky: m.skyColors(-20) };
  // Jupiter sits under the header; its name would print right of it, into
  // the header, so it flips left of the body, clear of the reserved box.
  const x = m.panoX(150, 180, m.HZ_SPAN) * W;
  const reserve = { w: x + 60, h: 200 };
  const g = paint(scene(Object.assign({}, night, { planets: [{ name: 'Jupiter', az: 150, alt: 60 }], reserve })));
  const j = g.texts.find(t => t.t === 'Jupiter');
  assert.ok(!j || j.x < x, `Jupiter label at ${j && j.x} would sit in the header`);
  // Deep inside the box, with no room either side: the dot stays, the name goes.
  const g2 = paint(scene(Object.assign({}, night, { planets: [{ name: 'Jupiter', az: 150, alt: 60 }], reserve: { w: W, h: 300 } })));
  assert.ok(!names(g2).includes('Jupiter'));
  assert.ok(g2.dots.some(d => Math.abs(d.x - x) < 1), 'the planet itself is still drawn');
  // With no header, the label prints as always.
  assert.ok(names(paint(scene(Object.assign({}, night, { planets: [{ name: 'Jupiter', az: 150, alt: 60 }] })))).includes('Jupiter'));
});

test('the horizon is a soft ridge everywhere: no buildings, no vertical walls', () => {
  const hy = Math.round(H * 0.62);
  for (const bortle of [2, 8]) {
    const g = paint(scene({ bortle }));
    const outline = g.ground.find(p => p.some(([, y]) => y < hy));
    assert.ok(outline, 'a horizon was drawn');
    const top = outline.filter(([, y]) => y < hy + 1);
    // A building is a vertical wall: two consecutive points at one x. The
    // ridge advances in x at every point.
    for (let i = 1; i < top.length; i++) assert.ok(top[i][0] > top[i - 1][0], `a vertical edge at x=${top[i][0]} (bortle ${bortle})`);
    // Nor any sudden step: neighbouring points 3 px apart differ by under 4 px.
    for (let i = 1; i < top.length; i++) assert.ok(Math.abs(top[i][1] - top[i - 1][1]) < 4, `a ${Math.abs(top[i][1] - top[i - 1][1]).toFixed(1)} px step (bortle ${bortle})`);
    assert.ok(Math.max(...top.map(([, y]) => hy - y)) <= 22, 'the ridge stays low');
  }
});
