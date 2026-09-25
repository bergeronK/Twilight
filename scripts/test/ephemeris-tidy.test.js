'use strict';
/*
 * The Ephemeris, tidied (2026-09-25): 3,709 → about 3,060 px at 390 px wide.
 * The times, golden and blue hours, the Moon tonight, the eclipses that can
 * be seen from here and the upcoming events stay open; the month's Moon
 * calendar, the month export, eclipses not seen from here and the band notes
 * are folded, each one tap away.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');
const { eclipseSeen } = extract(['eclipseSeen']);

test('an eclipse counts as seen unless the words say it can\'t be', () => {
  assert.ok(eclipseSeen({ line: 'Only a faint shading on one side of the Moon, strongest at 18:13.' }));
  assert.ok(eclipseSeen({ line: 'Totality 11:02 to 11:04. Eclipse glasses for every partial moment.' }));
  assert.ok(!eclipseSeen({ line: 'Not seen from here.' }));
  assert.ok(!eclipseSeen({ line: 'Not seen from here: the Moon is below the horizon.' }));
  assert.ok(!eclipseSeen({ line: 'It grazes the outer shadow: nothing to see.' }));
});

test('what stays open, what is folded, and in what order', () => {
  const eph = declSource('TwilightEphemeris');
  // Folds are <details> with no `open`: shut until tapped.
  assert.match(eph, /React\.createElement\("details", \{ className: "te-moon-month", style:/, 'the month of Moons');
  assert.match(eph, /React\.createElement\("details", null, \/\*#__PURE__\*\/React\.createElement\("summary", \{[\s\S]{0,200}"Export the whole month \("/, 'the export');
  assert.match(eph, /unseen\.length > 0 && React\.createElement\("details", \{ key: "unseen"/, 'eclipses not seen from here');
  assert.ok(!/React\.createElement\("details", \{[^}]*\bopen:/.test(eph), 'none open by default');
  // The Moon fold's summary names the next principal phase.
  assert.match(eph, /nextPhase\.phase\.name \+ ", "/);
  // Eclipses that can be seen stay open; if none, it says so.
  assert.match(eph, /seen\.length \? seen\.map\(row\) : React\.createElement\("div", \{ key: "none"/);
  assert.match(eph, /"None that can be seen from here in the next three years\."/);
  // The band notes follow the events, with the other folds at the end.
  const events = eph.indexOf('"Upcoming sky events"'), bands = eph.indexOf('"What the three twilights mean"');
  assert.ok(events > 0 && bands > events, 'events, then the band notes');
});

test('the accuracy note and the credit say what is true since the sun-times fix', () => {
  const eph = declSource('TwilightEphemeris');
  assert.ok(!/NOAA/.test(eph), 'the Ephemeris no longer claims the NOAA algorithm');
  assert.match(eph, /within half a minute of PyEphem/);
  assert.ok(!/"Sun: NOAA/.test(declSource('TwilightApp')));
});
