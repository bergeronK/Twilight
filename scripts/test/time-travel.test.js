'use strict';
/*
 * Sky View's time travel: a slider that shows the sky up to a day either
 * way on the same live view. What matters is that everything Sky View draws
 * and guides to moves to that time together (bodies, constellation lines and
 * names, the Milky Way's sidereal time), that the rest of the Stars tab stays
 * on now, and that Align, which compares the drawn sky with the real one, is
 * not offered while the two are at different times.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'asin', 'acos', 'atan2', 'rev', 'jd', 'gmst', 'sunHcZn', 'MOON_LR', 'MOON_B', 'moonEcliptic', 'moonState', 'moonTopo',
  'planetAltAz', 'starHcZn', 'NAV_STARS', 'starColor', 'dsoLabel', 'timeShiftWords']);

test('the shift in words', () => {
  assert.strictEqual(m.timeShiftWords(0), 'now');
  assert.strictEqual(m.timeShiftWords(45), 'in 45 min');
  assert.strictEqual(m.timeShiftWords(180), 'in 3 h');
  assert.strictEqual(m.timeShiftWords(195), 'in 3 h 15 min');
  assert.strictEqual(m.timeShiftWords(-15), '15 min ago');
  assert.strictEqual(m.timeShiftWords(-1440), '24 h ago');
});

// Runs StarFinder's own memo with the names it reads, `now` deliberately
// different from `skyNow` so reading the wrong one shows.
function memo(name, deps) {
  const names = Object.keys(deps);
  return new Function(...names, declSource(name) + '\nreturn ' + name + ';')(...names.map(k => deps[k]));
}

test('Sky View’s bodies, lines and names are drawn at the time chosen', () => {
  const now = Date.UTC(2026, 8, 24, 16), skyNow = now + 6 * 3600000;
  const loc = { lat: 42.1, lon: -72.6 };
  const deepSky = [{ id: 'M31', name: 'Andromeda Galaxy', type: 's', mag: 3.4, ra: 10.68, dec: 41.27, size: 190 }];
  const deps = { useMemo: f => f(), now, skyNow, loc, starCatalog: [], deepSky, ...m };
  const bodies = memo('skyBodies', deps);
  const sun = bodies.find(b => b.name === 'Sun'), want = m.sunHcZn(new Date(skyNow), loc.lat, loc.lon);
  assert.ok(Math.abs(sun.alt - want.alt) < 1e-9 && Math.abs(sun.az - want.az) < 1e-9, 'the Sun where it will be');
  const stars = bodies.filter(b => b.nav);
  assert.ok(stars.length > 20);
  for (const sb of stars) {
    const st = m.NAV_STARS.find(s => s[0] === sb.name);
    assert.ok(Math.abs(sb.alt - m.starHcZn(st[1] * 15, st[2], loc.lat, loc.lon, new Date(skyNow)).alt) < 1e-9, sb.name);
  }
  const m31 = bodies.find(b => b.name === 'Andromeda Galaxy');
  assert.ok(m31 && Math.abs(m31.alt - m.starHcZn(10.68, 41.27, loc.lat, loc.lon, new Date(skyNow)).alt) < 1e-9, 'galaxies too');
  const lines = memo('constellationPaths', { ...deps, constLines: [{ id: 'Ori', rank: 1, pts: [{ ra: 88.79, dec: 7.41 }] }] });
  assert.ok(Math.abs(lines[0].pts[0].alt - m.starHcZn(88.79, 7.41, loc.lat, loc.lon, new Date(skyNow)).alt) < 1e-9);
  const names = memo('constellationNames', { ...deps, constNames: [{ id: 'Ori', name: 'Orion', rank: 1, ra: 83.8, dec: 5 }] });
  assert.ok(Math.abs(names[0].alt - m.starHcZn(83.8, 5, loc.lat, loc.lon, new Date(skyNow)).alt) < 1e-9);
});

test('Sky View gets the shifted sidereal time, a way back to now, and no Align while shifted', () => {
  const src = declSource('StarFinder');
  const dome = src.slice(src.indexOf('React.createElement(SkyDome'));
  assert.match(dome, /lst: rev\(gmst\(new Date\(minuteKey \* 60000 \+ skyShift \* 60000\)\) \+ loc\.lon\)/);
  assert.match(dome, /onClose: \(\) => \{ setSkyOpen\(false\); setSkyShift\(0\); \}/);
  assert.match(dome, /align: skyShift \? null : \{/);
  // The preview and the chart stay on now: they read minuteKey alone.
  const preview = src.slice(src.indexOf('React.createElement(SkyViewPreview'), src.indexOf('React.createElement(SkyViewPreview') + 300);
  assert.match(preview, /lst: rev\(gmst\(new Date\(minuteKey \* 60000\)\) \+ loc\.lon\)/);
  // The slider, labelled for a screen reader, and the Now button.
  const sd = declSource('SkyDome');
  assert.match(sd, /type: 'range', min: -1440, max: 1440, step: 15/);
  assert.match(sd, /'aria-label': 'Time shown, in minutes from now'/);
  assert.match(sd, /onClick: \(\) => time\.onShift\(0\)/);
});
