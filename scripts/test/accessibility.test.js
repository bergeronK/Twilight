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

/*
 * Red light mode's tokens (2026-10-21): --ink-faint was 2.0:1 and --ink-dim
 * 3.3:1 on the red surfaces, and axe found 12-15 failing nodes a screen. The
 * inks are pure red now (no green or blue, red-mode.test.js), and pure red
 * reaches at most 5.3:1 on black, so --ink-dim takes AA and --ink-faint the
 * large-text 3:1, a step below it as in the normal palette.
 */
test('red light mode: the inks meet their contrast on every red surface', () => {
  const css = declSource('TwilightApp').match(/redMode && React\.createElement\("style", null, `[\s\S]*?:root\{([\s\S]*?)\n\s*\}/)[1];
  const red = name => css.match(new RegExp('--' + name + ':(#[0-9a-f]{6});', 'i'))[1];
  const at = (ink, min) => {
    for (const bg of ['bg', 'bg-glow', 'bg-glow-2', 'surface', 'surface-2']) {
      const r = contrast(red(ink), red(bg));
      assert.ok(r >= min, `red --${ink} on --${bg}: ${r.toFixed(2)}, wants ${min}`);
    }
  };
  at('ink', 4.5); at('ink-prose', 4.5); at('ink-dim', 4.5); at('btn-ink', 4.5); at('accent', 4.5); at('accent-hi', 4.5);
  at('ink-faint', 3);
  assert.ok(lum(red('ink')) >= lum(red('ink-dim')) && lum(red('ink-dim')) > lum(red('ink-faint')), 'ink, then dim, then faint');
  assert.ok(contrast(red('on-accent'), red('accent')) >= 4.5, 'words on an accent fill');
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
  assert.match(declSource('RealtimeTwilight'), /React\.createElement\("h1", \{ style: \{ margin: 0, font: "inherit" \} \}, React\.createElement\("button", \{\s*ref: placeBtnRef,\s*onClick: togglePicker/);
});

test('keyboard focus shows even where a field sets outline:none inline', () => {
  assert.match(HTML, /:focus-visible\{\s*outline:2px solid var\(--accent-hi\) !important;/);
});

test('Sky View is a dialog: named, modal, focus on Back, Escape closes', () => {
  const src = declSource('SkyDome');
  assert.match(src, /role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Sky View'/);
  assert.match(src, /createElement\('button', \{ ref: backRef, onClick: onClose/);
  assert.match(src, /if \(backRef\.current\) backRef\.current\.focus\(\);/);
  assert.match(src, /if \(e\.key === 'Escape'\) \{ onClose\(\); return; \}/);
  // Tab goes round the dialog's own controls, not on to the page behind.
  assert.match(src, /if \(e\.key !== 'Tab' \|\| !wrapRef\.current\) return;/);
  assert.match(src, /else if \(!e\.shiftKey && \(document\.activeElement === last \|\| !inside\)\) \{ e\.preventDefault\(\); first\.focus\(\); \}/);
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

/* ---- 2026-10-21: what VoiceOver, Voice Control, larger text and less
   precise taps get (a review of build v164, the iPhone app emulated). ---- */

const ROOT = path.join(__dirname, '..', '..');
const ts = extract(['TS_MAX', 'textScale', 'TS_SVG_TEXT', 'tsSize', 'tsBig', 'scaleTextStyle']);

test('Larger Text: pinch zoom is on in the apps, and the page lets it zoom', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'native', 'capacitor.config.json'), 'utf8'));
  // Capacitor turns zooming off unless asked (both platforms read the top-level key).
  assert.strictEqual(cfg.zoomEnabled, true);
  const vp = HTML.match(/<meta name="viewport" content="([^"]+)"/)[1];
  assert.doesNotMatch(vp, /user-scalable\s*=\s*(no|0)|maximum-scale/);
  // A double tap on a button must not zoom instead.
  assert.match(HTML, /html\{ touch-action:manipulation; \}/);
});

test('Larger Text: iOS\u2019s text size becomes --ts, from 1 to TS_MAX', () => {
  assert.strictEqual(ts.TS_MAX, 2);
  assert.strictEqual(ts.textScale(17), 1, 'the standard size');
  assert.strictEqual(ts.textScale(14), 1, 'smaller sizes leave the design as drawn');
  assert.strictEqual(ts.textScale(25.5), 1.5);
  assert.strictEqual(ts.textScale(23), 1.35, 'the largest of the ordinary sizes');
  assert.strictEqual(ts.textScale(53), 2, 'the largest accessibility size, clamped');
  assert.strictEqual(ts.textScale(NaN), 1);
  assert.strictEqual(ts.textScale(1), 1, 'a browser without the font keyword: the 1 px probe');
  // The probe reads -apple-system-body; a browser that ignores the keyword
  // leaves it at 1 px.
  const probe = known => {
    const els = [];
    const doc = { createElement: () => { const p = { style: {}, remove() { els.splice(els.indexOf(p), 1); } }; return p; }, body: { appendChild: p => els.push(p) } };
    const gcs = p => ({ fontSize: known && p.style.font === '-apple-system-body' ? '28px' : (p.style.cssText.match(/font-size:(\d+px)/) || [])[1] });
    const n = new Function('getComputedStyle', 'textScale', declSource('readTextScale') + '; return readTextScale;')(gcs, ts.textScale)(doc);
    return { n, left: els.length };
  };
  assert.deepStrictEqual(probe(true), { n: 1.65, left: 0 }, 'AX1 (28 pt), and the probe removed');
  assert.deepStrictEqual(probe(false), { n: 1, left: 0 });
});

test('Larger Text: every px text size in a style is multiplied by --ts', () => {
  const st = { fontSize: 13, color: 'x' };
  const out = ts.scaleTextStyle(st);
  assert.deepStrictEqual(out, { fontSize: 'calc(13px * var(--ts, 1))', color: 'x' });
  assert.deepStrictEqual(st, { fontSize: 13, color: 'x' }, 'the shared style object is left alone');
  assert.strictEqual(ts.scaleTextStyle({ font: '600 10.5px var(--font-ui)' }).font, '600 calc(10.5px * var(--ts, 1)) var(--font-ui)');
  assert.strictEqual(ts.scaleTextStyle({ font: '13px/1.5 var(--font-ui)' }).font, 'calc(13px * var(--ts, 1))/1.5 var(--font-ui)');
  // Display sizes grow half as much.
  assert.strictEqual(ts.scaleTextStyle({ fontSize: 'clamp(32px, 8vw, 46px)' }).fontSize, 'calc(clamp(32px, 8vw, 46px) * (1 + (var(--ts, 1) - 1) / 2))');
  assert.strictEqual(ts.scaleTextStyle({ font: '650 clamp(22px,5vw,30px) var(--font-ui)' }).font, '650 calc(clamp(22px,5vw,30px) * (1 + (var(--ts, 1) - 1) / 2)) var(--font-ui)');
  // Nothing to scale: the same object back.
  for (const same of [{ color: 'x' }, { font: 'inherit' }, { fontSize: '0.6em' }]) assert.strictEqual(ts.scaleTextStyle(same), same);
  // React.createElement does it for every element but SVG text, which the
  // charts size to their own drawing.
  const made = [];
  const R = { createElement(...a) { made.push(a); return a; } };
  const win = { on: {}, addEventListener(k, f) { this.on[k] = f; } };
  const set = {};
  const doc = { documentElement: { style: { getPropertyValue: k => set[k] || '', setProperty: (k, v) => { set[k] = v; } } }, hidden: false, addEventListener(k, f) { win.on['doc:' + k] = f; } };
  let scale = 1.5;
  new Function('React', 'document', 'window', 'readTextScale', 'scaleTextStyle', 'TS_SVG_TEXT', declSource('followTextSize') + '; followTextSize();')(
    R, doc, win, () => scale, ts.scaleTextStyle, ts.TS_SVG_TEXT);
  R.createElement('div', { style: { fontSize: 12 }, key: 'k' }, 'a', 'b');
  R.createElement('text', { style: { font: '10px var(--font-ui)' } }, 'c');
  R.createElement('div', null, 'd');
  assert.deepStrictEqual(made[0], ['div', { style: { fontSize: 'calc(12px * var(--ts, 1))' }, key: 'k' }, 'a', 'b'], 'children and key kept');
  assert.deepStrictEqual(made[1], ['text', { style: { font: '10px var(--font-ui)' } }, 'c']);
  assert.deepStrictEqual(made[2], ['div', null, 'd']);
  // --ts set at once, and read again on resize and on coming back into view.
  assert.strictEqual(set['--ts'], '1.5');
  scale = 2; win.on.resize(); assert.strictEqual(set['--ts'], '2');
  scale = 1.2; doc.hidden = true; win.on['doc:visibilitychange'](); assert.strictEqual(set['--ts'], '2', 'not while away');
  doc.hidden = false; win.on['doc:visibilitychange'](); assert.strictEqual(set['--ts'], '1.2');
  // Installed before any component renders.
  assert.ok(SRC.indexOf('(function followTextSize()') < SRC.indexOf('function HorizonHero('));
  assert.ok(SRC.indexOf('(function followTextSize()') < SRC.indexOf('React.createElement('));
});

test('Larger Text: the layouts that held text in fixed boxes make room', () => {
  // The painting grows its ground for its words (hero-polish.test.js has heroFit).
  assert.match(declSource('HorizonHero'), /const \{ H, hy \} = heroFit\(width, wordsH\);/);
  assert.match(declSource('HorizonHero'), /paddingRight: corner \? Math\.max\(132, cornerW \+ 19\) : 0/);
  // So does the Sky View preview.
  assert.match(declSource('SkyViewPreview'), /const H = Math\.max\(width < 560 \? 400 : 460, 10 \+ over\.top \+ 24 \+ over\.foot \+ 18\);/);
  // The week's day column widens with the text, and its words can wrap.
  const wk = declSource('weekPlannerEl');
  assert.match(wk, /width: "calc\(76px \* var\(--ts, 1\)\)"/);
  assert.match(wk, /display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 12px", padding: "9px 0",/);
  // Tonight's facts: three across, fewer as the text grows.
  assert.match(declSource('NightFacts'), /minmax\(min\(100%, calc\(92px \* var\(--ts, 1\)\)\), 1fr\)/);
  // The Ephemeris' one column never wider than the page.
  assert.match(declSource('TwilightEphemeris'), /\.te-grid\.te-solo\{grid-template-columns:minmax\(0,1fr\)\}/);
});

test('the smallest information text is 11 px at the standard size', () => {
  const eph = declSource('TwilightEphemeris');
  // The chart's axes, times, band names and readout (were 9 and 10).
  assert.doesNotMatch(eph, /font: "(9|10)px var\(--font-ui\)"/);
  const planets = declSource('PlanetViews') + declSource('jupiterDrawing');
  // Jupiter's moon letters and East and West (8 and 8.5 units).
  for (const [, n] of planets.matchAll(/fontSize: (\d+(?:\.\d+)?)/g)) assert.ok(+n >= 10.5, `fontSize ${n}`);
  assert.match(planets, /fontSize: 11, fill: 'var\(--ink-faint\)', fontFamily: 'Inter, system-ui, sans-serif' \}, 'East'\)/);
});

// A stub React: elements as plain trees, so hook-free components can be
// walked for what they render.
const RS = { Fragment: 'F', createElement: (t, p, ...c) => ({ t, p: p || {}, c: c.flat(Infinity).filter(x => x != null && x !== false) }) };
const textOf = n => typeof n === 'string' || typeof n === 'number' ? String(n) : (n.c || []).map(textOf).join('');
const find = (n, f, out = []) => { if (n && typeof n === 'object') { if (f(n)) out.push(n); (n.c || []).forEach(k => find(k, f, out)); } return out; };
const headingFor = (tree, words) => find(tree, n => /^h[1-6]$/.test(n.t) && textOf(n) === words)[0];
const Cst = { ink: 'INK', inkDim: 'DIM', inkFaint: 'FAINT', brass: 'AMBER', line: 'LINE' };

test('section titles are headings, styled as they were', () => {
  const TH = new Function('React', 'C', 'highlightIcon', declSource('TonightHighlights') + '; return TonightHighlights;')(RS, Cst, () => null);
  const h = headingFor(TH({ items: [{ kind: 'planet', title: 'Saturn', detail: 'x' }] }), 'Worth a look tonight');
  assert.strictEqual(h.t, 'h2');
  // A heading's own margins and weight are reset, so nothing moves.
  assert.match(String(h.p.style.margin), /^0/);
  const bortle = extract(['BORTLE', 'BORTLE_WORD', 'skyWord', 'BORTLE_SEE']);
  const SD = new Function('React', 'C', 'skyWord', 'BORTLE_SEE', declSource('SkyDarkness') + '; return SkyDarkness;')(RS, Cst, bortle.skyWord, bortle.BORTLE_SEE);
  const sd = headingFor(SD({ bortle: 5, auto: true, from: 'satellite' }), 'How dark the sky is here');
  assert.strictEqual(sd.t, 'h2'); assert.strictEqual(sd.p.className, 'sr-only', 'no title on screen, one for the headings list');
  const TT = new Function('React', 'C', 'cdHMS', 'twilightWord', 'TWILIGHT_DOTS', declSource('TwilightToday') + '; return TwilightToday;')(RS, Cst, () => '', () => '', {});
  const row = (key, t, past) => ({ key, label: key, t, past });
  const tt = TT({ next: null, now: 5, sched: { when: 'today', dawn: [row('Sunrise', 1, true)], dusk: [row('Sunset', 9, false)] }, fmt: String, sunUp: true, onMore() {} });
  assert.strictEqual(headingFor(tt, 'Twilight today').t, 'h2');
  assert.strictEqual(headingFor(tt, 'Dawn').t, 'h3');
  assert.strictEqual(headingFor(tt, 'Dusk').t, 'h3');
  const pv = new Function('React', 'C', 'saturnDrawing', 'saturnWords', declSource('PlanetViews') + '; return PlanetViews;')(RS, Cst, () => ({ H: 10, kids: [] }), () => 'rings');
  const pvt = pv({ jup: null, sat: { t: 0, rings: {} }, when: () => 'now' });
  assert.strictEqual(headingFor(pvt, 'Jupiter and Saturn').t, 'h2');
  assert.strictEqual(find(pvt, n => n.t === 'h3' && /^Saturn’s rings/.test(textOf(n))).length, 1);
  const iss = new Function('React', 'ISS_OPEN', 'issWords', declSource('IssPanel') + '; return IssPanel;')(RS, 2, () => '');
  assert.strictEqual(headingFor(iss({ passes: [], failed: false, when: String, fmt: String }), 'The space station').t, 'h2');
  // In the big components, at source level.
  const src = { console: declSource('weekPlannerEl') + declSource('NightRibbon'), eph: declSource('TwilightEphemeris'), stars: declSource('StarFinder') };
  assert.match(src.console, /createElement\("h2", \{ style: \{ margin: 0, [^}]*\} \}, "The week ahead"\)/);
  assert.match(src.console, /createElement\('h2', \{ style: \{ \.\.\.small, margin: 0, [^}]*\} \}, 'Tonight, sunset to sunrise'\)/);
  for (const t of ['Eclipses', 'Upcoming sky events']) assert.match(src.eph, new RegExp('createElement\\("h2", \\{\\s*style: \\{ margin: "0 0 \\d+px", [^}]*\\}\\s*\\}, "' + t + '"\\)'), t);
  assert.match(src.eph, /createElement\("h2", \{ style: \{ \.\.\.labelSt, margin: 0 \} \}, title\)/, 'For photographers, The Moon');
  assert.match(src.stars, /createElement\("h2", \{ style: \{ margin: "0 0 12px", [^}]*\} \}, "The whole sky now"\)/);
  assert.match(src.stars, /createElement\("h2", \{ className: "sr-only" \}, "For navigators"\),\s*React\.createElement\("details", \{\s*id: "for-navigators"/);
  assert.match(src.stars, /createElement\("h3", \{ style: \{ margin: "0 0 12px", [^}]*\} \}, "Navigation stars up now"\)/);
  assert.match(src.stars, /createElement\("h3", \{ style: \{ margin: 0, [^}]*\} \},\s*sextWin \?/, 'the sextant window');
  assert.strictEqual((src.stars.match(/createElement\("h3", \{ style: navSectionHdr \}/g) || []).length, 2, 'sight reduction and Aim Assist');
  assert.match(src.stars, /margin: "0 0 12px" \};/, 'navSectionHdr resets the heading margin');
  // The fold's summary says its name, a pause, then what's in it.
  assert.match(src.stars, /"For navigators",\s*React\.createElement\("span", \{ className: "sr-only" \}, ": "\),/);
});

test('tap targets: 44 px each way', () => {
  // The invisible hit area: 44 px centred on the control, nothing for one already that big.
  assert.match(HTML, /\.tw-hit, summary, \.rtbtn\{ position:relative; \}/);
  const after = HTML.match(/\.tw-hit::after, summary::after, \.rtbtn::after\{([^}]+)\}/)[1];
  for (const side of ['top', 'bottom', 'left', 'right']) assert.match(after, new RegExp(side + ':min\\(0px, calc\\(50% - 22px\\)\\)'), side);
  const app = declSource('TwilightApp');
  // Settings and Red light: 44 x 44 boxes (were 27 x 27, side by side).
  assert.strictEqual((app.match(/justifyContent: "center", width: 44, height: 44, flexShrink: 0,/g) || []).length, 2);
  // The three Settings switches, and the banners' close buttons.
  assert.strictEqual((app.match(/className: "tw-hit",\s*style: \{\s*width: 42, height: 24,/g) || []).length, 3);
  assert.strictEqual((app.match(/padding: 0, width: 44, height: 44, margin: "-1\dpx -9px", flexShrink: 0/g) || []).length, 2, 'Not now and Dismiss tip');
  // Privacy and Help on their own line, 44 px tall.
  assert.strictEqual((app.match(/href: "\/(privacy|support)\.html", style: \{ color: "var\(--ink-dim\)", display: "inline-flex", alignItems: "center", (justifyContent: "center", )?minHeight: 44, minWidth: 44 \}/g) || []).length, 2);
  // The Ephemeris' day buttons and its place; the DST switch.
  const eph = declSource('TwilightEphemeris');
  assert.strictEqual((eph.match(/style: stepBtn, className: "tw-hit"/g) || []).length, 2);
  assert.match(eph, /onClick: goToday, "aria-pressed": isToday, className: "tw-hit",/);
  assert.match(eph, /"aria-controls": "te-form", className: "tw-hit",/);
  assert.match(eph, /"aria-label": "Daylight saving, one hour", className: "tw-hit",/);
  // Sky View's chips, rows far enough apart that the hit areas meet; the
  // Time slider; the bottom bar's buttons.
  const sd = declSource('SkyDome');
  assert.match(sd, /gap: '11px 8px'/);
  assert.strictEqual((sd.match(/className: 'tw-hit'/g) || []).length, 16, 'every Sky View button but Find\u2019s rows');
  assert.match(sd, /padding: '13px 0', background: 'none',/, 'Find\u2019s rows, 44 px tall');
  assert.match(sd, /style: \{ flex: '1 1 220px', maxWidth: 360, height: 44, margin: '-12px 0', accentColor: '#e8b563' \}/);
  // Stars: the aim chips 13 px apart, the navigator's buttons, the
  // sextant's calendar button (bare and 24 px tall on this tab before).
  const sf = declSource('StarFinder');
  assert.match(sf, /gap: "13px 8px" \} \},\s*aimableBodies\.length === 0[\s\S]{0,300}className: "tw-hit", style: segBtn\(false\)/);
  assert.strictEqual((sf.match(/className: "tw-hit", style: segBtn\(/g) || []).length, 5);
  assert.match(sf, /className: "tw-hit", onClick: downloadSextantICS,\s*style: \{ marginTop: 12, fontFamily: "var\(--font-ui\)", fontSize: 12, fontWeight: 500, padding: "9px 14px"/);
  // The welcome's second way in.
  assert.match(declSource('WelcomeSky'), /onClick: \(\) => close\(!standIn\), className: 'tw-hit',/);
});

test('Voice Control: a button\u2019s name starts with the words on it (WCAG 2.5.3)', () => {
  // Every button with a written aria-label and written words.
  const re = /createElement\(("|')button\1,\s*\{/g;
  let m, checked = 0;
  const bad = [];
  while ((m = re.exec(SRC))) {
    let i = m.index + m[0].length, d = 1;
    while (d && i < SRC.length) { if (SRC[i] === '{') d++; else if (SRC[i] === '}') d--; i++; }
    const props = SRC.slice(m.index, i);
    const label = props.match(/("|')aria-label\1:\s*("|')([^"']*)\2\s*[,}\n]/);
    const words = SRC.slice(i).match(/^,\s*("|')([^"']*)\1\s*[,)]/);
    const unescape = t => t.replace(/\\u([0-9a-fA-F]{4})/g, (x, h) => String.fromCharCode(parseInt(h, 16)));
    // A mark with no words or figures (a chevron, a cross) has nothing to say.
    if (!label || !words || !/[A-Za-z0-9]/.test(unescape(words[2]))) continue;
    checked++;
    if (!label[3].toLowerCase().startsWith(unescape(words[2]).toLowerCase())) bad.push(`${label[3]} / ${words[2]}`);
  }
  assert.deepStrictEqual(bad, []);
  assert.ok(checked >= 3, 'the scan found the buttons');
  // Names worked out as the app runs.
  const rt = declSource('RealtimeTwilight');
  assert.match(rt, /label: "Add sunset to calendar", aria: "Add sunset to calendar, " \+/);
  assert.match(rt, /label: "Add sunrise to calendar", aria: "Add sunrise to calendar, " \+/);
  assert.match(rt, /"aria-label": "Twilight fact, from the almanac"/);
  assert.match(declSource('SkyDome'), /'aria-label': targetName \+ ', stop finding'[\s\S]{0,120}\}, targetName, /);
  assert.doesNotMatch(SRC, /Add (tonight|tomorrow|this morning)\S* (sunset|sunrise) to your calendar/);
});

test('one name per toggle, its state in aria-pressed', () => {
  const app = declSource('TwilightApp');
  assert.match(app, /title: "Red light mode",\s*"aria-label": "Red light mode",\s*"aria-pressed": redMode,/);
  assert.doesNotMatch(app, /"(Exit|Enable) red light mode"/);
  const sd = declSource('SkyDome');
  assert.match(sd, /setCam\(v => !v\); \}, 'aria-pressed': cam, className: 'tw-hit', style: \{[^\n]*\} \}, 'Camera'\)/);
  assert.doesNotMatch(sd, /'Camera on'/);
});

test('Sky View\u2019s time is said when the reader changes it, not every minute', () => {
  const sd = declSource('SkyDome');
  const line = sd.slice(sd.indexOf("(shifted ? 'The sky at ' : 'The sky now, ')") - 200, sd.indexOf("(shifted ? 'The sky at ' : 'The sky now, ')"));
  assert.doesNotMatch(line, /aria-live/, 'the line is not a live region');
  assert.match(sd, /'aria-valuetext': time\.label \+ ', ' \+ timeShiftWords\(time\.shift\)/, 'the slider says it as it moves');
  // Now disappears when pressed: focus goes somewhere that stays.
  assert.match(sd, /onClick: \(\) => \{ time\.onShift\(0\); const f = sliderRef\.current \|\| timeBtnRef\.current; if \(f\) f\.focus\(\); \}/);
  assert.match(sd, /ref: sliderRef, type: 'range'/);
  assert.match(sd, /ref: timeBtnRef, onClick: \(\) => setTimeOpen/);
});

test('decorative marks are hidden from screen readers; what they mean is said', () => {
  // A string child holding one of the app's marks must sit in an aria-hidden element.
  const marks = /[\u2190\u2192\u2197\u2726\u21bb\u2316\uff0b\u25c6\u25ad\u2193\u2713]|\\u(2190|2192|2197|2726|21bb|21BB|2316|FF0B|ff0b|25C6|25c6|25AD|25ad|2193|2713)/;
  const re = /createElement\(("|')(\w+)\1,\s*(\{|null)/g;
  let m;
  const bad = [];
  while ((m = re.exec(SRC))) {
    let i = m.index + m[0].length, props = 'null';
    if (m[3] === '{') {
      let d = 1;
      while (d && i < SRC.length) { if (SRC[i] === '{') d++; else if (SRC[i] === '}') d--; i++; }
      props = SRC.slice(m.index, i);
    }
    // The element's own string children, up to the first nested element.
    const rest = SRC.slice(i, i + 400).split(/createElement|\)\s*[,;)]/)[0];
    for (const [, , s] of rest.matchAll(/(["'])((?:(?!\1).)*)\1/g)) {
      if (marks.test(s) && !/aria-hidden/.test(props) && m[2] !== 'text') bad.push(`${m[2]}: ${s}`);
    }
  }
  assert.deepStrictEqual(bad, []);
  // Meaning that was in a mark or a shade, said in words.
  assert.match(declSource('TwilightToday'), /r\.past && React\.createElement\("span", \{ className: "sr-only" \}, ", passed"\)/);
  assert.match(declSource('StarFinder'), /React\.createElement\("span", \{ className: "sr-only" \}, ", magnitude ", s\.mag\.toFixed\(1\)\)/);
  assert.match(declSource('StarFinder'), /"\\u2192"\), React\.createElement\("span", \{ className: "sr-only" \}, "to"\)/);
});

test('the page behind a dialog is inert while it is open', () => {
  // Siblings of the dialog and of each ancestor up to <body>; undone after.
  const el = (tagName, kids = []) => { const e = { tagName, inert: false, children: kids }; kids.forEach(k => { k.parentElement = e; }); return e; };
  const dialog = el('DIV'), main = el('MAIN', [el('DIV'), el('DIV', [dialog])]), header = el('HEADER'), footer = el('FOOTER');
  const root = el('DIV', [header, main, footer]), script = el('SCRIPT'), already = el('DIV');
  already.inert = true;
  const body = el('BODY', [root, script, already]);
  const inertOutside = new Function('document', declSource('inertOutside') + '; return inertOutside;')({ body });
  const free = inertOutside(dialog);
  assert.deepStrictEqual([header.inert, footer.inert, main.children[0].inert, script.inert, dialog.inert, root.inert], [true, true, true, false, false, false]);
  free();
  assert.deepStrictEqual([header.inert, footer.inert, main.children[0].inert, already.inert], [false, false, false, true], 'what was inert before stays so');
  // The welcome and Sky View use it; Sky View makes the page live again
  // before it gives focus back (an inert element can't take it).
  assert.match(declSource('WelcomeSky'), /const free = dlgRef\.current \? inertOutside\(dlgRef\.current\) : \(\) => \{\};/);
  assert.match(declSource('WelcomeSky'), /return \(\) => \{ free\(\);/);
  const sd = declSource('SkyDome');
  assert.match(sd, /const free = wrapRef\.current \? inertOutside\(wrapRef\.current\) : \(\) => \{\};/);
  assert.match(sd, /free\(\); if \(before && before\.focus\) before\.focus\(\);/);
});

test('Escape closes Settings and the place picker, and focus goes back to what opened them', () => {
  const app = declSource('TwilightApp');
  assert.match(app, /const esc = e => \{ if \(e\.key === 'Escape'\) \{ close\(\); if \(settingsBtnRef\.current\) settingsBtnRef\.current\.focus\(\); \} \};/);
  assert.match(app, /window\.addEventListener\('keydown', esc\);/);
  assert.match(app, /window\.removeEventListener\('keydown', esc\);/);
  assert.match(app, /ref: settingsBtnRef,\s*onClick: e => \{ e\.stopPropagation\(\); setSettingsOpen/);
  // The picker's, run from source.
  const rt = declSource('RealtimeTwilight');
  const eff = rt.slice(rt.indexOf('  useEffect(() => {\n    if (!pickerOpen) return;'), rt.indexOf('  // The place is the Console\u2019s heading') >= 0 ? rt.indexOf('  // The place is the Console\u2019s heading') : rt.indexOf("  // The place is the Console's heading"));
  const on = {};
  let toggled = 0, focused = 0, cleanup;
  const win = { addEventListener: (k, f) => { on[k] = f; }, removeEventListener: (k, f) => { if (on[k] === f) delete on[k]; } };
  new Function('useEffect', 'window', 'pickerOpen', 'togglePicker', 'placeBtnRef', eff)(f => { cleanup = f(); }, win, true, () => toggled++, { current: { focus: () => focused++ } });
  on.keydown({ key: 'Enter' });
  assert.deepStrictEqual([toggled, focused], [0, 0]);
  on.keydown({ key: 'Escape' });
  assert.deepStrictEqual([toggled, focused], [1, 1]);
  cleanup();
  assert.ok(!on.keydown, 'the listener goes when the picker closes');
});

test('the Ephemeris\u2019 scroll back to its form honours reduced motion', () => {
  assert.match(declSource('TwilightEphemeris'), /window\.scrollTo\(\{ top: 0, behavior: window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches \? "auto" : "smooth" \}\)/);
});
