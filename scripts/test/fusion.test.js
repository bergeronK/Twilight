'use strict';
/*
 * Orientation fusion: smooth attitude from the gyro-based stream, north from
 * the compass, combined by estimating one slowly varying yaw offset.
 *
 * Each scenario below is a real situation from one of the three platform
 * contracts, simulated with a known true pose so the answer can be checked
 * exactly. The iOS past-vertical case is the one that motivated this design:
 * substituting a top-of-device compass heading for alpha puts the view 180
 * degrees out as soon as the phone tips back to look at the sky.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const O = require('./orient-lib.js');
const { angErr, rng } = O;

const run = (samples, state = O.FUSION_INIT) => samples.reduce(O.fuseOrientation, state);
const repeat = (n, s) => Array.from({ length: n }, () => s);
// The same physical pose, but with the yaw origin shifted — what a relative
// stream reports.
const relOf = (truth, offset) => O.quatMul(O.yawQ(offset), truth);
// A CoreLocation-style heading: the bearing of the top of the device.
const topHeading = q => O.vecAz(O.quatRotate(q, [0, 1, 0]));

function aimErr(state, truth) {
  const v = O.fusedView(state);
  const a = O.aimOf(v.q), t = O.aimOf(truth);
  return { az: t.stable ? angErr(a.az, t.az) : 0, alt: Math.abs(a.alt - t.alt), view: v };
}

// ---------------------------------------------------------------- smoothAngle / slerp

test('smoothAngle eases part way and takes the short way round north', () => {
  assert.ok(Math.abs(O.smoothAngle(0, 100, 0.25) - 25) < 1e-9);
  const across = O.smoothAngle(350, 10, 0.5);
  assert.ok(angErr(across, 0) < 1e-9, `350 -> 10 halfway should be 0, got ${across}`);
  assert.strictEqual(O.smoothAngle(null, 137, 0.25), 137, 'no history adopts the sample');
  assert.strictEqual(O.smoothAngle(null, -20, 1), 340, 'and normalises it into [0,360)');
});

test('slerp stays on the unit sphere and hits both endpoints', () => {
  const rand = rng(7);
  for (let i = 0; i < 500; i++) {
    const a = O.quatFromEuler(rand() * 360, rand() * 360 - 180, rand() * 180 - 90);
    const b = O.quatFromEuler(rand() * 360, rand() * 360 - 180, rand() * 180 - 90);
    for (const t of [0, 0.3, 0.5, 1]) {
      const q = O.quatSlerp(a, b, t);
      assert.ok(Math.abs(Math.hypot(...q) - 1) < 1e-9, 'slerp must stay unit length');
    }
    const end = O.aimOf(O.quatSlerp(a, b, 1)), want = O.aimOf(b);
    assert.ok(Math.abs(end.alt - want.alt) < 1e-6);
  }
});

test('slerp takes the short way even when the quaternions have opposite sign', () => {
  // q and -q are the same rotation. Interpolating from q to -q must not move.
  const q = O.quatFromEuler(40, 100, 10);
  const neg = q.map(x => -x);
  const mid = O.quatSlerp(q, neg, 0.5);
  const a = O.aimOf(mid), b = O.aimOf(q);
  assert.ok(angErr(a.az, b.az) < 1e-9 && Math.abs(a.alt - b.alt) < 1e-9,
    'interpolating between a rotation and its double must stay put');
});

// ---------------------------------------------------------------- platform contracts

test('Android: the gyro stream drives the view, the compass supplies north', () => {
  const truth = O.quatFromEuler(20, 135, 0);
  const s = run([].concat(...repeat(5, [
    { kind: 'rel', q: relOf(truth, -73) },
    { kind: 'abs', q: truth, magnetic: true }
  ])));
  const e = aimErr(s, truth);
  assert.ok(e.az < 1e-9 && e.alt < 1e-9, `fused aim off by az ${e.az} alt ${e.alt}`);
  assert.strictEqual(s.frame, 'rel', 'the smooth stream should be the one on screen');
  assert.strictEqual(e.view.abs, true);
  assert.strictEqual(e.view.magnetic, true, 'Android north is magnetic');
});

test('Android: magnetometer jitter barely moves the view', () => {
  // The whole reason for fusion. A steady phone, a compass wobbling +/-8 deg.
  const truth = O.quatFromEuler(60, 120, 0);
  const rand = rng(5);
  let s = run([{ kind: 'rel', q: relOf(truth, 30) }, { kind: 'abs', q: truth, magnetic: true }]);
  let worst = 0;
  for (let i = 0; i < 300; i++) {
    const noisy = O.quatMul(O.yawQ((rand() - 0.5) * 16), truth);
    s = O.fuseOrientation(s, { kind: 'rel', q: relOf(truth, 30) });
    s = O.fuseOrientation(s, { kind: 'abs', q: noisy, magnetic: true });
    if (i > 50) worst = Math.max(worst, aimErr(s, truth).az);
  }
  assert.ok(worst < 2, `a +/-8 deg compass wobble moved the view by up to ${worst.toFixed(2)} deg`);
});

test('Android: a device with only an absolute stream still works', () => {
  const truth = O.quatFromEuler(200, 95, 3);
  const s = run([{ kind: 'abs', q: truth, magnetic: true }]);
  assert.strictEqual(s.frame, 'abs');
  assert.ok(aimErr(s, truth).az < 1e-9);
  assert.strictEqual(O.fusedView(s).magnetic, true);
});

test('Android: a relative stream arriving after an absolute one causes no jump', () => {
  const truth = O.quatFromEuler(110, 125, 0);
  let s = run([{ kind: 'abs', q: truth, magnetic: true }]);
  const before = O.aimOf(O.fusedView(s).q);
  s = O.fuseOrientation(s, { kind: 'rel', q: relOf(truth, 57) });
  const after = O.aimOf(O.fusedView(s).q);
  assert.ok(angErr(before.az, after.az) < 1e-9, `switching streams moved the view ${angErr(before.az, after.az)} deg`);
  assert.strictEqual(s.frame, 'rel');
});

test('relative only: the view is shown but claims no north', () => {
  const s = run([{ kind: 'rel', q: O.quatFromEuler(10, 90, 0) }]);
  const v = O.fusedView(s);
  assert.strictEqual(v.abs, false, 'a relative yaw origin is not north');
  assert.strictEqual(v.magnetic, false, 'no north means no declination either');
});

test('iOS: the view stays right as the phone tips back past vertical', () => {
  // The regression this design exists for. The heading tracks the top of the
  // device, which reverses direction past vertical; the camera does not.
  const offset = -137;
  let s = O.FUSION_INIT;
  for (const beta of [10, 40, 80, 100, 120, 135, 150, 165]) {
    const truth = O.quatFromEuler(30, beta, 0);
    const heading = topHeading(truth);
    s = run(repeat(60, { kind: 'heading', q: relOf(truth, offset), heading, trueNorth: true }), s);
    const e = aimErr(s, truth);
    assert.ok(e.az < 1e-6, `beta ${beta}: view off by ${e.az.toFixed(3)} deg (top heading ${heading.toFixed(0)})`);
  }
});

test('iOS: the old substitution really was 180 degrees out', () => {
  // Pins the diagnosis: replacing alpha with 360 - heading and keeping the
  // event's beta, the way the app used to, aims the wrong way past vertical.
  const truth = O.quatFromEuler(0, 135, 0);
  const oldWay = O.quatFromEuler((360 - topHeading(truth)) % 360, 135, 0);
  assert.ok(angErr(O.aimOf(oldWay).az, O.aimOf(truth).az) > 179,
    'the old substitution should be ~180 deg out here');
});

test('iOS: upright from the first sample still gets a usable north', () => {
  // No flat phase to learn from: the camera axis is used as a first guess.
  const truth = O.quatFromEuler(250, 90, 0);
  const cameraHeading = O.aimOf(truth).az;
  const s = run([{ kind: 'heading', q: relOf(truth, 44), heading: cameraHeading, trueNorth: true }]);
  assert.ok(aimErr(s, truth).az < 1e-9, 'a camera-axis heading while upright should be accepted');
  assert.strictEqual(O.fusedView(s).magnetic, false, 'iOS heading is treated as true north');
});

test('iOS: while upright, an unreliable top heading does not disturb an estimate', () => {
  const truth = O.quatFromEuler(30, 45, 0);
  let s = run(repeat(60, { kind: 'heading', q: relOf(truth, 12), heading: topHeading(truth), trueNorth: true }));
  const yaw = s.yaw;
  // Upright: the top points at the sky and its "heading" is noise.
  const upright = O.quatFromEuler(30, 90, 0);
  s = run(repeat(60, { kind: 'heading', q: relOf(upright, 12), heading: 311, trueNorth: true }), s);
  assert.ok(angErr(s.yaw, yaw) < 1e-9, `the estimate drifted from ${yaw} to ${s.yaw} on garbage headings`);
});

test('iOS: a session that starts already looking up is right from the first reading', () => {
  // Past vertical the top of the phone points away from the camera. If the
  // first heading were compared against the camera axis here, north would
  // start 180 degrees out.
  const truth = O.quatFromEuler(20, 140, 0);
  const s = run([{ kind: 'heading', q: relOf(truth, 33), heading: topHeading(truth), trueNorth: true }]);
  assert.ok(aimErr(s, truth).az < 1e-9, `first reading past vertical is off by ${aimErr(s, truth).az} deg`);
});

test('iOS: the north estimate keeps following the compass', () => {
  // An estimate learned once and then frozen would never recover from a
  // compass that recalibrates, or from a poor first reading.
  let s = O.FUSION_INIT;
  const truth = O.quatFromEuler(20, 45, 0);
  s = run(repeat(30, { kind: 'heading', q: relOf(truth, 0), heading: topHeading(truth), trueNorth: true }), s);
  // The relative frame now drifts 25 degrees (gyro drift), compass unchanged.
  s = run(repeat(400, { kind: 'heading', q: relOf(truth, 25), heading: topHeading(truth), trueNorth: true }), s);
  assert.ok(aimErr(s, truth).az < 0.05, `estimate failed to follow the drift: off by ${aimErr(s, truth).az} deg`);
});

test('the north estimate settles smoothly rather than snapping', () => {
  const truth = O.quatFromEuler(0, 120, 0);
  let s = run([{ kind: 'rel', q: truth }, { kind: 'abs', q: truth, magnetic: true }]);
  assert.ok(angErr(s.yaw, 0) < 1e-9);
  // The compass now puts the camera 20 deg further round (a recalibration,
  // say). yawQ(psi) lowers azimuths by psi, so the offset that maps the
  // relative frame onto this one is -20, i.e. 340.
  const shifted = O.quatMul(O.yawQ(-20), truth);
  s = O.fuseOrientation(s, { kind: 'abs', q: shifted, magnetic: true });
  const step = angErr(s.yaw, 0);
  assert.ok(step > 0 && step < 2, `one noisy sample should nudge north slightly, moved ${step}`);
  s = run(repeat(400, { kind: 'abs', q: shifted, magnetic: true }), s);
  assert.ok(angErr(s.yaw, 340) < 0.01, `and a persistent change should win eventually, sat at ${s.yaw}`);
  assert.ok(angErr(O.aimOf(O.fusedView(s).q).az, O.aimOf(shifted).az) < 0.01,
    'the view should now agree with the compass');
});

// ---------------------------------------------------------------- the singularity

test('at beta = 90, contradictory angle splits describe one steady view', () => {
  // Only alpha + gamma is defined there, and browsers split it differently
  // from one event to the next. The fused view must not care.
  let s = O.FUSION_INIT, worst = 0;
  const steady = O.quatFromEuler(40, 90, 0);
  for (let i = 0; i < 200; i++) {
    const split = i % 2 ? 60 : -60;
    s = O.fuseOrientation(s, { kind: 'abs', q: O.quatFromEuler(40 + split, 90, -split), magnetic: true });
    worst = Math.max(worst, aimErr(s, steady).az);
  }
  assert.ok(worst < 1e-6, `contradictory splits wobbled the view by ${worst} deg`);
});

test('rolling past gamma = 90 does not throw the view across the sky', () => {
  // The case that actually breaks angle-by-angle filtering. gamma is limited
  // to [-90, 90), so as the phone rolls past 90 the browser has to switch to
  // the other way of writing the same rotation: (a, b, g) becomes
  // (a + 180, 180 - b, g - 180). Two samples a fifth of a degree apart
  // physically then differ by 180 in two of their angles.
  const P = [30, 60, 89.9], Q = [210, 120, -89.9];
  const qa = O.quatFromEuler(...P), qb = O.quatFromEuler(...Q);
  const apart = (x, y) =>
    Math.acos(Math.min(1, Math.abs(x.reduce((acc, v, i) => acc + v * y[i], 0)))) * 360 / Math.PI;
  assert.ok(apart(qa, qb) < 0.5, 'the two samples really are nearly the same pose');

  // Filtering the angles one at a time — what the previous version did —
  // passes through a pose the phone was never in.
  const perAngle = O.quatFromEuler(O.smoothAngle(P[0], Q[0], 0.5), (P[1] + Q[1]) / 2, (P[2] + Q[2]) / 2);
  assert.ok(apart(perAngle, qa) > 90, `per-angle midpoint should be far off, was ${apart(perAngle, qa)}`);

  // The fusion step does not.
  let s = O.fuseOrientation(O.FUSION_INIT, { kind: 'abs', q: qa, magnetic: true });
  let worst = 0;
  for (let i = 0; i < 50; i++) {
    s = O.fuseOrientation(s, { kind: 'abs', q: i % 2 ? qb : qa, magnetic: true });
    worst = Math.max(worst, apart(O.fusedView(s).q, qa));
  }
  assert.ok(worst < 0.5, `fused view strayed ${worst.toFixed(2)} deg across the switch`);
});

test('at beta = 90 alone, per-angle filtering happened to be safe', () => {
  // Recorded so nobody re-derives the wrong reason for this design. With
  // alpha eased along the short arc and gamma linearly, alpha + gamma is
  // preserved whenever the gamma step is under 180 — always, given its range.
  // The singularity was not what broke the old filter; the switch above was.
  const a1 = [100, 90, -60], a2 = [-20, 90, 60];
  const perAngle = O.quatFromEuler(O.smoothAngle(a1[0], a2[0], 0.5), 90, (a1[2] + a2[2]) / 2);
  const truth = O.aimOf(O.quatFromEuler(40, 90, 0));
  assert.ok(angErr(O.aimOf(perAngle).az, truth.az) < 1e-9);
});

// ---------------------------------------------------------------- tuning

test('the attitude filter responds fast enough to aim with', () => {
  const from = O.quatFromEuler(0, 90, 0), to = O.quatFromEuler(90, 90, 0);
  let q = from, steps = 0;
  while (angErr(O.aimOf(q).az, O.aimOf(to).az) > 9 && steps < 1000) {
    q = O.quatSlerp(q, to, O.ORIENT_SMOOTH);
    steps++;
  }
  assert.ok(steps <= 10, `took ${steps} events to close 90% of a turn — too sluggish`);
});

test('tuning constants are in sensible ranges', () => {
  assert.ok(O.ORIENT_SMOOTH > 0 && O.ORIENT_SMOOTH < 1);
  assert.ok(O.NORTH_SMOOTH > 0 && O.NORTH_SMOOTH < O.ORIENT_SMOOTH,
    'north should be filtered harder than attitude — that is the point');
  assert.ok(O.ORIENT_MIN_MS > 0 && O.ORIENT_MIN_MS <= 33);
  assert.ok(O.NORTH_MIN_HORIZ > 0 && O.NORTH_MIN_HORIZ < 1);
});
