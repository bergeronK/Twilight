'use strict';
/*
 * index.html and twilight-times/twilight-calc.js carry two hand-written
 * copies of the same NOAA solar-position algorithm — the app's Ephemeris tab
 * and the SEO city landing pages. CLAUDE.md says to mirror any change from
 * one into the other, and records that the port was cross-checked once by
 * hand. This test makes that check automatic, so a change to one that is not
 * mirrored into the other fails CI instead of quietly shipping city pages
 * that disagree with the app for the same coordinates and date.
 *
 * Locations deliberately include the polar cases (Tromsø, Longyearbyen,
 * McMurdo, Ushuaia) where events are absent for part of the year, since the
 * `{none:'above'|'below'}` branch is where two ports are most likely to drift.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extract, extractFrom } = require('./extract.js');

const NAMES = ['RAD', 'rad', 'deg', 'ALT', 'solarParams', 'eventUTC', 'computeDay'];

const app = extract(NAMES);
const pages = extractFrom(
  fs.readFileSync(path.join(__dirname, '..', '..', 'twilight-times', 'twilight-calc.js'), 'utf8'),
  NAMES
);

const LOCATIONS = [
  ['New York', 40.7128, -74.0060],
  ['London', 51.5074, -0.1278],
  ['Sydney', -33.8688, 151.2093],
  ['Reykjavik', 64.1466, -21.9426],
  ['Singapore', 1.3521, 103.8198],
  ['Quito', -0.1807, -78.4678],
  ['Anchorage', 61.2181, -149.9003],
  ['Cape Town', -33.9249, 18.4241],
  ['Ushuaia', -54.8019, -68.3029],
  ['Tromso', 69.6492, 18.9553],
  ['Longyearbyen', 78.2232, 15.6267],
  ['McMurdo', -77.8419, 166.6863]
];

// Solstices, equinoxes and a few ordinary dates, across a year boundary.
const DATES = [
  [2026, 1, 15], [2026, 3, 20], [2026, 6, 21], [2026, 9, 23],
  [2026, 12, 21], [2027, 2, 28], [2026, 7, 4], [2026, 10, 31]
];

const EVENTS = ['astroDawn', 'nautDawn', 'civilDawn', 'sunrise', 'sunset', 'civilDusk', 'nautDusk', 'astroDusk'];

test('the two solar ports agree exactly on every twilight event', () => {
  let compared = 0;
  for (const [name, lat, lon] of LOCATIONS) {
    for (const [y, m, d] of DATES) {
      const a = app.computeDay(lat, lon, y, m, d);
      const b = pages.computeDay(lat, lon, y, m, d);
      for (const ev of EVENTS) {
        const where = `${name} ${y}-${m}-${d} ${ev}`;
        assert.ok(a[ev], `${where}: missing from index.html`);
        assert.ok(b[ev], `${where}: missing from twilight-calc.js`);
        // Either both resolve to a time, or both report the same no-event
        // reason ('above'/'below' the threshold all day).
        assert.strictEqual(
          a[ev].none, b[ev].none,
          `${where}: no-event state differs (${a[ev].none} vs ${b[ev].none})`
        );
        if (a[ev].none === undefined) {
          assert.strictEqual(
            a[ev].utc, b[ev].utc,
            `${where}: times differ by ${Math.abs(a[ev].utc - b[ev].utc)} min`
          );
        }
        compared++;
      }
    }
  }
  assert.strictEqual(compared, LOCATIONS.length * DATES.length * EVENTS.length);
});

test('solarParams agrees on declination and equation of time', () => {
  for (const [y, m, d] of DATES) {
    const a = app.solarParams(y, m, d);
    const b = pages.solarParams(y, m, d);
    assert.strictEqual(a.decl, b.decl, `${y}-${m}-${d}: declination differs`);
    assert.strictEqual(a.eqTime, b.eqTime, `${y}-${m}-${d}: equation of time differs`);
  }
});

test('the polar cases actually exercise the no-event branch', () => {
  // Guards the test above: if neither port ever returned {none:...}, the
  // no-event comparison would be vacuously true and a drift there invisible.
  const polar = app.computeDay(78.2232, 15.6267, 2026, 6, 21); // Longyearbyen, midnight sun
  const absent = EVENTS.filter(e => polar[e].none !== undefined);
  assert.ok(absent.length > 0, 'expected some events to be absent under the midnight sun');
});

test('the twilight thresholds themselves match', () => {
  assert.deepStrictEqual(app.ALT, pages.ALT, 'ALT thresholds differ between the two files');
});
