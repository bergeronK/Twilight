'use strict';
/*
 * Twilyte Pro (owner, 2026-10-05): the app is free, Pro is one purchase, and
 * whoever had the app while it sold nothing keeps Pro. On iOS the store says
 * which build a person first downloaded; the free builds are numbered under
 * EARLY_BUILDS_BELOW and the first build that sells starts there. These tests
 * hold the rule, the purchase code that reads it, and the Xcode project's
 * build number to one another. See docs/monetization.md.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extract, declSource } = require('./extract.js');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('early supporters are the free builds, by whole build number', () => {
  const { earlySupporter, EARLY_BUILDS_BELOW } = extract(['EARLY_BUILDS_BELOW', 'earlySupporter']);
  assert.strictEqual(EARLY_BUILDS_BELOW, 100);
  const early = v => earlySupporter({ originalApplicationVersion: v });
  for (const v of ['1', '2', '17', '99', ' 42 ', 7]) assert.strictEqual(early(v), true, JSON.stringify(v));
  for (const v of ['100', '101', '250', 100]) assert.strictEqual(early(v), false, `${v}: bought after Pro went on sale`);
  // Apple's sandbox (TestFlight, App Review) says "1.0" for everyone. Read as
  // build 1, no tester could ever see the purchase.
  assert.strictEqual(early('1.0'), false, 'sandbox');
  // Android says null; the store may not know yet on iOS either.
  for (const v of [null, undefined, '', '0', '-3', '1.2.3', 'abc', '12a']) assert.strictEqual(early(v), false, JSON.stringify(v));
  assert.strictEqual(earlySupporter(null), false);
  assert.strictEqual(earlySupporter({}), false);
});

// rcApply with a recording stand-in for prefStore, and its rcEarly readable.
function applier(stored) {
  const store = { pro: stored, setPro(v) { this.pro = !!v; }, getPro() { return this.pro; } };
  const src = ['EARLY_BUILDS_BELOW', 'earlySupporter', 'rcEarly', 'rcApply'].map(n => declSource(n)).join('\n');
  const { rcApply, early } = new Function('prefStore', src + '\nreturn { rcApply, early: () => rcEarly };')(store);
  return { store, rcApply, early };
}
const info = (pro, v) => ({ entitlements: { active: pro ? { pro: { identifier: 'pro' } } : {} }, originalApplicationVersion: v });

test('the store decides Pro: a purchase, or having had the app first', () => {
  let a = applier(false);
  assert.strictEqual(a.rcApply(info(true, '140')), true, 'bought');
  assert.strictEqual(a.early(), false);
  a = applier(true);
  assert.strictEqual(a.rcApply({ customerInfo: info(false, '140') }), false, 'downloaded after the sale began, not bought');
  assert.strictEqual(a.early(), false);
  a = applier(false);
  assert.strictEqual(a.rcApply(info(false, '12')), true, 'downloaded build 12, while free');
  assert.strictEqual(a.early(), true);
  a = applier(false);
  assert.strictEqual(a.rcApply({ customerInfo: info(false, '1.0') }), false, 'a TestFlight tester can buy');
  // Bought and early both: it was bought, and Settings says so.
  a = applier(false);
  assert.strictEqual(a.rcApply(info(true, '3')), true);
  assert.strictEqual(a.early(), false);
  // No answer from the store leaves what was stored.
  for (const res of [null, undefined, {}, { customerInfo: {} }]) {
    a = applier(true);
    assert.strictEqual(a.rcApply(res), true, JSON.stringify(res));
  }
});

test('Settings says why Pro is unlocked, and Restore says it too', () => {
  const app = declSource('TwilightApp');
  assert.match(app, /iapMode \? \(pro && rcEarly \? " Yours free, since you had Twilyte before Pro went on sale\." : " One-time purchase\."\)/);
  assert.match(app, /\(await rcRestorePro\(\)\) \? \(rcEarly \? "Pro is yours, since you had Twilyte before it went on sale\." : "Purchases restored\."\)/);
  // rcEarly is set before setPro, whose re-render reads it.
  const apply = declSource('rcApply');
  assert.ok(apply.indexOf('rcEarly =') < apply.indexOf('prefStore.setPro('), 'set before the re-render');
});

test('the purchase buys the offering’s Lifetime package', async () => {
  const bought = [];
  const offering = (lifetime, list) => ({ current: { lifetime, availablePackages: list } });
  const run = async off => {
    const P = {
      getOfferings: async () => off,
      purchasePackage: async ({ aPackage }) => { bought.push(aPackage.id); return { customerInfo: info(true, '140') }; }
    };
    const store = { pro: false, setPro(v) { this.pro = !!v; }, getPro() { return this.pro; } };
    const src = ['EARLY_BUILDS_BELOW', 'earlySupporter', 'rcEarly', 'rcApply', 'rcPurchasePro'].map(n => declSource(n)).join('\n');
    return new Function('prefStore', 'rcInit', src + '\nreturn rcPurchasePro;')(store, async () => P)();
  };
  assert.strictEqual(await run(offering({ id: 'life' }, [{ id: 'other' }, { id: 'life' }])), true);
  assert.strictEqual(await run(offering(null, [{ id: 'only' }])), true, 'else the first');
  assert.deepStrictEqual(bought, ['life', 'only']);
  await assert.rejects(run(offering(null, [])), /No product configured/);
});

test('nobody starts with Pro where the store sells it', () => {
  // A first launch offline would otherwise keep the planner until the store
  // answered; in 1.0, which sells nothing, everyone has it.
  const ps = declSource('prefStore');
  assert.match(ps, /pro = !rcPlugin\(\)/);
  const html = read('index.html');
  assert.ok(html.indexOf('const RC_KEYS') < html.indexOf('const prefStore'), 'RC_KEYS is declared before prefStore reads it');
  const { rcPlugin } = extract(['RC_KEYS', 'rcPlugin']);
  const saved = global.window;
  try {
    global.window = {};
    assert.strictEqual(!rcPlugin(), true, 'website: the preview gives it');
    global.window = { Capacitor: { getPlatform: () => 'ios', Plugins: { Purchases: {} } } };
    assert.strictEqual(!rcPlugin(), true, '1.0: no key, everyone has it');
    global.window.__TW_RC_KEY = 'appl_x';
    assert.strictEqual(!rcPlugin(), false, 'once sold, the store must say so');
  } finally {
    global.window = saved;
  }
});

test('the Xcode build number keeps the rule: under 100 while free, 100+ once Pro sells', () => {
  const { RC_KEYS, EARLY_BUILDS_BELOW } = extract(['RC_KEYS', 'EARLY_BUILDS_BELOW']);
  const pbx = read('native/ios/App/App.xcodeproj/project.pbxproj');
  const builds = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map(m => m[1].trim());
  assert.ok(builds.length >= 2, 'Debug and Release');
  assert.strictEqual(new Set(builds).size, 1, 'Debug and Release build the same number');
  assert.match(builds[0], /^\d+$/, 'a whole number, as the early-supporter rule reads it');
  const n = Number(builds[0]);
  if (RC_KEYS.ios) {
    assert.ok(n >= EARLY_BUILDS_BELOW, `Pro is sold, so Build must be ${EARLY_BUILDS_BELOW} or more (is ${n}): else every buyer reads as an early supporter`);
  } else {
    assert.ok(n >= 1 && n < EARLY_BUILDS_BELOW, `nothing is sold, so Build must stay under ${EARLY_BUILDS_BELOW} (is ${n}): else these people lose Pro later`);
  }
  // The app reads the build from the project, so the number above is the one uploaded.
  assert.match(read('native/ios/App/App/Info.plist'), /<key>CFBundleVersion<\/key>\s*<string>\$\(CURRENT_PROJECT_VERSION\)<\/string>/);
});

test('the plan and the release steps say the same numbers as the code', () => {
  const doc = read('docs/monetization.md');
  const { EARLY_BUILDS_BELOW } = extract(['EARLY_BUILDS_BELOW']);
  assert.ok(doc.includes(`\`EARLY_BUILDS_BELOW\` (${EARLY_BUILDS_BELOW})`));
  assert.ok(doc.includes(`Build ${EARLY_BUILDS_BELOW} or higher`));
  assert.ok(doc.includes('1.1 (100)'));
  assert.ok(doc.includes('entitlement named exactly `pro`'));
  assert.match(declSource('rcApply'), /active\.pro/, 'the entitlement the doc names');
  assert.match(read('native/README.md'), /under 100 while the app sells nothing/);
  assert.ok(read('CLAUDE.md').includes('docs/monetization.md'));
});
