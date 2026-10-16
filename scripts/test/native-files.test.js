'use strict';
/*
 * From the owner's iPhone (app build v161, 2026-10-09): "Add sunset to
 * calendar", "Add sunrise to calendar", the sextant window's "Add to
 * calendar" and the Ephemeris's month export (iCal and CSV) all did
 * nothing. Each made a file and clicked a download link, which a browser
 * saves and the app's web view drops. Now every one goes through
 * `saveFile`: the website downloads as before; the iPhone app sends a
 * calendar's events to TwilyteCalendarPlugin (iOS's event editor for one,
 * all of them into the default calendar for a month) and any other file to
 * the share sheet. The page reads its own .ics back into events
 * (`icsEvents`), so these tests run every calendar the app writes through
 * it.
 *
 * Also from that report: the observing log and its Messier checklist were
 * taken out.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extract, declSource } = require('./extract.js');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SWIFT = read('native/ios/App/App/AppDelegate.swift');
const PLIST = read('native/ios/App/App/Info.plist');

const m = extract(['icsEvents', 'sunsetICS', 'sunriseICS', 'sextantICS']);
const fmt = t => new Date(t).toISOString().slice(11, 16);
const T = Date.UTC(2026, 9, 9, 22, 37);

test('a sunset reads back as the event it was written as, reminder and all', () => {
  const set = { t: T, civil: T + 28 * 60000, naut: T + 60 * 60000, astro: T + 92 * 60000 };
  const ev = m.icsEvents(m.sunsetICS(set, 'Boston, MA', Date.UTC(2026, 9, 9), fmt));
  assert.strictEqual(ev.length, 1);
  assert.deepStrictEqual(ev[0], {
    title: 'Sunset at Boston, MA',
    notes: 'Sunset 22:37. Civil dusk 23:05: the last of the colour. Nautical dusk 23:37: the horizon fades and the brighter stars are out. Fully dark 00:09.',
    start: T, end: T + 28 * 60000, alarm: 30
  });
});

test('a sunrise runs from civil dawn to sunrise, and the alarm’s own words aren’t its notes', () => {
  const rise = { t: T, civil: T - 27 * 60000, naut: T - 60 * 60000 };
  const [ev] = m.icsEvents(m.sunriseICS(rise, 'Grand Canyon, AZ', Date.UTC(2026, 9, 9), fmt));
  assert.strictEqual(ev.title, 'Sunrise at Grand Canyon, AZ');
  assert.strictEqual(ev.start, T - 27 * 60000);
  assert.strictEqual(ev.end, T);
  assert.strictEqual(ev.alarm, 30);
  assert.doesNotMatch(ev.notes, /in 30 minutes/, 'the VALARM’s DESCRIPTION');
  assert.match(ev.notes, /^Nautical dawn .* Sunrise 22:37\.$/);
});

test('the sextant window, which has no reminder', () => {
  const win = { s: T, e: T + 32 * 60000, kind: 'evening' };
  const [ev] = m.icsEvents(m.sextantICS(win, 'Boston, MA', Date.UTC(2026, 9, 9)));
  assert.strictEqual(ev.title, 'Sextant window — nautical twilight (evening)');
  assert.strictEqual(ev.start, T);
  assert.strictEqual(ev.end, T + 32 * 60000);
  assert.ok(!('alarm' in ev));
  assert.match(ev.notes, /at Boston, MA\./);
});

test('a month’s export: every window, in order', () => {
  const x = extract(['D2R', 'R2D', 'RAD', 'rad', 'deg', 'solarParams', 'eventUTC', 'sunEvent', 'ALT', 'computeDay', 'photoWindows',
    'localComputeDay', 'photoWindowsFor', 'pad2', 'icalStamp', 'utcDate', 'daysInMonth', 'tzOffset', 'zoneOffsets']);
  const run = mode => {
    let out = null;
    new Function('Y', 'Mo', 'latN', 'lonN', 'icalMode', 'daysInMonth', 'localComputeDay', 'icalStamp', 'utcDate', 'photoWindowsFor', 'download', 'pad2',
      'valid', 'tz', 'zoneOffsets', 'offMin', declSource('exportICS') + '\nreturn exportICS;')(2026, 10, 42.36, -71.06, mode, x.daysInMonth, x.localComputeDay, x.icalStamp, x.utcDate, x.photoWindowsFor,
      (name, text, mime) => { out = { name, text, mime }; }, x.pad2, true, 'America/New_York', x.zoneOffsets, -240)();
    return out;
  };
  const dark = run('stargazing');
  assert.strictEqual(dark.mime, 'text/calendar');
  const ev = m.icsEvents(dark.text);
  assert.strictEqual(ev.length, 31, 'one dark window a night in October, Boston');
  for (const e of ev) {
    assert.strictEqual(e.title, '🌌 Astronomical dark window');
    const h = (e.end - e.start) / 3600000;
    assert.ok(h > 8 && h < 12, `${h} h of dark`);
  }
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].start - ev[i - 1].start > 23 * 3600000, 'a night apart');
  assert.strictEqual(m.icsEvents(run('photography').text).length, 124, 'four a day');
});

test('reading a calendar: folded lines, escapes, and nothing half-written', () => {
  const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'SUMMARY:Dusk\\, then dark\\; a\\\\b', 'DESCRIPTION:One line\\nand ano',
    ' ther', 'DTSTART:20261009T223700Z', 'DTEND:20261009T230500Z', 'BEGIN:VALARM', 'TRIGGER:-PT1H15M', 'END:VALARM', 'END:VEVENT',
    'BEGIN:VEVENT', 'SUMMARY:No end', 'DTSTART:20261009T223700Z', 'END:VEVENT',
    'BEGIN:VEVENT', 'SUMMARY:Local time', 'DTSTART:20261009T223700', 'DTEND:20261009T230500', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  assert.deepStrictEqual(m.icsEvents(ics), [{
    title: 'Dusk, then dark; a\\b', notes: 'One line\nand another', start: T, end: T + 28 * 60000, alarm: 75
  }]);
  for (const junk of ['', null, undefined, 'not a calendar', 'BEGIN:VEVENT']) assert.deepStrictEqual(m.icsEvents(junk), []);
});

function withWindow(w, fn) {
  const saved = global.window;
  global.window = w;
  try { return fn(); } finally { global.window = saved; }
}
const app = (plugins, platform = 'ios') => ({ Capacitor: { getPlatform: () => platform, Plugins: plugins } });

test('the calendar is the iPhone app’s plugin, and nothing on the website', () => {
  const { nativeCalendar } = extract(['nativeCalendar']);
  const plugin = { add() {} };
  assert.strictEqual(withWindow({}, nativeCalendar), null, 'website');
  assert.strictEqual(withWindow(app({}), nativeCalendar), null, 'an app without the plugin');
  assert.strictEqual(withWindow(app({ TwilyteCalendar: plugin }, 'android'), nativeCalendar), null);
  assert.strictEqual(withWindow(app({ TwilyteCalendar: plugin }), nativeCalendar), plugin);
});

// saveFile with a recording document, and the plugins it can find.
async function save(plugins, name, text, mime) {
  const { saveFile } = extract(['saveFile', 'nativeCalendar', 'nativeShare', 'icsEvents']);
  const saved = {};
  for (const k of ['window', 'document', 'URL', 'Blob']) saved[k] = Object.getOwnPropertyDescriptor(global, k);
  const set = (k, v) => Object.defineProperty(global, k, { value: v, configurable: true, writable: true });
  const clicked = [];
  set('window', plugins ? app(plugins) : {});
  set('document', { createElement: () => ({ click() { clicked.push({ name: this.download, href: this.href }); }, remove() {} }), body: { appendChild() {} } });
  set('URL', { createObjectURL: b => 'blob:' + b.type, revokeObjectURL() {} });
  set('Blob', function Blob(parts, o) { this.type = o.type; });
  try {
    return { r: await saveFile(name, text, mime), clicked };
  } finally {
    for (const k in saved) saved[k] ? Object.defineProperty(global, k, saved[k]) : delete global[k];
  }
}

test('the website downloads, as it always has', async () => {
  const ics = m.sextantICS({ s: T, e: T + 60000, kind: 'evening' }, 'Boston', T);
  const { clicked } = await save(null, 'sextant-window.ics', ics, 'text/calendar');
  assert.deepStrictEqual(clicked, [{ name: 'sextant-window.ics', href: 'blob:text/calendar' }]);
  assert.deepStrictEqual((await save(null, 'twilight_2026-10.csv', 'a,b', 'text/csv')).clicked, [{ name: 'twilight_2026-10.csv', href: 'blob:text/csv' }]);
});

test('the iPhone app: a calendar to Calendar, anything else to the share sheet, and no download', async () => {
  const calls = [];
  const plugins = {
    TwilyteCalendar: { add: o => { calls.push(['add', o]); return Promise.resolve({ added: o.events.length }); } },
    TwilyteShare: { share: o => { calls.push(['share', o]); return Promise.resolve({ completed: true }); } }
  };
  const ics = m.sextantICS({ s: T, e: T + 60000, kind: 'evening' }, 'Boston', T);
  let out = await save(plugins, 'sextant-window.ics', ics, 'text/calendar');
  assert.deepStrictEqual(out, { r: { added: 1 }, clicked: [] });
  assert.deepStrictEqual(calls.pop(), ['add', { events: m.icsEvents(ics) }]);
  out = await save(plugins, 'twilight_2026-10.csv', '"Date"\n"2026-10-01"', 'text/csv');
  assert.deepStrictEqual(out.clicked, []);
  assert.deepStrictEqual(calls.pop(), ['share', { fileName: 'twilight_2026-10.csv', fileText: '"Date"\n"2026-10-01"' }]);
  // A refusal or a failure in the plugin says nothing more on the page.
  plugins.TwilyteCalendar.add = () => Promise.reject(new Error('denied'));
  assert.strictEqual((await save(plugins, 'x.ics', ics, 'text/calendar')).r, null);
});

test('every calendar button and both exports go through saveFile', () => {
  const html = read('index.html');
  // The only download links left: saveFile's own, and the sky picture's
  // website fallback (the app shares that picture natively).
  assert.strictEqual((html.match(/\.download = /g) || []).length, 2);
  assert.match(declSource('saveFile'), /a\.download = name;/);
  assert.match(declSource('shareSkyCard'), /a\.download = name;/);
  const rt = declSource('RealtimeTwilight');
  assert.match(rt, /const saveICS = \(text, name\) => saveFile\(name, text, "text\/calendar"\);/);
  assert.match(rt, /saveICS\(sunsetICS\(/);
  assert.match(rt, /saveICS\(sunriseICS\(/);
  assert.match(declSource('TwilightEphemeris'), /const download = \(name, text, mime\) => saveFile\(name, text, mime\);/);
  assert.match(declSource('StarFinder'), /saveFile\("sextant-window\.ics", sextantICS\(sextWin, loc\.name, Date\.now\(\)\), "text\/calendar"\)/);
});

test('the Swift calendar plugin is registered under the name the page looks for', () => {
  assert.match(SWIFT, /^import EventKit$/m);
  assert.match(SWIFT, /^import EventKitUI$/m);
  assert.match(SWIFT, /@objc\(TwilyteCalendarPlugin\)\npublic class TwilyteCalendarPlugin: CAPPlugin, CAPBridgedPlugin, EKEventEditViewDelegate \{/);
  assert.match(SWIFT, /public let jsName = "TwilyteCalendar"/);
  assert.match(SWIFT, /CAPPluginMethod\(name: "add", returnType: CAPPluginReturnPromise\)/);
  assert.match(SWIFT, /@objc func add\(_ call: CAPPluginCall\)/);
  // The keys icsEvents writes.
  const ev = m.icsEvents(m.sunsetICS({ t: T, civil: T + 60000 }, 'Boston', T, fmt))[0];
  for (const key of Object.keys(ev)) assert.ok(SWIFT.includes(`o["${key}"]`), key);
  assert.match(SWIFT, /Date\(timeIntervalSince1970: s \/ 1000\)/, 'ms from the page');
  assert.match(SWIFT, /EKAlarm\(relativeOffset: -m \* 60\)/, 'minutes before');
  // One event: the editor, which on iOS 17+ needs no permission at all.
  assert.match(SWIFT, /events\.count == 1 \{\s*self\.edit\(/);
  assert.match(SWIFT, /if #available\(iOS 17\.0, \*\) \{\s*open\(\)\s*\} else \{\s*store\.requestAccess\(to: \.event\)/);
  // Several: asked first, then write-only access, never full.
  assert.match(SWIFT, /store\.requestWriteOnlyAccessToEvents/);
  assert.doesNotMatch(SWIFT, /requestFullAccessToEvents/);
  assert.match(SWIFT, /UIAlertController\(title: "Add \\\(events\.count\) events to your calendar\?"/);
  assert.match(SWIFT, /try store\.commit\(\)/);
  const vc = SWIFT.slice(SWIFT.indexOf('class TwilyteBridgeViewController'));
  assert.match(vc, /bridge\?\.registerPluginInstance\(TwilyteCalendarPlugin\(\)\)/);
});

test('the share sheet takes a file by name', () => {
  for (const key of ['fileName', 'fileText']) assert.ok(SWIFT.includes(`call.getString("${key}")`), key);
  assert.match(SWIFT, /FileManager\.default\.temporaryDirectory\s*\.appendingPathComponent\(\(name as NSString\)\.lastPathComponent\)/);
});

test('Info.plist says why Twilyte adds to the calendar, on every iOS it runs on', () => {
  // iOS 17+ asks with the write-only string (a missing one fails silently);
  // 15 and 16 with the older one. Neither lets the app read the calendar.
  for (const key of ['NSCalendarsWriteOnlyAccessUsageDescription', 'NSCalendarsUsageDescription']) {
    assert.match(PLIST, new RegExp(`<key>${key}</key>\\s*<string>[^<]{20,}</string>`), key);
  }
  assert.doesNotMatch(PLIST, /NSCalendarsFullAccessUsageDescription/, 'add-only');
  assert.match(read('docs/app-store-privacy-answers.md'), /NSCalendarsWriteOnlyAccessUsageDescription/);
});

test('the observing log is gone, and what it kept goes with it', () => {
  const html = read('index.html');
  for (const name of ['ObservingLog', 'seenStore', 'useSeen', 'logSummary', 'Messier checklist', 'I’ve seen it']) {
    assert.ok(!html.includes(name), name);
  }
  assert.match(html, /try \{ localStorage\.removeItem\('tw_seen'\); \} catch \(e\) \{\}/);
  assert.ok(!html.includes("setItem('tw_seen'"));
  assert.doesNotMatch(read('privacy.html'), /observing log/i);
});
