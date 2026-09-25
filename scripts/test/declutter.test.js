'use strict';
/*
 * The declutter of 2026-09-25: what left the Console and where it went.
 * Casual stargazers land on the Console; the navigator's material is kept
 * whole under "For navigators" on the Stars tab. These pin both halves, so
 * a later change can't quietly bring limiting magnitude back to the Console
 * or lose the sextant window on its way to the Stars tab.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'asin', 'acos', 'atan2', 'rev', 'jd', 'gmst', 'sunAltitude', 'sunRaDec', 'sunHcZn', 'scanCrossings', 'SUN_THR',
  'sextantWindows', 'nextSextantWindow', 'sextantICS']);

test('the sextant windows are nautical twilight, evening and morning', () => {
  const lat = 42.36, lon = -71.06, now = Date.UTC(2026, 8, 24, 16);
  const w = m.sextantWindows(now, lat, lon);
  assert.ok(w.length >= 3, `${w.length} windows in two days`);
  for (let i = 1; i < w.length; i++) assert.ok(w[i].s > w[i - 1].s, 'earliest first');
  w.forEach(x => {
    // The Sun crosses 6° down at one end and 12° down at the other.
    const a = m.sunAltitude(new Date(x.s), lat, lon), b = m.sunAltitude(new Date(x.e), lat, lon);
    const [lo, hi] = x.kind === 'Evening' ? [b, a] : [a, b];
    assert.ok(Math.abs(hi + 6) < 0.2 && Math.abs(lo + 12) < 0.2, `${x.kind} ${a.toFixed(2)} → ${b.toFixed(2)}`);
    assert.ok(x.e - x.s > 20 * 60000 && x.e - x.s < 60 * 60000, 'about half an hour at 42° N');
  });
  // Open now, or the next one.
  const first = w[0];
  assert.deepStrictEqual(m.nextSextantWindow(w, first.s + 60000), { ...first, open: true });
  assert.deepStrictEqual(m.nextSextantWindow(w, first.s - 60000), { ...first, open: false });
  assert.strictEqual(m.nextSextantWindow([], now), null);
  // Midsummer at 70° N: no nautical twilight at all.
  assert.deepStrictEqual(m.sextantWindows(Date.UTC(2026, 5, 21), 70, 20), []);
  const ics = m.sextantICS(first, 'Boston', Date.UTC(2026, 8, 24));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /SUMMARY:Sextant window — nautical twilight \(Evening\)/);
  assert.match(ics, /DESCRIPTION:Optimal window for celestial sights at Boston\./);
});

test('the Console keeps only what nothing above it says', () => {
  const rt = declSource('RealtimeTwilight');
  for (const gone of ['Faintest star visible', '"Above the horizon now"', 'Today\'s twilight schedule', 'EventCol', 'TwilightBands', 'downloadICS', 'Sextant window', 'Horizon visible']) {
    assert.ok(!rt.includes(gone), `${gone} is back on the Console`);
  }
  assert.match(rt, /onMore: \(\) => goTab\("ephemeris"\)/, 'a way to the day\'s times');
  assert.match(rt, /React\.createElement\(TwilightToday, \{\s*next: nextSunEv,/, 'the countdown stays');
  // The almanac says nothing until asked.
  assert.match(rt, /fact === null \? null :/);
  // Tabs listen for goTab.
  assert.match(declSource('TwilightApp'), /window\.addEventListener\('tw:tab', h\)/);
});

test('the navigator\'s material is whole, under one fold on the Stars tab', () => {
  const sf = declSource('StarFinder');
  const fold = sf.slice(sf.indexOf('id: "for-navigators"'));
  assert.ok(fold.length > 0 && /React\.createElement\("details", \{\s*id: "for-navigators"/.test(sf), 'a <details> fold');
  assert.ok(!/id: "for-navigators",\s*open:/.test(sf), 'shut by default');
  const inside = fold.slice(0, fold.indexOf('skyOpen && React.createElement(SkyDome'));
  for (const part of ['navStarsPanel', 'sextantPanel', 'navigatorPanel', 'aimPanel']) assert.ok(inside.includes(part), `${part} inside the fold`);
  assert.match(sf, /"The whole sky now"\),\s*skyChart/, 'the chart stays out in the open');
  assert.match(sf, /sextantWindows\(Date\.now\(\), loc\.lat, loc\.lon\)/);
  assert.match(sf, /onClick: downloadSextantICS/);
});

test('the feedback link and its template', () => {
  const root = path.join(__dirname, '..', '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /href: "https:\/\/github\.com\/bergeronK\/Twilight\/issues\/new\?template=feedback\.md"/);
  const tpl = fs.readFileSync(path.join(root, '.github', 'ISSUE_TEMPLATE', 'feedback.md'), 'utf8');
  assert.match(tpl, /^---\nname: Feedback\n/);
});
