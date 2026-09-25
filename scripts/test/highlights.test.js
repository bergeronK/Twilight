'use strict';
/*
 * "Worth a look tonight": the Console's list of what to step outside for.
 *
 * Each item is a claim about the real sky on a real night, so the tests run
 * the app's own astronomy on nights whose events are published: the 2026
 * Perseid peak (under a new Moon), the Venus–Jupiter pairing of 9 June 2026,
 * and Saturn's opposition on 4 October 2026. A list that reads well but names
 * the wrong night, or a shower nobody could see from a city, is the failure
 * these are here to catch.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'asin', 'acos', 'atan2', 'rev', 'jd', 'gmst', 'sunAltitude', 'sunHcZn',
  'MOON_LR', 'MOON_B', 'moonEcliptic', 'moonState', 'moonTopo', 'moonAltSeen', 'moonElong', 'MOON_PHASE_NAMES', 'moonPhases', 'moonSD', 'moonHP', 'sunState', 'sunSDdeg', 'sunHPdeg', 'angSep', 'lunarShadow', 'bisectTime', 'minTime', 'lunarEclipse', 'eclipseWords', 'planetAltAz', 'starHcZn', 'scanCrossings', 'SUN_THR', 'MOON_THR',
  'nightSpan', 'HZ_AFTER', 'nightPlan', 'limitingMag', 'BORTLE', 'skyLimit', 'METEOR_SHOWERS', 'SPORADIC_HR',
  'showerActivity', 'meteorRate', 'milkyWayVisibility', 'COMPASS16', 'compass16', 'HIGHLIGHT_STARS', 'sepAltAz',
  'HIGHLIGHT_DSO', 'tonightHighlights', 'TonightHighlights']);

const STOWE = [44.26, -72.58];
function tonight(iso, [lat, lon], bortle = 3) {
  const now = Date.parse(iso);
  const sunEv = m.scanCrossings(now - 20 * 3600000, now + 30 * 3600000, lat, lon, m.sunAltitude, m.SUN_THR, 2);
  const span = m.nightSpan(sunEv, now);
  if (!span) return m.tonightHighlights(null, lat, lon, bortle, String);
  const moonEv = m.scanCrossings(span.start, span.end, lat, lon, m.moonAltSeen, m.MOON_THR, 4);
  const plan = m.nightPlan(span, sunEv, moonEv, m.moonAltSeen(new Date(span.start), lat, lon) > -0.833);
  const fmt = t => new Date(t).toISOString().slice(11, 16);
  return m.tonightHighlights(plan, lat, lon, bortle, fmt);
}
const titles = h => h.map(x => x.title);

test('the Perseid peak, under a new Moon, leads the list', () => {
  const h = tonight('2026-08-12T22:00:00Z', STOWE);
  assert.strictEqual(h[0].kind, 'meteors');
  assert.strictEqual(h[0].title, 'The Perseids peak tonight');
  const n = +/about (\d+) meteors/.exec(h[0].detail)[1];
  assert.ok(n >= 40 && n <= 100, `${n} an hour`);
  assert.match(h[0].detail, /from the (N|NNE|NE|ENE)\./, 'the radiant is in the north-east');
  assert.ok(titles(h).includes('No Moon tonight'));
  assert.ok(h.length <= 4);
});

test('from a city the same shower is thinner, and the Milky Way is not offered', () => {
  const dark = tonight('2026-08-12T22:00:00Z', STOWE, 2), city = tonight('2026-08-12T22:00:00Z', STOWE, 8);
  const rate = h => +/about (\d+) meteors/.exec(h.find(x => x.kind === 'meteors').detail)[1];
  assert.ok(rate(city) < rate(dark) / 3, `${rate(city)} vs ${rate(dark)}`);
  assert.ok(dark.some(x => x.kind === 'milkyway'));
  assert.ok(!city.some(x => x.kind === 'milkyway'));
});

test('Venus and Jupiter together on 9 June 2026, brighter one first', () => {
  const h = tonight('2026-06-09T22:00:00Z', STOWE);
  const pair = h.find(x => x.title === 'Venus and Jupiter close together');
  assert.ok(pair, titles(h).join(' / '));
  assert.match(pair.detail, /^About [12]° apart, low in the (W|WNW|NW)/);
});

test('Saturn at its best at its 2026 opposition, not three months later', () => {
  assert.ok(titles(tonight('2026-10-04T22:00:00Z', STOWE)).includes('Saturn is at its best'));
  assert.ok(!titles(tonight('2027-01-04T22:00:00Z', STOWE)).includes('Saturn is at its best'));
});

test('no night, no list', () => {
  // Midsummer at 78°N: the Sun never sets.
  assert.deepStrictEqual(tonight('2026-06-21T12:00:00Z', [78.2, 15.6]), []);
  assert.deepStrictEqual(m.tonightHighlights(null, 0, 0, 3, String), []);
});

test('the list renders flat, one row per item, and not at all when empty', () => {
  const R = { createElement: (t, p, ...c) => ({ t, p, c: c.flat().filter(x => x != null && x !== false) }) };
  const src = require('./extract.js').declSource;
  const [render, icon] = new Function('React', 'C', `${src('highlightIcon')}; ${src('TonightHighlights')}; return [TonightHighlights, highlightIcon];`)(R, { ink: 'INK', inkDim: 'DIM', inkFaint: '', brass: 'AMBER' });
  assert.strictEqual(render({ items: [] }), null);
  const out = render({ items: [{ title: 'A', detail: 'a', kind: 'meteors' }, { title: 'B', detail: 'b', kind: 'planet' }] });
  assert.strictEqual(out.c.length, 3, 'a heading and two rows');
  assert.ok(!JSON.stringify(out).includes('"border":'), 'no boxes: hairlines between rows only');
  // Each row leads with its kind's icon: the first in amber, the rest dim.
  const [, r1, r2] = out.c;
  assert.strictEqual(r1.c[0].p.style.color, 'AMBER');
  assert.strictEqual(r2.c[0].p.style.color, 'DIM');
  assert.strictEqual(r1.c[0].c[0].t, 'svg');
  assert.strictEqual(r1.c[0].c[0].p['aria-hidden'], 'true', 'decoration, not read out');
  // A different drawing for every kind the list makes, and a plain dot for
  // one it doesn't know.
  const kinds = ['meteors', 'pair', 'planet', 'iss', 'eclipse', 'moon', 'moonfeature', 'deep', 'milkyway', 'aurora'];
  const drawn = kinds.map(k => JSON.stringify(icon(k).c));
  assert.strictEqual(new Set(drawn).size, kinds.length);
  const dot = icon('something-new').c;
  assert.strictEqual(dot.length, 1);
  assert.strictEqual(dot[0].t, 'circle');
  // Every kind tonightHighlights can produce has its own icon.
  const made = [...src('tonightHighlights').matchAll(/kind: '(\w+)',\s*rank/g)].map(x => x[1]);
  made.forEach(k => assert.ok(kinds.includes(k), `${k} has an icon`));
});

test('across a year of nights: never more than four, most important first', () => {
  let longest = 0;
  for (let t = Date.parse('2026-01-02T22:00:00Z'); t < Date.parse('2027-01-01T00:00:00Z'); t += 9 * 86400000) {
    const h = tonight(new Date(t).toISOString(), STOWE, 2);
    longest = Math.max(longest, h.length);
    assert.ok(h.length <= 4, new Date(t).toISOString());
    for (let i = 1; i < h.length; i++) assert.ok(h[i].rank >= h[i - 1].rank, `${new Date(t).toISOString()}: ${titles(h).join(' / ')}`);
  }
  assert.ok(longest >= 3, 'some nights have plenty to offer');
});

test('a galaxy or cluster when it is well placed and the sky dark enough for it', () => {
  // Mid-October from Stowe: the Andromeda Galaxy nearly overhead.
  const oct = tonight('2026-10-15T01:00Z', STOWE);
  const deep = oct.find(h => h.kind === 'deep');
  assert.strictEqual(deep.title, 'The Andromeda Galaxy is well placed');
  assert.match(deep.detail, /^High in the \w+ around \d\d:\d\d: a faint oval glow 2\.5 million light-years away/);
  // From a city it is too faint to be worth the trip; the Pleiades are not.
  const city = tonight('2026-10-15T01:00Z', STOWE, 8).find(h => h.kind === 'deep');
  assert.strictEqual(city.title, 'The Pleiades are well placed');
  // One a night at most.
  assert.ok(oct.filter(h => h.kind === 'deep').length === 1);
  // From Sydney the Andromeda Galaxy never climbs past 15°: not offered.
  assert.ok(!tonight('2026-10-15T10:00Z', [-33.87, 151.21]).some(h => /Andromeda/.test(h.title)));
});

test('an eclipse of the Moon tonight leads the list', () => {
  const HOLYOKE = [42.2, -72.6];
  // 3 March 2026: total, the Moon setting during totality at dawn.
  const march = tonight('2026-03-03T01:00Z', HOLYOKE);
  assert.strictEqual(march[0].kind, 'eclipse');
  assert.strictEqual(march[0].title, 'A total eclipse of the Moon tonight');
  // 28 August 2026: partial, the Moon well up.
  const aug = tonight('2026-08-28T01:00Z', HOLYOKE);
  assert.strictEqual(aug[0].title, 'A partial eclipse of the Moon tonight');
  assert.match(aug[0].detail, /covers up to 9\d% of the Moon’s width/);
  // A night later, nothing.
  assert.ok(!tonight('2026-08-29T01:00Z', HOLYOKE).some(h => h.kind === 'eclipse'));
  // A deep penumbral eclipse is worth a mention; a shallow one isn't.
  const LONDON = [51.5, -0.1];
  assert.strictEqual(tonight('2027-02-20T20:00Z', LONDON)[0].title, 'A faint eclipse of the Moon tonight');
  assert.ok(!tonight('2027-08-16T22:00Z', [21.3, -157.9]).some(h => h.kind === 'eclipse'), 'penumbral magnitude 0.55: nothing to see');
});
