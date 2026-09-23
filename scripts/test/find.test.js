'use strict';
/*
 * Sky View's Find: the list of what's up, the words that guide you to it,
 * and the arrow at the screen edge.
 *
 * The failure that matters is a guide that sends you the wrong way. Its
 * words and its arrow are computed separately (azimuth arithmetic for the
 * words, the camera projection for the arrow), so they are checked against
 * physical postures described in words — facing south, west is on your
 * right — and against each other, not only against themselves.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'asin', 'atan2', 'rev', 'COMPASS16', 'compass16',
  'quatAxis', 'quatMul', 'quatFromEuler', 'quatRotate', 'vecAz', 'viewBasis', 'toScreen', 'skyProject', 'screenDir',
  'sepAltAz', 'COMPASS_WORDS', 'compassWord', 'whereWords', 'PLANET_ORDER', 'findList', 'findTarget',
  'theName', 'capFirst', 'findGuide', 'edgePoint',
  'constellationSegments', 'constellationLabelSpots', 'MOON_MARIA', 'skyBearing', 'bearingOnScreen',
  'drawMoonDisc', 'starGlow', 'drawSkyView']);

// A phone held up facing `az`, `alt` up, as SkyDome builds its drag view.
const facing = (az, alt) => m.viewBasis(m.quatFromEuler((360 - az) % 360, 90 + alt, 0), 0);
const W = 390, H = 844, FOV = 63;
const centreOf = b => m.screenDir(b, W / 2, H / 2, W, H, FOV);
// SkyDome's arrow angle, degrees clockwise from straight up the screen.
const arrow = (b, t) => { const d = m.toScreen(b, t.az, t.alt); return (m.atan2(d.x, d.y) + 360) % 360; };

test('directions in words', () => {
  assert.strictEqual(m.compassWord(0), 'north');
  assert.strictEqual(m.compassWord(135), 'south-east');
  assert.strictEqual(m.compassWord(350), 'north');
  assert.strictEqual(m.compassWord(290), 'west');
  assert.strictEqual(m.whereWords(135, 10), 'low in the south-east');
  assert.strictEqual(m.whereWords(180, 35), 'in the south');
  assert.strictEqual(m.whereWords(270, 60), 'high in the west');
  assert.strictEqual(m.whereWords(10, 80), 'almost overhead');
});

const BODIES = [
  { name: 'Sun', kind: 'sun', az: 250, alt: 20, mag: -26 },
  { name: 'Moon', kind: 'moon', az: 120, alt: 25, mag: -12 },
  { name: 'Saturn', kind: 'planet', az: 160, alt: 30, mag: -2 },
  { name: 'Jupiter', kind: 'planet', az: 90, alt: 12, mag: -2 },
  { name: 'Mars', kind: 'planet', az: 300, alt: -5, mag: -2 },
  { name: 'Vega', kind: 'star', az: 280, alt: 70, mag: 0.03 },
  { name: 'Sirius', kind: 'star', az: 150, alt: 2, mag: -1.46 },
  { name: 'Arcturus', kind: 'star', az: 270, alt: 20, mag: -0.05 },
  { name: 'Polaris', kind: 'star', az: 0, alt: 42, mag: 1.98 },
  { name: undefined, kind: 'star', az: 200, alt: 50, mag: 1.2 }
];
const NAMES = [
  { id: 'Ori', name: 'Orion', rank: 1, az: 110, alt: 20 },
  { id: 'Cyg', name: 'Cygnus', rank: 1, az: 290, alt: 60 },
  { id: 'Lep', name: 'Lepus', rank: 2, az: 140, alt: 15 },
  { id: 'Sco', name: 'Scorpius', rank: 1, az: 200, alt: 5 }
];

test('Find lists only what is up, never the Sun, in a helpful order', () => {
  const g = m.findList(BODIES, NAMES);
  assert.deepStrictEqual(g.map(x => x.title), ['Moon and planets', 'Brightest stars', 'Constellations']);
  assert.deepStrictEqual(g[0].items.map(i => i.name), ['Moon', 'Jupiter', 'Saturn'], 'Moon first, then planets by brightness; Mars is down');
  assert.deepStrictEqual(g[1].items.map(i => i.name), ['Arcturus', 'Vega'], 'brightest first; Sirius too low, Polaris too faint, unnamed left out');
  assert.deepStrictEqual(g[2].items.map(i => i.name), ['Cygnus', 'Orion'], 'the familiar ones 10° up, A to Z');
  assert.strictEqual(g[0].items[1].where, 'low in the east');
  assert.ok(!JSON.stringify(g).includes('Sun'));
  assert.deepStrictEqual(m.findList(BODIES.filter(b => b.alt < 3 || b.kind === 'sun'), []), [], 'empty groups are dropped');
});

test('findTarget finds bodies and constellations', () => {
  assert.strictEqual(m.findTarget('Saturn', BODIES, NAMES).kind, 'planet');
  assert.deepStrictEqual(m.findTarget('Orion', BODIES, NAMES), { name: 'Orion', az: 110, alt: 20, kind: 'const', id: 'Ori' });
  assert.strictEqual(m.findTarget('Nope', BODIES, NAMES), null);
  assert.strictEqual(m.findTarget(null, BODIES, NAMES), null);
});

test('the words: facing south, west is to the right and higher is up', () => {
  const b = facing(180, 30), c = centreOf(b);
  assert.ok(Math.abs(c.az - 180) < 1e-6 && Math.abs(c.alt - 30) < 1e-6);
  assert.strictEqual(m.findGuide(c, { name: 'Arcturus', az: 220, alt: 30 }).text, 'Turn right 40°.');
  assert.strictEqual(m.findGuide(c, { name: 'Jupiter', az: 90, alt: 12 }).text, 'Turn left 90° and tilt down 18°.');
  assert.strictEqual(m.findGuide(c, { name: 'Vega', az: 181, alt: 70 }).text, 'Tilt up 40°.', 'a degree of turn is not worth saying');
  assert.strictEqual(m.findGuide(c, { name: 'Moon', az: 182, alt: 32 }).text, 'That’s the Moon, in the ring.');
  assert.ok(m.findGuide(c, { name: 'Moon', az: 182, alt: 32 }).on);
  assert.strictEqual(m.findGuide(c, { name: 'Moon', az: 90, alt: -4 }).text, 'The Moon is below the horizon now.');
  // Behind you: the short way round.
  assert.strictEqual(m.findGuide(c, { name: 'Polaris', az: 10, alt: 30 }).text, 'Turn left 170°.');
  // Across north: facing 350°, something at 20° is 30° to the right.
  assert.strictEqual(m.findGuide({ az: 350, alt: 30 }, { name: 'Capella', az: 20, alt: 30 }).text, 'Turn right 30°.');
  // Looking straight up, turning is meaningless.
  assert.strictEqual(m.findGuide({ az: 180, alt: 85 }, { name: 'Vega', az: 40, alt: 50 }).text, 'Tilt down 35°.');
});

test('the arrow points the way the words say', () => {
  const b = facing(180, 30);
  const right = arrow(b, { az: 260, alt: 30 }), left = arrow(b, { az: 100, alt: 30 });
  const up = arrow(b, { az: 180, alt: 85 }), down = arrow(b, { az: 180, alt: -30 });
  // Sideways at the same height reads a little upward on a raised phone
  // (the altitude circle curves up toward the sides), so a quarter, not 90°.
  assert.ok(right > 45 && right < 135, `right ${right}`);
  assert.ok(left > 225 && left < 315, `left ${left}`);
  assert.ok(up < 5 || up > 355, `up ${up}`);
  assert.ok(Math.abs(down - 180) < 5, `down ${down}`);
  // And across the sky: wherever the words say right, the arrow is on the
  // right half; left, the left half.
  const c = centreOf(b);
  for (let az = 0; az < 360; az += 7) for (const alt of [5, 25, 45]) {
    const t = { name: 'x', az, alt }, gd = m.findGuide(c, t), a = arrow(b, t);
    if (gd.on || Math.abs(gd.turn) < 20 || Math.abs(gd.turn) > 160) continue;
    assert.strictEqual(a > 0 && a < 180, gd.turn > 0, `az ${az} alt ${alt}: turn ${gd.turn.toFixed(0)}, arrow ${a.toFixed(0)}`);
  }
});

test('edgePoint puts the arrow on the screen edge, inset', () => {
  const near = (p, x, y) => Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9;
  assert.ok(near(m.edgePoint(0, W, H, 30), W / 2, 30), 'up: the top edge');
  assert.ok(near(m.edgePoint(90, W, H, 30), W - 30, H / 2), 'right');
  assert.ok(near(m.edgePoint(180, W, H, 30), W / 2, H - 30), 'down');
  assert.ok(near(m.edgePoint(270, W, H, 30), 30, H / 2), 'left');
  // On a tall phone, 45° meets the side, not the top.
  const p = m.edgePoint(45, W, H, 30);
  assert.ok(Math.abs(p.x - (W - 30)) < 1e-9 && p.y > 30 && p.y < H / 2);
});

// A canvas stand-in that remembers the stroke colour of each line drawn.
function strokeCtx() {
  const lines = [], texts = [];
  let path = [];
  const g = {
    strokeStyle: '', fillStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1, lineCap: '',
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    measureText: t => ({ width: t.length * 6 }), fillText(t, x, y) { texts.push({ t, color: this.fillStyle }); },
    beginPath() { path = []; }, moveTo(x, y) { path.push([x, y]); }, lineTo(x, y) { path.push([x, y]); },
    stroke() { lines.push({ color: this.strokeStyle, n: path.length }); },
    arc() {}, fill() {}, fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, ellipse() {}, clip() {}, closePath() {}
  };
  return { g, lines, texts };
}

test('a constellation picked in Find is drawn in amber and named, even with Lines off', () => {
  const b = facing(110, 25);
  const lines = [
    { id: 'Ori', rank: 1, pts: [{ az: 105, alt: 18 }, { az: 110, alt: 24 }, { az: 116, alt: 20 }] },
    { id: 'Tau', rank: 1, pts: [{ az: 95, alt: 30 }, { az: 100, alt: 34 }] }
  ];
  const names = [{ id: 'Ori', name: 'Orion', rank: 1, az: 110, alt: 21 }, { id: 'Tau', name: 'Taurus', rank: 1, az: 97, alt: 32 }];
  const o = { basis: b, fov: FOV, cam: false, bodies: [], lines, names, showLines: false, targetName: 'Orion' };
  const r = strokeCtx();
  m.drawSkyView(r.g, W, H, o);
  const amber = r.lines.filter(l => /232,181,99/.test(l.color));
  assert.strictEqual(amber.length, 2, "Orion's two segments, and not Taurus's");
  assert.ok(r.texts.some(t => t.t === 'Orion' && t.color === '#e8b563'));
  // With Lines on, the usual spaced-capitals name gives way to the amber one.
  const on = strokeCtx();
  m.drawSkyView(on.g, W, H, Object.assign({}, o, { showLines: true }));
  assert.ok(!on.texts.some(t => t.t.replace(/\u2009/g, '') === 'ORION'), 'not named twice');
  assert.ok(on.texts.some(t => t.t.replace(/\u2009/g, '') === 'TAURUS'), 'others still named');
  const none = strokeCtx();
  m.drawSkyView(none.g, W, H, Object.assign({}, o, { targetName: 'Vega' }));
  assert.ok(!none.lines.some(l => /232,181,99/.test(l.color)), 'nothing amber for a star target');
});

test('Aim Assist can aim at anything Sky View can pick', () => {
  // It used to resolve only the Sun, the Moon and the navigation stars, so a
  // planet or a constellation picked in Sky View gave it nothing to aim at.
  const src = declSource('StarFinder');
  assert.match(src, /findTarget\(aimTargetName, skyBodies, constellationNames\)/);
  // Declared before use: a useMemo reading a later const throws on render.
  assert.ok(src.indexOf('const skyBodies = useMemo') < src.indexOf('const aimTarget = useMemo'));
  assert.ok(src.indexOf('const constellationNames = useMemo') < src.indexOf('const aimTarget = useMemo'));
  // Constellations carry their id through to Sky View, which needs it to
  // pick the figure out.
  assert.match(src, /id: c\.id, rank: c\.rank,/);
  assert.match(src, /return \{ id: c\.id, name: c\.name/);
});
