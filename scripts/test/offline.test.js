'use strict';
/*
 * Twilyte offline at a dark site, the main way stargazers use it (offline
 * review of v164, the iPhone app emulated with every request but its own
 * refused, in Utah at night). What it found, and what each test here holds:
 *
 *  - A forecast saved at home or at the trailhead was lost at the site: it
 *    was looked up only under the place to 0.01°, and a GPS fix 2 km away
 *    is another key. Now the nearest within 25 km stands in, said to be
 *    older and from how far away.
 *  - With no forecast at all, nothing said so: the week planner and the
 *    sunset colour just vanished. Now each says why, once it's known the
 *    fetch failed (not while the first is still loading).
 *  - A first launch with location refused or timed out called Boston "the
 *    sky over Boston right now" and saved it as the place; every way out
 *    needed the network. Now Boston is "(example)", isn't saved, a refusal
 *    and a timeout are told apart, and coordinates can be typed in.
 *  - With a saved place, a failed quiet try kept home's sky without a word.
 *    Now a line under the painting says so, with Try again.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'wxCacheUse', 'staleNote', 'wxSaved', 'nearestWx', 'netWhy', 'noWxWords',
  'nativeGeo', 'getPosition', 'locate', 'appShell', 'geoFailWords', 'geoMissWords',
  'parseCoord', 'coordsPlace', 'welcomeLine']);
const R = { createElement: (t, p, ...c) => ({ t, p, c: c.flat().filter(x => x != null && x !== false) }) };
const C = { ink: 'INK', inkDim: 'DIM', inkFaint: 'FAINT', brass: 'AMBER', line: 'LINE' };
const texts = n => n == null || n === false ? [] : typeof n === 'string' ? [n] : (n.c || []).flatMap(texts);

const NOW = Date.UTC(2026, 9, 20, 3);
const H = 3600000;
const entry = (hoursOld, tag = 'x') => ({ t: NOW - hoursOld * H, d: [{ hourly: { time: [] }, tag }] });
// Moab, and places around it: 0.01° of latitude is 1.11 km.
const SITE = { lat: 38.57, lon: -109.55 };

test('the nearest saved forecast within 25 km, this spot’s own included', () => {
  const at = (lat, lon) => `tw_wx_${lat.toFixed(2)}_${lon.toFixed(2)}`;
  // Fetched 2 km north (at the trailhead) 3 hours ago, 30 km away an hour ago.
  const two = [at(38.588, -109.55), entry(3, 'trailhead')], thirty = [at(38.84, -109.55), entry(1, 'town')];
  let r = m.nearestWx([thirty, two], NOW, SITE.lat, SITE.lon);
  assert.strictEqual(r.key, 'tw_wx_38.59_-109.55');
  assert.ok(Math.abs(r.km - 2.22) < 0.05, `2.2 km, not ${r.km}`);
  assert.strictEqual(r.c.d[0].tag, 'trailhead');
  // 30 km is too far: a different sky.
  assert.strictEqual(m.nearestWx([thirty], NOW, SITE.lat, SITE.lon), null);
  assert.ok(m.nearestWx([thirty], NOW, SITE.lat, SITE.lon, 31), 'the limit is a parameter');
  // Its own key wins when it's still good...
  const own = [at(SITE.lat, SITE.lon), entry(5, 'own')];
  r = m.nearestWx([two, own, thirty], NOW, SITE.lat, SITE.lon);
  assert.strictEqual(r.c.d[0].tag, 'own');
  assert.ok(r.km < 0.01);
  // ...and a day-old one is skipped for a nearby one that isn't.
  r = m.nearestWx([[at(SITE.lat, SITE.lon), entry(24.5, 'old')], two], NOW, SITE.lat, SITE.lon);
  assert.strictEqual(r.c.d[0].tag, 'trailhead');
  // Equal distances: the newer.
  const again = [two[0], entry(2, 'again')];
  assert.strictEqual(m.nearestWx([two, again], NOW, SITE.lat, SITE.lon).c.d[0].tag, 'again');
  assert.strictEqual(m.nearestWx([again, two], NOW, SITE.lat, SITE.lon).c.d[0].tag, 'again');
  // Junk, other keys, a clock that jumped: none of them.
  assert.strictEqual(m.nearestWx([
    ['tw_wx_junk', entry(1)], [at(38.58, -109.55), null], [at(38.58, -109.55), { t: 'x', d: {} }],
    [at(38.58, -109.55), entry(-2)], ['tw_loc', entry(1)], [null, entry(1)]
  ], NOW, SITE.lat, SITE.lon), null);
  assert.strictEqual(m.nearestWx(null, NOW, SITE.lat, SITE.lon), null);
  // Across the date line, by the short way round.
  assert.ok(m.nearestWx([['tw_wx_-17.00_-179.95', entry(2)]], NOW, -17, 179.95).km < 11);
});

test('the saved forecasts are read out of storage, junk and all', () => {
  const data = { 'tw_wx_38.59_-109.55': JSON.stringify(entry(3)), 'tw_wx_1.00_2.00': '{not json', tw_loc: '{}', 'tw_wx_38.84_-109.55': JSON.stringify(entry(1)) };
  const keys = Object.keys(data);
  const store = { length: keys.length, key: i => keys[i], getItem: k => data[k] };
  const all = m.wxSaved(store);
  assert.deepStrictEqual(all.map(e => e[0]), ['tw_wx_38.59_-109.55', 'tw_wx_1.00_2.00', 'tw_wx_38.84_-109.55']);
  assert.strictEqual(all[1][1], null, 'unreadable is null, not a throw');
  assert.strictEqual(m.nearestWx(all, NOW, SITE.lat, SITE.lon).key, 'tw_wx_38.59_-109.55');
});

test('a saved forecast says how old it is, and how far away from 1 km', () => {
  assert.strictEqual(m.staleNote(NOW - 3 * H, NOW), 'forecast from 3 hours ago');
  assert.strictEqual(m.staleNote(NOW - 3 * H, NOW, 0.7), 'forecast from 3 hours ago', 'its own key: within a kilometre');
  assert.strictEqual(m.staleNote(NOW - 3 * H, NOW, 12.4), 'forecast from 3 hours ago, for a place 12 km away');
  assert.strictEqual(m.staleNote(NOW - 30 * 60000, NOW, 2.2), 'forecast from under an hour ago, for a place 2 km away');
});

test('no forecast: offline or failed, said once in each place', () => {
  assert.strictEqual(m.netWhy(new TypeError('Load failed'), true), 'offline');
  assert.strictEqual(m.netWhy(new Error('HTTP 503'), false), 'offline', 'the device says it is offline');
  assert.strictEqual(m.netWhy(new Error('HTTP 503'), true), 'failed');
  assert.strictEqual(m.netWhy(new SyntaxError('JSON'), undefined), 'failed');
  assert.strictEqual(m.noWxWords('offline', 'twilight'), 'No cloud forecast without a connection, so no sunset or sunrise colour. The times above don’t need one.');
  assert.strictEqual(m.noWxWords('offline', 'week'), 'No cloud forecast without a connection. The darkness times above don’t need one.');
  assert.strictEqual(m.noWxWords('failed', 'twilight'), 'The cloud forecast couldn’t be fetched just now, so no sunset or sunrise colour. The times above don’t need it.');
  assert.strictEqual(m.noWxWords('failed', 'week'), 'The cloud forecast couldn’t be fetched just now. The darkness times above don’t need it.');
});

test('the week planner stays, and says why it has nothing, or how old its forecast is', () => {
  const week = new Function('React', 'C', 'proShown', 'scoreRating', 'SCORE_SHORT', `${declSource('weekPlannerEl')}; return weekPlannerEl;`)(
    R, C, () => null, s => s >= 78 ? 'Excellent' : 'Poor', { clear: 'clear' });
  const loc = { tz: 'America/Denver' };
  const none = m.noWxWords('offline', 'week');
  // Loading the first forecast: nothing yet, as before.
  assert.strictEqual(week([], loc, true, true, null, null), null);
  // Failed: the section, its heading, and why.
  const t = texts(week([], loc, true, true, null, none));
  assert.deepStrictEqual(t, ['The week ahead', none]);
  assert.strictEqual(week([], loc, true, false, null, none), null, 'Pro off: hidden as ever');
  // A saved forecast: its age, then the nights.
  const nights = [{ i: 0, mid: NOW + 6 * H, sum: { score: 80, bestMs: NOW, factor: 'clear' } }];
  const old = texts(week(nights, loc, true, true, 'forecast from 3 hours ago, for a place 12 km away', null));
  assert.deepStrictEqual(old.slice(0, 3), ['The week ahead', 'scores out of 100', 'Forecast from 3 hours ago, for a place 12 km away.']);
  assert.ok(old.includes('Tonight'));
  // A current one: no age line.
  assert.ok(!texts(week(nights, loc, true, true, null, null)).some(x => /Forecast from/.test(x)));
});

test('the twilight section says it where the sunset colour goes', () => {
  const TT = new Function('React', 'C', 'cdHMS', 'twilightWord', 'TWILIGHT_DOTS', `${declSource('TwilightToday')}; return TwilightToday;`)(
    R, C, () => '', () => '', {});
  const base = { next: null, now: 0, sched: { when: 'today', dawn: [], dusk: [] }, fmt: String, sunUp: true, onMore: () => {} };
  const words = m.noWxWords('offline', 'twilight');
  assert.ok(texts(TT({ ...base, glows: [], noWx: words })).includes(words));
  assert.ok(!texts(TT({ ...base, glows: [] })).includes(words));
  // Never beside a colour that is shown.
  const glows = [{ kind: 'sunset', label: 'Tonight’s sunset', level: 'some', title: 'Some colour possible', detail: 'x' }];
  assert.ok(!texts(TT({ ...base, glows, noWx: words })).includes(words));
});

test('the Console: the nearest saved forecast offline, and “none” only once a fetch has failed', () => {
  const rt = declSource('RealtimeTwilight');
  const fx = rt.slice(rt.indexOf('const key = `tw_wx_'), rt.indexOf('}, [loc.lat, loc.lon, hourKey]);'));
  // A new place is loading, not failed; a forecast in hand clears it.
  assert.match(fx, /if \(wxKey\.current !== key\) \{[^}]*setWxNone\(null\); \}/);
  assert.match(fx, /=== 'fresh'\) \{ setWx\(wxOf\(cached\.d\)\); setWxStale\(null\); setWxNone\(null\); return; \}/);
  assert.match(fx, /setWx\(wxOf\(d\)\);\s*setWxStale\(null\);\s*setWxNone\(null\);/);
  // The fallback is the nearest saved one, not this key's alone; then why.
  const fail = fx.slice(fx.indexOf('.catch(err =>'));
  assert.match(fail, /near = nearestWx\(wxSaved\(localStorage\), Date\.now\(\), loc\.lat, loc\.lon\)/);
  assert.match(fail, /if \(near\) \{ setWx\(wxOf\(near\.c\.d\)\); setWxStale\(\{ t: near\.c\.t, km: near\.km \}\); setWxNone\(null\); \}/);
  assert.match(fail, /else \{ setWx\(null\); setWxStale\(null\); setWxNone\(netWhy\(err, navigator\.onLine\)\); \}/);
  assert.ok(!/wxCacheUse\(cached/.test(fail), 'not the exact key only');
  // Both places say it.
  assert.match(rt, /noWx: wxNone \? noWxWords\(wxNone, 'twilight'\) : null/);
  assert.match(rt, /weekPlannerEl\(wxWeek, loc, h24, pro, wxNote, wxNone \? noWxWords\(wxNone, 'week'\) : null\)/);
});

test('a refusal and no fix are told apart, and say where to turn location on', () => {
  assert.strictEqual(m.geoFailWords({ code: 1 }, 'ios'), 'Location is off for Twilyte. Search for your town, or turn it on in Settings > Privacy & Security > Location Services.');
  assert.strictEqual(m.geoFailWords({ code: 1 }, 'web'), 'Location is off for Twilyte. Search for your town, or turn it on in your browser’s settings.');
  assert.strictEqual(m.geoFailWords({ code: 1 }, 'android'), 'Location is off for Twilyte. Search for your town, or turn it on in your phone’s settings.');
  for (const code of [2, 3]) assert.strictEqual(m.geoFailWords({ code }, 'ios'), 'Couldn’t find your position. Try again outside, or search for your town.');
  assert.strictEqual(m.geoFailWords(undefined, 'ios'), 'Couldn’t find your position. Try again outside, or search for your town.');
  // The Stars tab sends people to the Console instead.
  const other = 'choose your place on the Console';
  assert.strictEqual(m.geoFailWords({ code: 1 }, 'ios', other), 'Location is off for Twilyte. Choose your place on the Console, or turn it on in Settings > Privacy & Security > Location Services.');
  assert.strictEqual(m.geoFailWords({ code: 3 }, 'web', other), 'Couldn’t find your position. Try again outside, or choose your place on the Console.');
  // Which shell: the apps' Capacitor, else the website.
  const saved = global.window;
  try {
    global.window = { Capacitor: { getPlatform: () => 'ios', Plugins: {} } };
    assert.strictEqual(m.appShell(), 'ios');
    global.window = { Capacitor: { getPlatform: () => 'android' } };
    assert.strictEqual(m.appShell(), 'android');
    global.window = {};
    assert.strictEqual(m.appShell(), 'web');
  } finally { global.window = saved; }
  const rt = declSource('RealtimeTwilight'), sf = declSource('StarFinder');
  assert.match(rt, /setGeoMsg\(geoFailWords\(err, appShell\(\)\)\);/);
  assert.match(sf, /e => setGeoMsg\(geoFailWords\(e, appShell\(\), "choose your place on the Console"\)\)/);
  assert.ok(!/Couldn't get precise location|Couldn't get your location/.test(rt + sf), 'the old words are gone');
});

test('the try on opening asks again with the GPS when the first finds nothing; a tap asks for it at once', () => {
  const run = (answers, precise) => {
    const asked = [], out = [];
    const saved = global.window, savedN = Object.getOwnPropertyDescriptor(global, 'navigator');
    global.window = {};
    Object.defineProperty(global, 'navigator', { configurable: true, writable: true, value: { geolocation: { getCurrentPosition: (ok, fail, o) => {
      asked.push(o);
      const a = answers[asked.length - 1];
      return a === 'ok' ? ok({ coords: { latitude: 1, longitude: 2 } }) : fail({ code: a });
    } } } });
    try { m.locate(p => out.push('ok'), e => out.push(e.code), precise); } finally {
      global.window = saved;
      if (savedN) Object.defineProperty(global, 'navigator', savedN); else delete global.navigator;
    }
    return { asked, out };
  };
  // Timed out at low accuracy, found by the GPS.
  let r = run([3, 'ok']);
  assert.deepStrictEqual(r.out, ['ok']);
  assert.deepStrictEqual(r.asked.map(o => o.enableHighAccuracy), [false, true]);
  assert.ok(r.asked[1].timeout >= 30000, 'time for a fix with no network to help');
  // Unavailable both times: one failure, the second's.
  r = run([2, 3]);
  assert.deepStrictEqual(r.out, [3]);
  assert.strictEqual(r.asked.length, 2);
  // A refusal isn't asked twice.
  r = run([1]);
  assert.deepStrictEqual(r.out, [1]);
  assert.strictEqual(r.asked.length, 1);
  // Found straight away: once.
  assert.strictEqual(run(['ok']).asked.length, 1);
  // A tap: the GPS, once.
  r = run([3], true);
  assert.deepStrictEqual(r.asked.map(o => o.enableHighAccuracy), [true]);
  assert.deepStrictEqual(r.out, [3]);
  // The Console's try on opening is the two-step one, its tap the GPS.
  const rt = declSource('RealtimeTwilight');
  assert.match(rt, /\}, auto !== true\);\s*\};/);
  assert.match(rt, /if \(start !== 'url'\) useMyLocation\(start === 'saved', true\);/);
});

test('coordinates typed in: commas, degrees and N/S/E/W, checked', () => {
  const lat = s => m.parseCoord(s, 'lat'), lon = s => m.parseCoord(s, 'lon');
  assert.strictEqual(lat('38.57'), 38.57);
  assert.strictEqual(lat(' 38,57 '), 38.57);
  assert.strictEqual(lat('38.57 N'), 38.57);
  assert.strictEqual(lat('n38.57'), 38.57);
  assert.strictEqual(lat('38.57°S'), -38.57);
  assert.strictEqual(lat('-38.57'), -38.57);
  assert.strictEqual(lat('−38.57'), -38.57, 'a true minus sign');
  assert.strictEqual(lat('90'), 90);
  assert.strictEqual(lon('109.55 W'), -109.55);
  assert.strictEqual(lon('-109,55'), -109.55);
  assert.strictEqual(lon('E 151.2'), 151.2);
  assert.strictEqual(lon('180'), 180);
  for (const bad of ['', '  ', 'abc', '91', '-90.5', '38.57 E', 'N 38 S', '-38 S', '38..5', '1,2,3', null, undefined]) {
    assert.ok(Number.isNaN(lat(bad)), `latitude ${JSON.stringify(bad)}`);
  }
  for (const bad of ['181', '-180.01', '109 N', '12 34']) assert.ok(Number.isNaN(lon(bad)), `longitude ${bad}`);
  // The place they make, named by its coordinates, in the device's zone.
  const ok = m.coordsPlace('38,57', '109.55 W');
  assert.deepStrictEqual(ok.place, { name: '38.57°, -109.55°', lat: 38.57, lon: -109.55, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
  assert.deepStrictEqual(m.coordsPlace('95', '10'), { msg: 'Latitude is a number from -90 to 90, like 38.57 or 38.57 N.' });
  assert.deepStrictEqual(m.coordsPlace('38', ''), { msg: 'Longitude is a number from -180 to 180, like -109.55 or 109.55 W.' });
  // On the Console's place panel: two named fields and a button; a
  // place set this way goes through pickPlace like a search result.
  const rt = declSource('RealtimeTwilight');
  assert.match(rt, /\[\["Latitude", coordLat, setCoordLat\], \["Longitude", coordLon, setCoordLon\]\]/);
  assert.match(rt, /placeholder: label, "aria-label": label/);
  assert.match(rt, /coordMsg \|\| "Like 38\.57 and -109\.55\. Times are in this device’s time zone\."/);
  assert.match(rt, /React\.createElement\("button", \{ className: "rtbtn solid", onClick: useCoords \}, "Use these"\)/);
  assert.match(rt, /const r = coordsPlace\(coordLat, coordLon\);\s*if \(!r\.place\) \{ setCoordMsg\(r\.msg\); return; \}[\s\S]*?pickPlace\(r\.place\);/);
  // Search offline points to them.
  assert.match(rt, /netWhy\(e, navigator\.onLine\) === 'offline'\s*\? "Search needs a connection\. Enter latitude and longitude below instead\."/);
});

test('Boston standing in is called an example, isn’t saved, and the welcome asks for a place', () => {
  assert.strictEqual(m.welcomeLine({ name: 'Boston' }, false, true), 'Twilyte needs your place to show your sky.');
  assert.strictEqual(m.welcomeLine({ name: 'Boston' }, false, false), 'This is the sky over Boston right now.');
  const rt = declSource('RealtimeTwilight');
  // Only the fallback itself, by identity: a place chosen, found or saved
  // is a new object, even a chosen Boston.
  assert.match(rt, /return savedPlace\(\) \|\| PRESETS\[0\];/);
  assert.match(rt, /const standIn = loc === PRESETS\[0\];/);
  assert.match(rt, /\}, loc\.name, standIn \? " \(example\)" : null,/);
  assert.match(rt, /if \(loc === PRESETS\[0\]\) return;\s*try \{ localStorage\.setItem\('tw_loc'/);
  assert.match(rt, /intro, locating: geoMsg === "Locating\\u2026", standIn,/);
  // The hero hands the welcome its words and, once the try is over, the
  // stand-in's name: "Choose your place" leads, the example sky follows.
  const hero = declSource('HorizonHero');
  assert.match(hero, /line: welcomeLine\(loc, locating, standIn\), onDone: onIntroDone,\s*standIn: standIn && !locating \? loc\.name\.split\(','\)\[0\] : null,/);
  const ws = declSource('WelcomeSky');
  assert.match(ws, /ref: btnRef, onClick: \(\) => close\(!!standIn\),/);
  assert.match(ws, /standIn \? 'Choose your place' : 'Show me tonight'/);
  assert.match(ws, /onClick: \(\) => close\(!standIn\),/);
  assert.match(ws, /standIn \? `See \$\{standIn\}\\u2019s sky for now` : 'Not here\? Choose your place'/);
});

test('a failed quiet try with a saved place says so under the painting, with Try again', () => {
  assert.strictEqual(m.geoMissWords({ name: 'Home' }), 'Couldn’t update your location. Showing Home.');
  assert.strictEqual(m.geoMissWords({ name: 'Moab, Utah, United States' }), 'Couldn’t update your location. Showing Moab, Utah, United States.');
  assert.strictEqual(m.geoMissWords({ name: 'Your location' }), 'Couldn’t update your location. Showing your last location.');
  const rt = declSource('RealtimeTwilight');
  // Set for no fix, never for a refusal; cleared by any explicit try.
  assert.match(rt, /if \(quiet\) \{ if \(!\(err && err\.code === 1\)\) setGeoMiss\(loc\); return; \}/);
  assert.match(rt, /if \(!quiet\) setGeoMiss\(null\);/);
  // Shown only while the place is still that one (any new place is a new
  // object), under the painting where the picker's panel goes, and the
  // panel takes its place while open.
  assert.match(rt, /const geoNote = geoMiss && geoMiss === loc && React\.createElement\("div", \{\s*role: "status",/);
  assert.match(rt, /React\.createElement\("span", null, geoMissWords\(loc\)\),\s*React\.createElement\("button", \{ className: "rtbtn", onClick: \(\) => useMyLocation\(\) \}, "Try again"\)\)/);
  assert.match(rt, /panel: placePanel \|\| geoNote,/);
});
