'use strict';
/*
 * The Android app (native/android), before its first Play release
 * (2026-11-04). Its web view drops downloads and has no navigator.share,
 * exactly as the iPhone app's did before v162, so every "Add to calendar",
 * both month exports and "Share tonight's sky" would have done nothing.
 * Now the same two plugins the iPhone app has, in Java, under the same JS
 * names and with the same keys: TwilyteShare (Android's share sheet) and
 * TwilyteCalendar (the calendar's own new-event screen for one event, the
 * .ics file for a month, no calendar permission). And the back button,
 * which left the app from anywhere, Sky View included: it now closes
 * what's open on the page first (`twBack`).
 *
 * No Android SDK in this sandbox (dl.google.com is blocked), so the Java is
 * compiled and the app launched in CI (.github/workflows/android-build.yml);
 * these hold the two sides of each plugin to one contract.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extract, declSource } = require('./extract.js');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const JAVA = 'native/android/app/src/main/java/info/twilyte/app/';
const SHARE = read(JAVA + 'TwilyteSharePlugin.java');
const CAL = read(JAVA + 'TwilyteCalendarPlugin.java');
const MAIN = read(JAVA + 'MainActivity.java');
const MANIFEST = read('native/android/app/src/main/AndroidManifest.xml');
const HTML = read('index.html');

test('both plugins are under the names the page looks for, with the methods it calls', () => {
  assert.match(SHARE, /@CapacitorPlugin\(name = "TwilyteShare"\)\npublic class TwilyteSharePlugin extends Plugin \{/);
  assert.match(SHARE, /@PluginMethod\n\s*public void share\(PluginCall call\)/);
  assert.match(CAL, /@CapacitorPlugin\(name = "TwilyteCalendar"\)\npublic class TwilyteCalendarPlugin extends Plugin \{/);
  assert.match(CAL, /@PluginMethod\n\s*public void add\(PluginCall call\)/);
  assert.match(declSource('nativeShare'), /c\.Plugins\.TwilyteShare/);
  assert.match(declSource('nativeCalendar'), /c\.Plugins\.TwilyteCalendar/);
  assert.deepStrictEqual(extract(['NATIVE_FILES']).NATIVE_FILES, ['ios', 'android']);
});

test('they are registered before the bridge is made', () => {
  // Capacitor builds its bridge in BridgeActivity.onCreate; a plugin
  // registered after that is never seen by the page.
  const body = MAIN.slice(MAIN.indexOf('protected void onCreate'));
  const at = s => body.indexOf(s);
  assert.ok(at('registerPlugin(TwilyteSharePlugin.class);') > 0);
  assert.ok(at('registerPlugin(TwilyteCalendarPlugin.class);') > 0);
  assert.ok(at('registerPlugin(TwilyteSharePlugin.class);') < at('super.onCreate(savedInstanceState);'));
  assert.ok(at('registerPlugin(TwilyteCalendarPlugin.class);') < at('super.onCreate(savedInstanceState);'));
  assert.match(MANIFEST, /android:name="\.MainActivity"/);
});

test('the share sheet reads every key the page sends', () => {
  // What shareSkyCard and saveFile hand to TwilyteShare.
  assert.match(declSource('shareSkyCard'), /ns\.share\(\{ image: cv\.toDataURL\('image\/png'\)\.split\(','\)\[1\], text \}\)/);
  assert.match(declSource('saveFile'), /ns\.share\(\{ fileName: name, fileText: text \}\)/);
  for (const key of ['image', 'text', 'url', 'fileName', 'fileText']) assert.ok(SHARE.includes(`call.getString("${key}")`), key);
  assert.match(SHARE, /Base64\.decode\(image, Base64\.DEFAULT\)/, 'base64 with no data: prefix');
  assert.match(SHARE, /new File\(name\)\.getName\(\)/, 'only the name, never a path');
  assert.match(SHARE, /if \(n\.endsWith\("\.csv"\)\) return "text\/csv";/);
  assert.match(SHARE, /r\.put\("completed", true\)/, 'shareSkyCard reads completed');
});

test('files go out through the FileProvider the manifest declares, from the cache', () => {
  assert.match(MANIFEST, /android:name="androidx\.core\.content\.FileProvider"\s+android:authorities="\$\{applicationId\}\.fileprovider"\s+android:exported="false"\s+android:grantUriPermissions="true"/);
  assert.match(SHARE, /FileProvider\.getUriForFile\(ctx, ctx\.getPackageName\(\) \+ "\.fileprovider", f\)/);
  assert.match(SHARE, /new File\(ctx\.getCacheDir\(\), "shared"\)/);
  assert.match(read('native/android/app/src/main/res/xml/file_paths.xml'), /<cache-path name="[^"]+" path="\." \/>/);
  // The app picked may read it; nothing else may.
  assert.match(SHARE, /addFlags\(Intent\.FLAG_GRANT_READ_URI_PERMISSION\)/);
  assert.match(CAL, /addFlags\(Intent\.FLAG_GRANT_READ_URI_PERMISSION\)/);
});

test('the calendar: one event in the calendar’s own screen, a month as its file, no permission', () => {
  // The keys icsEvents writes, read for the one-event screen.
  const { icsEvents, sunsetICS } = extract(['icsEvents', 'sunsetICS']);
  const T = Date.UTC(2026, 10, 4, 21, 30);
  const ev = icsEvents(sunsetICS({ t: T, civil: T + 60000 }, 'Boston', T, t => new Date(t).toISOString().slice(11, 16)))[0];
  for (const key of ['title', 'start', 'end', 'notes']) assert.ok(ev && key in ev && CAL.includes(`e.opt${key === 'start' || key === 'end' ? 'Double' : 'String'}("${key}"`), key);
  for (const key of ['events', 'ics', 'fileName']) assert.ok(CAL.includes(`call.get${key === 'events' ? 'Array' : 'String'}("${key}"`), key);
  assert.match(CAL, /new Intent\(Intent\.ACTION_INSERT\)\s*\.setData\(CalendarContract\.Events\.CONTENT_URI\)/);
  assert.match(CAL, /putExtra\(CalendarContract\.EXTRA_EVENT_BEGIN_TIME, \(long\) start\)/, 'ms, as the page sends them');
  assert.match(CAL, /events\.length\(\) == 1/);
  assert.match(CAL, /new Intent\(Intent\.ACTION_VIEW\)\s*\.setDataAndType\(uri, "text\/calendar"\)/);
  assert.match(CAL, /catch \(ActivityNotFoundException x\) \{\s*activity\.startActivity\(Intent\.createChooser\(TwilyteSharePlugin\.shareIntent\(uri, "text\/calendar", null\), null\)\);/, 'no app imports .ics: the share sheet');
  // No calendar permission: the privacy policy and the store answers say
  // the apps can add but never read.
  assert.doesNotMatch(MANIFEST, /CALENDAR/);
  assert.doesNotMatch(CAL, /ContentResolver|insert\(CalendarContract/);
});

test('in the Android app saveFile hands a calendar to the plugin with its file, and downloads nothing', async () => {
  const { saveFile, sextantICS, icsEvents } = extract(['saveFile', 'NATIVE_FILES', 'nativeCalendar', 'nativeShare', 'icsEvents', 'sextantICS']);
  const calls = [];
  const saved = global.window, savedDoc = global.document;
  global.window = { Capacitor: { getPlatform: () => 'android', Plugins: {
    TwilyteCalendar: { add: o => { calls.push(['add', o]); return Promise.resolve({ shown: 'editor' }); } },
    TwilyteShare: { share: o => { calls.push(['share', o]); return Promise.resolve({ completed: true }); } }
  } } };
  global.document = { createElement() { throw new Error('a download link in the app'); } };
  try {
    const T = Date.UTC(2026, 10, 4, 22);
    const ics = sextantICS({ s: T, e: T + 1800000, kind: 'evening' }, 'Boston', T);
    assert.deepStrictEqual(await saveFile('sextant-window.ics', ics, 'text/calendar'), { shown: 'editor' });
    assert.deepStrictEqual(calls.pop(), ['add', { events: icsEvents(ics), ics, fileName: 'sextant-window.ics' }]);
    await saveFile('twilight_2026-11.csv', 'a,b', 'text/csv');
    assert.deepStrictEqual(calls.pop(), ['share', { fileName: 'twilight_2026-11.csv', fileText: 'a,b' }]);
  } finally {
    global.window = saved;
    global.document = savedDoc;
  }
});

test('back sends the page an Escape and says whether anything took it', () => {
  const { twBack } = extract(['twBack']);
  class KeyboardEvent {
    constructor(type, o) { Object.assign(this, { type, key: o.key, cancelable: o.cancelable, defaultPrevented: false }); }
    preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
  }
  const win = handlers => ({ KeyboardEvent, dispatchEvent: e => handlers.forEach(h => h(e)) });
  assert.strictEqual(twBack(win([])), false, 'nothing open: back goes on');
  assert.strictEqual(twBack(win([e => { if (e.key === 'Escape') e.preventDefault(); }])), true);
  assert.strictEqual(twBack(win([e => { if (e.key === 'Enter') e.preventDefault(); }])), false);
});

test('everything on the page that closes on Escape says so, so back stops there', () => {
  // Each window keydown handler that acts on Escape: Sky View, the welcome,
  // Settings and the Console's place picker.
  const handlers = [...HTML.matchAll(/if \(e\.key (===|!==) ['"]Escape['"]\)[^\n]*(\n[^\n]*){0,2}/g)].map(m => m[0]);
  assert.strictEqual(handlers.length, 4, handlers.join('\n---\n'));
  for (const h of handlers) assert.match(h, /e\.preventDefault\(\);/, h);
  assert.match(declSource('SkyDome'), /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); onClose\(\); return; \}/);
  // And MainActivity asks it before going back a page or leaving.
  assert.match(MAIN, /web\.evaluateJavascript\("typeof twBack === 'function' && twBack\(\) === true", handled -> \{\s*if \("true"\.equals\(handled\)\) return;\s*if \(web\.canGoBack\(\)\) web\.goBack\(\);\s*else leave\(\);/);
  assert.match(MAIN, /getOnBackPressedDispatcher\(\)\.addCallback\(this, back\);/);
});

test('behind the bars, where an older web view is inset from them, the header’s colour', () => {
  const bg = (HTML.match(/--bg:\s*(#[0-9a-f]{6})/i) || [])[1];
  assert.ok(bg, '--bg in index.html');
  assert.match(read('native/android/app/src/main/res/values/colors.xml'), new RegExp(`<color name="twilyte_bg">${bg}</color>`, 'i'));
  assert.match(read('native/android/app/src/main/res/values/styles.xml'), /<style name="AppTheme\.NoActionBar"(?:(?!<\/style>)[^])*<item name="android:windowBackground">@color\/twilyte_bg<\/item>/);
  // The bars' icons stay light over it.
  assert.strictEqual(JSON.parse(read('native/capacitor.config.json')).plugins.SystemBars.style, 'DARK');
});

// Chromium 153 has DeviceOrientationEvent.requestPermission, and with no
// one to ask it answers "prompt"; read as a refusal, Sky View said
// "Compass permission was denied" (found taking the Play screenshots,
// 2026-11-04). Android's web view is Chromium.
test('the motion permission: only "denied" is a refusal', async () => {
  const src = declSource('StarFinder');
  const body = src.slice(src.indexOf('  const ensureSensors = async () => {'), src.indexOf('  const startAim = name =>'));
  const run = async answer => {
    const states = [];
    const DeviceOrientationEvent = { requestPermission: () => typeof answer === 'function' ? answer() : Promise.resolve(answer) };
    const ensure = new Function('nativeMotion', 'setAimSensor', 'window', 'DeviceOrientationEvent', body + '\nreturn ensureSensors;')(
      () => null, s => states.push(s), { isSecureContext: true }, DeviceOrientationEvent);
    await ensure();
    return states.pop();
  };
  assert.strictEqual(await run('granted'), 'granted');
  assert.strictEqual(await run('prompt'), 'granted', 'no one to ask: listen');
  assert.strictEqual(await run('denied'), 'denied');
  assert.strictEqual(await run(() => Promise.reject(new Error('not from a tap'))), 'denied');
});
