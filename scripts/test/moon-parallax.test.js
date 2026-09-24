'use strict';
/*
 * The Moon's parallax: where it appears from the ground, not from the
 * Earth's centre.
 *
 * moonState is geocentric. The Moon is close enough that from the surface it
 * sits visibly lower — 0.83° at 25° up, about 1.7 Moon-widths — and Sky View
 * drew it that far too high over the camera image. moonTopo corrects it for
 * everything that draws the Moon or times its rising and setting; the
 * sextant path must NOT use it, because sightToHo already applies parallax
 * to the observed altitude and would then correct twice.
 *
 * moonTopo is checked against the standard relation for parallax in altitude,
 * sin p = sin HP · cos h (Meeus, ch. 40; the Nautical Almanac's form), which
 * is derived differently from the vector shift moonTopo uses. Moonset is
 * checked against Meeus's rising-and-setting altitude for the Moon,
 * h0 = 0.7275·HP − 0.5667°.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'rev', 'sin', 'cos', 'asin', 'acos', 'atan2', 'jd', 'gmst',
  'MOON_LR', 'MOON_B', 'moonEcliptic', 'moonState', 'moonTopo', 'moonAltSeen', 'scanCrossings', 'MOON_THR']);
const D = Math.PI / 180;
const hp = r => Math.asin(1 / r) / D;   // horizontal parallax, degrees

test('the bearing is untouched: parallax only lowers the Moon', () => {
  for (const alt of [-5, 0, 10, 25, 60, 89]) {
    const t = m.moonTopo({ alt, az: 137.25, r: 60.3, illum: 0.5, age: 7 });
    assert.strictEqual(t.az, 137.25);
    assert.ok(t.alt < alt, `at ${alt}° the Moon should appear lower, got ${t.alt}`);
    assert.strictEqual(t.illum, 0.5, 'everything else passes through');
  }
});

test('matches the standard parallax-in-altitude relation, sin p = sin HP · cos h', () => {
  for (const r of [56, 60.3, 63.8]) {           // perigee to apogee
    for (const alt of [0, 5, 25, 45, 70, 88]) {
      const seen = m.moonTopo({ alt, az: 0, r }).alt;
      const p = alt - seen;
      const want = Math.asin(Math.sin(hp(r) * D) * Math.cos(seen * D)) / D;
      assert.ok(Math.abs(p - want) < 1e-9, `r ${r}, alt ${alt}: parallax ${p.toFixed(6)} vs ${want.toFixed(6)}`);
    }
  }
});

test('tonight’s numbers: 0.83° lower at 25° up, nearly the full parallax on the horizon', () => {
  const at25 = 25 - m.moonTopo({ alt: 25, az: 0, r: 62.5 }).alt;
  assert.ok(Math.abs(at25 - 0.83) < 0.01, `at 25° the Moon drops ${at25.toFixed(3)}°`);
  const atHorizon = 0 - m.moonTopo({ alt: 0, az: 0, r: 62.5 }).alt;
  assert.ok(Math.abs(atHorizon - hp(62.5)) < 0.001, `on the horizon it drops ${atHorizon.toFixed(3)}°`);
  const overhead = 90 - m.moonTopo({ alt: 90, az: 0, r: 62.5 }).alt;
  assert.ok(overhead < 1e-9, 'straight overhead there is no parallax');
});

test('moonset agrees with Meeus: the Earth’s centre sees the Moon at 0.7275·HP − 0.5667°', () => {
  // 42.10, -72.45 on the night of 22-23 September 2026, when the Moon set a
  // little after 3 am.
  const lat = 42.10, lon = -72.45;
  const start = Date.UTC(2026, 8, 23, 4, 0), end = Date.UTC(2026, 8, 23, 10, 0);
  const seen = m.scanCrossings(start, end, lat, lon, m.moonAltSeen, m.MOON_THR, 1).find(e => e.dir === 'down');
  const geo = m.moonState(new Date(seen.t), lat, lon);
  const h0 = 0.7275 * hp(geo.r) - 0.5667;
  assert.ok(Math.abs(geo.alt - h0) < 0.05,
    `at the moonset found, the geocentric altitude is ${geo.alt.toFixed(3)}°, Meeus says ${h0.toFixed(3)}°`);
  // And the old reckoning, which applied the Sun's threshold to the
  // geocentric altitude, set the Moon noticeably late.
  const old = m.scanCrossings(start, end, lat, lon, (d, la, lo) => m.moonState(d, la, lo).alt, m.MOON_THR, 1).find(e => e.dir === 'down');
  const lateMin = (old.t - seen.t) / 60000;
  assert.ok(lateMin > 3 && lateMin < 10, `the old moonset was ${lateMin.toFixed(1)} min late`);
});

test('the sextant path stays geocentric, and everything that draws the Moon does not', () => {
  // The one place a well-meaning change would do harm: sightToHo applies the
  // Moon's parallax to Ho, so a topocentric Hc would be corrected twice.
  const src = declSource('StarFinder');
  const sextant = src.match(/s\.body === 'moon'\) \{[^}]*\}/);
  assert.ok(sextant, 'the sextant Moon branch should still exist');
  assert.ok(/moonState\(dt/.test(sextant[0]) && !/moonTopo|moonAltSeen/.test(sextant[0]),
    'the sextant path must use the geocentric moonState');
  // Every other moonState in the Stars tab must be wrapped: Sky View, Aim
  // Assist, the chart. An unwrapped one draws the Moon too high.
  let at = -1, bare = [];
  while ((at = src.indexOf('moonState(', at + 1)) !== -1) {
    const before = src.slice(Math.max(0, at - 9), at);
    const line = src.slice(src.lastIndexOf('\n', at), src.indexOf('\n', at));
    if (before !== 'moonTopo(' && !/s\.body === 'moon'/.test(line)) bare.push(line.trim());
  }
  assert.deepStrictEqual(bare, [], 'a display call site is using the geocentric Moon');
});
