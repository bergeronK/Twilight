'use strict';
/*
 * Red light mode is red (2026-10-21). An accessibility review of v164 found
 * it wasn't: the filter over the paintings (saturate, sepia, hue-rotate,
 * brightness) turned white into grey, #b2b0a9, so Sky View, the stars, the
 * Moon and the charts stayed grey-white; text drawn over the painting, the
 * night ribbon and the twilight dots never went through it at all; and the
 * red tokens themselves carried green and blue. For a mode whose point is
 * keeping the eyes dark-adapted, green and blue are the light that matters.
 *
 * Three parts, checked here: the film (RED_LIGHT_MATRIX, an SVG
 * feColorMatrix) keeps only red; every colour token red mode sets is pure
 * red, and every :root token with any green or blue in it is one red mode
 * sets; and the colours that used to be written out in code (the words over
 * the painting, the ribbon, the dots, the page washes, Sky View's chips) now
 * go through those tokens. The tokens' contrast is in accessibility.test.js.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extract, declSource } = require('./extract.js');

const HTML = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const { RED_LIGHT_MATRIX, redFilm } = extract(['RED_LIGHT_MATRIX', 'redFilm']);
const APP = declSource('TwilightApp');
const RED_CSS = APP.match(/redMode && React\.createElement\("style", null, `([\s\S]*?)`\)/)[1];

// Custom properties of a CSS block, comments removed.
const props = block => {
  const out = {};
  const re = /--([a-z0-9-]+):([^;]+);/g;
  let m;
  const clean = block.replace(/\/\*[\s\S]*?\*\//g, '');
  while ((m = re.exec(clean))) out[m[1]] = m[2].trim();
  return out;
};
const ROOT = props(HTML.match(/:root\{([\s\S]*?)\n {2}\}/)[1]);
const RED = props(RED_CSS.match(/:root\{([\s\S]*?)\n\s*\}/)[1]);
// Every colour written in a value: #rrggbb, rgb()/rgba(), or a bare triplet.
const colours = (name, v) => {
  if (/^-?\d+,\d+,\d+$/.test(v)) return [v.split(',').map(Number)];
  const out = [];
  v.replace(/#([0-9a-f]{6})\b/gi, (_, h) => out.push([0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))));
  v.replace(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g, (_, r, g, b) => out.push([+r, +g, +b]));
  return out;
};

const matrix = RED_LIGHT_MATRIX.trim().split(/\s+/).map(Number);
const apply = ([r, g, b, a]) => [0, 1, 2, 3].map(row =>
  Math.min(1, Math.max(0, matrix[row * 5] * r + matrix[row * 5 + 1] * g + matrix[row * 5 + 2] * b + matrix[row * 5 + 3] * a + matrix[row * 5 + 4])));

test('the red film keeps red alone: white becomes pure red, blue goes black', () => {
  assert.strictEqual(matrix.length, 20, 'an feColorMatrix is 4 rows of 5');
  assert.deepStrictEqual(matrix.slice(5, 15), Array(10).fill(0), 'the green and blue rows are zero');
  assert.deepStrictEqual(apply([1, 1, 1, 1]), [1, 0, 0, 1], 'white');
  const blue = apply([0, 0, 1, 1]);
  assert.ok(blue[0] <= 0.12 && blue[1] === 0 && blue[2] === 0, 'blue is near-black red: ' + blue);
  assert.deepStrictEqual(apply([0.5, 0.5, 0.5, 0.4]), [0.5, 0, 0, 0.4], 'a grey keeps its brightness, and alpha is kept');
  // Pure red passes unchanged, so a red token inside a filtered picture (the
  // Ephemeris chart's labels, an icon in currentColor) isn't dimmed.
  for (const r of [0.2, 0.78, 1]) assert.deepStrictEqual(apply([r, 0, 0, 1]), [r, 0, 0, 1]);
  for (let i = 0; i < 50; i++) {
    const c = [Math.random(), Math.random(), Math.random(), 1];
    assert.deepStrictEqual(apply(apply(c)), apply(c), 'filtered twice is filtered once');
  }
});

test('redFilm, for colours set in code, is the same film', () => {
  for (const hex of ['#ffffff', '#5f86d8', '#f2b45a', '#7a78d6', '#d9d6cc', '#000000']) {
    const rgb = [0, 2, 4].map(i => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
    const want = apply([...rgb, 1]).slice(0, 3).map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
    assert.strictEqual(redFilm(hex), '#' + want, hex);
  }
  assert.strictEqual(redFilm('var(--accent)'), 'var(--accent)', 'a token is left to red mode');
});

test('the film is an SVG filter in the page, on what is painted', () => {
  assert.match(APP, /redMode && React\.createElement\("svg", \{[^\n]*width: 0, height: 0[^\n]*\n\s*React\.createElement\("filter", \{ id: "tw-red", colorInterpolationFilters: "sRGB" \},\s*React\.createElement\("feColorMatrix", \{ type: "matrix", values: RED_LIGHT_MATRIX \}\)\)\)/);
  assert.doesNotMatch(APP.match(/redMode && React\.createElement\("svg", \{[^\n]*/)[0], /display: "none"/, 'display:none drops the filter in some browsers');
  assert.ok(APP.indexOf('React.createElement("filter", { id: "tw-red"') < APP.indexOf('redMode && React.createElement("style"'), 'the filter comes before the rule that uses it');
  const rule = RED_CSS.match(/([^}]*)\{filter:url\(#tw-red\)\}/);
  assert.ok(rule, 'the rule');
  for (const sel of ['.tw-stars', '#root .hz-sky', '#root main svg', '#root main canvas', '[role="dialog"][aria-label="Sky View"]', '[role="dialog"][aria-label="Welcome to Twilyte"]'])
    assert.ok(rule[1].includes(sel), sel);
  assert.doesNotMatch(RED_CSS, /hue-rotate|sepia|saturate/, 'the old chain that made white grey');
});

test('every colour red mode sets is pure red', () => {
  const bad = [];
  for (const [k, v] of Object.entries(RED)) {
    assert.ok(k in ROOT || k === 'chip-on', `--${k} is a real token`);
    for (const [r, g, b] of colours(k, v)) if (g || b) bad.push(`--${k}: ${v}`);
  }
  assert.deepStrictEqual(bad, []);
});

test('every token with green or blue in it is one red mode replaces', () => {
  const missed = Object.entries(ROOT)
    .filter(([k, v]) => colours(k, v).some(([r, g, b]) => g || b))
    .map(([k]) => k)
    .filter(k => !(k in RED));
  assert.deepStrictEqual(missed, []);
});

test('the twilight colours keep their order of brightness in red', () => {
  const r = k => colours(k, RED[k])[0][0];
  assert.ok(r('band-civil') > r('band-naut') && r('band-naut') > r('band-astro') && r('band-astro') > r('band-night'), 'the ribbon darkens into night');
  assert.ok(r('dot-rise') > r('band-civil') && r('band-naut') > r('dot-astro'), 'the dots, sunrise brightest');
});

test('the colours that were written out in code follow red mode', () => {
  // The twilight dots and the night ribbon.
  const dots = extract(['TWILIGHT_DOTS']).TWILIGHT_DOTS;
  for (const [k, v] of Object.entries(dots)) {
    const t = (v.match(/^var\(--([a-z-]+)\)$/) || [])[1];
    assert.ok(t && t in RED, `TWILIGHT_DOTS.${k} is a token red mode sets: ${v}`);
  }
  const ribbon = declSource('NightRibbon');
  assert.doesNotMatch(ribbon, /#[0-9a-f]{3,6}\b/i, 'no colour written out in the ribbon');
  assert.match(ribbon, /background: 'var\(--band-moon\)'/);
  assert.match(ribbon, /civil: 'var\(--band-civil\)', naut: 'var\(--band-naut\)', astro: 'var\(--band-astro\)', night: 'var\(--band-night\)'/);
  // Words and lines over the painting and Sky View's preview, and the brass
  // edges of buttons: none in white or brass written out.
  const literal = /(color|border|borderColor|background|boxShadow)[^,\n]*rgba\((238,241,250|210,160,77|5,7,15|12,14,22)/;
  for (const name of ['HorizonHero', 'NightRibbon', 'TwilightToday', 'RealtimeTwilight', 'SkyViewPreview', 'MoonMonth', 'TwilightEphemeris', 'StarFinder'])
    assert.doesNotMatch(declSource(name), literal, name);
  assert.match(declSource('HorizonHero'), /textTransform: 'uppercase', color: 'rgba\(var\(--sky-ink-rgb\),\.72\)'/, 'the line over the headline ("Dark until 06:04")');
  assert.match(declSource('RealtimeTwilight'), /fontSize: 12, color: "rgba\(var\(--sky-ink-rgb\),\.78\)"/, 'the date under the place');
  assert.match(declSource('RealtimeTwilight'), /color: "var\(--ink-prose\)"/, 'the almanac');
  // The page's washes: the navy is blue light.
  assert.match(declSource('RealtimeTwilight'), /const pageBg = redMode \? RED_PAGE_BG : PAGE_BG;/);
  assert.match(declSource('StarFinder'), /const pageBg = redMode \? RED_PAGE_BG : PAGE_BG;/);
  assert.match(declSource('TwilightEphemeris'), /const pageBg = redMode \? RED_PAGE_BG : eSky/);
  assert.doesNotMatch(extract(['RED_PAGE_BG']).RED_PAGE_BG, /#/, 'red wash in tokens only');
  // The Ephemeris's dots key its chart, so they take the same film.
  const eph = declSource('TwilightEphemeris');
  assert.match(eph, /const dotColor = c => redMode \? redFilm\(c\) : c;/);
  assert.strictEqual((eph.match(/background: dotColor\(color\),?\s*boxShadow: `0 0 8px \$\{dotColor\(color\)\}`/g) || []).length, 2, 'both lists of dots');
  // The status bar is the red --bg.
  assert.match(APP, new RegExp(`redMode \\? '${RED.bg}' : '#0e0d0b'`));
});

// A full-page scan in red light (2026-10-23) found what the first pass
// missed: the place picker's navy fields and pink messages, the sight
// form's warnings, the wide screen's margin stars, the second buttons'
// navy and the browser's grey placeholders. (Inside a chart's svg the film
// does it.)
test('the place picker, the sight form, the margins and the CSV button follow red mode too', () => {
  const script = HTML.slice(HTML.indexOf('<script>', HTML.indexOf('</style>')));
  for (const lit of ['"#0a0f1c"', '"#c99"', '"#e7b3a3"', '"#dfe6ff"', 'background: "rgba(120,140,200']) {
    assert.ok(!script.includes(lit), `${lit} is still written out in code`);
  }
  for (const v of ['--pick-field', '--ink-warn', '--ink-alert', '--star-dot', '--btn-alt-bg', '--btn-alt-line']) {
    assert.match(RED_CSS, new RegExp(v + ':'), `${v} has a red value`);
    assert.match(HTML, new RegExp('var\\(' + v + '\\)'), `${v} is used`);
  }
  assert.match(RED_CSS, /input::placeholder,textarea::placeholder\{color:var\(--ink-faint\)/);
});

test('Sky View: a chip that is on is filled in red light, not only brass', () => {
  // Through the film brass and white come out the same red, so on and off
  // were told apart only by hue (the review measured #ae8884 and #b2b0a9).
  const dome = declSource('SkyDome');
  const on = dome.match(/const chipOn = \{([^}]*)\};/)[1];
  const off = dome.match(/const chip = \{([^}]*)\};/)[1];
  assert.match(on, /background: 'var\(--chip-on, rgba\(10,12,20,\.72\)\)'/, 'the normal fill is the off chip\'s, so nothing changes outside red mode');
  assert.match(off, /background: 'rgba\(10,12,20,\.72\)'/);
  const fill = colours('chip-on', RED['chip-on'])[0];
  assert.ok(fill[0] >= 200 && /,\.(2|3|4)\d?\)$/.test(RED['chip-on']), 'a clear red fill: ' + RED['chip-on']);
  assert.match(dome, /style: \{ \.\.\.chip, \.\.\.\(cam \? chipOn : null\) \}/, 'Camera on uses the same on style');
});
