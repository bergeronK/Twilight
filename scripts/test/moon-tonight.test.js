'use strict';
/*
 * Tonight on the Moon: the libration and the Sun's place on the Moon
 * against PyEphem (written out by script), the terminator's geometry, the
 * features offered (lit, low Sun, facing us), and the words. MOON_FEATURES
 * comes from the IAU gazetteer through scripts/generate-moon-features.js;
 * the test checks the two lists are in step, since the gazetteer file itself
 * isn't in the repo.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'asin', 'acos', 'atan2', 'rev', 'jd', 'gmst', 'sunAltitude', 'sunHcZn',
  'MOON_LR', 'MOON_B', 'moonEcliptic', 'moonState', 'moonTopo', 'moonAltSeen', 'moonElong', 'MOON_PHASE_NAMES', 'moonPhases', 'moonSD', 'moonHP', 'sunState', 'sunSDdeg', 'sunHPdeg', 'angSep', 'lunarShadow', 'bisectTime', 'minTime', 'lunarEclipse', 'eclipseWords', 'planetAltAz', 'starHcZn', 'scanCrossings', 'SUN_THR', 'MOON_THR',
  'nightSpan', 'HZ_AFTER', 'nightPlan', 'limitingMag', 'BORTLE', 'skyLimit', 'METEOR_SHOWERS', 'SPORADIC_HR',
  'showerActivity', 'meteorRate', 'milkyWayVisibility', 'COMPASS16', 'compass16', 'HIGHLIGHT_STARS', 'sepAltAz',
  'HIGHLIGHT_DSO', 'tonightHighlights',
  'MOON_FEATURES', 'moonLibration', 'moonSunAlt', 'terminatorFeatures', 'librationWords']);

// PyEphem 4.2: [ms, libration_long, libration_lat, colong, subsolar_lat], degrees.
const REF = [[1767225600000, -1.298, -6.534, 57.398, -1.37], [1768340304000, 1.018, 6.595, 214.181, -1.127], [1769455008000, -3.323, -6.064, 11.098, -0.874], [1770569712000, 2.844, 6.036, 168.007, -0.519], [1771684416000, -3.32, -4.833, 324.87, -0.181], [1772799120000, 3.748, 4.701, 122.087, 0.201], [1773913824000, -4.684, -2.777, 279.128, 0.541], [1775028528000, 4.408, 2.8, 76.338, 0.873], [1776143232000, -6.867, -0.333, 233.565, 1.14], [1777257936000, 5.912, 0.847, 31.162, 1.347], [1778372640000, -7.031, 1.749, 188.497, 1.487], [1779487344000, 7.061, -1.057, 346.179, 1.538], [1780602048000, -4.951, 3.378, 143.806, 1.525], [1781716752000, 5.295, -3.166, 301.303, 1.41], [1782831456000, -2.179, 4.808, 99.075, 1.254], [1783946160000, 0.827, -5.241, 256.774, 0.998], [1785060864000, 0.382, 6.027, 54.431, 0.731], [1786175568000, -2.452, -6.514, 212.057, 0.379], [1787290272000, 2.564, 6.762, 9.78, 0.061], [1788404976000, -3.0, -6.743, 167.176, -0.322], [1789519680000, 3.984, 6.77, 324.779, -0.629], [1790634384000, -3.429, -6.066, 122.104, -0.961], [1791749088000, 4.538, 6.033, 279.379, -1.193], [1792863792000, -5.55, -4.615, 76.527, -1.406], [1793978496000, 5.37, 4.837, 233.735, -1.501], [1795093200000, -7.174, -2.806, 30.593, -1.547], [1796207904000, 6.881, 3.431, 187.746, -1.478], [1797322608000, -6.095, -1.025, 344.602, -1.344], [1798437312000, 6.599, 1.522, 141.306, -1.116], [1799552016000, -3.394, 0.821, 298.279, -0.833]];

test('libration and the Sun’s place on the Moon as PyEphem has them', () => {
  for (const [ms, l, b, c, sl] of REF) {
    const L = m.moonLibration(ms), when = new Date(ms).toISOString();
    assert.ok(Math.abs(L.l - l) < 0.1, `longitude ${L.l} vs ${l} at ${when}`);
    assert.ok(Math.abs(L.b - b) < 0.1, `latitude ${L.b} vs ${b} at ${when}`);
    assert.ok(Math.abs(((L.colong - c + 540) % 360) - 180) < 0.3, `colongitude ${L.colong} vs ${c} at ${when}`);
    assert.ok(Math.abs(L.sunLat - sl) < 0.02, `Sun's latitude ${L.sunLat} vs ${sl} at ${when}`);
  }
  // The range the libration really covers.
  const ls = REF.map(r => m.moonLibration(r[0]));
  assert.ok(Math.max(...ls.map(x => Math.abs(x.l))) > 5 && Math.max(...ls.map(x => Math.abs(x.b))) > 5);
});

test('the Sun rises along the terminator and stands overhead where it should', () => {
  const lib = { colong: 20, sunLat: 0, l: 0, b: 0 };
  // Colongitude 20: the morning terminator is at 20° west.
  const t = m.moonSunAlt(lib, -20, 0);
  assert.ok(Math.abs(t.alt) < 1e-9);
  assert.strictEqual(m.moonSunAlt(lib, -15, 0).rising, true);
  assert.ok(m.moonSunAlt(lib, -15, 0).alt > 4.9 && m.moonSunAlt(lib, -15, 0).alt < 5.1);
  assert.ok(m.moonSunAlt(lib, -25, 0).alt < 0, 'still night west of it');
  assert.ok(Math.abs(m.moonSunAlt(lib, 70, 0).alt - 90) < 1e-9, 'noon 90° east of it');
  assert.strictEqual(m.moonSunAlt(lib, 155, 0).rising, false, 'the evening side');
  // Near the poles the Sun stays low: at 60° it can't climb past 30°.
  assert.ok(m.moonSunAlt(lib, 70, 60).alt <= 30 + 1e-9);
});

test('only features in low sunlight, on the side facing us, most worth seeing first', () => {
  const names = m.MOON_FEATURES.map(f => f[0]);
  for (let t = Date.UTC(2026, 8, 10); t < Date.UTC(2026, 9, 10); t += 6 * 3600000) {
    const lib = m.moonLibration(t);
    const fs_ = m.terminatorFeatures(lib, 5);
    assert.ok(fs_.length <= 5);
    let last = -1;
    fs_.forEach(f => {
      assert.ok(f.alt >= 1 && f.alt <= 10, `${f.name} at ${f.alt}`);
      assert.ok(f.off < 80);
      const i = names.indexOf(f.name);
      assert.ok(i > last, 'in the list’s order'); last = i;
    });
  }
  // First quarter, 18 Sep 2026: sunrise along the middle of the Moon.
  const fq = m.terminatorFeatures(m.moonLibration(Date.UTC(2026, 8, 19, 1)));
  assert.deepStrictEqual(fq.map(f => [f.name, f.rising]), [['the Apennine Mountains', true], ['the Alpine Valley', true], ['Hipparchus', true]]);
  // Four days past full the evening terminator crosses the east.
  const wan = m.terminatorFeatures(m.moonLibration(Date.UTC(2026, 9, 1, 1)), 5);
  assert.ok(wan.length && wan.every(f => !f.rising), JSON.stringify(wan));
  // A feature behind the limb is not offered even in low sun.
  assert.strictEqual(m.terminatorFeatures({ colong: 272, sunLat: 0, l: -8, b: 0 }).find(f => f.name === 'Langrenus'), undefined);
});

test('the tilt in words, only when it’s enough to notice', () => {
  assert.strictEqual(m.librationWords({ l: 2, b: -3 }), '');
  assert.strictEqual(m.librationWords({ l: 6.2, b: 1 }), 'The Moon is tipped to show more than usual of the Mare Crisium side.');
  assert.strictEqual(m.librationWords({ l: -5.5, b: -6.5 }), 'The Moon is tipped to show more than usual of its south edge, beyond Tycho and the Grimaldi side.');
  assert.strictEqual(m.librationWords({ l: 0, b: 6.7 }), 'The Moon is tipped to show more than usual of its north edge, beyond Plato.');
});

test('the Console offers one on a part-lit night, not at full or new Moon', () => {
  const lat = 42.36, lon = -71.06;
  const tonight = iso => {
    const now = Date.parse(iso);
    const sunEv = m.scanCrossings(now - 20 * 3600000, now + 30 * 3600000, lat, lon, m.sunAltitude, m.SUN_THR, 2);
    const span = m.nightSpan(sunEv, now);
    const moonEv = m.scanCrossings(span.start, span.end, lat, lon, m.moonAltSeen, m.MOON_THR, 4);
    const plan = m.nightPlan(span, sunEv, moonEv, m.moonAltSeen(new Date(span.start), lat, lon) > -0.833);
    return m.tonightHighlights(plan, lat, lon, 5, t => new Date(t).toISOString().slice(11, 16));
  };
  const fq = tonight('2026-09-18T20:00:00Z').find(h => h.kind === 'moonfeature');
  assert.ok(fq, 'first quarter');
  assert.match(fq.title, /^On the Moon: sunrise over /);
  assert.match(fq.detail, /on the line between day and night/);
  assert.ok(!tonight('2026-09-26T20:00:00Z').some(h => h.kind === 'moonfeature'), 'full Moon');
  assert.ok(!tonight('2026-09-10T20:00:00Z').some(h => h.kind === 'moonfeature'), 'new Moon');
});

test('MOON_FEATURES is the generator’s list, in its order, from the gazetteer', () => {
  const gen = fs.readFileSync(path.join(__dirname, '..', 'generate-moon-features.js'), 'utf8');
  const picks = [...gen.matchAll(/^\s*\['([^']+)', '([^']+)', '([^']+)'\],?$/gm)].map(x => [x[2], x[3]]);
  assert.strictEqual(picks.length, m.MOON_FEATURES.length);
  picks.forEach(([shown, what], i) => assert.deepStrictEqual(m.MOON_FEATURES[i].slice(0, 2), [shown, what]));
  m.MOON_FEATURES.forEach(([n, , lon, lat, dia]) => assert.ok(Math.abs(lon) <= 90 && Math.abs(lat) < 90 && dia > 0, n));
  // The Ephemeris shows them at 9 PM with the tilt.
  const eph = declSource('TwilightEphemeris');
  assert.match(eph, /moonLibration\(dayStartMs \+ 21 \* 3600000\)/);
  assert.match(eph, /"Tipped toward us", libWords/);
});
