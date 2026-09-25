'use strict';
/*
 * The northern and southern lights: NOAA's Kp forecast read into rows, the
 * geomagnetic latitude that decides how far the aurora reaches, and the
 * Console highlight that says whether tonight's forecast brings it into
 * this sky. The pole is checked against the published WMM2025 value, not
 * against the formula's own output; the reach thresholds against NOAA's
 * Kp-to-latitude table.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'asin', 'acos', 'atan2', 'rev', 'jd', 'gmst', 'sunAltitude', 'sunHcZn',
  'MOON_LR', 'MOON_B', 'moonEcliptic', 'moonState', 'moonTopo', 'moonAltSeen', 'moonElong', 'MOON_PHASE_NAMES', 'moonPhases', 'moonSD', 'moonHP', 'sunState', 'sunSDdeg', 'sunHPdeg', 'angSep', 'lunarShadow', 'bisectTime', 'minTime', 'lunarEclipse', 'eclipseWords', 'planetGeo', 'planetAltAz', 'starHcZn', 'scanCrossings', 'SUN_THR', 'MOON_THR',
  'nightSpan', 'HZ_AFTER', 'nightPlan', 'limitingMag', 'BORTLE', 'skyLimit', 'METEOR_SHOWERS', 'SPORADIC_HR',
  'showerActivity', 'meteorRate', 'milkyWayVisibility', 'COMPASS16', 'compass16', 'HIGHLIGHT_STARS', 'sepAltAz',
  'HIGHLIGHT_DSO', 'tonightHighlights',
  'WMM_COF', 'WMM_EPOCH_YEARS', 'wmmCache', 'wmmModel', 'KP_URL', 'parseKp', 'loadKp', 'geomagPole', 'geomagLat', 'auroraEdge', 'auroraReach', 'auroraTonight', 'auroraWords']);

const fmt = t => new Date(t).toISOString().slice(11, 16);
function planFor(iso, lat, lon) {
  const now = Date.parse(iso);
  const sunEv = m.scanCrossings(now - 20 * 3600000, now + 30 * 3600000, lat, lon, m.sunAltitude, m.SUN_THR, 2);
  const span = m.nightSpan(sunEv, now);
  const moonEv = m.scanCrossings(span.start, span.end, lat, lon, m.moonAltSeen, m.MOON_THR, 4);
  return m.nightPlan(span, sunEv, moonEv, m.moonAltSeen(new Date(span.start), lat, lon) > -0.833);
}
// A flat forecast over three days from `from`, with one block changed.
function rows(from, kp, spike) {
  const out = [];
  for (let t = Date.parse(from); t < Date.parse(from) + 3 * 86400000; t += 3 * 3600000) out.push({ t, kp: spike && spike[0] === t ? spike[1] : kp });
  return out;
}

test('NOAA’s forecast read in either shape', () => {
  const arr = [['time_tag', 'kp', 'observed', 'noaa_scale'],
    ['2026-09-24 00:00:00', '2.67', 'observed', null],
    ['2026-09-24 03:00:00', '5.33', 'estimated', 'G1'],
    ['2026-09-24 06:00:00', '4.00', 'predicted', null],
    ['bad', 'x', 'predicted', null]];
  const a = m.parseKp(arr);
  assert.deepStrictEqual(a, [{ t: Date.UTC(2026, 8, 24, 0), kp: 2.67 }, { t: Date.UTC(2026, 8, 24, 3), kp: 5.33 }, { t: Date.UTC(2026, 8, 24, 6), kp: 4 }]);
  const obj = [{ time_tag: '2026-09-24T03:00:00', Kp: 5.33 }, { time_tag: '2026-09-24T00:00:00Z', kp: '2.67' }, { time_tag: '2026-09-24T06:00:00', Kp: 12 }];
  assert.deepStrictEqual(m.parseKp(obj), a.slice(0, 2), 'sorted, out-of-range dropped');
  assert.deepStrictEqual(m.parseKp({ error: 1 }), []);
  assert.deepStrictEqual(m.parseKp(null), []);
});

test('the forecast is kept 3 hours, and a kept one used offline for two days', async () => {
  const now = Date.UTC(2026, 8, 24, 12), mem = {};
  const store = { getItem: k => mem[k] || null, setItem: (k, v) => { mem[k] = v; } };
  let calls = 0;
  const ok = async url => { calls++; assert.strictEqual(url, m.KP_URL); return { ok: true, json: async () => [['time_tag', 'kp'], ['2026-09-24 12:00:00', '3']] }; };
  assert.strictEqual((await m.loadKp(now, ok, store))[0].kp, 3);
  await m.loadKp(now + 2.9 * 3600000, ok, store);
  assert.strictEqual(calls, 1, 'kept for 3 hours');
  const down = async () => { calls++; throw new Error('offline'); };
  assert.strictEqual((await m.loadKp(now + 4 * 3600000, down, store))[0].kp, 3, 'offline: the kept one');
  assert.strictEqual(calls, 2);
  const junk = async () => ({ ok: true, json: async () => [] });
  assert.strictEqual((await m.loadKp(now + 4 * 3600000, junk, store))[0].kp, 3, 'empty: the kept one');
  assert.strictEqual(await m.loadKp(now + 49 * 3600000, down, store), null, 'over two days old: none');
  assert.strictEqual(await m.loadKp(now, async () => ({ ok: false, status: 503 }), { getItem: () => { throw new Error('no'); }, setItem() {} }), null);
});

test('the geomagnetic pole where WMM2025 puts it, and latitudes from it', () => {
  // WMM2025 technical report: geomagnetic north pole 80.8° N, 72.8° W (2025.0).
  const p = m.geomagPole(new Date(Date.UTC(2025, 0, 1)));
  assert.ok(Math.abs(p.lat - 80.8) < 0.1 && Math.abs(p.lon + 72.8) < 0.1, JSON.stringify(p));
  // On the pole's meridian geomagnetic latitude is just shifted by the tilt;
  // opposite it, shifted the other way.
  const d = new Date(Date.UTC(2025, 0, 1));
  assert.ok(Math.abs(m.geomagLat(40, p.lon, d) - (40 + 90 - p.lat)) < 1e-6);
  assert.ok(Math.abs(m.geomagLat(40, p.lon + 180, d) - (40 - (90 - p.lat))) < 1e-6);
  // The south is negative, and the same distance from its own pole.
  assert.ok(Math.abs(m.geomagLat(-40, p.lon + 180, d) + (40 + 90 - p.lat)) < 1e-6);
  assert.ok(Math.abs(m.geomagLat(p.lat, p.lon, d) - 90) < 1e-6);
});

test('how far the aurora reaches, by Kp', () => {
  // NOAA's table: Kp 0 at 66.5°, 5 at 56.3°, 9 at 48.1°.
  [[0, 66.5], [5, 56.3], [9, 48.1]].forEach(([kp, lat]) => assert.ok(Math.abs(m.auroraEdge(kp) - lat) < 0.1, `Kp ${kp}`));
  assert.strictEqual(m.auroraReach(67, 0), 'overhead');
  assert.strictEqual(m.auroraReach(-67, 0), 'overhead', 'the south too');
  assert.strictEqual(m.auroraReach(56.3, 5), 'overhead');
  assert.strictEqual(m.auroraReach(51.5, 5), 'low');
  assert.strictEqual(m.auroraReach(48, 5), 'camera');
  assert.strictEqual(m.auroraReach(47, 5), null);
  assert.strictEqual(m.auroraReach(40, 9), 'camera');
  assert.strictEqual(m.auroraReach(20, 9), null);
});

test('tonight’s chance, from the dark hours only', () => {
  const lat = 42.36, lon = -71.06; // Boston, geomagnetic latitude about 51.8
  const plan = planFor('2026-09-24T20:00:00Z', lat, lon);
  const from = '2026-09-24T00:00:00Z';
  assert.strictEqual(m.auroraTonight(plan, lat, lon, rows(from, 2), fmt), null, 'quiet: nothing');
  assert.strictEqual(m.auroraTonight(plan, lat, lon, null, fmt), null);
  // A storm at 06 UTC, 2 AM in Boston: in the dark.
  const a = m.auroraTonight(plan, lat, lon, rows(from, 2, [Date.UTC(2026, 8, 25, 6), 6.67]), fmt);
  assert.strictEqual(a.reach, 'low');
  assert.strictEqual(a.t, Date.UTC(2026, 8, 25, 6), 'from the start of the block');
  assert.strictEqual(a.south, false);
  assert.strictEqual(m.auroraTonight(plan, lat, lon, rows(from, 2, [Date.UTC(2026, 8, 25, 6), 8.33]), fmt).reach, 'overhead');
  // The same storm at 18 UTC, 2 PM, is in daylight: nothing.
  assert.strictEqual(m.auroraTonight(plan, lat, lon, rows(from, 2, [Date.UTC(2026, 8, 24, 18), 8.33]), fmt), null);
  // And 4:30-7:30 PM, through sunset and twilight, ending before the Sun
  // is 12° down (7:40): nothing.
  assert.strictEqual(m.auroraTonight(plan, lat, lon, [{ t: Date.UTC(2026, 8, 24, 20, 30), kp: 8.33 }], fmt), null);
  // Hobart, under the southern oval's reach.
  // A storm all evening: from when it gets dark, not from sunset.
  const ev = m.auroraTonight(plan, lat, lon, rows(from, 7), fmt);
  assert.ok(m.sunAltitude(new Date(ev.t), lat, lon) <= -12 && m.sunAltitude(new Date(ev.t - 15 * 60000), lat, lon) > -12, fmt(ev.t));
  const hp = planFor('2026-09-24T10:00:00Z', -42.88, 147.33);
  const h = m.auroraTonight(hp, -42.88, 147.33, rows(from, 7), fmt);
  assert.ok(h && h.south && h.reach !== null, JSON.stringify(h));
});

test('the words, and the Console list', () => {
  const t = Date.UTC(2026, 8, 25, 6);
  const w = m.auroraWords({ reach: 'low', kp: 6.67, t, south: false }, fmt);
  assert.strictEqual(w.title, 'A chance of the northern lights tonight');
  assert.match(w.detail, /^Kp 7 on the 0-9 scale of geomagnetic activity is forecast around 06:00\. From here it would show low in the north/);
  assert.strictEqual(m.auroraWords({ reach: 'overhead', kp: 5, t, south: true }, fmt).title, 'The southern lights may be out tonight');
  assert.match(m.auroraWords({ reach: 'overhead', kp: 5, t, south: true }, fmt).detail, /Look south and up/);
  assert.match(m.auroraWords({ reach: 'camera', kp: 5, t, south: false }, fmt).detail, /phone camera/);
  // In the highlights: a storm overhead leads; a camera-only chance isn't listed.
  const lat = 42.36, lon = -71.06, plan = planFor('2026-09-24T20:00:00Z', lat, lon), from = '2026-09-24T00:00:00Z';
  const storm = m.tonightHighlights(plan, lat, lon, 5, fmt, null, rows(from, 8.33));
  assert.strictEqual(storm[0].kind, 'aurora');
  assert.strictEqual(storm[0].title, 'The northern lights may be out tonight');
  const faint = m.tonightHighlights(plan, lat, lon, 5, fmt, null, rows(from, 4));
  const i = faint.findIndex(h => h.kind === 'aurora');
  assert.strictEqual(i, -1, 'a camera-only chance is not offered');
  assert.ok(!m.tonightHighlights(plan, lat, lon, 5, fmt, null, rows(from, 1)).some(h => h.kind === 'aurora'));
  assert.ok(!m.tonightHighlights(plan, lat, lon, 5, fmt).some(h => h.kind === 'aurora'), 'no forecast, no item');
});

test('the forecast is allowed by the CSP and loaded by the Console', () => {
  const fs = require('fs'), path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  assert.match(/connect-src[^;"]*/.exec(html)[0], /https:\/\/services\.swpc\.noaa\.gov/);
  assert.match(html, /loadKp\(\)\.then/);
  assert.match(html, /issPasses\([^\n]*\n?[^\n]*kpRows\)/);
  const priv = fs.readFileSync(path.join(__dirname, '..', '..', 'privacy.html'), 'utf8');
  assert.match(priv, /Space Weather Prediction Center/);
});
