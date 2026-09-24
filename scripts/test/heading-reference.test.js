'use strict';
/*
 * The real orientation event handler, driven with synthetic events from each
 * platform, and the heading correction applied to its output.
 *
 * CLAUDE.md's v1.5 note says a sensor regression test has to name all three
 * platform contracts, because the original Android bug came from testing only
 * the one combination Android never sends. These drive the shipped handler
 * and the shipped correction expression, not restatements of them.
 *
 * The contracts, as this handler now treats them:
 *   iOS Safari   — `deviceorientation` with a relative alpha and a
 *                  webkitCompassHeading. Attitude from the angles, north
 *                  from the heading. Treated as MAGNETIC north (four field
 *                  readings, fusion.test.js IPHONE).
 *   Android      — plain `deviceorientation` is relative (gyro-based) and
 *                  drives the view; `deviceorientationabsolute` is
 *                  magnetometer-referenced and supplies north.
 *   Spec         — `deviceorientation` with absolute: true, handled as
 *                  absolute, magnetic.
 * The previous handler discarded Android's relative stream once the absolute
 * one appeared. It is now the stream on screen, because it is the smooth one.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');
const O = require('./orient-lib.js');
const { angErr } = O;

const { magneticDeclination } = extract([
  'D2R', 'R2D', 'sin', 'cos', 'asin', 'atan2',
  'WMM_EPOCH_YEARS', 'WMM_COF', 'wmmCache', 'wmmModel', 'magneticDeclination'
]);

/* The shipped handler with its closure dependencies injected — one listener
   per simulated device. lastEmitRef starts far in the past so the first
   publish is never throttled; `clock` lets a test step time forward. */
function makeListener() {
  const seen = [];
  const stats = { rel: 0, abs: 0, usable: 0, last: null };
  const fusionRef = { current: O.FUSION_INIT };
  const lastEmitRef = { current: -1e9 };
  const clock = { now: 1e6 };
  const deps = {
    setOrient: o => seen.push(o),
    sensorStatsRef: { current: stats },
    fusionRef, lastEmitRef,
    FUSION_INIT: O.FUSION_INIT,
    ORIENT_MIN_MS: O.ORIENT_MIN_MS,
    quatFromEuler: O.quatFromEuler,
    fuseOrientation: O.fuseOrientation,
    fusedView: O.fusedView,
    Date: { now: () => clock.now }
  };
  const names = Object.keys(deps);
  const fn = new Function(...names, declSource('orientHandler') + '\nreturn orientHandler;')(
    ...names.map(n => deps[n])
  );
  return {
    fire: e => fn(e),
    tick: ms => { clock.now += ms; },
    seen, stats, fusionRef,
    last: () => seen[seen.length - 1]
  };
}

// The shipped correction expression.
const headingCorrection = new Function(
  'orient', 'decl', 'aimOffset',
  declSource('headingCorr') + '\nreturn headingCorr;'
);

const ev = (type, absolute, a, b, g, extra) =>
  Object.assign({ type, absolute, alpha: a, beta: b, gamma: g }, extra || {});
const aimAz = o => O.aimOf(o.q).az;

// ---------------------------------------------------------------- the three contracts

test('iOS: the compass heading supplies north, magnetic, for declination to correct', () => {
  const L = makeListener();
  // Upright, relative alpha arbitrary; the camera actually faces 40.
  L.fire(ev('deviceorientation', false, 12, 90, 0, { webkitCompassHeading: 40, webkitCompassAccuracy: 8 }));
  const o = L.last();
  assert.ok(o, 'an iOS event should produce a view');
  assert.strictEqual(o.abs, true, 'a compass heading means north is known');
  assert.strictEqual(o.magnetic, true, 'iPhone headings read as magnetic in the field (fusion.test.js, IPHONE)');
  assert.strictEqual(o.acc, 8, 'compass accuracy passes through for the calibration hint');
  assert.ok(angErr(aimAz(o), 40) < 1e-9, `camera should read 40, got ${aimAz(o)}`);
});

test('iOS: tipping back to look at the sky keeps the bearing', () => {
  // Measured on an iPhone: the heading is the bearing of the camera, and so
  // does not reverse as the phone tips past vertical.
  const L = makeListener();
  for (const beta of [50, 110, 140]) {
    const truth = O.quatFromEuler(300, beta, 0);          // camera faces 60 once raised
    const heading = O.aimOf(truth).az;
    // Relative alpha is offset from true by an arbitrary 75.
    for (let i = 0; i < 80; i++) {
      L.tick(20);
      L.fire(ev('deviceorientation', false, (300 + 75) % 360, beta, 0, { webkitCompassHeading: heading }));
    }
  }
  const o = L.last();
  assert.ok(angErr(aimAz(o), O.aimOf(O.quatFromEuler(300, 140, 0)).az) < 0.01,
    `after tipping past vertical the camera bearing is wrong: ${aimAz(o)}`);
});

test('Android: the absolute stream alone gives a magnetic view', () => {
  const L = makeListener();
  L.fire(ev('deviceorientationabsolute', true, 100, 80, 0));
  const o = L.last();
  assert.ok(o);
  assert.strictEqual(o.abs, true);
  assert.strictEqual(o.magnetic, true, 'Android absolute yaw is magnetometer-referenced');
  assert.strictEqual(o.frame, 'abs');
});

test('Android: with both streams, the relative one is on screen', () => {
  const L = makeListener();
  // Same pose; the relative stream's yaw origin is 50 degrees off.
  L.fire(ev('deviceorientationabsolute', true, 100, 110, 0));
  L.tick(20);
  L.fire(ev('deviceorientation', false, 150, 110, 0));
  const o = L.last();
  assert.strictEqual(o.frame, 'rel', 'the gyro stream should drive the view');
  assert.strictEqual(o.abs, true, 'but north should still be known');
  assert.strictEqual(o.magnetic, true);
  assert.ok(angErr(aimAz(o), O.aimOf(O.quatFromEuler(100, 110, 0)).az) < 1e-9,
    'the view should sit where the absolute stream says, not where the relative origin is');
});

test('the spec absolute:true path is treated as absolute and magnetic', () => {
  const L = makeListener();
  L.fire(ev('deviceorientation', true, 100, 80, 0));
  const o = L.last();
  assert.strictEqual(o.abs, true);
  assert.strictEqual(o.magnetic, true);
});

test('a relative stream alone is shown but claims no north', () => {
  const L = makeListener();
  L.fire(ev('deviceorientation', false, 100, 80, 0));
  const o = L.last();
  assert.strictEqual(o.abs, false, 'plain deviceorientation without absolute is relative');
  assert.strictEqual(o.magnetic, false, 'declination cannot correct an arbitrary yaw origin');
});

test('events carrying no angles are counted but produce no view', () => {
  const L = makeListener();
  L.fire(ev('deviceorientation', false, null, null, null));
  assert.strictEqual(L.seen.length, 0);
  assert.strictEqual(L.stats.rel, 1, '"arriving" and "carrying data" are different failures');
  assert.strictEqual(L.stats.usable, 0);
});

test('a compass heading with no angles is counted as usable but places nothing', () => {
  // iOS can deliver a heading before the angles; there is no rotation yet.
  const L = makeListener();
  L.fire(ev('deviceorientation', false, null, null, null, { webkitCompassHeading: 90 }));
  assert.strictEqual(L.seen.length, 0);
  assert.strictEqual(L.stats.usable, 1);
});

// ---------------------------------------------------------------- publishing

test('a burst inside the throttle window publishes once but loses nothing', () => {
  const L = makeListener();
  L.fire(ev('deviceorientationabsolute', true, 0, 110, 0));
  const first = L.seen.length;
  for (let i = 0; i < 20; i++) L.fire(ev('deviceorientationabsolute', true, 90, 110, 0));
  assert.strictEqual(L.seen.length, first, 'no time has passed, so nothing more should publish');
  // The fusion state kept advancing regardless.
  const settled = O.aimOf(O.fusedView(L.fusionRef.current).q).az;
  const target = O.aimOf(O.quatFromEuler(90, 110, 0)).az;
  assert.ok(angErr(settled, target) < 1, `filter should have converged near ${target}, sat at ${settled}`);
  // And the next publish carries it.
  L.tick(O.ORIENT_MIN_MS + 1);
  L.fire(ev('deviceorientationabsolute', true, 90, 110, 0));
  assert.strictEqual(L.seen.length, first + 1);
  assert.ok(angErr(aimAz(L.last()), target) < 1);
});

test('gaining north publishes immediately, whatever the throttle says', () => {
  const L = makeListener();
  L.fire(ev('deviceorientation', false, 10, 110, 0));
  assert.strictEqual(L.last().abs, false);
  const n = L.seen.length;
  // No time passes — but this changes what the view means.
  L.fire(ev('deviceorientationabsolute', true, 200, 110, 0));
  assert.strictEqual(L.seen.length, n + 1, 'the first north-referenced view must not wait');
  assert.strictEqual(L.last().abs, true);
});

test('diagnostics fields are published', () => {
  const L = makeListener();
  L.fire(ev('deviceorientationabsolute', true, 100, 110, 0));
  L.tick(20);
  L.fire(ev('deviceorientation', false, 150, 110, 0));
  const o = L.last();
  assert.ok('frame' in o && 'yaw' in o && 'haveRel' in o, 'Sensor details needs frame, yaw and haveRel');
  assert.strictEqual(o.haveRel, true);
  assert.ok(Number.isFinite(o.yaw));
});

// ---------------------------------------------------------------- the correction

test('headingCorr adds declination only for a magnetic view', () => {
  const decl = { deg: 14.9, stale: false };
  assert.ok(Math.abs(headingCorrection({ magnetic: true }, decl, 3) - 17.9) < 1e-9);
  assert.ok(Math.abs(headingCorrection({ magnetic: false }, decl, 3) - 3) < 1e-9);
  assert.ok(Math.abs(headingCorrection(null, decl, 3) - 3) < 1e-9);
});

test('headingCorr carries the declination sign through unchanged', () => {
  const west = headingCorrection({ magnetic: true }, { deg: -12.5, stale: false }, 0);
  assert.ok(Math.abs(west - -12.5) < 1e-9);
  assert.ok(headingCorrection({ magnetic: true }, { deg: 14.9, stale: false }, 0) > 0);
});

test('end to end: an Android view in Seattle is turned from magnetic to true', () => {
  // Seattle's declination is ~15 deg east: a compass saying "north" is really
  // pointing about 15 deg east of true north.
  const L = makeListener();
  L.fire(ev('deviceorientationabsolute', true, 0, 90, 0));   // magnetic north, upright
  const o = L.last();
  const seattle = magneticDeclination(47.6062, -122.3321, new Date());
  const corrected = O.aimOf(O.correctView(o.q, headingCorrection(o, seattle, 0))).az;
  assert.ok(corrected > 10 && corrected < 20, `expected ~15 deg true, got ${corrected.toFixed(1)}`);
});

test('end to end: an iOS view in Holyoke is turned from magnetic to true', () => {
  // The field case: the phone's camera on the Moon at true az 152.7, the
  // heading 168; declination 13.3 W takes it to 154.7.
  const L = makeListener();
  L.fire(ev('deviceorientation', false, 351.5, 121.2, -6.4, { webkitCompassHeading: 168 }));
  const o = L.last();
  const here = magneticDeclination(42.09, -72.62, new Date('2026-09-24T01:09:00Z'));
  const corrected = O.aimOf(O.correctView(o.q, headingCorrection(o, here, 0))).az;
  assert.ok(Math.abs(corrected - 152.7) < 4, `corrected to ${corrected.toFixed(1)}, the Moon was at 152.7`);
});

test('iOS: a heading marked invalid by the phone does not move north', () => {
  // iOS reports a negative webkitCompassAccuracy when the heading cannot be
  // trusted. That flag has to survive the trip from the event to the fusion.
  const L = makeListener();
  const flat = O.quatFromEuler(30, 20, 0);
  const good = O.vecAz(O.quatRotate(flat, [0, 1, 0]));
  for (let i = 0; i < 10; i++) {
    L.tick(20);
    L.fire(ev('deviceorientation', false, 30, 20, 0, { webkitCompassHeading: good, webkitCompassAccuracy: 5 }));
  }
  const yaw = L.fusionRef.current.yaw;
  for (let i = 0; i < 200; i++) {
    L.tick(20);
    L.fire(ev('deviceorientation', false, 30, 20, 0, { webkitCompassHeading: (good + 40) % 360, webkitCompassAccuracy: -1 }));
  }
  assert.ok(angErr(L.fusionRef.current.yaw, yaw) < 1e-9,
    `invalid headings moved north from ${yaw} to ${L.fusionRef.current.yaw}`);
  assert.strictEqual(L.last().acc, -1, 'the accuracy is still published for the calibration hint');
});

test('iOS: pointing at the sky does not move a north learned while flat', () => {
  // The reported bug, through the real handler: raise the phone past
  // vertical with a heading that follows the camera, as the iPhone's appears
  // to, and the view must keep its bearing.
  const L = makeListener();
  const fire = (beta, heading) => { L.tick(20); L.fire(ev('deviceorientation', false, 0, beta, 0, { webkitCompassHeading: heading, webkitCompassAccuracy: 5 })); };
  for (let i = 0; i < 20; i++) fire(30, 0);   // screen up, facing north
  // Raise it to the zenith with a heading that follows the camera (still 0)...
  for (let b = 30; b <= 170; b += 2) fire(b, 0);
  // ...and again with one that follows the top of the phone, which points
  // south (180) once past vertical. Either way the camera faces north.
  for (let b = 100; b <= 170; b += 2) fire(b, 180);
  const o = L.last();
  assert.ok(o.trusted, 'north should still be the confirmed one');
  assert.ok(angErr(O.aimOf(o.q).az, 0) < 1e-6, `camera bearing drifted to ${O.aimOf(o.q).az}`);
});
