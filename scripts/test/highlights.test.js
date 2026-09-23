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
  'moonState', 'moonTopo', 'moonAltSeen', 'planetAltAz', 'starHcZn', 'scanCrossings', 'SUN_THR', 'MOON_THR',
  'nightSpan', 'HZ_AFTER', 'nightPlan', 'limitingMag', 'BORTLE', 'skyLimit', 'METEOR_SHOWERS', 'SPORADIC_HR',
  'showerActivity', 'meteorRate', 'milkyWayVisibility', 'COMPASS16', 'compass16', 'HIGHLIGHT_STARS', 'sepAltAz',
  'tonightHighlights', 'TonightHighlights']);

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
  const R = { createElement: (t, p, ...c) => ({ t, p, c: c.flat() }) };
  const render = new Function('React', 'C', `${require('./extract.js').declSource('TonightHighlights')}; return TonightHighlights;`)(R, { ink: '', inkDim: '', inkFaint: '' });
  assert.strictEqual(render({ items: [] }), null);
  const out = render({ items: [{ title: 'A', detail: 'a' }, { title: 'B', detail: 'b' }] });
  assert.strictEqual(out.c.length, 3, 'a heading and two rows');
  assert.ok(!JSON.stringify(out).includes('"border":'), 'no boxes: hairlines between rows only');
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
