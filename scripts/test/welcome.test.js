'use strict';
/*
 * The first-run welcome. Its words are the first thing Twilyte says to
 * anyone, and its one rule is that it appears once: the checks here are the
 * line itself, and the source-level wiring that makes "once" true (the flag
 * written on the way out, a deep link skipping it, the store screenshots
 * skipping it) and keeps it above the bottom tab bar.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extract, declSource } = require('./extract.js');

const { welcomeLine } = extract(['welcomeLine']);

test('the line names the place, or "you", or says it is still looking', () => {
  assert.strictEqual(welcomeLine({ name: 'Stowe, VT' }, false), 'This is the sky over Stowe right now.');
  assert.strictEqual(welcomeLine({ name: 'Your location' }, false), 'This is the sky over you right now.');
  assert.strictEqual(welcomeLine({ name: 'Boston' }, true), 'Finding your sky…');
  assert.strictEqual(welcomeLine(null, false), 'This is the sky over you right now.');
  // Boston standing in (no fix, nothing saved) is never called theirs.
  assert.strictEqual(welcomeLine({ name: 'Boston' }, false, true), 'Twilyte needs your place to show your sky.');
  assert.strictEqual(welcomeLine({ name: 'Boston' }, true, true), 'Finding your sky…');
});

test('shown once: the flag is written on the way out, and a deep link skips it', () => {
  const rt = declSource('RealtimeTwilight');
  assert.match(rt, /!localStorage\.getItem\('tw_welcomed'\) && !new URLSearchParams\(window\.location\.search\)\.get\('tab'\)/);
  assert.match(rt, /localStorage\.setItem\('tw_welcomed', '1'\)/);
  assert.match(rt, /if \(pick\) \{ if \(geoAuto\.current\) \{ dropFix\(\); setGeoMsg\(""\); \} setPickerOpen\(true\); \}/, '"Not here?" opens the place picker, and drops the try for a fix');
});

test('above everything, the tab bar included', () => {
  // The tab content's fade-in makes its own stacking context; only a portal
  // to <body> gets out of it.
  assert.match(declSource('WelcomeSky'), /ReactDOM\.createPortal\([\s\S]*document\.body\)/);
});

test('the store screenshots skip it', () => {
  for (const f of ['generate.js', 'generate-android.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'store-assets', f), 'utf8');
    assert.match(src, /localStorage\.setItem\('tw_welcomed', '1'\)/, f);
  }
});

test('a saved place is kept quietly when the device’s location can’t be had', () => {
  const src = declSource('RealtimeTwilight');
  const a = src.indexOf('const geoSeq = useRef(0)'), b = src.indexOf('\n  };', src.indexOf('const useMyLocation = (quiet, auto) =>')) + 4;
  const body = src.slice(a, b);
  // The shipped canLocate/getPosition/locate, on the website (no
  // Capacitor), with a stand-in for the browser's geolocation.
  const { canLocate, locate, appShell, geoFailWords } = extract(['nativeGeo', 'canLocate', 'getPosition', 'locate', 'appShell', 'geoFailWords']);
  const run = (quiet, outcome, hasGeo = true) => {
    const log = { msg: [], picker: [], loc: [], miss: [] };
    const nav = { geolocation: hasGeo ? { getCurrentPosition: (ok, fail) => outcome === 'ok' ? ok({ coords: { latitude: 1, longitude: 2 } }) : fail({ code: outcome === 'refused' ? 1 : 3 }) } : undefined };
    const savedW = global.window, savedN = Object.getOwnPropertyDescriptor(global, 'navigator');
    global.window = {};
    Object.defineProperty(global, 'navigator', { value: nav, configurable: true, writable: true });
    try {
      new Function('canLocate', 'locate', 'appShell', 'geoFailWords', 'setGeoMsg', 'setPickerOpen', 'setLoc', 'setGeoMiss', 'loc', 'Intl', 'useRef', body + '\nuseMyLocation(arguments[11]);')(
        canLocate, locate, appShell, geoFailWords, m => log.msg.push(m), v => log.picker.push(v), l => log.loc.push(l), v => log.miss.push(v), { name: 'Home' }, Intl, v => ({ current: v }), quiet);
    } finally {
      global.window = savedW;
      if (savedN) Object.defineProperty(global, 'navigator', savedN); else delete global.navigator;
    }
    return log;
  };
  // Opened with a saved place: nothing said in the header, the picker
  // stays shut. A refusal is the person's choice and says nothing at all;
  // no fix leaves the note under the painting (offline.test.js).
  assert.deepStrictEqual(run(true, 'refused'), { msg: [], picker: [], loc: [], miss: [] });
  assert.deepStrictEqual(run(true, 'fail'), { msg: [], picker: [], loc: [], miss: [{ name: 'Home' }] });
  assert.deepStrictEqual(run(true, 'fail', false), { msg: [], picker: [], loc: [], miss: [] });
  // A fix still replaces it.
  assert.strictEqual(run(true, 'ok').loc[0].name, 'Your location');
  // A tap (the click event is truthy, not true) and a first visit say so.
  const tap = run({ type: 'click' }, 'fail');
  assert.deepStrictEqual(tap.msg, ['Locating…', 'Couldn’t find your position. Try again outside, or search for your town.']);
  assert.deepStrictEqual(tap.picker, [true]);
  assert.deepStrictEqual(run(undefined, 'fail').picker, [true]);
  assert.deepStrictEqual(run(undefined, 'refused').msg, ['Locating…', 'Location is off for Twilyte. Search for your town, or turn it on in your browser’s settings.']);
  // Where the place came from is read before tw_loc is written, and a
  // shared link's place is not replaced.
  assert.match(src, /const \[start\] = useState\(startPlace\);[\s\S]*React\.useEffect\(\(\) => \{[^}]*if \(loc === PRESETS\[0\]\) return;\s*try \{ localStorage\.setItem\('tw_loc'/);
  assert.match(src, /if \(start !== 'url'\) useMyLocation\(start === 'saved', true\);/);
});
