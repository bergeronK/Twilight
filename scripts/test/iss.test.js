'use strict';
/*
 * The space station: SGP4, where it is from a place, its visible passes,
 * the orbit's loading and keeping, and the words.
 *
 * Checked against two independent programs, their numbers written out by
 * script: the `sgp4` Python package (Vallado's reference implementation)
 * for positions, and PyEphem for what one place sees and when it passes.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'rev', 'sin', 'cos', 'asin', 'acos', 'atan2', 'sunAltitude', 'sunRaDec', 'sunHcZn', 'SGP4_RE', 'SGP4_XKE', 'SGP4_J2', 'SGP4_J3',
  'SGP4_J4', 'SGP4_J3OJ2', 'parseTle', 'sgp4Init', 'sgp4At', 'gstimeRad', 'issSunDir', 'issLook', 'issPasses', 'ISS_TLE_URL',
  'noteSource', 'loadIssTle', 'issSatFrom', 'COMPASS_WORDS', 'compassWord', 'issWords']);

// sgp4 2.27 (Python, WGS-72): [line 1, line 2, [[minutes, TEME km]]]. The
// space station, a low decaying orbit, a sun-synchronous one, Spacetrack
// Report #3's test case and a 134-minute one.
const SGP4_REF = [
  ["1 25544U 98067A   19366.82137887  .00016717  00000-0  10270-3 0  9129", "2 25544  51.6392  96.6358 0005156  88.7140 271.4601 15.49497216  6061", [[0, [-786.62778, 6751.31234, 1.50379]], [60, [3805.752953, -3705.605659, -4250.861411]], [360, [2489.224515, 5111.050939, -3735.870088]], [1440, [363.553967, -6784.35367, -207.221933]], [2880, [103.7673, 6786.509478, 357.898463]], [4320, [-519.315311, -6753.425796, -570.526728]]]],
  ["1 06251U 62025E   06176.82412014  .00008885  00000-0  12808-3 0  3985", "2 06251  58.0579  54.0425 0030035 139.1568 221.1854 15.56387291  6774", [[0, [3988.310227, 5498.966572, 0.900559]], [60, [18.814494, -4917.405189, -4672.03902]], [360, [4993.626428, 2890.549699, -3600.401456]], [1440, [-2777.146823, -5663.160317, -2462.548891]], [2880, [1159.278029, 5056.601755, 4353.494186]], [4320, [946.926062, -3781.660542, -5557.691709]]]],
  ["1 28057U 03049A   06177.78615833  .00000060  00000-0  35940-4 0  1836", "2 28057  98.4283 247.6961 0000884  88.1964 271.9322 14.35478080140550", [[0, [-2715.282375, -6619.264369, -0.013414]], [60, [2772.934543, 5166.823984, -4105.474844]], [360, [2801.256072, 5455.039313, -3692.128657]], [1440, [688.160566, 4124.87619, 5794.559944]], [2880, [1788.423346, 1990.50531, -6640.593377]], [4320, [-2543.092025, -6454.420576, 1740.215621]]]],
  ["1 88888U          80275.98708465  .00073094  13844-3  66816-4 0    87", "2 88888  72.8435 115.9689 0086731  52.6988 110.5714 16.05824518  1058", [[0, [2328.969753, -5995.220513, 1719.972972]], [60, [-3279.182674, 3683.967051, 4349.420564]], [360, [2456.107065, -6071.938555, 1222.897686]], [1440, [2742.553988, -6079.670091, -326.390126]], [2880, [2900.915423, -5533.51907, -2396.926676]], [4320, [2819.166963, -4342.858278, -4249.097093]]]],
  ["1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753", "2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667", [[0, [7022.465293, -1400.082968, 0.039952]], [60, [-8198.270037, 5546.904733, 2599.06786]], [360, [-7154.031202, -3783.176825, -3536.194123]], [1440, [-938.559239, -6268.187488, -4294.029248]], [2880, [-8650.730822, -1914.938115, -3007.036034]], [4320, [-9060.473736, 4658.709525, 813.686732]]]]
];
// PyEphem 4 for the station from New York (40.7, -74.0), 2020-01-01 on:
// [minutes, altitude, azimuth, in shadow, range km], every 7 minutes it was up.
const PYEPHEM_LOOK = [
  [357, 7.5954, 138.285, true, 1647.993],
  [455, 40.1233, 63.655, true, 624.24],
  [546, 0.0398, 271.2441, true, 2344.918],
  [553, 13.3263, 22.8721, true, 1304.779],
  [651, 7.9814, 37.4324, false, 1629.553],
  [742, 1.9445, 314.0884, false, 2148.408],
  [749, 10.8425, 70.9363, false, 1439.861],
  [840, 8.4157, 303.4523, false, 1597.632],
  [847, 9.4948, 133.8388, false, 1518.533],
  [938, 5.419, 259.1755, false, 1821.914],
  [1750, 3.0462, 124.7283, true, 2030.161],
  [1841, 0.8019, 216.3072, true, 2254.431],
  [1848, 20.3338, 75.6976, true, 1013.996],
  [1939, 4.8563, 266.6914, true, 1870.234],
  [1946, 9.4399, 36.9846, true, 1529.568],
  [2037, 3.4506, 302.9776, true, 2000.588],
  [2044, 4.1025, 45.3039, false, 1941.773],
  [2135, 5.3595, 320.6069, true, 1832.865],
  [2142, 4.6541, 72.043, false, 1890.109],
  [2233, 14.683, 312.9742, false, 1237.443],
  [2240, 4.5779, 119.3555, false, 1890.961],
  [2331, 12.3514, 251.5773, false, 1350.727],
  [3234, 2.9117, 200.6164, true, 2040.363],
  [3241, 10.3986, 78.2857, true, 1466.161],
  [3332, 11.4997, 260.2529, true, 1399.253],
  [3339, 5.2962, 46.1183, true, 1837.791],
  [3430, 8.2461, 308.02, true, 1609.823],
  [3437, 0.5493, 50.2289, false, 2294.222],
  [3528, 8.8721, 330.6578, true, 1567.641],
  [3535, 0.0385, 71.9631, false, 2347.354],
  [3626, 21.9875, 331.7498, false, 963.552],
  [3633, 0.1959, 109.5345, false, 2323.834],
  [3724, 23.3392, 236.9423, false, 921.611]
];
// PyEphem's passes whose highest point is 10°+ up, in sunlight, in a sky
// 6°+ dark: [place, lat, lon, highest, altitude].
const PYEPHEM_PASSES = [
  ["New York", 40.7, -74.0, "2020-01-01T10:48:47Z", 12.68],
  ["New York", 40.7, -74.0, "2020-01-02T11:38:24Z", 16.95],
  ["New York", 40.7, -74.0, "2020-01-03T10:50:15Z", 14.45],
  ["London", 51.5, -0.1, "2020-01-01T06:10:40Z", 86.1],
  ["London", 51.5, -0.1, "2020-01-02T06:59:31Z", 63.92],
  ["London", 51.5, -0.1, "2020-01-03T06:11:37Z", 78.16],
  ["Sydney", -33.87, 151.21, "2020-01-01T10:09:59Z", 14.11],
  ["Sydney", -33.87, 151.21, "2020-01-02T10:59:13Z", 58.83],
  ["Sydney", -33.87, 151.21, "2020-01-03T10:11:14Z", 32.46]
];
const ISS = SGP4_REF[0];

test('SGP4 agrees with the reference implementation to a centimetre', () => {
  for (const [l1, l2, rows] of SGP4_REF) {
    const s = m.sgp4Init(m.parseTle(l1, l2));
    for (const [t, r] of rows) {
      const p = m.sgp4At(s, t);
      assert.ok(Math.hypot(p[0] - r[0], p[1] - r[1], p[2] - r[2]) < 1e-5, `${l1.slice(2, 7)} at ${t} min`);
    }
  }
  // A deep-space orbit (12-hour Molniya) is refused rather than got wrong.
  assert.throws(() => m.sgp4Init(m.parseTle('1 99999U          20001.00000000  .00000000  00000-0  00000-0 0    01', '2 99999  63.4000 000.0000 7000000 270.0000 000.0000  2.00000000    01')), /deep-space/);
});

test('from the ground: where it is, how far, and whether sunlight reaches it', () => {
  const sat = m.sgp4Init(m.parseTle(ISS[0], ISS[1]));
  for (const [min, alt, az, shadow, km] of PYEPHEM_LOOK) {
    const L = m.issLook(sat, Date.UTC(2020, 0, 1) + min * 60000, 40.7, -74.0);
    assert.ok(Math.abs(L.alt - alt) < 0.01, `alt at ${min}`);
    assert.ok(Math.abs(((L.az - az + 540) % 360) - 180) * Math.cos(alt * Math.PI / 180) < 0.02, `az at ${min}`);
    assert.ok(Math.abs(L.range - km) < 0.2, `range at ${min}`);
    assert.strictEqual(L.lit, !shadow, `shadow at ${min}`);
  }
});

test('visible passes: the ones PyEphem sees, at the same moment and height', () => {
  const sat = m.sgp4Init(m.parseTle(ISS[0], ISS[1]));
  for (const place of ['New York', 'London', 'Sydney']) {
    const ref = PYEPHEM_PASSES.filter(p => p[0] === place), [, lat, lon] = ref[0];
    const got = m.issPasses(sat, Date.UTC(2020, 0, 1), Date.UTC(2020, 0, 4), lat, lon);
    for (const [, , , iso, alt] of ref) {
      const g = got.find(p => Math.abs(p.top.t - Date.parse(iso)) < 60000);
      assert.ok(g, `${place} ${iso} found`);
      assert.ok(Math.abs(g.top.alt - alt) < 0.5, `${place} ${iso}: ${g.top.alt.toFixed(2)} not ${alt}`);
    }
    // And nothing it shouldn't: every pass has a real visible stretch.
    for (const p of got) assert.ok(p.end.t - p.start.t >= 30000 && p.top.alt >= 10);
  }
  // Sunlit and high, but in a sky too bright to see it: London at 07:47 on
  // 1 January 2020 (Sun 3.2° down, PyEphem), New York at 14:03 (Sun up).
  const at = (lat, lon, iso) => m.issPasses(m.sgp4Init(m.parseTle(ISS[0], ISS[1])), Date.UTC(2020, 0, 1), Date.UTC(2020, 0, 4), lat, lon)
    .some(p => Math.abs(p.top.t - Date.parse(iso)) < 300000);
  assert.ok(!at(51.5, -0.1, '2020-01-01T07:47:22Z'), 'civil twilight');
  assert.ok(!at(40.7, -74.0, '2020-01-01T14:03:35Z'), 'daylight');
  // London on New Year's morning: nearly overhead and very bright.
  const lon = m.issPasses(m.sgp4Init(m.parseTle(ISS[0], ISS[1])), Date.UTC(2020, 0, 1, 5), Date.UTC(2020, 0, 1, 7), 51.5, -0.1)[0];
  assert.ok(lon.top.alt > 80 && lon.mag < -3, `alt ${lon.top.alt}, magnitude ${lon.mag}`);
});

test('the orbit is fetched at most every 12 hours, kept, and given up after a week', async () => {
  const now = Date.UTC(2020, 0, 1, 12);
  const mem = {}, store = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  let calls = 0;
  const ok = async url => { calls++; assert.strictEqual(url, m.ISS_TLE_URL); return { ok: true, text: async () => 'ISS (ZARYA)\r\n' + ISS[0] + '\r\n' + ISS[1] + '\r\n' }; };
  const first = await m.loadIssTle(now, ok, store);
  assert.strictEqual(first.l1, ISS[0]);
  assert.strictEqual(calls, 1);
  await m.loadIssTle(now + 11 * 3600000, ok, store);
  assert.strictEqual(calls, 1, 'kept for 12 hours');
  const down = async () => { calls++; throw new Error('offline'); };
  const stale = await m.loadIssTle(now + 13 * 3600000, down, store);
  assert.strictEqual(calls, 2);
  assert.strictEqual(stale.l1, ISS[0], 'offline: the kept one');
  const bad = async () => ({ ok: true, text: async () => '<html>busy</html>' });
  assert.strictEqual((await m.loadIssTle(now + 13 * 3600000, bad, store)).l1, ISS[0], 'junk: the kept one');
  assert.strictEqual(await m.loadIssTle(now, down, { getItem: () => { throw new Error('no'); }, setItem() {} }), null);
  assert.strictEqual(await m.loadIssTle(now, async () => ({ ok: false, status: 500 }), { getItem: () => null, setItem() {} }), null);
  // Predictions from elements over a week old drift by minutes: none made.
  assert.ok(m.issSatFrom(first, Date.UTC(2020, 0, 2)));
  assert.strictEqual(m.issSatFrom(first, Date.UTC(2020, 0, 9)), null);
  assert.strictEqual(m.issSatFrom({ l1: 'x', l2: 'y' }, now), null);
});

test('a pass in words', () => {
  const fmt = t => new Date(t).toISOString().slice(11, 16);
  const p = { start: { t: Date.parse('2020-01-01T06:07:00Z'), az: 250 }, top: { t: 0, alt: 86, az: 180 }, end: { t: Date.parse('2020-01-01T06:12:00Z'), az: 90 }, endWhy: 'shadow', mag: -3.6 };
  assert.strictEqual(m.issWords(p, fmt), 'From 06:07 it rises out of the west, climbs to 86°, almost overhead, and fades into the Earth’s shadow in the east at 06:12. Brighter than any star, and steady: a plane blinks, the station doesn’t.');
  assert.match(m.issWords({ ...p, top: { alt: 30 }, endWhy: 'sets', mag: -2 }, fmt), /climbs to 30° and sinks toward the east by 06:12\. As bright as the brightest stars/);
  assert.match(m.issWords({ ...p, top: { alt: 30 }, endWhy: 'twilight', mag: 0 }, fmt), /is lost in the brightening sky in the east by 06:12\. A steady, moving star/);
});

test('the Console and the Stars tab show it; the request is allowed and declared', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  assert.match(src.match(/connect-src[^;]*/)[0], /https:\/\/celestrak\.org/);
  assert.match(declSource('tonightHighlights'), /kind: 'iss', rank: 1/);
  assert.match(declSource('HorizonHero'), /issSat && plan \? issPasses\(issSat, Math\.max\(plan\.start, Date\.now\(\)\), plan\.end, loc\.lat, loc\.lon\) : null/);
  assert.match(declSource('StarFinder'), /React\.createElement\(IssPanel, \{/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', '..', 'privacy.html'), 'utf8'), /CelesTrak/);
});
