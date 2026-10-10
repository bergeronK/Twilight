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

test('compass letters stay clear of the buttons and the words over the picture', () => {
  // Looking north-east 29° up, as the store shot did: the horizon sits near
  // the bottom, where Sky View's bottom line is, and "NE" was written on it.
  const low = m.viewBasis(m.quatFromEuler((360 - 55) % 360, 90 + 29, 0), 0);
  const H2 = 912;
  const o = { basis: low, fov: 63, cam: false, bodies: [], lines: [], names: [], showLines: false, targetName: null };
  const letters = r => r.texts.filter(t => /^[NESW]{1,3}$/.test(t.t));
  // Where the horizon's letters fall with nothing kept clear: near the foot.
  const all = recCtx(); m.drawSkyView(all.g, W, H2, Object.assign({}, o, { clearTop: 0, clearBottom: 0 }));
  assert.ok(letters(all).some(t => t.y > H2 - 76), 'the case: a letter under the bottom line');
  const full = recCtx(); m.drawSkyView(full.g, W, H2, o);
  assert.ok(letters(full).every(t => t.y <= H2 - 76 && t.y - 12 >= 72), 'none under the bottom line or the buttons');
  // Level, the horizon runs across the middle and its letters stay.
  const level = recCtx();
  m.drawSkyView(level.g, W, H2, Object.assign({}, o, { basis: m.viewBasis(m.quatFromEuler(0, 90, 0), 0) }));
  assert.deepStrictEqual(letters(level).map(t => t.t), ['N'], 'facing north, level');
  // The preview keeps clear of its own, larger, overlays.
  const pv = recCtx();
  m.drawSkyView(pv.g, W, 450, Object.assign({}, o, { basis, clearTop: 150, clearBottom: 120 }));
  assert.ok(letters(pv).every(t => t.y <= 450 - 120 && t.y - 12 >= 150));
});

test('a constellation’s name steps off a star’s name, or is left off', () => {
  // "PISCIS AUSTRINUS" was written across "Fomalhaut" (store screenshots).
  const spot = at(200, 220);
  const names = [{ id: 'PsA', name: 'Piscis Austrinus', rank: 1, az: spot.az, alt: spot.alt }];
  const lines = [{ id: 'PsA', rank: 1, pts: [] }];
  const base = { basis, fov: 64, cam: false, lines, names, showLines: true, targetName: null };
  const textBox = (r, t) => {
    // The recorder's measureText is 6 px a character, the name centred and
    // the star's name to its right at baseline y + 4.
    if (t.t === 'Fomalhaut') return { x1: t.x, x2: t.x + 6 * t.t.length, y1: t.y - 12, y2: t.y };
    const half = 3 * t.t.length;
    return { x1: t.x - half, x2: t.x + half, y1: t.y - 7, y2: t.y + 7 };
  };
  const overlap = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
  const nameOf = r => r.texts.find(t => /^P\u2009I\u2009S/.test(t.t));
  // Nothing in the way: the name sits on its spot.
  const alone = recCtx(); m.drawSkyView(alone.g, W, H, Object.assign({ bodies: [] }, base));
  assert.ok(nameOf(alone), 'named');
  const home = nameOf(alone).y;
  // A named star just left of the spot: the name moves off its label.
  const star = at(150, 222);
  const fom = { name: 'Fomalhaut', kind: 'star', mag: 1.2, nav: true, az: star.az, alt: star.alt };
  const r = recCtx(); m.drawSkyView(r.g, W, H, Object.assign({ bodies: [fom] }, base));
  const n = nameOf(r), f = r.texts.find(t => t.t === 'Fomalhaut');
  assert.ok(n && f, 'both named');
  assert.ok(Math.abs(n.y - home) === 16, `moved a line (${home} → ${n.y})`);
  assert.ok(!overlap(textBox(r, n), textBox(r, f)), 'not across the star’s name');
  // A faint, unnamed star there changes nothing.
  const faint = recCtx(); m.drawSkyView(faint.g, W, H, Object.assign({ bodies: [Object.assign({}, fom, { name: 'HIP 1', nav: false, mag: 4 })] }, base));
  assert.strictEqual(nameOf(faint).y, home);
  // Hemmed in above and below: left off rather than written across.
  const crowd = [fom, ...[-16, 16].map((dy, i) => { const q = at(150, 222 + dy); return Object.assign({}, fom, { name: 'Star' + i, az: q.az, alt: q.alt }); })];
  const c = recCtx(); m.drawSkyView(c.g, W, H, Object.assign({ bodies: crowd }, base));
  const cn = nameOf(c);
  assert.ok(!cn || crowd.every(b => { const t = c.texts.find(x => x.t === b.name); return !t || !overlap(textBox(c, cn), { x1: t.x, x2: t.x + 6 * t.t.length, y1: t.y - 12, y2: t.y }); }));
});

test('a name that steps aside doesn’t land on another name', () => {
  // PISCIS AUSTRINUS stepped up off Fomalhaut onto CAPRICORNUS.
  // Fomalhaut's name blocks the spot and the line below; the line above is
  // where Capricornus is written.
  const a = at(200, 220), b = at(290, 204), star = at(150, 224);
  const names = [
    { id: 'Cap', name: 'Capricornus', rank: 1, az: b.az, alt: b.alt },
    { id: 'PsA', name: 'Piscis Austrinus', rank: 1, az: a.az, alt: a.alt }
  ];
  const fom = { name: 'Fomalhaut', kind: 'star', mag: 1.2, nav: true, az: star.az, alt: star.alt };
  const o = { basis, fov: 64, cam: false, lines: [{ id: 'Cap', rank: 1, pts: [] }], names, showLines: true, targetName: null, bodies: [fom] };
  const r = recCtx(); m.drawSkyView(r.g, W, H, o);
  const spaced = r.texts.filter(t => /\u2009/.test(t.t)).map(t => {
    const half = 3 * t.t.length;
    return { t: t.t, x1: t.x - half, x2: t.x + half, y1: t.y - 7, y2: t.y + 7 };
  });
  // Nowhere left for Piscis Austrinus, so it is left off; Capricornus stays.
  assert.deepStrictEqual(spaced.map(t => t.t.replace(/\u2009/g, '')), ['CAPRICORNUS']);
  for (let i = 0; i < spaced.length; i++) for (let j = i + 1; j < spaced.length; j++) {
    const p = spaced[i], q = spaced[j];
    assert.ok(!(p.x1 < q.x2 && q.x1 < p.x2 && p.y1 < q.y2 && q.y1 < p.y2), `${p.t} on ${q.t}`);
  }
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

test("Sky View carries Aim Assist's Align, where the error is seen", () => {
  // Field report, build v100: the drawn Moon sat ~6° left of the real one on
  // an iPhone, the phone compass's own error. The correction existed only on
  // the Stars tab; Sky View must offer the same one, wired to the same
  // handler, and only when it can mean something (sensors live, a target).
  assert.match(declSource('StarFinder'), /align: skyShift \? null : \{ onAlign: alignHere, ok: alignOk, onReset: \(\) => prefStore\.setAimOffset\(0\), offset: aimOffset \}/);
  assert.match(declSource('SkyDome'), /live && target && align && React\.createElement/);
});
