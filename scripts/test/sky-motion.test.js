'use strict';
/*
 * The Console painting in motion: twinkling, meteors, and the split into a
 * sky layer and a ground layer that slides under tilt.
 *
 * The rule the painting has kept since it was built is that nothing in it is
 * invented, and motion is where that is easiest to break: a shooting star
 * every few seconds would look lovely and be a lie. So the meteor rate is
 * checked against the standard formula at real showers, the direction against
 * the radiant, and the twinkle against the one thing about it that is
 * physical — it is strongest low down.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'asin', 'atan2', 'rev', 'gmst', 'jd', 'starHcZn',
  'HZ_SPAN', 'panoX', 'panoY', 'heroMoonDisc', 'hzRandom', 'COMPASS16', 'compass16', 'drawMoonDisc',
  'drawHorizonScene', 'drawHorizonSky', 'drawHorizonGround',
  'TWINKLE_MAG', 'twinkleAmp', 'twinkle', 'METEOR_SHOWERS', 'SPORADIC_HR', 'showerActivity',
  'meteorRate', 'newMeteor', 'drawSkyMotion']);

const rng = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const PERSEIDS = m.METEOR_SHOWERS.find(s => s[0] === 'Perseids');

test('showers peak on their dates and fade either side', () => {
  assert.ok(m.showerActivity(PERSEIDS, new Date('2026-08-12T12:00:00Z')) > 0.99);
  assert.ok(m.showerActivity(PERSEIDS, new Date('2026-08-17T12:00:00Z')) < 0.2);
  assert.ok(m.showerActivity(PERSEIDS, new Date('2026-03-01T00:00:00Z')) < 1e-6);
  // A shower that peaks on 3 January is still active on 2 January, across the
  // year boundary from the peak's point of view as well.
  const q = m.METEOR_SHOWERS.find(s => s[0] === 'Quadrantids');
  assert.ok(m.showerActivity(q, new Date('2026-12-31T12:00:00Z')) < 0.01);
  assert.ok(m.showerActivity(q, new Date('2027-01-03T06:00:00Z')) > 0.5);
});

test('meteor rate: the standard hourly rate at a real shower, none by day', () => {
  // Perseid peak, 3 a.m. in Vermont: radiant high in the north-east.
  const d = new Date('2026-08-12T07:00:00Z');
  const r = m.meteorRate(d, 44.26, -72.58, 6.5, -30);
  const p = r.parts.find(x => x.sh && x.sh[0] === 'Perseids');
  assert.ok(p, 'the Perseids are counted');
  const expect = 100 * m.showerActivity(PERSEIDS, d) * Math.sin(p.radiant.alt * m.D2R);
  assert.ok(Math.abs(p.hr - expect) < 1e-9);
  assert.ok(r.total > 50 && r.total < 110, `total ${r.total}`);
  // Light pollution: at a limiting magnitude of 4.5, two magnitudes lost,
  // the rate falls by 2.2 squared.
  const town = m.meteorRate(d, 44.26, -72.58, 4.5, -30);
  assert.ok(Math.abs(town.total * 2.2 * 2.2 - r.total) < 1e-6);
  // Daylight and bright twilight: none.
  assert.strictEqual(m.meteorRate(d, 44.26, -72.58, 6.5, -8).total, 0);
  assert.strictEqual(m.meteorRate(d, 44.26, -72.58, -10, 20).total, 0);
  // An ordinary night: only the sporadic background, a few an hour.
  const plain = m.meteorRate(new Date('2026-03-10T07:00:00Z'), 44.26, -72.58, 6.5, -30);
  assert.strictEqual(plain.parts.length, 1);
  assert.strictEqual(plain.total, m.SPORADIC_HR);
});

test('a shower is not counted while its radiant is below the horizon', () => {
  // The Perseid radiant is circumpolar from Vermont but not from Sydney.
  const d = new Date('2026-08-12T10:00:00Z'); // evening in Sydney
  const r = m.meteorRate(d, -33.87, 151.21, 6.5, -30);
  const rad = m.starHcZn(PERSEIDS[4], PERSEIDS[5], -33.87, 151.21, d);
  assert.ok(rad.alt < 0);
  assert.ok(!r.parts.some(x => x.sh && x.sh[0] === 'Perseids'));
});

test('shower meteors fly away from their radiant', () => {
  const d = new Date('2026-08-12T07:00:00Z');
  const rate = m.meteorRate(d, 44.26, -72.58, 6.5, -30);
  const only = { total: 1, parts: [rate.parts.find(x => x.sh && x.sh[0] === 'Perseids')] };
  only.parts[0] = Object.assign({}, only.parts[0], { hr: 1 });
  const W = 400, hy = 236, facing = 60; // facing the radiant, roughly
  const rad = only.parts[0].radiant;
  const rx = (0.5 + (((rad.az - facing + 540) % 360) - 180) / m.HZ_SPAN) * W;
  const ry = hy - (rad.alt / 75) * (hy - 22);
  const r = rng(5);
  for (let i = 0; i < 50; i++) {
    const mt = m.newMeteor(r, only, W, hy, facing);
    const ox = mt.x - rx, oy = mt.y - ry;
    const n = Math.hypot(ox, oy);
    assert.ok((mt.dx * ox + mt.dy * oy) / n > 0.999, 'heading straight out from the radiant');
    assert.strictEqual(mt.shower, 'Perseids');
    assert.ok(Math.abs(Math.hypot(mt.dx, mt.dy) - 1) < 1e-9);
  }
});

test('twinkling is strongest near the horizon and stays gentle overhead', () => {
  assert.ok(m.twinkleAmp(2) > 3 * m.twinkleAmp(70));
  assert.ok(m.twinkleAmp(90) >= 0.1 && m.twinkleAmp(0) <= 0.5);
  // Two stars do not pulse in step.
  let same = 0;
  for (let t = 0; t < 10; t += 0.1) if (Math.abs(m.twinkle(11, t, 30) - m.twinkle(412, t, 30)) < 0.01) same++;
  assert.ok(same < 10);
  for (let t = 0; t < 20; t += 0.05) {
    const k = m.twinkle(77, t, 5);
    assert.ok(k >= 1 - m.twinkleAmp(5) - 1e-9 && k <= 1 + m.twinkleAmp(5) + 1e-9);
  }
});

function stubCtx() {
  const dots = [], texts = [], strokes = [], ground = [];
  const grad = { addColorStop() {} };
  let path = [];
  return {
    dots, texts, strokes, ground,
    createRadialGradient: () => grad, createLinearGradient: () => grad,
    beginPath() { path = []; }, closePath() {}, fill() { if (path.length > 20) ground.push(path); },
    stroke() { strokes.push(path); }, clip() {}, save() {}, restore() {}, fillRect() {}, clearRect() {},
    ellipse() {}, scale() {}, translate() {}, rotate() {},
    arc(x, y, r) { dots.push({ x, y, r }); },
    moveTo(x, y) { path.push([x, y]); }, lineTo(x, y) { path.push([x, y]); },
    fillText(t, x, y) { texts.push({ t, x, y }); },
    measureText: t => ({ width: t.length * 6 }),
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1, lineCap: ''
  };
}

test('the moving layer: no star twinkles on top of the painted Moon; meteors draw in flight only', () => {
  const W = 400, H = 380, hy = Math.round(H * 0.62);
  const moon = { az: 180, alt: 30, illum: 0.6 };
  const md = m.heroMoonDisc(W, hy, moon, 180);
  const stars = [{ az: 180, alt: 30.5, mag: 1, seed: 3 }, { az: 150, alt: 40, mag: 1, seed: 4 }];
  const g = stubCtx();
  m.drawSkyMotion(g, W, H, { stars, facing: 180, moon, meteors: [] }, 1);
  assert.strictEqual(g.dots.length, 1, 'the star behind the Moon disc is not drawn');
  assert.ok(Math.hypot(g.dots[0].x - md.x, g.dots[0].y - md.y) > md.r);
  const mt = { x: 100, y: 100, dx: 1, dy: 0, len: 100, dur: 0.5, b: 1, t0: 10 };
  const at = t => { const c = stubCtx(); m.drawSkyMotion(c, W, H, { stars: [], facing: 180, moon: null, meteors: [mt] }, t); return c.strokes; };
  assert.strictEqual(at(9.9).length, 0, 'not yet');
  assert.strictEqual(at(10.25).length, 1, 'in flight');
  assert.strictEqual(at(10.6).length, 0, 'burnt out');
});

test('the two layers together draw what the still picture draws', () => {
  const W = 400, H = 380;
  const o = {
    sky: { s: '#000', m: '#000', h: '#000' }, sunAlt: -20, sun: { az: 0, alt: -20 },
    moon: { az: 200, alt: 20, illum: 0.5 }, facing: 180,
    stars: [{ az: 170, alt: 40, mag: 3 }], planets: [{ name: 'Jupiter', az: 160, alt: 30 }],
    bortle: 7, lat: 42, lon: -72
  };
  const whole = stubCtx(); m.drawHorizonScene(whole, W, H, o);
  const sky = stubCtx(); m.drawHorizonScene(sky, W, H, Object.assign({}, o, { part: 'sky' }));
  const ground = stubCtx(); m.drawHorizonScene(ground, W, H, Object.assign({}, o, { part: 'ground' }));
  const names = g => g.texts.map(t => t.t).sort();
  assert.deepStrictEqual(names(whole), [...names(sky), ...names(ground)].sort());
  assert.ok(names(sky).includes('Jupiter') && !names(sky).includes('S'), 'labels on the sky, compass on the ground');
  assert.strictEqual(sky.ground.length, 0, 'no ridge on the sky layer');
  assert.strictEqual(ground.ground.length, 1, 'the ridge on the ground layer');
  // With bleed, the ridge runs past both edges so sliding never shows a gap.
  const bled = stubCtx(); m.drawHorizonScene(bled, W, H, Object.assign({}, o, { part: 'ground', bleed: 10 }));
  const xs = bled.ground[0].filter(p => p[1] < Math.round(H * 0.62)).map(p => p[0]); // the ridge line, not the corners
  assert.ok(Math.min(...xs) <= -10 && Math.max(...xs) >= W + 10);
});
