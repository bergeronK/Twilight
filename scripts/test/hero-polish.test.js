'use strict';
/*
 * The Console's first screen, polished (owner, 2026-10-02):
 * - the painting keeps its size (a taller one, 60% of a phone, was tried and
 *   was too much sky), with one rule for where the horizon sits;
 * - two farther ridges behind the near one, paler toward the sky's colour,
 *   and the brighter air low over the horizon;
 * - no Milky Way in the painting: grey smoke, a blurry glow and a grainy
 *   one were each tried and each made it less appealing (owner);
 * - the page's scattered stars only in wide screens' margins (they sat on
 *   the words like dust).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'asin', 'atan2', 'rev', 'hx', 'toHex', 'lerpC',
  'heroHeight', 'heroHorizon', 'panoY', 'HZ_SPAN', 'panoX', 'hzRandom', 'COMPASS16', 'compass16',
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

test('the painting and its moving layer agree on where the horizon is', () => {
  const hero = declSource('HorizonHero');
  assert.match(hero, /const H = heroHeight\(width\);/);
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

test('the painting has no Milky Way (owner, 2026-10-02)', () => {
  // Not loaded, sampled or passed on, so the welcome and the share picture
  // have none either; the Stars tab's chart and Sky View keep theirs.
  const hero = declSource('HorizonHero');
  assert.doesNotMatch(hero, /loadMilkyWay|milkyWayField|milkyWayImage|\bmw:/);
  assert.doesNotMatch(declSource('drawHorizonSky'), /drawImage/);
  assert.match(declSource('SkyChart'), /milkyWayField/, 'the chart still draws it');
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
