'use strict';
/*
 * Faults found by a review of the whole app for what its users would meet
 * (2026-10-10), each pinned here by what it got wrong. Where a fault was in
 * pure code the test runs that code; where it was wiring inside a component
 * the test reads the source, as the other suites here do.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extract, declSource } = require('./extract.js');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'asin', 'acos', 'atan2', 'rev', 'jd', 'gmst', 'sunAltitude', 'sunRaDec', 'sunHcZn',
  'MOON_LR', 'MOON_B', 'moonEcliptic', 'moonState', 'moonTopo', 'moonAltSeen', 'moonElong', 'MOON_PHASE_NAMES', 'moonPhases', 'moonSD', 'moonHP',
  'sunState', 'sunSDdeg', 'sunHPdeg', 'angSep', 'lunarShadow', 'bisectTime', 'minTime', 'lunarEclipse', 'eclipseWords', 'planetGeo', 'planetAltAz',
  'starHcZn', 'scanCrossings', 'SUN_THR', 'MOON_THR', 'nightSpan', 'HZ_AFTER', 'nightPlan', 'heroLabel', 'limitingMag', 'BORTLE', 'skyLimit',
  'METEOR_SHOWERS', 'SPORADIC_HR', 'showerActivity', 'meteorRate', 'milkyWayVisibility', 'COMPASS16', 'compass16', 'HIGHLIGHT_STARS', 'sepAltAz',
  'HIGHLIGHT_DSO', 'tonightHighlights', 'auroraTonight', 'auroraWords', 'MOON_FEATURES', 'moonLibration', 'moonSunAlt', 'terminatorFeatures',
  'tonightGlance', 'twilightDayEvents', 'twilightDay', 'TWILIGHT_WORDS', 'twilightWord', 'tzOffset', 'localMidnight', 'sextantWindows',
  'RAD', 'rad', 'deg', 'solarParams', 'eventUTC', 'sunEvent', 'ALT', 'computeDay', 'photoWindows', 'localComputeDay', 'photoWindowsFor',
  'daysInMonth', 'zoneOffsets', 'moonMonth', 'solveFix', 'knownTz', 'geocodePlaces']);

test('the automatic Bortle class stays automatic after the first launch', () => {
  // The estimate stores its class; a stored class with no stored mode was
  // read as one chosen by hand, so every later place kept the first one's.
  const store = mem => new Function('localStorage', 'rcPlugin', declSource('prefStore') + '\nreturn prefStore;')({
    getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }
  }, () => null);
  const mem = {};
  const first = store(mem);
  assert.strictEqual(first.getBortleMode(), 'auto');
  first.setBortle(6); // what the automatic estimate does
  assert.deepStrictEqual(mem, { tw_bortle: '6' });
  const second = store(mem);
  assert.strictEqual(second.getBortleMode(), 'auto', 'the second launch');
  assert.strictEqual(second.getBortle(), 6, 'and shows the last class until the new one is in');
  // Chosen by hand, it stays chosen.
  second.setBortleMode('manual');
  assert.strictEqual(store(mem).getBortleMode(), 'manual');
});

test('a time zone this device doesn’t know can’t crash the app', () => {
  assert.strictEqual(m.knownTz('Europe/Paris'), 'Europe/Paris');
  for (const bad of ['Europe/NotAZone', '', null, undefined, 42]) assert.strictEqual(m.knownTz(bad), DEVICE_TZ, String(bad));
  const saved = mem => new Function('localStorage', 'knownTz', declSource('savedPlace') + '\nreturn savedPlace;')({ getItem: () => mem }, m.knownTz)();
  assert.deepStrictEqual(saved(JSON.stringify({ name: 'Kyiv', lat: 50.45, lon: 30.52, tz: 'Europe/NotAZone' })), { name: 'Kyiv', lat: 50.45, lon: 30.52, tz: DEVICE_TZ });
  for (const junk of [null, 'not json', '[]', '{"lat":"x","lon":1}', '{"lat":95,"lon":0}']) assert.strictEqual(saved(junk), null, junk);
  assert.strictEqual(saved('{"lat":1,"lon":2}').name, '1.00°, 2.00°');
  // Every tab reads the saved place through it.
  for (const c of ['RealtimeTwilight', 'TwilightEphemeris', 'StarFinder']) assert.match(declSource(c), /return savedPlace\(\) \|\| PRESETS\[0\];/, c);
});

test('the place search hands on only zones the device knows', async () => {
  const res = { ok: true, json: async () => ({ results: [{ name: 'Kyiv', country_code: 'UA', latitude: 50.45, longitude: 30.52, timezone: 'Europe/NotAZone' }] }) };
  const [p] = await m.geocodePlaces('Kyiv', async () => res);
  assert.strictEqual(p.tz, DEVICE_TZ);
});

test('twilight words: golden and blue hour as the Ephemeris has them, and dawn is not dusk', () => {
  const sky = (alt, rising) => ({ phase: alt > -0.833 ? 'day' : 'civil', alt, rising, m: { alt: -10, illum: 0 } });
  assert.strictEqual(m.tonightGlance(sky(-2, false)).head, 'Golden hour');
  assert.strictEqual(m.tonightGlance(sky(-5, false)).head, 'Blue hour');
  assert.strictEqual(m.tonightGlance(sky(3, false)).head, 'Golden hour', 'the Sun 3° up');
  assert.strictEqual(m.tonightGlance(sky(20, false)).head, 'Daylight');
  assert.match(m.tonightGlance(sky(-3, false)).sub, /coming out/);
  assert.match(m.tonightGlance(sky(-3, true)).sub, /fading/, 'at dawn the stars go');
  assert.doesNotMatch(m.tonightGlance(sky(-3, true)).sub, /emerging|coming out/);
});

test('the midnight sun just under the horizon is not "stays down all day"', () => {
  assert.strictEqual(m.heroLabel(null, 0, -0.4, String), 'The Sun stays up all night');
  assert.strictEqual(m.heroLabel(null, 0, -3, String), 'The Sun stays down all day');
});

const TROMSO = [69.65, 18.96];
test('a night over 20 hours long is still this night, not tomorrow’s', () => {
  // Tromsø, late November: half an hour before the brief sunrise.
  const day = Date.UTC(2026, 10, 25);
  const rise = m.scanCrossings(day, day + 86400000, ...TROMSO, m.sunAltitude, m.SUN_THR, 2).find(e => e.key === 'rise' && e.dir === 'up');
  assert.ok(rise, 'the Sun rises that day');
  const now = rise.t - 30 * 60000;
  const span = back => m.nightSpan(m.scanCrossings(now - back * 3600000, now + 30 * 3600000, ...TROMSO, m.sunAltitude, m.SUN_THR, 2), now);
  assert.ok(span(20).start > now, 'the old 20-hour look-back found tomorrow’s night');
  assert.ok(span(26).start < now && span(26).end > now, 'now inside the night');
  assert.match(declSource('HorizonHero'), /scanCrossings\(now - 26 \* 3600000, now \+ 30 \* 3600000,/);
});

test('polar night has things worth a look, in the next 24 hours', () => {
  // Tromsø on the Geminids' peak, 13 December 2026, in polar night: no
  // sunset, so no night span, and the list used to be empty.
  const now = Date.UTC(2026, 11, 13, 15);
  assert.strictEqual(m.nightSpan(m.scanCrossings(now - 26 * 3600000, now + 30 * 3600000, ...TROMSO, m.sunAltitude, m.SUN_THR, 2), now), null);
  const items = m.tonightHighlights({ start: now, end: now + 24 * 3600000 }, ...TROMSO, 3, t => new Date(t).toISOString().slice(11, 16));
  assert.ok(items.some(i => /Geminid/.test(i.title)), JSON.stringify(items.map(i => i.title)));
  const hero = declSource('HorizonHero');
  assert.match(hero, /const hlSpan = plan \|\| \{ start: tenMin \* 600000, end: tenMin \* 600000 \+ 24 \* 3600000 \};/);
  assert.match(hero, /prefStore\.getH24\(\)\]\);/, 'and the times follow the 12/24-hour setting at once');
  assert.match(declSource('NightFacts'), /sunDown \? \{ v: '—', c: 'The Sun doesn’t rise today' \}/);
});

test('a total eclipse of the Moon seen only in part says so', () => {
  const full = m.moonPhases(Date.UTC(2028, 11, 30), Date.UTC(2029, 0, 2), [180])[0].t;
  const e = m.lunarEclipse(full);
  assert.strictEqual(e.kind, 'total');
  const fmt = t => new Date(t).toISOString().slice(11, 16);
  const casablanca = m.eclipseWords(e, 33.57, -7.59, fmt);
  assert.ok(casablanca.partial);
  assert.match(casablanca.line, /^The Moon rises at about \d\d:\d\d with the Earth’s shadow still across it, after totality/);
  assert.match(m.eclipseWords(e, 42.36, -71.06, fmt).line, /^Not seen from here/, 'Boston: down the whole time');
  assert.match(m.eclipseWords(e, 35.68, 139.69, fmt).line, /^Totality from/, 'Tokyo: all of it');
});

test('the dusk column is tonight’s, after-midnight stages included', () => {
  // Vigo on 21 June: astronomical dusk is at about 00:28 on the 22nd.
  const tz = 'Europe/Madrid', mid = m.localMidnight(tz, Date.UTC(2026, 5, 21, 12));
  const ev = m.twilightDayEvents(mid, 42.24, -8.72);
  const day = m.twilightDay(ev, mid);
  assert.deepStrictEqual(day.dusk.map(r => r.key), ['rise', 'civil', 'naut', 'astro']);
  assert.ok(day.dusk[3].t > mid + 24 * 3600000, 'astronomical dusk after midnight, tonight’s');
  assert.deepStrictEqual(day.dawn.map(r => r.key), ['astro', 'naut', 'civil', 'rise']);
  assert.ok(day.dawn.every(r => r.t > mid && r.t < mid + 12 * 3600000), 'this morning’s dawn');
  // Fairbanks, 20 April: nautical dusk after midnight belongs to tonight.
  const fb = m.twilightDay(m.twilightDayEvents(m.localMidnight('America/Anchorage', Date.UTC(2026, 3, 20, 20)), 64.84, -147.72), 0);
  assert.strictEqual(fb.dusk[0].key, 'rise', 'sunset first');
  assert.deepStrictEqual(fb.dusk.map(r => r.key), ['rise', 'civil', 'naut']);
});

test('the week planner has seven different nights across a DST change', () => {
  const run = (tz, now) => new Function('localMidnight', 'scoreHours', 'summarize', declSource('weekOutlook') + '\nreturn weekOutlook;')(
    m.localMidnight, () => [], () => ({}))({ hourly: { time: [] } }, { tz, lat: 40.7, lon: -74 }, 3, now);
  const days = nights => nights.map(n => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(n.mid)));
  // Wednesday 28 October 2026, 00:30: the clocks go back on Sunday 1 November.
  const autumn = days(run('America/New_York', Date.parse('2026-10-28T04:30:00Z')));
  assert.deepStrictEqual(autumn, ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
  // Saturday 7 March 2026, 23:30: tonight is the night into Sunday the 8th.
  assert.strictEqual(days(run('America/New_York', Date.parse('2026-03-08T04:30:00Z')))[0], '2026-03-08');
});

test('west of the date line the Ephemeris shows the day asked for', () => {
  // Apia, Samoa (UTC+13): computeDay works on the UTC date, whose times were
  // the next local day's, each marked "+1d".
  const off = 13 * 60, c = m.localComputeDay(-13.83, -171.76, 2026, 10, 10, off);
  const local = e => e.utc + off;
  assert.ok(c.shift === -1440);
  assert.ok(local(c.sunrise) > 5 * 60 && local(c.sunrise) < 7 * 60, `sunrise at ${local(c.sunrise)} min`);
  assert.ok(local(c.sunset) > 17 * 60 && local(c.sunset) < 19 * 60, `sunset at ${local(c.sunset)} min`);
  const raw = m.computeDay(-13.83, -171.76, 2026, 10, 10);
  assert.ok(raw.sunrise.utc + off >= 1440, 'computeDay alone gives the next day');
  // Photographers' windows follow, and an ordinary place is untouched.
  const w = m.photoWindowsFor(-13.83, -171.76, c);
  assert.ok(w.eveningGolden[0] + off < 1440 && w.eveningGolden[0] + off > 16 * 60);
  const boston = m.localComputeDay(42.36, -71.06, 2026, 10, 10, -240);
  assert.strictEqual(boston.shift, 0);
  assert.deepStrictEqual(boston.sunrise, m.computeDay(42.36, -71.06, 2026, 10, 10).sunrise);
});

test('the Moon calendar takes the offset of the day a phase lands on', () => {
  // Auckland: DST began at 02:00 on 27 September 2026; that morning's full
  // Moon is 05:50 NZDT, and read 04:50 on the UTC day's offset.
  const offOf = d => m.zoneOffsets('Pacific/Auckland', 2026, 9, d).off;
  const day = m.moonMonth(2026, 9, offOf).find(d => d.phase && d.phase.t > Date.UTC(2026, 8, 26));
  assert.strictEqual(day.day, 27);
  const local = new Date(day.phase.t + day.phase.off * 60000);
  assert.strictEqual(local.getUTCHours(), 5, local.toISOString());
});

test('a summer night that never gets 12° dark is one sextant window', () => {
  // Copenhagen, 21 June: the horizon never goes, and nothing was offered.
  const now = Date.UTC(2026, 5, 21, 12);
  const wins = m.sextantWindows(now, 55.68, 12.57);
  const night = wins.find(w => w.kind === 'All night');
  assert.ok(night, JSON.stringify(wins));
  assert.ok((night.e - night.s) / 3600000 > 3 && (night.e - night.s) / 3600000 < 6);
  for (const w of wins) assert.ok(w.e - w.s < 8 * 3600000, 'no window spans a day');
  // Boston keeps its evening and morning windows.
  const kinds = m.sextantWindows(now, 42.36, -71.06).map(w => w.kind);
  assert.ok(kinds.includes('Evening') && kinds.includes('Morning') && !kinds.includes('All night'));
});

test('a fix across the date line stays between -180° and 180°', () => {
  const fix = m.solveFix(10, 179.9, [{ zn: 90, nm: 20 }, { zn: 0, nm: 0 }]);
  assert.ok(fix.lon < -179 && fix.lon > -180, String(fix.lon));
  const back = m.solveFix(10, -179.9, [{ zn: 270, nm: 20 }, { zn: 0, nm: 0 }]);
  assert.ok(back.lon > 179 && back.lon < 180, String(back.lon));
});

test('the Console: forecasts and location fixes can’t land on the wrong place', () => {
  const rt = declSource('RealtimeTwilight');
  // Every run of the forecast effect takes a new number, the cached one too.
  const fx = rt.slice(rt.indexOf('const key = `tw_wx_'));
  assert.ok(fx.indexOf('const seq = ++wxSeq.current;') < fx.indexOf("=== 'fresh'"), 'before the cache can return');
  assert.match(fx, /if \(wxKey\.current !== key\) \{ wxKey\.current = key; setWx\(null\); setWxStale\(null\); \}/);
  // A fix that comes back after a pick is dropped.
  assert.equal((rt.match(/if \(seq !== geoSeq\.current\) return;/g) || []).length, 2);
  assert.match(rt, /const pickPlace = p => \{\s*dropFix\(\);/);
  assert.match(rt, /onClick: \(\) => \{ dropFix\(\); setLoc\(s\); setPickerOpen\(false\); \}/);
  assert.match(rt, /if \(open && geoAuto\.current\) \{ dropFix\(\); setGeoMsg\(""\); \}/);
});

test('the Ephemeris: seasons by hemisphere, craters only with the Moon up, a minus sign', () => {
  const eph = declSource('TwilightEphemeris');
  assert.match(eph, /\{ month: 5, day: 21, s: south \? "winter" : "summer" \}/);
  assert.match(eph, /\}, \[latN < 0\]\);/, 'and the list follows the hemisphere');
  assert.match(eph, /const moonFeats = moonLib && moonUp9 \? terminatorFeatures\(moonLib, 2\) : \[\];/);
  assert.match(eph, /onChange: e => \{ goManual\(\); setOffset\(e\.target\.value\); \}/);
  assert.match(eph, /type: "button", role: "switch", "aria-checked": !!dstShown, "aria-label": "Daylight saving, one hour"/);
  assert.match(eph, /fmtLocal\(Math\.round\(hover\.mLocal\) - offMin, offMin\)/, 'the readout as the rest of the page writes times');
  assert.match(eph, /c\.civilDusk\.utc\), utcDate\(Y, Mo, day, c\.nautDusk\.utc\), "\\u2693 Evening nautical twilight"/);
});

test('Sky View lets go of the sensors and the screen when it closes', () => {
  const sf = declSource('StarFinder');
  assert.match(sf, /if \(!\(nav && nav\.open && aimTargetName\)\) \{ setAimSensor\('idle'\); setOrient\(null\); \}/);
  assert.match(sf, /if \(\(!\(aimTargetName && aimSensor === 'granted'\) && !skyOpen\) \|\| !navigator\.wakeLock\) return;/);
  assert.match(sf, /const fixStars = useMemo\(\(\) => \{/);
  assert.match(sf, /const alignOk = !!aimNow && \(aimNow\.stable \|\| aimNow\.alt < 0\);/);
  assert.match(sf, /bodies: skyShown,/, 'a sunk target still reaches Sky View');
});

test('the app shell: status bar, red light, switches, pages and footer', () => {
  const cfg = JSON.parse(read('native/capacitor.config.json'));
  assert.strictEqual(cfg.plugins.SystemBars.style, 'DARK', 'light clock on the dark header, in Light Mode too');
  const app = declSource('TwilightApp');
  assert.match(app, /\[role="dialog"\]\[aria-label="Sky View"\]/, 'red light reaches Sky View');
  const switches = app.match(/React\.createElement\("button", \{\s*type: "button", onClick: [^\n]*\n\s*role: "switch", "aria-checked": [^,]+, "aria-label": "[^"]+"/g) || [];
  assert.strictEqual(switches.length, 3, 'named buttons');
  assert.doesNotMatch(app, /React\.createElement\("span", \{\s*onClick: [^\n]*\n\s*role: "switch"/);
  assert.match(app, /window\.Capacitor \? "https:\/\/twilyte\.info\/constellations\.LICENSE\.txt" : "constellations\.LICENSE\.txt"/);
  assert.match(app, /window\.Capacitor \? "\) · No tracking\. " :/);
  for (const p of ['privacy.html', 'support.html']) {
    const h = read(p);
    assert.match(h, /<main>\n  <a class="kicker" href="\/">&larr; Twilyte<\/a>/, p + ': the way back at the top');
    assert.match(h, /padding-top:max\(clamp\(28px,6vw,64px\),calc\(env\(safe-area-inset-top\) \+ 16px\)\)/, p);
  }
});
