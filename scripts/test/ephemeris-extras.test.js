'use strict';
/*
 * The Ephemeris's golden and blue hours, and its moonrise and moonset.
 *
 * Checked against geometry that doesn't depend on the code: at the equator
 * on an equinox the Sun climbs straight up at 15° an hour, so a 10° golden
 * hour lasts 40 minutes and a 2° blue hour 8; far north in summer and winter
 * some windows can't happen at all. The Moon is checked on a full Moon
 * (26 September 2026), which rises as the Sun sets and sets as it rises, and
 * by where it actually is at the minute it is said to rise.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'rev', 'sin', 'cos', 'asin', 'atan2', 'jd', 'gmst', 'MOON_LR', 'MOON_B', 'moonEcliptic', 'moonState', 'moonTopo', 'moonAltSeen',
  'scanCrossings', 'MOON_THR', 'RAD', 'rad', 'deg', 'solarParams', 'eventUTC', 'ALT', 'computeDay', 'photoWindows', 'moonRiseSet']);

const len = w => w[1] - w[0];

test('golden and blue hours at the equator on an equinox: 40 and 8 minutes', () => {
  const p = m.solarParams(2026, 3, 20);
  const w = m.photoWindows(0, 0, p);
  for (const k of ['morningGolden', 'eveningGolden']) assert.ok(Math.abs(len(w[k]) - 40) < 1.5, `${k} ${len(w[k])}`);
  for (const k of ['morningBlue', 'eveningBlue']) assert.ok(Math.abs(len(w[k]) - 8) < 1, `${k} ${len(w[k])}`);
});

test('the windows join up and straddle sunrise and sunset', () => {
  const lat = 42.2, lon = -72.6, c = m.computeDay(lat, lon, 2026, 9, 26), w = m.photoWindows(lat, lon, c.p);
  assert.strictEqual(w.morningBlue[1], w.morningGolden[0]);
  assert.strictEqual(w.eveningGolden[1], w.eveningBlue[0]);
  assert.ok(w.morningGolden[0] < c.sunrise.utc && c.sunrise.utc < w.morningGolden[1]);
  assert.ok(w.eveningGolden[0] < c.sunset.utc && c.sunset.utc < w.eveningGolden[1]);
  assert.ok(w.morningBlue[0] > c.civilDawn.utc - 0.01 && w.eveningBlue[1] < c.civilDusk.utc + 0.01, 'blue hour ends at civil twilight (-6°)');
  // Longer away from the equator: the Sun sets at a slant.
  const eq = m.photoWindows(0, 0, m.solarParams(2026, 9, 26));
  assert.ok(len(w.eveningGolden) > len(eq.eveningGolden) + 10);
});

test('far north, some windows can’t happen', () => {
  // Tromsø-ish latitude at midsummer: the Sun never gets 4° below the horizon.
  const summer = m.photoWindows(70, 19, m.solarParams(2026, 6, 21));
  assert.deepStrictEqual(summer, { morningBlue: null, morningGolden: null, eveningGolden: null, eveningBlue: null });
  // The Arctic Circle at midwinter: the Sun never reaches 6° up, but it does
  // spend a blue hour below the horizon.
  const winter = m.photoWindows(66, 25, m.solarParams(2026, 12, 21));
  assert.strictEqual(winter.morningGolden, null);
  assert.strictEqual(winter.eveningGolden, null);
  assert.ok(winter.morningBlue && winter.eveningBlue);
});

test('moonrise and moonset on the full Moon: opposite the Sun', () => {
  const lat = 42.2043, lon = -72.6162, off = -240;
  const start = Date.UTC(2026, 8, 26) - off * 60000;
  const mr = m.moonRiseSet(lat, lon, start);
  const c = m.computeDay(lat, lon, 2026, 9, 26);
  const utcMin = t => (t - Date.UTC(2026, 8, 26)) / 60000;
  assert.ok(Math.abs(utcMin(mr.rise) - c.sunset.utc) < 30, 'rises with sunset');
  assert.ok(Math.abs(utcMin(mr.set) - c.sunrise.utc) < 45, 'sets with sunrise');
  // At the minute given, the Moon is where rising means: its upper limb on
  // the horizon, as seen from the ground.
  assert.ok(Math.abs(m.moonAltSeen(new Date(mr.rise), lat, lon) + 0.833) < 0.05);
  assert.ok(Math.abs(m.moonAltSeen(new Date(mr.set), lat, lon) + 0.833) < 0.05);
  // A day later it rises later, by the usual half hour to an hour.
  const next = m.moonRiseSet(lat, lon, start + 86400000);
  const late = (next.rise - mr.rise) / 60000 - 1440;
  assert.ok(late > 10 && late < 80, `${late.toFixed(0)} min later`);
});

test('a day with no moonrise says so rather than borrowing the next day’s', () => {
  // Scan a month: every day has at most one of each, and at least one day
  // has none (the Moon's day is ~50 minutes longer than ours).
  const lat = 42.2, lon = -72.6;
  let missing = 0;
  for (let d = 1; d <= 30; d++) {
    const r = m.moonRiseSet(lat, lon, Date.UTC(2026, 8, d, 4));
    if (r.rise == null) missing++;
    if (r.rise != null) assert.ok(r.rise >= Date.UTC(2026, 8, d, 4) && r.rise < Date.UTC(2026, 8, d + 1, 4));
  }
  assert.ok(missing >= 1 && missing <= 2, `${missing} days without a moonrise`);
});

test('the month export carries the new columns, one value each', () => {
  let out = null;
  const fn = new Function('Y', 'Mo', 'latN', 'lonN', 'monthRows', 'cell', 'fmtLocal', 'photoWindows', 'moonRiseSet', 'download', 'pad2',
    declSource('exportCSV') + '\nreturn exportCSV;');
  const fmt = (u, off) => String(Math.round(u + off));
  const rows = [1, 2].map(day => ({ day, c: m.computeDay(42.2, -72.6, 2026, 9, day), off: -240 }));
  fn(2026, 9, 42.2, -72.6, () => rows, e => (e.none ? 'none' : fmt(e.utc, -240)), fmt, m.photoWindows, m.moonRiseSet,
    (name, text) => { out = text; }, n => String(n).padStart(2, '0'))();
  const lines = out.split('\n');
  const hdr = lines[0].split(',');
  assert.deepStrictEqual(hdr.slice(-6), ['Blue hour (morning)', 'Golden hour (morning)', 'Golden hour (evening)', 'Blue hour (evening)', 'Moonrise', 'Moonset']);
  for (const l of lines.slice(1)) assert.strictEqual(l.split('","').length, hdr.length, l);
  assert.match(lines[1], /"\d+–\d+","\d+–\d+","\d+–\d+","\d+–\d+","(\d+|none)","(\d+|none)"$/);
});

test('the tab shows them, flat rows under the times', () => {
  const src = declSource('TwilightEphemeris');
  assert.match(src, /\["For photographers", \[/);
  assert.match(src, /\["The Moon", \[/);
  assert.match(src, /const moonDay = useMemo\(\(\) => valid \? moonRiseSet\(latN, lonN, dayStartMs\) : null/);
});

test('the photography calendar: four windows a day, golden and blue', () => {
  const x = extract(['pad2', 'icalStamp', 'utcDate']);
  let out = null;
  const fn = new Function('Y', 'Mo', 'latN', 'lonN', 'icalMode', 'daysInMonth', 'computeDay', 'icalStamp', 'utcDate', 'photoWindows', 'download', 'pad2',
    declSource('exportICS') + '\nreturn exportICS;');
  fn(2026, 9, 42.2, -72.6, 'photography', () => 30, (la, lo, y, mo, d) => m.computeDay(la, lo, y, mo, d), x.icalStamp, x.utcDate, m.photoWindows,
    (name, text) => { out = { name, text }; }, n => String(n).padStart(2, '0'))();
  assert.strictEqual(out.name, 'twilight_2026-09_photography.ics');
  const titles = [...out.text.matchAll(/SUMMARY:(.*)/g)].map(t => t[1].trim());
  assert.strictEqual(titles.length, 120, 'four a day in September');
  assert.deepStrictEqual(titles.slice(0, 4), ['📷 Blue hour', '📷 Golden hour', '📷 Golden hour', '📷 Blue hour']);
  // Each window is a real span, a few minutes to an hour or two.
  const starts = [...out.text.matchAll(/DTSTART:(\d{8}T\d{6}Z)/g)], ends = [...out.text.matchAll(/DTEND:(\d{8}T\d{6}Z)/g)];
  const ms = s => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11), +s.slice(11, 13), +s.slice(13, 15));
  starts.forEach((st, i) => { const d = (ms(ends[i][1]) - ms(st[1])) / 60000; assert.ok(d > 5 && d < 120, `${d} min`); });
});
