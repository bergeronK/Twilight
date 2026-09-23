'use strict';
/*
 * The "Share tonight's sky" picture. It leaves the app, so what is on it is
 * what people see of Twilyte without the app around it: the place, the time,
 * the verdict, the painting and the address must all be there, and nothing
 * may run off the edge whatever the place is called.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'asin', 'atan2', 'rev', 'hx', 'toHex', 'lerpC', 'skyColors',
  'HZ_SPAN', 'panoX', 'panoY', 'hzRandom', 'COMPASS16', 'compass16', 'MOON_MARIA', 'skyBearing',
  'drawMoonDisc', 'heroMoonDisc', 'starGlow', 'drawHorizonScene', 'drawHorizonSky', 'drawHorizonGround',
  'wrapText', 'drawShareCard']);

function recCtx() {
  const texts = [], calls = [];
  let font = '';
  const grad = { addColorStop() {} };
  // Roughly Inter's width: 0.55 of the font size per character.
  const size = () => +(/(\d+)px/.exec(font) || [0, 12])[1];
  const g = new Proxy({
    createRadialGradient: () => grad, createLinearGradient: () => grad,
    measureText: t => ({ width: String(t).length * size() * 0.55 }),
    fillText: (t, x, y) => texts.push({ t, x, y, w: String(t).length * size() * 0.55, align: g.textAlign }),
    textAlign: 'left'
  }, {
    get(t, k) { if (k in t) return t[k]; return (...a) => calls.push([k, a]); },
    set(t, k, v) { if (k === 'font') font = v; t[k] = v; return true; }
  });
  return { g, texts, calls };
}

const scene = {
  sky: m.skyColors(-25), sunAlt: -25, sun: { az: 0, alt: -25 }, moon: { az: 150, alt: 30, illum: 0.6 },
  facing: 180, stars: [{ az: 170, alt: 40, mag: 1 }], planets: [{ name: 'Saturn', az: 200, alt: 30 }],
  bortle: 3, lat: 44, lon: -72
};
const card = over => Object.assign({ scene, place: 'Stowe, VT', when: 'Wednesday, August 12 · 22:30', label: 'Dark until 03:56', head: 'Excellent stargazing', sub: 'Dark skies and the Moon is down.', highlight: 'The Perseids peak tonight' }, over);

test('the card carries the place, the time, the verdict, the highlight and the address', () => {
  const { g, texts, calls } = recCtx();
  m.drawShareCard(g, 1080, 1350, card());
  const all = texts.map(t => t.t).join(' | ');
  for (const s of ['Stowe, VT', 'Wednesday, August 12', 'DARK UNTIL 03:56', 'Excellent stargazing', 'Dark skies and the Moon is down.', '✦ The Perseids peak tonight', 'twilyte.info'])
    assert.ok(all.includes(s), `missing ${s}: ${all}`);
  assert.ok(calls.some(c => c[0] === 'scale' && c[1][0] === 2), 'the painting is drawn at half size, scaled up');
  assert.ok(texts.some(t => t.t === 'Saturn'), 'with its labels');
});

test('long names and verdicts wrap inside the card', () => {
  const { g, texts } = recCtx();
  m.drawShareCard(g, 1080, 1350, card({ head: 'A very long verdict that could never fit across one line of the card', sub: 'And a subtitle that goes on and on and on for rather longer than any real one does today.' }));
  const inside = texts.filter(t => t.align !== 'right' && t.y > 600);
  inside.forEach(t => assert.ok(t.x + t.w <= 1080 - 64 + 1, `"${t.t}" runs to ${t.x + t.w}`));
  const head = 'A very long verdict that could never fit across one line of the card';
  assert.strictEqual(inside.filter(t => head.includes(t.t)).length, 2, 'the verdict takes two lines at most');
  const bottom = Math.max(...texts.filter(t => t.align !== 'right').map(t => t.y));
  assert.ok(bottom < 1350 - 90, 'and everything stays clear of the address');
});

test('no highlight, no highlight line', () => {
  const { g, texts } = recCtx();
  m.drawShareCard(g, 1080, 1350, card({ highlight: null }));
  assert.ok(!texts.some(t => String(t.t).startsWith('✦ ') && !t.t.includes('twilyte')));
});

test('wrapText breaks between words, never inside one', () => {
  const g = { measureText: t => ({ width: t.length * 10 }) };
  assert.deepStrictEqual(m.wrapText(g, 'one two three four', 90), ['one two', 'three', 'four']);
  assert.deepStrictEqual(m.wrapText(g, 'extraordinarily', 50), ['extraordinarily'], 'a long word stays whole');
});
