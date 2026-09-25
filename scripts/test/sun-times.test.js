'use strict';
/*
 * Sunrise, sunset and the twilight edges, against PyEphem (2026-09-25).
 *
 * The Console (sunAltitude, scanned a minute at a time) and the Ephemeris and
 * city pages (computeDay) had two different Suns: a short Fourier fit, a few
 * arcminutes out, and Meeus's formula taken once at noon UTC. Against the 588
 * events in sun-reference.json, the Console was off by 29 s at the median and
 * 10 minutes at worst (Tromsø, where the Sun crosses the horizon at a slant),
 * the Ephemeris 13 s and 4.5 minutes, and the two tabs disagreed by up to
 * 14 minutes. Boston's sunset on 24 September read 18:37 on one and 6:39 on
 * the other; PyEphem says 18:37:50. Now both take Meeus's Sun at the moment
 * itself (the Ephemeris refines each event at its own time), and round to
 * the nearest minute.
 *
 * The reference comes from PyEphem, not the app: scripts/sun-reference.py.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');
const REF = require('./sun-reference.json');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'asin', 'acos', 'atan2', 'rev', 'jd', 'gmst', 'sunAltitude', 'sunHcZn', 'sunRaDec',
  'scanCrossings', 'SUN_THR', 'RAD', 'rad', 'deg', 'computeDay', 'solarParams', 'eventUTC', 'sunEvent', 'ALT', 'photoWindows']);
const FIELD = { astro: ['astroDawn', 'astroDusk'], naut: ['nautDawn', 'nautDusk'], civil: ['civilDawn', 'civilDusk'], rise: ['sunrise', 'sunset'] };
const DAY = 86400000;

// The Console's time for a reference event: the same kind of crossing
// nearest it in a scan of the day around it.
function consoleTime([, lat, lon, key, dir, t]) {
  const xs = m.scanCrossings(t - DAY / 2, t + DAY / 2, lat, lon, m.sunAltitude, m.SUN_THR, 1).filter(e => e.key === key && e.dir === dir);
  return xs.reduce((best, e) => (Math.abs(e.t - t) < Math.abs(best - t) ? e.t : best), Infinity);
}
// The Ephemeris's: computeDay on the UTC date either side, nearest.
function ephemerisTime([, lat, lon, key, dir, t]) {
  let best = Infinity;
  for (const k of [-1, 0, 1]) {
    const d = new Date(t + k * DAY), Y = d.getUTCFullYear(), M = d.getUTCMonth() + 1, D = d.getUTCDate();
    const e = m.computeDay(lat, lon, Y, M, D)[FIELD[key][dir === 'up' ? 0 : 1]];
    if (e.utc === undefined) continue;
    const at = Date.UTC(Y, M - 1, D) + e.utc * 60000;
    if (Math.abs(at - t) < Math.abs(best - t)) best = at;
  }
  return best;
}
const minutes = ms => ms / 60000;
const summary = errs => {
  const a = errs.map(Math.abs).sort((x, y) => x - y);
  return { median: a[a.length >> 1], max: a[a.length - 1] };
};

test('the Sun where PyEphem has it, to a hundredth of a degree', () => {
  for (const [name, lat, lon, t, alt, az] of REF.positions) {
    const s = m.sunHcZn(new Date(t), lat, lon);
    assert.ok(Math.abs(s.alt - alt) < 0.012, `${name} ${new Date(t).toISOString()}: alt ${s.alt.toFixed(4)} vs ${alt}`);
    const dAz = Math.abs(((s.az - az + 540) % 360) - 180);
    assert.ok(dAz * Math.cos(alt * Math.PI / 180) < 0.012, `${name}: az ${s.az.toFixed(4)} vs ${az}`);
    assert.strictEqual(m.sunAltitude(new Date(t), lat, lon), s.alt, 'one Sun for the sky and the sextant');
  }
});

test('the Console\'s twilight times, within half a minute everywhere', () => {
  const errs = REF.events.map(r => {
    const e = minutes(consoleTime(r) - r[5]);
    assert.ok(Math.abs(e) < 0.5, `${r[0]} ${new Date(r[5]).toISOString()} ${r[3]} ${r[4]}: ${e.toFixed(2)} min`);
    return e;
  });
  const s = summary(errs);
  assert.ok(s.median < 0.05, `median ${s.median.toFixed(3)} min`);
});

test('the Ephemeris\'s (and the city pages\'), within half a minute everywhere', () => {
  const errs = REF.events.map(r => {
    const e = minutes(ephemerisTime(r) - r[5]);
    assert.ok(Math.abs(e) < 0.5, `${r[0]} ${new Date(r[5]).toISOString()} ${r[3]} ${r[4]}: ${e.toFixed(2)} min`);
    return e;
  });
  assert.ok(summary(errs).median < 0.05);
});

test('the two tabs agree to a few seconds', () => {
  for (const r of REF.events) {
    const d = minutes(consoleTime(r) - ephemerisTime(r));
    assert.ok(Math.abs(d) < 0.1, `${r[0]} ${r[3]} ${r[4]}: ${d.toFixed(2)} min apart`);
  }
});

test('Boston, 24 September 2026: sunset 18:38 on both tabs', () => {
  const ev = REF.events.find(r => r[0] === 'Boston' && r[3] === 'rise' && r[4] === 'down' && new Date(r[5]).toISOString().startsWith('2026-09-24'));
  // Rounded to the minute, the way each tab writes it.
  const R = { getH24: () => true };
  const fmtT = new Function('prefStore', declSource('fmtT') + '; return fmtT;')(R);
  assert.strictEqual(fmtT(ev[5], 'America/New_York'), '18:38', 'PyEphem, rounded');
  assert.strictEqual(fmtT(consoleTime(ev), 'America/New_York'), '18:38', 'the Console');
  const c = m.computeDay(42.36, -71.06, 2026, 9, 24).sunset.utc - 240;
  assert.strictEqual(`${Math.floor(Math.round(c) / 60)}:${String(Math.round(c) % 60).padStart(2, '0')}`, '18:38', 'the Ephemeris');
});

test('fmtT rounds to the nearest minute: 18:37:29 is 18:37, 18:37:30 is 18:38', () => {
  const fmtT = new Function('prefStore', declSource('fmtT') + '; return fmtT;')({ getH24: () => true });
  const at = s => Date.UTC(2026, 8, 24, 22, 37, s);
  assert.strictEqual(fmtT(at(29), 'America/New_York'), '18:37');
  assert.strictEqual(fmtT(at(30), 'America/New_York'), '18:38');
  assert.strictEqual(fmtT(Date.UTC(2026, 8, 25, 3, 59, 45), 'America/New_York'), '00:00', 'across midnight');
});

test('golden and blue hours share the refined edges', () => {
  // Blue hour ends where the Ephemeris's civil dusk is, to the second.
  const c = m.computeDay(64.15, -21.94, 2026, 9, 24), w = m.photoWindows(64.15, -21.94, c.p);
  assert.ok(Math.abs(w.eveningBlue[1] - c.civilDusk.utc) < 1 / 60);
  assert.ok(Math.abs(w.morningBlue[0] - c.civilDawn.utc) < 1 / 60);
});
