'use strict';
/*
 * Accessibility: what a screen reader or a keyboard gets.
 *
 * Every failure here is invisible to a sighted mouse user, which is why it
 * went unnoticed: an unlabelled field looks labelled (the label is a div
 * above it), a focus ring overridden by an inline style never shows, and an
 * unlabelled chart is simply silent. So the checks are on what is exposed,
 * not on what is drawn.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extract, declSource, appScript } = require('./extract.js');

const HTML = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const SRC = appScript(HTML);

// WCAG relative luminance and contrast.
const lum = h => {
  const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const token = name => HTML.match(new RegExp('--' + name + ':(#[0-9a-f]{6});', 'i'))[1];

test('the faintest text meets AA (4.5:1) on every surface it sits on', () => {
  const ink = token('ink-faint');
  for (const bg of ['bg', 'bg-glow', 'bg-glow-2', 'surface', 'surface-2']) {
    const r = contrast(ink, token(bg));
    assert.ok(r >= 4.5, `--ink-faint on --${bg}: ${r.toFixed(2)}`);
  }
  // Still quieter than the secondary ink, so the hierarchy survives.
  assert.ok(lum(ink) < lum(token('ink-dim')));
});

test('every input and select has a name a screen reader can say', () => {
  const re = /createElement\(("|')(input|select|textarea)\1,\s*\{/g;
  const bad = [];
  let m;
  while ((m = re.exec(SRC))) {
    let i = m.index + m[0].length, d = 1;
    while (d && i < SRC.length) { if (SRC[i] === '{') d++; else if (SRC[i] === '}') d--; i++; }
    const props = SRC.slice(m.index, i);
    if (!/"aria-label"|'aria-label'|type: ("|')hidden\1/.test(props)) bad.push(props.replace(/\s+/g, ' ').slice(0, 100));
  }
  assert.deepStrictEqual(bad, []);
});

test('the page has one header, one main, and a heading on the Console', () => {
  const app = declSource('TwilightApp');
  assert.match(app, /React\.createElement\("header", \{/);
  assert.match(app, /React\.createElement\("main", \{\s*key: activeTab/);
  assert.strictEqual((app.match(/createElement\("footer"/g) || []).length, 1);
  // The Ephemeris no longer has a footer of its own (two contentinfo landmarks).
  assert.ok(!/createElement\("footer"/.test(declSource('TwilightEphemeris')));
  assert.match(declSource('RealtimeTwilight'), /React\.createElement\("h1", \{ style: \{ margin: 0, font: "inherit" \} \}, React\.createElement\("button", \{\s*onClick: togglePicker/);
});

test('keyboard focus shows even where a field sets outline:none inline', () => {
  assert.match(HTML, /:focus-visible\{\s*outline:2px solid var\(--accent-hi\) !important;/);
});

test('Sky View is a dialog: named, modal, focus on Back, Escape closes', () => {
  const src = declSource('SkyDome');
  assert.match(src, /role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Sky View'/);
  assert.match(src, /createElement\('button', \{ ref: backRef, onClick: onClose/);
  assert.match(src, /if \(backRef\.current\) backRef\.current\.focus\(\);/);
  assert.match(src, /if \(e\.key === 'Escape'\) onClose\(\);/);
  assert.match(src, /if \(before && before\.focus\) before\.focus\(\);/, 'focus goes back where it came from');
  assert.match(src, /createElement\('canvas', \{ ref: canvasRef, role: 'img', 'aria-label': summary/);
});

const m = extract(['D2R', 'R2D', 'rev', 'sin', 'cos', 'COMPASS_WORDS', 'compassWord', 'theName', 'skyViewSummary', 'daySummary']);

test('Sky View in words: where it looks and the brightest things in frame', () => {
  const b = (name, kind, mag, alt = 30) => ({ name, kind, mag, alt, az: 180 });
  assert.strictEqual(m.skyViewSummary({ az: 135, alt: 30.4 }, [b('Vega', 'star', 0.03), b('Moon', 'moon', -12), b('Jupiter', 'planet', -2)]),
    'Looking toward the south-east, 30° up. In view: the Moon, Jupiter and Vega.');
  assert.strictEqual(m.skyViewSummary({ az: 0, alt: 10 }, [b('Sun', 'sun', -26), b('Deneb', 'star', 1.25, -2)]),
    'Looking toward the north, 10° up. Nothing bright in view.', 'never the Sun; nothing below the horizon');
  assert.strictEqual(m.skyViewSummary({ az: 0, alt: 80 }, [b('Vega', 'star', 0.03)]), 'Looking almost straight up. In view: Vega.');
  const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((n, i) => b(n, 'star', i));
  assert.match(m.skyViewSummary({ az: 90, alt: 20 }, many), /In view: A, B, C, D and E\.$/, 'five at most');
});

test('the Ephemeris chart in words', () => {
  const fmt = mins => 'T' + Math.round(mins);
  const day = (rise, set, decl = 0) => ({ p: { decl }, sunrise: rise, sunset: set, noon: 720 });
  assert.strictEqual(m.daySummary(day({ utc: 400 }, { utc: 1100 }, 10), 42, fmt, 1300, 1700),
    'The Sun’s height through the day. It rises at T400, is highest at 58° around T720, and sets at T1100. Fully dark from T1300 to T1700.');
  assert.strictEqual(m.daySummary(day({ none: 'above' }, { none: 'above' }, 23), 70, fmt, null, null),
    'The Sun’s height through the day. It stays up all day, highest at 43° around T720. It never gets fully dark.');
  assert.strictEqual(m.daySummary(day({ none: 'below' }, { none: 'below' }, -23), 80, fmt, null, null),
    'The Sun’s height through the day. It stays below the horizon all day. It never gets fully dark.');
  assert.match(declSource('TwilightEphemeris'), /role: "img",\s*"aria-label": today \? daySummary\(today, latN,/);
});
