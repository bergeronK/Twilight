'use strict';
/*
 * Eclipses, and the Moon under them.
 *
 * Everything here is checked against PyEphem (a full lunar and solar theory,
 * independent of the app), its numbers written out by script, never typed:
 * the Moon's position; each lunar eclipse's greatest moment and magnitudes
 * with the same shadow rule (Danjon's) applied to PyEphem's Sun and Moon;
 * and what particular places see of solar eclipses. The kinds are the ones
 * every catalogue lists. Building this found the app's old Moon (Schlyter's
 * short series) 1-2 arcminutes out: it put Oviedo, inside the 2026 path of
 * totality, outside it.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'rev', 'sin', 'cos', 'asin', 'acos', 'atan2', 'jd', 'gmst', 'MOON_LR', 'MOON_B', 'moonEcliptic',
  'moonState', 'moonTopo', 'moonAltSeen', 'moonElong', 'MOON_PHASE_NAMES', 'moonPhases', 'moonSD', 'moonHP', 'sepAltAz',
  'sunState', 'sunAltAzExact', 'sunSDdeg', 'sunHPdeg', 'angSep', 'lunarShadow', 'bisectTime', 'minTime', 'lunarEclipse',
  'solarEclipseGlobal', 'solarView', 'solarEclipseLocal', 'eclipsesBetween', 'eclipseWords']);

// PyEphem 4.x, apparent geocentric ecliptic of date: [ms, lon°, lat°, km].
const PYEPHEM_MOON = [
  [1735689600000, 293.91416, -4.60987, 381735.5],
  [1739310480000, 135.55705, 3.48732, 390332.9],
  [1742931360000, 315.96661, -3.50645, 374139.8],
  [1746552240000, 161.11947, 1.35418, 398414.5],
  [1750173120000, 341.76844, -0.91961, 377907.3],
  [1753794000000, 183.72433, -1.3166, 397464.6],
  [1757414880000, 9.77712, 1.93628, 365491.1],
  [1761035760000, 206.46094, -3.2213, 404015.5],
  [1764656640000, 31.97154, 3.71607, 361497.9],
  [1768277520000, 230.44441, -4.82645, 405163.7],
  [1771898400000, 59.71394, 5.21324, 370317.6],
  [1775519280000, 252.05626, -5.15097, 404896.0],
  [1779140160000, 87.384, 4.63419, 359689.9],
  [1782761040000, 275.99064, -4.17399, 405462.2],
  [1786381920000, 110.5281, 3.34101, 363326.3],
  [1790002800000, 298.87062, -2.67352, 400350.5],
  [1793623680000, 138.82968, 0.71418, 374903.9],
  [1797244560000, 320.99289, -0.1088, 402045.5],
  [1800865440000, 164.30012, -2.13031, 368011.6],
  [1804486320000, 345.8597, 2.24821, 394795.8],
  [1808107200000, 186.66859, -3.78863, 377275.3],
  [1811728080000, 8.05201, 4.12667, 388008.0],
  [1815348960000, 214.16378, -5.20586, 387403.0],
  [1818969840000, 32.58613, 5.20013, 389548.0],
  [1822590720000, 237.95919, -4.81998, 385100.8],
  [1826211600000, 59.28354, 4.5909, 376677.7],
  [1829832480000, 260.62785, -3.49051, 394766.3],
  [1833453360000, 80.88362, 3.50068, 372592.1],
  [1837074240000, 285.77268, -1.31732, 399762.3],
  [1840695120000, 107.84263, 0.73537, 375833.2]
];
// Lunar eclipses, Danjon's shadow on PyEphem's Sun and Moon: [greatest, umbral, penumbral].
const PYEPHEM_LUNAR = [
  ["2026-03-03T11:34Z", 1.149, 2.181],
  ["2026-08-28T04:14Z", 0.929, 1.962],
  ["2027-02-20T23:13Z", -0.057, 0.925],
  ["2027-08-17T07:14Z", -0.525, 0.545],
  ["2028-01-12T04:14Z", 0.068, 1.047],
  ["2028-07-06T18:20Z", 0.391, 1.427],
  ["2028-12-31T16:53Z", 1.247, 2.273]
];
// Solar eclipses seen from the ground (no refraction): [place, lat, lon, greatest, magnitude, kind].
const PYEPHEM_SOLAR = [
  ["Madrid", 40.4, -3.7, "2026-08-12T18:32Z", 0.998, "partial"],
  ["Oviedo", 43.36, -5.85, "2026-08-12T18:28Z", 1.016, "total"],
  ["Reykjavik", 64.15, -21.94, "2026-08-12T17:49Z", 1.002, "total"],
  ["Holyoke", 42.2, -72.6, "2026-08-12T17:53Z", 0.239, "partial"],
  ["Luxor", 25.69, 32.64, "2027-08-02T10:05Z", 1.035, "total"],
  ["Madrid", 40.4, -3.7, "2027-08-02T08:51Z", 0.881, "partial"],
  ["Sydney", -33.87, 151.21, "2028-07-22T04:01Z", 1.021, "total"],
  ["Madrid", 40.4, -3.7, "2028-01-26T16:56Z", 0.903, "partial"]
];

test('the Moon to within seconds of arc and kilometres', () => {
  // PyEphem 4 gives the ecliptic of the mean equinox of date, as this is.
  let worst = [0, 0, 0];
  for (const [t, lon, lat, km] of PYEPHEM_MOON) {
    const e = m.moonEcliptic(t);
    const dl = Math.abs(((e.lon - lon + 540) % 360) - 180) * 3600, db = Math.abs(e.lat - lat) * 3600, dr = Math.abs(e.dist - km);
    worst = [Math.max(worst[0], dl), Math.max(worst[1], db), Math.max(worst[2], dr)];
  }
  assert.ok(worst[0] < 12 && worst[1] < 5 && worst[2] < 10, `worst ${worst.map(x => x.toFixed(1)).join(' / ')}`);
  // moonState uses it: its r is the same distance in Earth radii.
  const s = m.moonState(new Date(PYEPHEM_MOON[3][0]), 0, 0);
  assert.ok(Math.abs(s.r * 6378.14 - PYEPHEM_MOON[3][3]) < 15);
});

test('every eclipse of 2026-2028, of the right kind, in order', () => {
  const es = m.eclipsesBetween(Date.UTC(2026, 0, 1), Date.UTC(2029, 0, 1), 0, 0);
  const got = es.filter(e => !(e.type === 'lunar' && e.penumbral < 0.01)).map(e => new Date(e.tMax).toISOString().slice(0, 10) + ' ' + e.kind + ' ' + e.type);
  assert.deepStrictEqual(got, [
    '2026-02-17 annular solar', '2026-03-03 total lunar', '2026-08-12 total solar', '2026-08-28 partial lunar',
    '2027-02-06 annular solar', '2027-02-20 penumbral lunar', '2027-08-02 total solar', '2027-08-17 penumbral lunar',
    '2028-01-12 partial lunar', '2028-01-26 annular solar', '2028-07-06 partial lunar', '2028-07-22 total solar',
    '2028-12-31 total lunar']);
});

test('total or annular is decided on the shadow’s axis: the hybrids come out total', () => {
  // [greatest eclipse, kind there, |gamma|] from NASA's catalogue (Espenak).
  for (const [iso, kind, gamma] of [['2023-04-20T04:17Z', 'total', 0.3952], ['2031-11-14T21:07Z', 'total', 0.3078],
    ['2024-04-08T18:18Z', 'total', 0.3431], ['2024-10-02T18:46Z', 'annular', 0.3509], ['2021-06-10T10:43Z', 'annular', 0.9152]]) {
    const e = m.solarEclipseGlobal(Date.parse(iso));
    assert.strictEqual(e.kind, kind, iso);
    assert.ok(Math.abs(e.gamma - gamma) < 0.003, `${iso}: gamma ${e.gamma.toFixed(4)}`);
  }
});

test('lunar eclipses: greatest within 2 minutes and magnitudes within 0.005 of PyEphem', () => {
  for (const [iso, umb, pen] of PYEPHEM_LUNAR) {
    const e = m.lunarEclipse(Date.parse(iso));
    assert.ok(Math.abs(e.tMax - Date.parse(iso)) <= 120000, iso + ' ' + new Date(e.tMax).toISOString());
    assert.ok(Math.abs(e.umbral - umb) < 0.005 && Math.abs(e.penumbral - pen) < 0.005, `${iso}: ${e.umbral.toFixed(3)} / ${e.penumbral.toFixed(3)}`);
  }
  // The contacts come in order, totality inside the partial phase.
  const t = m.lunarEclipse(Date.parse('2026-03-03T11:34Z'));
  assert.ok(t.P1 < t.U1 && t.U1 < t.U2 && t.U2 < t.tMax && t.tMax < t.U3 && t.U3 < t.U4 && t.U4 < t.P4);
  assert.ok(Math.abs((t.U3 - t.U2) / 60000 - 58) < 3, 'about 58 minutes of totality');
});

test('solar eclipses from the ground: within 2 minutes and 0.004 of PyEphem, and the edge of totality right', () => {
  for (const [name, lat, lon, iso, mag, kind] of PYEPHEM_SOLAR) {
    const l = m.solarEclipseLocal(Date.parse(iso), lat, lon);
    assert.ok(l, name);
    assert.ok(Math.abs(l.tMax - Date.parse(iso)) <= 120000, `${name} ${iso}: ${new Date(l.tMax).toISOString()}`);
    assert.ok(Math.abs(l.magnitude - mag) < 0.004, `${name} ${iso}: ${l.magnitude.toFixed(3)} not ${mag}`);
    assert.strictEqual(l.kind, kind, name + ' ' + iso);
  }
  // Nothing at all from the far side of the world.
  assert.strictEqual(m.solarEclipseLocal(Date.parse('2026-08-12T17:46Z'), -33.87, 151.21), null);
});

test('the words: what can be seen from here, and when', () => {
  const fmt = t => new Date(t).toISOString().slice(11, 16);
  const lunar = m.lunarEclipse(Date.parse('2026-03-03T11:34Z'));
  // From Holyoke the Moon sets during totality; from Honolulu it's up throughout.
  assert.match(m.eclipseWords(lunar, 42.2, -72.6, fmt).line, /^Totality from 11:0\d to 12:0\d, the Moon a dull coppery red\. .* The Moon sets partway through\.$/);
  assert.doesNotMatch(m.eclipseWords(lunar, 21.3, -157.9, fmt).line, /partway/);
  assert.strictEqual(m.eclipseWords(lunar, 48.9, 2.35, fmt).line, 'Not seen from here: the Moon is below the horizon.');
  assert.strictEqual(m.eclipseWords(lunar, 42.2, -72.6, fmt).title, 'Total lunar eclipse');
  const graze = m.lunarEclipse(Date.parse('2027-07-18T16:03Z'));
  assert.match(m.eclipseWords(graze, -33.87, 151.21, fmt).line, /nothing to see/);
  const solar = e => ({ type: 'solar', kind: 'total', tMax: e.tMax, local: e });
  const holyoke = m.solarEclipseLocal(Date.parse('2026-08-12T17:53Z'), 42.2, -72.6);
  assert.match(m.eclipseWords(solar(holyoke), 42.2, -72.6, fmt).line, /^The Moon covers 2\d% of the Sun’s width at 17:5\d, from 1\d:\d\d to 1\d:\d\d\. Look only through eclipse glasses\.$/);
  const oviedo = m.solarEclipseLocal(Date.parse('2026-08-12T18:28Z'), 43.36, -5.85);
  assert.match(m.eclipseWords(solar(oviedo), 43.36, -5.85, fmt).line, /^Total here at 18:2\d.*until totality begins\.$/);
  const madrid = m.solarEclipseLocal(Date.parse('2026-08-12T18:32Z'), 40.4, -3.7);
  assert.match(m.eclipseWords(solar(madrid), 40.4, -3.7, fmt).line, /The Sun sets partway through\./);
  assert.strictEqual(m.eclipseWords({ type: 'solar', kind: 'annular', tMax: 0, local: null }, 0, 0, fmt).line, 'Not seen from here.');
});

test('the Ephemeris lists the next four after painting, and the Console leads with one tonight', () => {
  const src = declSource('TwilightEphemeris');
  assert.match(src, /setTimeout\(\(\) => \{ const now = Date\.now\(\); setEclipses\(eclipsesBetween\(now, now \+ 3 \* 365\.25 \* 86400000, latN, lonN\)\.slice\(0, 4\)\); \}, 300\)/);
  assert.match(src, /eclipseSection, \/\*#__PURE__\*\/React\.createElement\("section"/);
  assert.match(declSource('tonightHighlights'), /kind: 'eclipse', rank: -1/);
});
