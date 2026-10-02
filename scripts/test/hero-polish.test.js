'use strict';
/*
 * The Console's first screen, polished (owner, 2026-10-02):
 * - the painting keeps its size (a taller one, 60% of a phone, was tried and
 *   was too much sky), with one rule for where the horizon sits;
 * - two farther ridges behind the near one, paler toward the sky's colour,
 *   and the brighter air low over the horizon;
 * - the Milky Way with the data's structure brought out, warmer where it is
 *   brighter, and a grain of unresolved stars at the canvas's own pixels (it
 *   read as grey smoke, then as blurry on a phone);
 * - the page's scattered stars only in wide screens' margins (they sat on
 *   the words like dust).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'asin', 'atan2', 'rev', 'hx', 'toHex', 'lerpC',
  'heroHeight', 'heroHorizon', 'panoY', 'horizToEq', 'mwLevel', 'decodeMilkyWay', 'milkyWayField',
  'pixelGrain', 'boxBlur', 'milkyWayGlow', 'HZ_SPAN', 'panoX', 'hzRandom', 'COMPASS16', 'compass16',
  'drawHorizonGround']);
const HTML = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

test('the painting keeps its size: a taller sky was too much (owner, 2026-10-02)', () => {
  // 60% of a phone's height (506 px on an iPhone) was tried and taken back.
  assert.strictEqual(m.heroHeight(390), 380, 'a phone');
  assert.strictEqual(m.heroHeight(1280), 420, 'a wider screen');
  // The horizon where it always was on a phone...
  assert.strictEqual(m.heroHorizon(380), 236);
  // ...and a band of ground under it that stops growing past 150 px, for
  // the welcome, the share card and any taller painting.
  for (const h of [420, 506, 600]) assert.strictEqual(h - m.heroHorizon(h), 150, `${h} px`);
});

test('the painting, its moving layer and its Milky Way agree on where the horizon is', () => {
  const hero = declSource('HorizonHero');
  assert.match(hero, /const H = heroHeight\(width\);/);
  assert.match(hero, /const hy = heroHorizon\(H\), cols = /, 'the Milky Way image');
  assert.match(hero, /newMeteor\(Math\.random, m\.rate, m\.w, heroHorizon\(m\.H\), m\.facing\)/, 'meteors');
  assert.match(declSource('drawSkyMotion'), /const hy = heroHorizon\(h\);/);
  assert.match(declSource('drawHorizonScene'), /const hy = o\.hy \|\| heroHorizon\(h\);/);
  assert.doesNotMatch(hero + declSource('drawSkyMotion'), /\* 0\.62/);
  // The welcome and the share picture keep their own layouts, 62% down.
  assert.match(declSource('WelcomeSky'), /hy: Math\.round\(sh \* 0\.62\)/);
  assert.match(declSource('drawShareCard'), /hy: Math\.round\(ph \* 0\.62\)/);
});

function recorder() {
  const fills = [], rects = [];
  let path = [];
  const g = {
    fillStyle: '', font: '', textAlign: '', textBaseline: '',
    createLinearGradient: () => ({ stops: [], addColorStop(o, c) { this.stops.push([o, c]); } }),
    beginPath() { path = []; }, moveTo(x, y) { path.push([x, y]); }, lineTo(x, y) { path.push([x, y]); },
    closePath() {}, fill() { fills.push({ style: g.fillStyle, path }); },
    fillRect(x, y, w, h) { rects.push({ style: g.fillStyle, x, y, w, h }); }, fillText() {}
  };
  return { g, fills, rects };
}
const ground = sky => {
  const r = recorder();
  m.drawHorizonGround(r.g, 400, 506, { sky, sunAlt: -20, lat: 44, lon: -72, bortle: 3, facing: 180 }, 356, () => null);
  return r;
};
const lum = c => { const [r, g, b] = m.hx(c); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

test('farther ridges are paler, toward the sky’s own colour, and the air low down is brighter', () => {
  const dusk = { s: '#3a4a8a', m: '#b06a8a', h: '#f4a04b' };
  const { fills, rects } = ground(dusk);
  const ridges = fills.filter(f => f.path.length > 20);
  assert.strictEqual(ridges.length, 3);
  const [far, mid, near] = ridges.map(r => r.style);
  assert.strictEqual(near, '#05070d');
  assert.ok(lum(far) > lum(mid) && lum(mid) > lum(near), `${far} ${mid} ${near}`);
  // Tinted by the sky: a dusk ridge is warmer than a night one.
  const night = ground({ s: '#0a0c1c', m: '#141832', h: '#26284a' }).fills.filter(f => f.path.length > 20)[0].style;
  assert.ok(m.hx(far)[0] - m.hx(far)[2] > m.hx(night)[0] - m.hx(night)[2]);
  // The glow is the first thing drawn, from 70 px above the horizon down to it.
  assert.ok(rects[0].style.stops, 'a gradient');
  assert.deepStrictEqual([rects[0].y, rects[0].h], [356 - 70, 72]);
  assert.match(rects[0].style.stops[0][1], /,0\)$/, 'nothing at the top');
  assert.match(rects[0].style.stops[1][1], /,0\.22\)$/, 'a faint glow at night');
  // A sky with no hex colours (as tests pass) still draws, without the glow.
  const plain = ground({ s: '#000', m: '#000', h: '#000' });
  assert.strictEqual(plain.fills.filter(f => f.path.length > 20).length, 3);
  assert.ok(!plain.rects.some(r => r.style.stops && r.y === 286));
});

test('the grain is a fixed scatter over the pixels, between 0 and 1', () => {
  const vals = [];
  for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
    const v = m.pixelGrain(x, y);
    assert.ok(v >= 0 && v < 1);
    assert.strictEqual(m.pixelGrain(x, y), v, 'the same pixel, the same grain');
    vals.push(v);
  }
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  assert.ok(Math.abs(mean - 0.5) < 0.03, `evenly spread (mean ${mean.toFixed(3)})`);
  // Neighbours are unrelated: no streaks along a row or a column.
  let same = 0;
  for (let i = 1; i < 60; i++) if (Math.abs(m.pixelGrain(i, 7) - m.pixelGrain(i - 1, 7)) < 0.02) same++;
  for (let j = 1; j < 60; j++) if (Math.abs(m.pixelGrain(9, j) - m.pixelGrain(9, j - 1)) < 0.02) same++;
  assert.ok(same < 8, `${same} near-equal neighbours`);
});

test('boxBlur smooths without moving or losing light', () => {
  const a = new Float32Array(25); a[12] = 1;
  const b = m.boxBlur(a, 5, 5, 1);
  assert.ok(Math.abs(b.reduce((x, y) => x + y, 0) - 1) < 1e-6, 'nothing lost away from the edges');
  assert.ok(Math.abs(b[12] - 1 / 9) < 1e-6 && Math.abs(b[6] - 1 / 9) < 1e-6 && b[0] === 0);
});

test('the Milky Way glow: sharp at the canvas’s pixels, no light where the data has none, brighter is warmer', () => {
  let put = null, made = null;
  global.document = { createElement: () => (made = { getContext: () => ({
    createImageData: (w, h) => ({ width: w, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: img => { put = img; }
  }) }) };
  try {
    // One row of 2 px cells: dark gaps either side of a faint band, a
    // middling one and a bright cloud, wide enough apart that the light blur
    // keeps them separate. Drawn 4 image pixels to a cell, 2 rows.
    const cols = 60, field = new Float32Array(cols), W = cols * 4;
    for (let i = 8; i < 14; i++) field[i] = 0.2;
    for (let i = 24; i < 30; i++) field[i] = 0.5;
    for (let i = 42; i < 48; i++) field[i] = 1;
    m.milkyWayGlow(field, cols, 1, W, 2);
    assert.deepStrictEqual([made.width, made.height], [W, 2], 'the image is the size asked: the canvas’s pixels');
    const a = x => put.data[4 * x + 3], rgb = x => Array.from(put.data.slice(4 * x, 4 * x + 3));
    const mean = (x0, x1) => { let t = 0; for (let x = x0; x < x1; x++) t += a(x); return t / (x1 - x0); };
    assert.strictEqual(mean(0, 20), 0, 'dark sky stays dark');
    assert.strictEqual(mean(70, 84), 0, 'and so does a gap between');
    // Linear, a fifth of the level would be a fifth of the light; the curve
    // makes it about a tenth.
    const faint = mean(40, 48), bright = mean(176, 184);
    assert.ok(bright > 7 * faint, `the faint band falls away (${faint.toFixed(1)} vs ${bright.toFixed(1)})`);
    const [r, , b] = rgb(180), [fr, , fb] = rgb(44);
    assert.ok(r > b + 20, 'the bright cloud is warm: more red than blue');
    assert.ok(fb > fr, 'the faint band is bluish');
    // The grain: every pixel its own, mostly a little fainter with a few
    // brighter specks, never brightening the band on the whole.
    const mid = []; for (let x = 104; x < 112; x++) mid.push(a(x));
    for (let x = W + 104; x < W + 112; x++) mid.push(put.data[4 * x + 3]);
    assert.ok(new Set(mid).size >= 10, `pixel by pixel: ${mid.join(' ')}`);
    const flat = 255 * Math.min(1, Math.pow(0.5, 1.5) * 1.35);
    const avg = mid.reduce((x, y) => x + y, 0) / mid.length;
    assert.ok(avg < flat && avg > 0.65 * flat, `on the whole a little fainter (${avg.toFixed(1)} of ${flat.toFixed(1)})`);
    assert.ok(Math.max(...mid) <= Math.ceil(1.75 * flat) && Math.min(...mid) >= Math.floor(0.55 * flat));
    m.milkyWayGlow(new Float32Array(cols), cols, 1, W, 2);
    assert.ok(put.data.every((v, k) => k % 4 !== 3 || v === 0), 'no grain where there is no Milky Way');
  } finally {
    delete global.document;
  }
  // The painting asks for it at the canvas's own resolution.
  assert.match(declSource('HorizonHero'), /const dpr = Math\.min\(window\.devicePixelRatio \|\| 1, 2\);\s*return milkyWayGlow\(field, cols, rows, Math\.round\(width \* dpr\), Math\.round\(hy \* dpr\)\);/);
  assert.match(declSource('HorizonHero'), /const dpr = Math\.min\(window\.devicePixelRatio \|\| 1, 2\);\s*const size = /, 'the same cap as the canvas');
});

test('the page’s scattered stars stay out of the content: margins only, none on a phone', () => {
  const css = HTML.slice(HTML.indexOf('<style>'), HTML.indexOf('</style>'));
  assert.match(css, /@media \(max-width:1280px\)\{ \.tw-stars\{ display:none; \} \}/);
  const mask = css.match(/\.tw-stars\{\s*-webkit-mask-image:([^;]+);\s*mask-image:([^;]+);/);
  assert.ok(mask, 'masked in the middle');
  assert.strictEqual(mask[1], mask[2], 'the same mask for Safari');
  assert.match(mask[2], /transparent calc\(50% - 600px\),transparent calc\(50% \+ 600px\)/, 'clear of a 1180 px column');
  // Both pages that draw them use the class the rule hides.
  assert.strictEqual((HTML.match(/className: "tw-stars"/g) || []).length, 2);
});
