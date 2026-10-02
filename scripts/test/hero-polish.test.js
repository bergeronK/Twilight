'use strict';
/*
 * The Console's first screen, polished (owner, 2026-10-02):
 * - the painting is the first screen's main picture: about 60% of a phone's
 *   height, all the extra height going to the sky (it was 380 px, 236 of
 *   them sky, under 30% of an iPhone's screen);
 * - two farther ridges behind the near one, paler toward the sky's colour,
 *   and the brighter air low over the horizon;
 * - the Milky Way with the data's structure brought out, warmer where it is
 *   brighter, and a grain of unresolved stars (it read as grey smoke);
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
  'skyGrain', 'boxBlur', 'milkyWayGlow', 'HZ_SPAN', 'panoX', 'hzRandom', 'COMPASS16', 'compass16',
  'drawHorizonGround']);
const HTML = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

test('the painting fills about 60% of a phone, and the extra height is all sky', () => {
  assert.strictEqual(m.heroHeight(390, 844), 506, 'an iPhone 14/15/16');
  assert.strictEqual(m.heroHeight(375, 667), 440, 'an iPhone SE: never under 440');
  assert.strictEqual(m.heroHeight(430, 1100), 580, 'never over 580 on a phone');
  assert.strictEqual(m.heroHeight(1280, 900), 495, 'a laptop: 55%');
  assert.strictEqual(m.heroHeight(1280, 1400), 560);
  // The horizon where it always was at the old 380 px...
  assert.strictEqual(m.heroHorizon(380), 236);
  // ...and the band of ground under it the same however tall the painting.
  for (const h of [440, 506, 580]) assert.strictEqual(h - m.heroHorizon(h), 150, `${h} px`);
  assert.ok(m.heroHorizon(506) - 236 >= 120, 'at least 120 px more sky on an iPhone');
});

test('the painting, its moving layer and its Milky Way agree on where the horizon is', () => {
  const hero = declSource('HorizonHero');
  assert.match(hero, /const H = heroHeight\(width, vh\);/);
  assert.match(hero, /const hy = heroHorizon\(H\), cols = /, 'the Milky Way image');
  assert.match(hero, /newMeteor\(Math\.random, m\.rate, m\.w, heroHorizon\(m\.H\), m\.facing\)/, 'meteors');
  assert.match(declSource('drawSkyMotion'), /const hy = heroHorizon\(h\);/);
  assert.match(declSource('drawHorizonScene'), /const hy = o\.hy \|\| heroHorizon\(h\);/);
  assert.doesNotMatch(hero + declSource('drawSkyMotion'), /\* 0\.62/);
  // The welcome and the share picture keep their own layouts, 62% down.
  assert.match(declSource('WelcomeSky'), /hy: Math\.round\(sh \* 0\.62\)/);
  assert.match(declSource('drawShareCard'), /hy: Math\.round\(ph \* 0\.62\)/);
  // The screen's height is read again only when the width changes: iOS
  // changes innerHeight while scrolling, and the painting would resize.
  assert.match(hero, /if \(!w \|\| Math\.round\(w\) === lastW\) return;\s*lastW = Math\.round\(w\);\s*setWidth\(lastW\);\s*setVh\(window\.innerHeight \|\| 800\);/);
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

test('the sky’s grain is fixed to the sky, between 0 and 1', () => {
  const vals = [];
  for (let ra = 0; ra < 360; ra += 7.3) for (let dec = -80; dec <= 80; dec += 9.1) {
    const v = m.skyGrain(ra, dec);
    assert.ok(v >= 0 && v < 1);
    assert.strictEqual(m.skyGrain(ra + 360, dec), v, 'the same RA a turn later');
    vals.push(v);
  }
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  assert.ok(Math.abs(mean - 0.5) < 0.06, `evenly spread (mean ${mean.toFixed(3)})`);
  // milkyWayField fills it from where each cell looks, so it turns with the stars.
  const MW = m.decodeMilkyWay(new Uint8Array(fs.readFileSync(path.join(__dirname, '..', '..', 'milkyway.bin'))));
  const grain = new Float32Array(2);
  m.milkyWayField(MW, 2, 1, i => ({ az: 100 + i * 40, alt: 30 }), 44, 200, grain);
  const e = m.horizToEq(140, 30, 44, 200);
  assert.strictEqual(grain[1], Math.fround(m.skyGrain(e.ra, e.dec)));
});

test('boxBlur smooths without moving or losing light', () => {
  const a = new Float32Array(25); a[12] = 1;
  const b = m.boxBlur(a, 5, 5, 1);
  assert.ok(Math.abs(b.reduce((x, y) => x + y, 0) - 1) < 1e-6, 'nothing lost away from the edges');
  assert.ok(Math.abs(b[12] - 1 / 9) < 1e-6 && Math.abs(b[6] - 1 / 9) < 1e-6 && b[0] === 0);
});

test('the Milky Way glow: no light where the data has none; brighter is warmer and stronger', () => {
  let put = null;
  global.document = { createElement: () => ({ getContext: () => ({
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: img => { put = img; }
  }) }) };
  try {
    // One row: dark gaps either side of a faint band and a bright cloud,
    // wide enough apart that the blur keeps them separate.
    const cols = 40, field = new Float32Array(cols), grain = new Float32Array(cols).fill(0.5);
    for (let i = 8; i < 14; i++) field[i] = 0.2;
    for (let i = 26; i < 32; i++) field[i] = 1;
    m.milkyWayGlow(field, grain, cols, 1);
    const px = i => Array.from(put.data.slice(4 * i, 4 * i + 4));
    assert.strictEqual(px(0)[3], 0, 'dark sky stays dark');
    assert.strictEqual(px(20)[3], 0, 'and so does the gap between');
    const faint = px(11), bright = px(29);
    assert.ok(bright[3] > 3 * faint[3], `the faint band falls away (${faint[3]} vs ${bright[3]})`);
    assert.ok(bright[0] - bright[2] > faint[0] - faint[2], 'the bright cloud is warmer');
    assert.ok(faint[2] > faint[0], 'the faint band is bluish');
    // Grain varies the brightness by under a quarter either way, never adds any.
    const g0 = new Float32Array(cols), g1 = new Float32Array(cols).fill(0.999);
    m.milkyWayGlow(field, g0, cols, 1); const lo = put.data[4 * 11 + 3];
    m.milkyWayGlow(field, g1, cols, 1); const hi = put.data[4 * 11 + 3];
    assert.ok(hi > lo && hi / lo < 1.6, `${lo}..${hi}`);
    m.milkyWayGlow(new Float32Array(cols), g1, cols, 1);
    assert.ok(put.data.every((v, k) => k % 4 !== 3 || v === 0), 'no grain where there is no Milky Way');
  } finally {
    delete global.document;
  }
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
