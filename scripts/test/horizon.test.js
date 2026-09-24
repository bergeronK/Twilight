'use strict';
/*
 * The Console's horizon view (redesign direction A): the night plan behind
 * its ribbon and facts, the words it puts on screen, and where the painting
 * places things.
 *
 * nightPlan decides what the ribbon claims about tonight, and the claims
 * that matter are the edges: a night that never gets fully dark, a Moon up
 * the whole dark stretch, a Sun that doesn't set at all. Those are tested
 * with synthetic events. One test then runs the app's real astronomy for a
 * real place and date, and checks the plan against the Ephemeris times.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract } = require('./extract.js');

const m = extract([
  'D2R', 'R2D', 'rev', 'sin', 'cos', 'asin', 'acos', 'atan2', 'jd', 'gmst',
  'sunAltitude', 'MOON_LR', 'MOON_B', 'moonEcliptic', 'moonState', 'scanCrossings', 'SUN_THR', 'MOON_THR',
  'nightSpan', 'HZ_AFTER', 'nightPlan', 'moonNote', 'heroLabel', 'heroFacing', 'panoX', 'panoY'
]);

const H = 3600000;
const T = h => h * H;                       // hours since an arbitrary epoch
const fmt = t => `${t / H}h`;               // readable in failure messages
const ev = (key, dir, h) => ({ key, dir, t: T(h), h: 0 });

// A mid-latitude night: sunset 18, civil 18.5, nautical 19, astro 19.5,
// then back up astro 4.5, nautical 5, civil 5.5, sunrise 6 (hours; >24 is
// after midnight).
const NIGHT = [
  ev('rise', 'down', 18), ev('civil', 'down', 18.5), ev('naut', 'down', 19), ev('astro', 'down', 19.5),
  ev('astro', 'up', 28.5), ev('naut', 'up', 29), ev('civil', 'up', 29.5), ev('rise', 'up', 30)
];
const span = { start: T(18), end: T(30) };

test('nightSpan: the night in progress, or the next one', () => {
  assert.deepStrictEqual(m.nightSpan(NIGHT, T(12)), span, 'afternoon: tonight');
  assert.deepStrictEqual(m.nightSpan(NIGHT, T(23)), span, 'midnight-ish: the night we are in');
  assert.strictEqual(m.nightSpan(NIGHT, T(31)), null, 'after sunrise, with no further sunset in range');
  assert.strictEqual(m.nightSpan([], T(12)), null, 'no crossings at all: polar day or night');
});

test('nightPlan: bands in order, and full darkness between the astronomical crossings', () => {
  const p = m.nightPlan(span, NIGHT, [], false);
  assert.deepStrictEqual(p.bands.map(b => [b.kind, b.from / H, b.to / H]), [
    ['civil', 18, 18.5], ['naut', 18.5, 19], ['astro', 19, 19.5], ['night', 19.5, 28.5],
    ['astro', 28.5, 29], ['naut', 29, 29.5], ['civil', 29.5, 30]
  ]);
  assert.deepStrictEqual([p.dark.from / H, p.dark.to / H], [19.5, 28.5]);
  assert.deepStrictEqual([p.darkest.from / H, p.darkest.to / H], [19.5, 28.5], 'no Moon: all of it');
});

test('nightPlan: a Moon setting mid-night leaves the darkest stretch after it', () => {
  const p = m.nightPlan(span, NIGHT, [{ key: 'moon', dir: 'down', t: T(27.2) }], true);
  assert.deepStrictEqual(p.moonUp.map(x => [x.from / H, x.to / H]), [[18, 27.2]]);
  assert.deepStrictEqual([p.darkest.from / H, p.darkest.to / H], [27.2, 28.5]);
});

test('nightPlan: of two moonless gaps, the longer one is the darkest', () => {
  const moon = [{ key: 'moon', dir: 'up', t: T(21) }, { key: 'moon', dir: 'down', t: T(23) }];
  const p = m.nightPlan(span, NIGHT, moon, false);
  assert.deepStrictEqual([p.darkest.from / H, p.darkest.to / H], [23, 28.5]);
});

test('nightPlan: a Moon up the whole dark stretch means no darkest window', () => {
  const p = m.nightPlan(span, NIGHT, [], true);
  assert.ok(p.dark, 'it is still fully dark');
  assert.strictEqual(p.darkest, null);
});

test('nightPlan: a summer night that never reaches astronomical darkness', () => {
  const summer = [ev('rise', 'down', 21), ev('civil', 'down', 21.8), ev('naut', 'down', 22.8),
    ev('naut', 'up', 26.2), ev('civil', 'up', 27.2), ev('rise', 'up', 28)];
  const p = m.nightPlan({ start: T(21), end: T(28) }, summer, [], false);
  assert.deepStrictEqual(p.bands.map(b => b.kind), ['civil', 'naut', 'astro', 'naut', 'civil']);
  assert.strictEqual(p.dark, null);
  assert.strictEqual(p.darkest, null);
});

test('moonNote says what the Moon does from where we are in the night', () => {
  const up = (from, to) => ({ start: T(18), end: T(30), moonUp: [{ from: T(from), to: T(to) }] });
  assert.strictEqual(m.moonNote(up(18, 27.2), T(20), fmt), 'Sets at 27.2h');
  assert.strictEqual(m.moonNote(up(18, 30), T(12), fmt), 'Up all night');
  assert.strictEqual(m.moonNote(up(18, 30), T(20), fmt), 'Up all night', 'still true once the night has begun');
  assert.strictEqual(m.moonNote(up(21, 30), T(22), fmt), 'Up until sunrise', 'rose after sunset, stays up');
  assert.strictEqual(m.moonNote(up(23, 30), T(20), fmt), 'Rises at 23h');
  assert.strictEqual(m.moonNote(up(18, 21), T(22), fmt), 'Set for the night');
  assert.strictEqual(m.moonNote({ start: T(18), end: T(30), moonUp: [] }, T(20), fmt), 'Down all night');
});

test('heroLabel follows the night from afternoon to dawn', () => {
  const p = m.nightPlan(span, NIGHT, [], false);
  assert.strictEqual(m.heroLabel(p, T(12), 30, fmt), 'Sunset at 18h · fully dark at 19.5h');
  assert.strictEqual(m.heroLabel(p, T(19), -9, fmt), 'Twilight · fully dark at 19.5h');
  assert.strictEqual(m.heroLabel(p, T(23), -40, fmt), 'Dark until 28.5h');
  assert.strictEqual(m.heroLabel(p, T(29.2), -8, fmt), 'Dawn · sunrise at 30h');
  const summer = { ...p, dark: null };
  assert.strictEqual(m.heroLabel(summer, T(12), 30, fmt), 'Sunset at 18h · never fully dark tonight');
  assert.strictEqual(m.heroLabel(summer, T(23), -8, fmt), 'Twilight all night · sunrise at 30h');
  assert.strictEqual(m.heroLabel(null, T(12), 10, fmt), 'The Sun stays up all night');
  assert.strictEqual(m.heroLabel(null, T(12), -10, fmt), 'The Sun stays down all day');
});

test('the painting faces the equator, turning only to keep the Moon in frame', () => {
  assert.strictEqual(m.heroFacing(42, { alt: -5, az: 60 }), 180, 'north: south, Moon down');
  assert.strictEqual(m.heroFacing(-34, { alt: -5, az: 60 }), 0, 'south: north');
  assert.strictEqual(m.heroFacing(42, { alt: 20, az: 135 }), 180, 'Moon in the SE is already in frame');
  const f = m.heroFacing(42, { alt: 20, az: 60 }); // ENE: 120° from south
  assert.ok(Math.abs(f - 130) < 1e-9, `turned to ${f}`);
  assert.ok(Math.abs(m.panoX(60, f, 200) - 0.15) < 1e-9, 'Moon lands 15% from the edge, not at it');
});

test('panoX: east on the left and west on the right when facing south', () => {
  assert.strictEqual(m.panoX(180, 180, 200), 0.5);
  assert.ok(m.panoX(90, 180, 200) < 0.5 && m.panoX(270, 180, 200) > 0.5);
  assert.strictEqual(m.panoX(0, 180, 200), null, 'north is behind you');
  assert.strictEqual(m.panoX(350, 0, 200), 0.45, 'wraps through north when facing north');
});

test('panoY: horizon at horizonY, higher is further up, never off the top', () => {
  assert.strictEqual(m.panoY(0, 240), 240);
  assert.ok(m.panoY(30, 240) < m.panoY(10, 240));
  assert.strictEqual(m.panoY(89, 240), 16);
});

test('real astronomy: Boston on 22 September 2026 matches the Ephemeris', () => {
  // Noon EDT (16:00 UTC; EDT = UTC-4). The app shows, for 22 September:
  // sunset 18:41 and full darkness from 20:17 — this night's evening, so
  // checked to the minute. Its morning figures (nautical dawn 05:29, sunrise
  // 06:30) are for the 22nd; this night ends on the 23rd, and late-September
  // sunrises come about a minute later each day, so the morning is checked
  // as "those times, up to three minutes later".
  const lat = 42.3601, lon = -71.0589, now = Date.UTC(2026, 8, 22, 16, 0);
  const sunEv = m.scanCrossings(now - 20 * H, now + 30 * H, lat, lon, m.sunAltitude, m.SUN_THR, 2);
  const s = m.nightSpan(sunEv, now);
  const utc = (h, mi) => Date.UTC(2026, 8, 22, h, mi);
  const near = (t, want, label) => assert.ok(Math.abs(t - want) <= 90000, `${label}: ${new Date(t).toISOString()} vs ${new Date(want).toISOString()}`);
  near(s.start, utc(22, 41), 'sunset 18:41 EDT');
  const laterBy = (t, base, label) => assert.ok(t >= base && t - base <= 3 * 60000, `${label}: ${new Date(t).toISOString()}`);
  laterBy(s.end, utc(34, 30), 'sunrise on the 23rd, just after 06:30 EDT');
  const moonAlt = (d, la, lo) => m.moonState(d, la, lo).alt;
  const moonEv = m.scanCrossings(s.start, s.end, lat, lon, moonAlt, m.MOON_THR, 4);
  const p = m.nightPlan(s, sunEv, moonEv, moonAlt(new Date(s.start), lat, lon) > -0.833);
  near(p.dark.from, utc(24, 17), 'fully dark 20:17 EDT');
  laterBy(p.bands.find(b => b.kind === 'naut' && b.from > p.dark.to).from, utc(33, 29), 'nautical dawn on the 23rd, just after 05:29 EDT');
  // Waxing gibbous a few days before full: up at sunset, sets before dawn,
  // so the darkest stretch runs from moonset to the end of full darkness.
  assert.ok(p.moonUp.length && p.moonUp[0].from === s.start, 'Moon up at sunset');
  assert.ok(p.darkest && p.darkest.from === p.moonUp[0].to && p.darkest.to === p.dark.to,
    'darkest = moonset to astronomical dawn');
});

// NightRibbon and NightFacts are hook-free, so calling them with a stub React
// runs every line and returns the element tree.
const { declSource } = require('./extract.js');
const R = { createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }), Fragment: 'Fragment' };
const TOKENS = { ink: '#fff', inkDim: '#aaa', inkFaint: '#777' };
const text = n => n == null || n === false ? '' : typeof n !== 'object' ? String(n) : n.children.map(text).join('');
const walk = (n, f) => { if (n && typeof n === 'object') { f(n); n.children.forEach(c => walk(c, f)); } };
const { ribbonGradient } = extract(['ribbonGradient']);
const comp = name => new Function('React', 'C', 'moonNote', 'compass16', 'ribbonGradient',
  declSource(name) + `\nreturn ${name};`)(R, TOKENS, m.moonNote, az => (az > 135 && az < 225 ? 'S' : 'E'), ribbonGradient);
const NightFacts = comp('NightFacts'), NightRibbon = comp('NightRibbon');

test('NightFacts states tonight plainly, including the awkward nights', () => {
  const base = m.nightPlan(span, NIGHT, [], false);
  const facts = plan => text(NightFacts({ plan, now: T(12), fmt, illum: 85, planets: [{ name: 'Saturn', az: 180, alt: 30 }] }));
  assert.ok(facts(base).includes('19.5h–28.5h') && facts(base).includes('Fully dark, Moon down'));
  assert.ok(facts(m.nightPlan(span, NIGHT, [], true)).includes('Moonlit'), 'Moon up the whole dark stretch');
  assert.ok(facts({ ...base, dark: null, darkest: null }).includes('Never fully dark tonight'));
  assert.ok(facts(null).includes('No sunset tonight'), 'polar day renders without a plan');
  assert.ok(facts(base).includes('Saturn in the S, well up'));
  assert.ok(text(NightFacts({ plan: base, now: T(12), fmt, illum: 0, planets: [] })).includes('No bright planets'));
});

test('NightRibbon outlines a darkest window only when there is one, and marks now inside the night', () => {
  const outlines = plan => { let n = 0; walk(NightRibbon({ plan, now: T(20), fmt }), e => { if (String(e.props.style && e.props.style.border).includes('--accent')) n++; }); return n; };
  assert.strictEqual(outlines(m.nightPlan(span, NIGHT, [], false)), 1);
  assert.strictEqual(outlines(m.nightPlan(span, NIGHT, [], true)), 0);
  const nowMarks = now => { let n = 0; walk(NightRibbon({ plan: m.nightPlan(span, NIGHT, [], false), now, fmt }), e => { if (e.props.style && e.props.style.width === 2) n++; }); return n; };
  assert.strictEqual(nowMarks(T(20)), 1, 'during the night');
  assert.strictEqual(nowMarks(T(12)), 0, 'before sunset there is no "now" on the ribbon');
});

// The ribbon is one gradient, not a block per band: the sky darkens
// continuously. No two neighbouring stops may share a position with different
// colours (that is a hard edge), each twilight colour sits mid-band, and full
// night is flat from astronomical dusk to astronomical dawn.
test('NightRibbon paints tonight as one smooth gradient, with night flat across the dark hours', () => {
  const plan = m.nightPlan(span, NIGHT, [], false);
  let bg = null;
  walk(NightRibbon({ plan, now: T(20), fmt }), e => { const b = e.props.style && e.props.style.background; if (/gradient/.test(String(b))) bg = b; });
  assert.ok(bg, 'the strip is a gradient');
  const stops = [...bg.matchAll(/(var\(--band-\w+\)) ([\d.]+)%/g)].map(x => ({ c: x[1], at: +x[2] }));
  for (let i = 1; i < stops.length; i++) {
    assert.ok(stops[i].at >= stops[i - 1].at, 'stops in order');
    assert.ok(!(stops[i].at === stops[i - 1].at && stops[i].c !== stops[i - 1].c), `hard edge at ${stops[i].at}%`);
  }
  const pc = t => +((t - plan.start) / (plan.end - plan.start) * 100).toFixed(3);
  const night = stops.filter(s => s.c === 'var(--band-night)').map(s => s.at);
  assert.deepStrictEqual([Math.min(...night), Math.max(...night)], [pc(plan.dark.from), pc(plan.dark.to)]);
  const civil = plan.bands.find(b => b.kind === 'civil');
  assert.ok(stops.some(s => s.c === 'var(--band-civil)' && s.at === pc((civil.from + civil.to) / 2)), 'civil colour mid-band');
  // A night that never gets fully dark still blends, with no night colour.
  const light = m.nightPlan(span, NIGHT.filter(e => e.key !== 'astro'), [], false);
  assert.ok(!ribbonGradient(light, { civil: 'c', naut: 'n', astro: 'a', night: 'N' }).includes('N '), 'no night stop when never fully dark');
});
