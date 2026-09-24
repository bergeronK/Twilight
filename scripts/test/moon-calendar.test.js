'use strict';
/*
 * The Ephemeris's Moon calendar, and the phase fix under it.
 *
 * The principal phases are checked against PyEphem (a full planetary theory,
 * independent of the app), whose 2026 times were written out by script, not
 * typed. This is what found that moonState took the phase from the MEAN
 * longitudes: its new Moon of 11 September 2026 came 13 hours late, its full
 * Moon 6. Positions were always from the true longitude and are unchanged.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'rev', 'sin', 'cos', 'asin', 'atan2', 'jd', 'gmst', 'moonState', 'moonElong', 'MOON_PHASE_NAMES',
  'moonPhases', 'daysInMonth', 'moonMonth', 'moonPhasePath']);

// PyEphem 4.x: ephem.next_new_moon / next_first_quarter_moon / next_full_moon /
// next_last_quarter_moon through 2026, [elongation, UTC].
const PYEPHEM_2026 = [
  [180, "2026-01-03T10:02Z"],
  [270, "2026-01-10T15:48Z"],
  [0, "2026-01-18T19:51Z"],
  [90, "2026-01-26T04:47Z"],
  [180, "2026-02-01T22:09Z"],
  [270, "2026-02-09T12:43Z"],
  [0, "2026-02-17T12:01Z"],
  [90, "2026-02-24T12:27Z"],
  [180, "2026-03-03T11:37Z"],
  [270, "2026-03-11T09:38Z"],
  [0, "2026-03-19T01:23Z"],
  [90, "2026-03-25T19:17Z"],
  [180, "2026-04-02T02:11Z"],
  [270, "2026-04-10T04:51Z"],
  [0, "2026-04-17T11:51Z"],
  [90, "2026-04-24T02:31Z"],
  [180, "2026-05-01T17:23Z"],
  [270, "2026-05-09T21:10Z"],
  [0, "2026-05-16T20:00Z"],
  [90, "2026-05-23T11:10Z"],
  [180, "2026-05-31T08:45Z"],
  [270, "2026-06-08T10:00Z"],
  [0, "2026-06-15T02:54Z"],
  [90, "2026-06-21T21:55Z"],
  [180, "2026-06-29T23:56Z"],
  [270, "2026-07-07T19:28Z"],
  [0, "2026-07-14T09:43Z"],
  [90, "2026-07-21T11:05Z"],
  [180, "2026-07-29T14:35Z"],
  [270, "2026-08-06T02:21Z"],
  [0, "2026-08-12T17:36Z"],
  [90, "2026-08-20T02:46Z"],
  [180, "2026-08-28T04:18Z"],
  [270, "2026-09-04T07:51Z"],
  [0, "2026-09-11T03:26Z"],
  [90, "2026-09-18T20:43Z"],
  [180, "2026-09-26T16:48Z"],
  [270, "2026-10-03T13:24Z"],
  [0, "2026-10-10T15:50Z"],
  [90, "2026-10-18T16:12Z"],
  [180, "2026-10-26T04:11Z"],
  [270, "2026-11-01T20:28Z"],
  [0, "2026-11-09T07:02Z"],
  [90, "2026-11-17T11:47Z"],
  [180, "2026-11-24T14:53Z"],
  [270, "2026-12-01T06:08Z"],
  [0, "2026-12-09T00:51Z"],
  [90, "2026-12-17T05:42Z"],
  [180, "2026-12-24T01:28Z"],
  [270, "2026-12-30T18:59Z"]
];

test('every principal phase of 2026, within 15 minutes of PyEphem', () => {
  const got = m.moonPhases(Date.UTC(2026, 0, 1), Date.UTC(2027, 0, 1));
  assert.strictEqual(got.length, PYEPHEM_2026.length);
  let worst = 0;
  got.forEach((g, i) => {
    const [k, t] = PYEPHEM_2026[i];
    assert.strictEqual(g.kind, k, t);
    const err = Math.abs(g.t - Date.parse(t)) / 60000;
    worst = Math.max(worst, err);
    assert.ok(err < 15, `${g.name} ${t}: ${err.toFixed(0)} min out`);
  });
  assert.ok(worst > 0, 'not trivially equal');
});

test('the Moon is dark at new, whole at full, half at the quarters', () => {
  const at = t => m.moonState(new Date(t), 0, 0);
  assert.ok(at(Date.parse('2026-09-11T03:26Z')).illum < 0.001);
  assert.ok(at(Date.parse('2026-09-26T16:48Z')).illum > 0.999);
  assert.ok(Math.abs(at(Date.parse('2026-09-18T20:43Z')).illum - 0.5) < 0.01);
  assert.ok(Math.abs(at(Date.parse('2026-10-03T13:24Z')).illum - 0.5) < 0.01);
});

test('a month of Moons, each phase on its local day', () => {
  const ny = m.moonMonth(2026, 9, () => -240);
  assert.strictEqual(ny.length, 30);
  const phaseDays = ny.filter(d => d.phase).map(d => [d.day, d.phase.name]);
  // The new Moon is 03:26 UTC on the 11th: still the 10th in New York.
  assert.deepStrictEqual(phaseDays, [[4, 'Last quarter'], [10, 'New Moon'], [18, 'First quarter'], [26, 'Full Moon']]);
  assert.strictEqual(m.moonMonth(2026, 9, () => 0).find(d => d.phase && d.phase.kind === 0).day, 11, 'in UTC it is the 11th');
  assert.ok(ny[14].waxing && !ny[5].waxing);
  assert.ok(ny[25].illum > 0.99 && ny[9].illum < 0.02);
  // November holds the clocks going back: each day uses its own offset.
  const nov = m.moonMonth(2026, 11, d => (d === 1 ? -240 : -300));
  assert.ok(nov[0].off === -240 && nov.slice(1).every(d => d.off === -300));
});

test('the phase shape: crescent bulges toward the lit side, gibbous away', () => {
  assert.strictEqual(m.moonPhasePath(0, 10), '');
  const arcs = d => [...d.matchAll(/A([\d.]+) ([\d.]+) 0 0 (\d) /g)].map(a => [+a[1], +a[3]]);
  assert.deepStrictEqual(arcs(m.moonPhasePath(0.25, 10)), [[10, 1], [5, 0]], 'crescent: terminator bulges right, into the lit side');
  assert.deepStrictEqual(arcs(m.moonPhasePath(0.75, 10)), [[10, 1], [5, 1]], 'gibbous: bulges left');
  assert.deepStrictEqual(arcs(m.moonPhasePath(0.5, 10)), [[10, 1], [0, 1]], 'half: straight');
  assert.deepStrictEqual(arcs(m.moonPhasePath(1, 10)), [[10, 1], [10, 1]], 'full: the whole disc');
});

const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(c => c != null && c !== false) }) };
const walk = (n, fn) => { if (n && typeof n === 'object') { fn(n); (n.children || []).forEach(c => walk(c, fn)); } };

test('the calendar: days under their weekdays, mirrored when waning or south, a tap picks the day', () => {
  const MoonMonth = new Function('React', 'moonPhasePath', declSource('MoonMonth') + '\nreturn MoonMonth;')(React, m.moonPhasePath);
  const days = m.moonMonth(2026, 9, () => -240);
  let picked = null;
  const tree = MoonMonth({ days, Y: 2026, Mo: 9, D: 24, south: false, onPick: d => { picked = d; } });
  const kids = tree.children;
  // 1 September 2026 is a Tuesday: seven headings, then two blanks.
  assert.strictEqual(kids.slice(7, 9).every(k => k.type === 'div' && !k.children.length), true);
  const buttons = kids.filter(k => k.type === 'button');
  assert.strictEqual(buttons.length, 30);
  assert.strictEqual(buttons[25].props['aria-label'], 'September 26: full moon, 100% lit');
  assert.strictEqual(buttons[23].props['aria-pressed'], true);
  buttons[9].props.onClick();
  assert.strictEqual(picked, 10);
  const flips = t => { const out = []; walk(t, n => { if (n.type === 'path') out.push(n.props.transform === 'scale(-1,1)'); }); return out; };
  const north = flips(tree), south = flips(MoonMonth({ days, Y: 2026, Mo: 9, D: 1, south: true }));
  assert.strictEqual(north[14], false, 'waxing, from the north: lit on the right');
  assert.strictEqual(north[5], true, 'waning: lit on the left');
  assert.deepStrictEqual(south, north.map(x => !x), 'from the south, every one the other way');
});

test('the Ephemeris shows it, and its events use the same phases', () => {
  const src = declSource('TwilightEphemeris');
  assert.match(src, /React\.createElement\(MoonMonth, \{ days: moonDays/);
  assert.match(src, /moonPhases\(now2, now2 \+ 6 \* lunarCycle\)/);
  assert.match(src, /onPick: day => setDateStr\(/);
  assert.match(src, /moonDays\.filter\(d => d\.phase\)\.map\(d => React\.createElement/, 'the four phases listed under it');
});
