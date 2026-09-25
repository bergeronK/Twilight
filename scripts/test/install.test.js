'use strict';
/*
 * Offering to install (2026-09-25). The banner used to appear on the first
 * visit, only in browsers with an install prompt (never on an iPhone, where
 * Add to Home Screen is also the only way to get notifications), to people
 * who had installed already, and its x hid it for good.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');
const m = extract(['INSTALL_SNOOZE_MS', 'noteVisitDay', 'installOffer', 'isIOS']);

const mem = (init = {}) => { const d = { ...init }; return { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, d }; };
const DAY = 86400000, T0 = new Date(2026, 8, 20, 21).getTime();

test('visit days: distinct local days, the last three kept', () => {
  const s = mem();
  assert.strictEqual(m.noteVisitDay(s, T0), 1);
  assert.strictEqual(m.noteVisitDay(s, T0 + 3600000), 1, 'later the same evening');
  assert.strictEqual(m.noteVisitDay(s, T0 + DAY), 2);
  m.noteVisitDay(s, T0 + 2 * DAY); m.noteVisitDay(s, T0 + 5 * DAY);
  assert.strictEqual(JSON.parse(s.d.tw_visit_days).length, 3, 'dates only, and only three');
  // Junk in storage, or storage that throws, is survived.
  assert.strictEqual(m.noteVisitDay(mem({ tw_visit_days: '{"x":1}' }), T0), 1);
  assert.strictEqual(m.noteVisitDay({ getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } }, T0), 1);
});

test('when to offer, and how', () => {
  const base = { standalone: false, native: false, tipShowing: false, visitDays: 2, snoozedUntil: 0, now: T0, hasPrompt: false, ios: true };
  const o = x => m.installOffer({ ...base, ...x });
  assert.strictEqual(o({}), 'ios', 'an iPhone on its second day: the Share sheet');
  assert.strictEqual(o({ ios: false, hasPrompt: true }), 'prompt', 'Chrome or Edge: its own dialog');
  assert.strictEqual(o({ ios: false }), null, 'a browser that can\'t install: nothing to say');
  assert.strictEqual(o({ visitDays: 1 }), null, 'never on the first day');
  assert.strictEqual(o({ standalone: true }), null, 'installed already');
  assert.strictEqual(o({ native: true }), null, 'the native apps');
  assert.strictEqual(o({ tipShowing: true }), null, 'one banner at a time');
  assert.strictEqual(o({ snoozedUntil: T0 + DAY }), null, 'put off');
  assert.strictEqual(o({ snoozedUntil: T0 - 1 }), 'ios', 'and back once that runs out');
});

test('iOS, iPadOS posing as a Mac, and not Android', () => {
  assert.ok(m.isIOS({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)' }));
  assert.ok(m.isIOS({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 }));
  assert.ok(!m.isIOS({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 }));
  assert.ok(!m.isIOS({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' }));
  assert.strictEqual(m.INSTALL_SNOOZE_MS, 60 * DAY);
});

test('the app wires it: snooze on x, installed hides it, the old flag migrates', () => {
  const app = declSource('TwilightApp');
  assert.match(app, /offer && React\.createElement\("div", \{\s*role: "region", "aria-label": "Install Twilyte"/);
  assert.match(app, /offer === 'prompt' && React\.createElement\("button", \{\s*onClick: doInstall/);
  assert.match(app, /localStorage\.setItem\('tw_install_snooze', String\(until\)\)/);
  assert.match(app, /window\.addEventListener\('appinstalled', done\)/);
  assert.match(app, /matchMedia\('\(display-mode: standalone\)'\)\.matches\) \|\| navigator\.standalone === true/);
  assert.match(app, /if \(localStorage\.getItem\('tw_nodismiss'\) === '1'\) \{\s*localStorage\.removeItem\('tw_nodismiss'\);/);
  assert.match(app, /tipShowing: !hintDismissed/);
  assert.match(app, /Add Twilyte to your Home Screen: tap Share /);
  assert.ok(!/Star Finder/.test(app), 'the tip names the tab as it is now');
});
