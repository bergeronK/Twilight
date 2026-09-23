'use strict';
/*
 * The Ephemeris tab: real time zones, day stepping, the painted day, and the
 * month export.
 *
 * Until this redesign the tab opened on a fixed New York solstice with a
 * hand-set "UTC-5 +DST", so anyone elsewhere — or anyone after a daylight-
 * saving change — saw times an hour or more out until they noticed. It now
 * takes the offset from the place's IANA zone for the date shown. The cases
 * below are the ones that break a naive version: both hemispheres, a
 * changeover day, a half-hour zone, and Lord Howe Island, whose daylight
 * saving is 30 minutes, so "standard + 60" would be wrong.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'rev', 'sin', 'cos', 'asin', 'acos', 'atan2', 'jd', 'gmst',
  'tzOffset', 'zoneOffsets', 'shiftDate', 'hx', 'toHex', 'lerpC', 'skyColors', 'daySkyStops',
  'moonState', 'moonTopo', 'moonAltSeen', 'moonDayTrack']);

test('zoneOffsets: the offset a real zone has on the date, daylight saving included', () => {
  const cases = [
    ['America/New_York', 2026, 6, 21, -240, -300, true],
    ['America/New_York', 2026, 1, 15, -300, -300, false],
    ['America/New_York', 2026, 3, 7, -300, -300, false],   // the day before the change
    ['America/New_York', 2026, 3, 8, -240, -300, true],    // changes at 02:00; noon is summer time
    ['America/New_York', 2026, 11, 1, -300, -300, false],  // and back
    ['Europe/London', 2026, 7, 1, 60, 0, true],
    ['Australia/Sydney', 2026, 1, 15, 660, 600, true],     // southern summer
    ['Australia/Sydney', 2026, 7, 15, 600, 600, false],
    ['Asia/Kolkata', 2026, 9, 22, 330, 330, false],        // half-hour zone, no DST
    ['Australia/Lord_Howe', 2026, 1, 15, 660, 630, true],  // a 30-minute daylight saving
    ['UTC', 2026, 9, 22, 0, 0, false]
  ];
  for (const [tz, Y, Mo, D, off, std, dst] of cases) {
    assert.deepStrictEqual(m.zoneOffsets(tz, Y, Mo, D), { off, std, dst }, `${tz} ${Y}-${Mo}-${D}`);
  }
});

test('shiftDate: whole days, across month ends, year ends and leap days', () => {
  assert.strictEqual(m.shiftDate('2026-09-22', 1), '2026-09-23');
  assert.strictEqual(m.shiftDate('2026-09-30', 1), '2026-10-01');
  assert.strictEqual(m.shiftDate('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(m.shiftDate('2027-01-01', -1), '2026-12-31');
  assert.strictEqual(m.shiftDate('2028-02-28', 1), '2028-02-29');
  assert.strictEqual(m.shiftDate('2027-02-28', 1), '2027-03-01');
  assert.strictEqual(m.shiftDate('2026-03-08', 1), '2026-03-09', 'a daylight-saving day is still one day');
});

test('daySkyStops: the day painted with the Console’s own sky colours', () => {
  // A crude day: night, dawn, noon, dusk, night.
  const pts = [];
  for (let min = 0; min <= 1440; min += 3) pts.push([min, 50 * Math.sin((min / 1440 - 0.25) * 2 * Math.PI)]);
  const stops = m.daySkyStops(pts, 5);
  assert.strictEqual(stops[0].at, 0);
  assert.strictEqual(stops[stops.length - 1].at, 1, 'the painting reaches the end of the day');
  for (let i = 1; i < stops.length; i++) assert.ok(stops[i].at > stops[i - 1].at, 'stops must ascend');
  const lum = hex => [1, 3, 5].reduce((s, i) => s + parseInt(hex.slice(i, i + 2), 16), 0);
  const noon = stops.find(s => Math.abs(s.at - 0.5) < 0.006), midnight = stops[0];
  assert.strictEqual(noon.color, m.skyColors(50).m, 'the colour is skyColors at that altitude');
  assert.ok(lum(noon.color) > 3 * lum(midnight.color), 'noon is far brighter than midnight');
});

test('moonDayTrack: the Moon as seen from the ground, through the local day', () => {
  const lat = 42.36, lon = -71.06, start = Date.UTC(2026, 8, 22) + 240 * 60000; // EDT midnight
  const track = m.moonDayTrack(lat, lon, start, 10);
  assert.strictEqual(track.length, 145);
  for (const [min, alt] of [track[0], track[63], track[144]]) {
    assert.strictEqual(alt, m.moonAltSeen(new Date(start + min * 60000), lat, lon));
  }
  const peak = track.reduce((b, p) => (p[1] > b[1] ? p : b));
  assert.ok(peak[0] >= 21 * 60 && peak[0] <= 23 * 60, `the Moon peaks at ${(peak[0] / 60).toFixed(1)} h local`);
});

// The month export, run from source: monthRows lives inside the component.
const monthRows = (tz, Y, Mo, offMin) => new Function(
  'Y', 'Mo', 'latN', 'lonN', 'tz', 'offMin', 'zoneOffsets', 'computeDay', 'daysInMonth',
  declSource('monthRows') + '\nreturn monthRows;'
)(Y, Mo, 42.36, -71.06, tz, offMin, m.zoneOffsets, () => ({}), (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate())();

test('the month export gives each day its own offset, across a daylight-saving change', () => {
  // March 2026 in New York: daylight saving starts on the 8th. The export used
  // one offset for the whole month, so every day after the change was an
  // hour out.
  const rows = monthRows('America/New_York', 2026, 3, -300);
  assert.strictEqual(rows.length, 31);
  assert.strictEqual(rows[6].off, -300, '7 March, still winter time');
  assert.strictEqual(rows[7].off, -240, '8 March, summer time');
  assert.strictEqual(rows[30].off, -240, '31 March');
});

test('with no zone (coordinates typed by hand) the export uses the manual offset', () => {
  const rows = monthRows(null, 2026, 3, -300);
  assert.ok(rows.every(r => r.off === -300));
});
