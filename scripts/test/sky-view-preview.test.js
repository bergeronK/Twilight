'use strict';
/*
 * The Stars tab opens on a preview of Sky View, drawn by the same painter as
 * the full-screen overlay (drawSkyView, pulled out of SkyDome for this). The
 * point of sharing it is that the two can't drift apart, so the source is
 * checked for exactly that; the painter itself is driven against a recording
 * canvas for what the preview needs from it: names kept clear of the text
 * laid over the picture, and no aiming reticle.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'asin', 'atan2', 'rev', 'COMPASS16', 'compass16',
  'quatAxis', 'quatMul', 'quatFromEuler', 'quatRotate', 'vecAz', 'viewBasis', 'toScreen', 'skyProject',
  'constellationSegments', 'constellationLabelSpots', 'MOON_MARIA', 'skyBearing', 'bearingOnScreen',
  'drawMoonDisc', 'starGlow', 'drawSkyView']);

function recCtx() {
  const calls = [], texts = [], arcs = [];
  const grad = { addColorStop() {} };
  const g = new Proxy({
    createRadialGradient: () => grad, createLinearGradient: () => grad,
    measureText: t => ({ width: t.length * 6 }),
    fillText: (t, x, y) => texts.push({ t, x, y }),
    arc: (x, y, r) => arcs.push({ x, y, r })
  }, {
    get(t, k) { if (k in t) return t[k]; return (...a) => calls.push([k, a]); },
    set() { return true; }
  });
  return { g, calls, texts, arcs };
}

const W = 390, H = 400;
// Looking south, 28° up, as the preview does.
const basis = m.viewBasis(m.quatFromEuler(180, 90 + 28, 0), 0);
const at = (x, y) => {
  // A body placed at a given screen point, found by searching the sky.
  let best = null;
  for (let az = 90; az <= 270; az += 0.5) for (let alt = 0; alt <= 70; alt += 0.5) {
    const p = m.skyProject(m.toScreen(basis, az, alt), W, H, 64);
    if (!p) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (!best || d < best.d) best = { d, az, alt };
  }
  return best;
};

test('the preview keeps names clear of the text over the picture', () => {
  const inHeader = at(60, 60), inMiddle = at(200, 220), atFoot = at(120, 360);
  const bodies = [
    { name: 'Header star', kind: 'star', mag: 1, nav: true, az: inHeader.az, alt: inHeader.alt },
    { name: 'Middle star', kind: 'star', mag: 1, nav: true, az: inMiddle.az, alt: inMiddle.alt },
    { name: 'Foot star', kind: 'star', mag: 1, nav: true, az: atFoot.az, alt: atFoot.alt }
  ];
  const o = { basis, fov: 64, cam: false, bodies, lines: [], names: [], showLines: false, targetName: null };
  const plain = recCtx();
  m.drawSkyView(plain.g, W, H, o);
  const names = r => r.texts.map(t => t.t);
  assert.ok(['Header star', 'Middle star', 'Foot star'].every(n => names(plain).includes(n)), 'all named in Sky View itself');
  const pv = recCtx();
  m.drawSkyView(pv.g, W, H, Object.assign({}, o, { keepClear: { w: 240, h: 150, bottom: 120 }, reticle: false }));
  assert.deepStrictEqual(names(pv).filter(n => n.endsWith('star')), ['Middle star']);
  // The stars themselves are still drawn; only their names give way.
  assert.ok(pv.arcs.length >= 3);
});

test('no aiming reticle on the preview', () => {
  const o = { basis, fov: 64, cam: false, bodies: [], lines: [], names: [], showLines: false, targetName: null };
  const reticle = r => r.arcs.some(a => a.r === 16 && Math.abs(a.x - W / 2) < 1e-9 && Math.abs(a.y - H / 2) < 1e-9);
  const full = recCtx(); m.drawSkyView(full.g, W, H, o);
  assert.ok(reticle(full), 'Sky View has one');
  const pv = recCtx(); m.drawSkyView(pv.g, W, H, Object.assign({}, o, { reticle: false }));
  assert.ok(!reticle(pv));
});

test('Sky View and its preview are drawn by the one painter', () => {
  assert.match(declSource('SkyDome'), /drawSkyView\(g, w, h, \{/);
  assert.match(declSource('SkyViewPreview'), /drawSkyView\(g, width, H, \{/);
  // The preview looks where the overlay starts without sensors.
  assert.match(declSource('StarFinder'), /initialAz: previewFacing/);
  assert.match(declSource('StarFinder'), /facing: previewFacing/);
});
