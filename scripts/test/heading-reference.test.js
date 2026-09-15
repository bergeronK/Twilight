'use strict';
/*
 * Which north a heading is referenced to, and what gets added to correct it.
 *
 * CLAUDE.md's v1.5 note says the regression test should name all three
 * platform contracts, because the original Android bug came from testing only
 * the one combination Android never sends. The same applies to declination:
 * whether it is added depends entirely on which platform produced the
 * heading, and getting that wrong is invisible in the eastern US and 15-20
 * degrees out in Alaska or the Pacific Northwest.
 *
 * These tests drive the shipped event handler and the shipped headingCorr
 * expression, not restatements of them, so a change to either has to keep
 * the contracts true.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const { magneticDeclination } = extract([
  'D2R', 'R2D', 'sin', 'cos', 'asin', 'atan2',
  'WMM_EPOCH_YEARS', 'WMM_COF', 'wmmCache', 'wmmModel', 'magneticDeclination'
]);

/* The real orientation handler, with its closure dependencies injected. It
   mutates `sawAbsolute` across calls, so the wrapper returns a fresh listener
   each time with its own copy — one listener per simulated device. */
function makeListener() {
  const seen = [];
  const stats = { rel: 0, abs: 0, usable: 0, last: null };
  const fn = new Function(
    'setOrient', 'sensorStatsRef',
    declSource('sawAbsolute') + '\n' + declSource('orientHandler') + '\nreturn orientHandler;'
  )(o => seen.push(o), { current: stats });
  return { fire: e => fn(e), seen, stats, last: () => seen[seen.length - 1] };
}

/* The shipped correction expression. */
const headingCorrection = new Function(
  'orient', 'decl', 'aimOffset',
  declSource('headingCorr') + '\nreturn headingCorr;'
);

test('iOS webkitCompassHeading is true north and takes no declination', () => {
  const L = makeListener();
  L.fire({ type: 'deviceorientation', absolute: false, alpha: 12, beta: 80, gamma: 0, webkitCompassHeading: 40 });
  const o = L.last();
  assert.ok(o, 'an iOS event should produce a heading');
  assert.strictEqual(o.abs, true, 'webkitCompassHeading counts as absolute');
  assert.strictEqual(o.magnetic, false, 'iOS already applied declination — correcting again doubles it');
  // alpha is derived from the compass heading, not from e.alpha.
  assert.ok(Math.abs(o.alpha - 320) < 1e-9, `expected alpha 320 for heading 40, got ${o.alpha}`);
});

test('Android deviceorientationabsolute is magnetic north and needs declination', () => {
  const L = makeListener();
  L.fire({ type: 'deviceorientationabsolute', absolute: true, alpha: 100, beta: 80, gamma: 0 });
  const o = L.last();
  assert.ok(o, 'an Android absolute event should produce a heading');
  assert.strictEqual(o.abs, true);
  assert.strictEqual(o.magnetic, true, 'Android absolute yaw is magnetic-referenced');
});

test('the spec absolute:true path is treated as magnetic', () => {
  const L = makeListener();
  L.fire({ type: 'deviceorientation', absolute: true, alpha: 100, beta: 80, gamma: 0 });
  const o = L.last();
  assert.strictEqual(o.abs, true);
  assert.strictEqual(o.magnetic, true);
});

test('a relative heading is not treated as magnetic', () => {
  // A relative yaw has an arbitrary origin with no north in it at all, so
  // declination is meaningless there — the manual Align nudge is the fix.
  const L = makeListener();
  L.fire({ type: 'deviceorientation', absolute: false, alpha: 100, beta: 80, gamma: 0 });
  const o = L.last();
  assert.strictEqual(o.abs, false, 'plain deviceorientation without absolute is relative');
  assert.strictEqual(o.magnetic, false, 'declination cannot correct an arbitrary yaw origin');
});

test('once an absolute source speaks, the relative stream is ignored', () => {
  // Both fire on Android; letting the relative one through makes the heading
  // fight itself.
  const L = makeListener();
  L.fire({ type: 'deviceorientationabsolute', absolute: true, alpha: 100, beta: 80, gamma: 0 });
  const n = L.seen.length;
  L.fire({ type: 'deviceorientation', absolute: false, alpha: 250, beta: 80, gamma: 0 });
  assert.strictEqual(L.seen.length, n, 'a relative event after an absolute one must be dropped');
});

test('events carrying no angles are counted but produce no heading', () => {
  const L = makeListener();
  L.fire({ type: 'deviceorientation', absolute: false, alpha: null, beta: null, gamma: null });
  assert.strictEqual(L.seen.length, 0, 'an event with no angles must not set a heading');
  assert.strictEqual(L.stats.rel, 1, 'it should still be tallied — "arriving" and "carrying data" are different failures');
  assert.strictEqual(L.stats.usable, 0);
});

test('headingCorr adds declination only for a magnetic heading', () => {
  const decl = { deg: 14.9, stale: false };

  const magnetic = headingCorrection({ magnetic: true }, decl, 3);
  assert.ok(Math.abs(magnetic - 17.9) < 1e-9,
    `magnetic heading should get declination + nudge, got ${magnetic}`);

  const trueNorth = headingCorrection({ magnetic: false }, decl, 3);
  assert.ok(Math.abs(trueNorth - 3) < 1e-9,
    `a true-north heading should get the nudge only, got ${trueNorth}`);

  const noSensor = headingCorrection(null, decl, 3);
  assert.ok(Math.abs(noSensor - 3) < 1e-9,
    `with no sensor the nudge alone should apply, got ${noSensor}`);
});

test('headingCorr carries the declination sign through unchanged', () => {
  // West-negative must stay negative all the way to the correction, or the
  // error doubles instead of cancelling.
  const west = headingCorrection({ magnetic: true }, { deg: -12.5, stale: false }, 0);
  assert.ok(Math.abs(west - -12.5) < 1e-9, `westerly declination should stay negative, got ${west}`);
  const east = headingCorrection({ magnetic: true }, { deg: 14.9, stale: false }, 0);
  assert.ok(east > 0, `easterly declination should stay positive, got ${east}`);
});

test('the correction is what turns a magnetic bearing into a true one', () => {
  // End to end, at a place where it actually matters: Seattle is ~15 deg east,
  // so a compass reading 0 is really pointing about 15 deg east of true north.
  const seattle = magneticDeclination(47.6062, -122.3321, new Date());
  const corr = headingCorrection({ magnetic: true }, seattle, 0);
  const trueBearing = (0 + corr + 360) % 360;
  assert.ok(
    trueBearing > 10 && trueBearing < 20,
    `a magnetic north reading in Seattle should be ~15 deg true, got ${trueBearing.toFixed(1)}`
  );
  // And in New York, west declination, the same reading is a bearing under 360.
  const nyc = magneticDeclination(40.7128, -74.0060, new Date());
  const nycTrue = (0 + headingCorrection({ magnetic: true }, nyc, 0) + 360) % 360;
  assert.ok(nycTrue > 340 && nycTrue < 355, `New York should read ~347 deg true, got ${nycTrue.toFixed(1)}`);
});
