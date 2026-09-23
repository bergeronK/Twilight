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
  // The regression this design exists for. Measured on an iPhone: the
  // reported heading is the bearing of the camera, which does not reverse as
  // the phone tips past vertical — the top of the device does.
  const offset = -137;
  let s = O.FUSION_INIT;
  for (const beta of [40, 80, 100, 120, 135, 150]) {
    const truth = O.quatFromEuler(30, beta, 0);
    const heading = O.aimOf(truth).az;
    s = run(repeat(60, { kind: 'heading', q: relOf(truth, offset), heading, trueNorth: true }), s);
    const e = aimErr(s, truth);
    assert.ok(e.az < 1e-6, `beta ${beta}: view off by ${e.az.toFixed(3)} deg (camera heading ${heading.toFixed(0)})`);
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

test('iOS: a heading read while the phone lies flat is ignored', () => {
  // Flat, the camera points at the ground and its bearing is meaningless, so
  // whatever the compass says there must not move an estimate already held.
  const truth = O.quatFromEuler(30, 80, 0);
  let s = run(repeat(60, { kind: 'heading', q: relOf(truth, 12), heading: O.aimOf(truth).az, trueNorth: true }));
  const yaw = s.yaw;
  const flat = O.quatFromEuler(30, 8, 0);
  s = run(repeat(60, { kind: 'heading', q: relOf(flat, 12), heading: 311, trueNorth: true }), s);
  assert.ok(angErr(s.yaw, yaw) < 1e-9, `the estimate drifted from ${yaw} to ${s.yaw} on a flat-phone heading`);
});

test('iOS: a session that starts flat claims no north until the phone is raised', () => {
  // Flat, the camera bearing is undefined, so nothing is claimed and the
  // view says it is still finding north.
  const flatStart = O.quatFromEuler(20, 6, 0);
  let s = run([{ kind: 'heading', q: relOf(flatStart, 33), heading: 123, trueNorth: true }]);
  assert.strictEqual(O.fusedView(s).abs, false, 'no north should be claimed with the phone flat');
  assert.strictEqual(s.northKind, 'heading');
  // Raising it establishes north.
  const flat = O.quatFromEuler(20, 100, 0);
  s = run(repeat(5, { kind: 'heading', q: relOf(flat, 33), heading: O.aimOf(flat).az, trueNorth: true }), s);
  const v = O.fusedView(s);
  assert.strictEqual(v.abs, true);
  assert.strictEqual(v.trusted, true);
  assert.ok(aimErr(s, flat).az < 1e-9);
  // And lowering it flat again keeps it, whatever the compass says down there.
  const backDown = O.quatFromEuler(20, 6, 0);
  s = run(repeat(60, { kind: 'heading', q: relOf(backDown, 33), heading: 271, trueNorth: true }), s);
  s = run(repeat(1, { kind: 'heading', q: relOf(flat, 33), heading: O.aimOf(flat).az, trueNorth: true }), s);
  assert.ok(aimErr(s, flat).az < 1e-9, 'a flat-phone heading must not move a confirmed north');
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

// ---------------------------------------------------------------- the tilt-up bug (reported on iPhone)

/* Sweep a phone smoothly from low to the zenith and back, facing north, with
   noisy headings, and report the worst bearing error on screen. `headingOf`
   decides what iOS reports — the point being that the answer must be right
   whichever it is. */
function sweep(headingOf, seed = 3) {
  const rand = rng(seed);
  let s = O.FUSION_INIT, worst = 0;
  const betas = [];
  for (let b = 40; b <= 175; b += 0.5) betas.push(b);
  for (let b = 175; b >= 40; b -= 0.5) betas.push(b);
  for (const b of betas) {
    const truth = O.quatFromEuler(0, b, 0);
    const h = (headingOf(truth, b, rand) + (rand() - 0.5) * 6 + 360) % 360;
    s = O.fuseOrientation(s, { kind: 'heading', q: relOf(truth, -40), heading: h, trueNorth: true });
    const v = O.fusedView(s);
    if (!v.abs) continue;
    const t = O.aimOf(truth);
    if (t.stable) worst = Math.max(worst, angErr(O.aimOf(v.q).az, t.az));
  }
  return worst;
}
const camHeading = q => O.aimOf(q).az;

test('iPhone: raising and lowering the phone does not throw north round', () => {
  // The reported bug, now with the heading the iPhone actually reports: the
  // bearing of the camera, in every posture. Sweeping up and down with 6
  // degrees of compass noise, the view must hold its bearing throughout.
  const worst = sweep(q => camHeading(q));
  assert.ok(worst < 4, `raising and lowering the phone put the view ${worst.toFixed(1)} deg out`);
});

test('iPhone: an unusable heading (negative accuracy) is ignored', () => {
  const truth = O.quatFromEuler(10, 30, 0);
  let s = run(repeat(10, { kind: 'heading', q: relOf(truth, 0), heading: topHeading(truth), trueNorth: true }));
  const yaw = s.yaw;
  s = run(repeat(200, { kind: 'heading', q: relOf(truth, 0), heading: 77, trueNorth: true, acc: -1 }), s);
  assert.ok(angErr(s.yaw, yaw) < 1e-9, 'a heading iOS marks invalid must not move north');
});

// ---------------------------------------------------------------- the jump gate

test('a heading 180 degrees out never makes north spin', () => {
  // Blending across a near-180 gap has no well-defined direction: with noise,
  // "the short way round" flips each sample. The gate refuses to blend it.
  const truth = O.quatFromEuler(0, 110, 0);
  const rand = rng(11);
  let s = run([{ kind: 'rel', q: truth }, { kind: 'abs', q: truth, magnetic: true }]);
  let worst = 0;
  for (let i = 0; i < 30; i++) {       // fewer than NORTH_JUMP_SAMPLES
    const flipped = O.quatMul(O.yawQ(180 + (rand() - 0.5) * 20), truth);
    s = O.fuseOrientation(s, { kind: 'abs', q: flipped, magnetic: true });
    worst = Math.max(worst, angErr(s.yaw, 0));
  }
  assert.ok(worst < 1e-9, `north moved ${worst} deg on a brief 180-degree disagreement`);
});

test('an inconsistent run of wild samples is never adopted', () => {
  const truth = O.quatFromEuler(0, 110, 0);
  const rand = rng(12);
  let s = run([{ kind: 'rel', q: truth }, { kind: 'abs', q: truth, magnetic: true }]);
  for (let i = 0; i < 500; i++) {
    const wild = O.quatMul(O.yawQ(90 + rand() * 180), truth);   // all over the place
    s = O.fuseOrientation(s, { kind: 'abs', q: wild, magnetic: true });
  }
  assert.ok(angErr(s.yaw, 0) < 1e-9, `north drifted to ${s.yaw} on samples that never agreed`);
});

test('a large change that persists is adopted, after a delay, in one step', () => {
  const truth = O.quatFromEuler(0, 110, 0);
  let s = run([{ kind: 'rel', q: truth }, { kind: 'abs', q: truth, magnetic: true }]);
  const moved = O.quatMul(O.yawQ(-100), truth);   // compass now says 100 deg further round
  for (let i = 0; i < O.NORTH_JUMP_SAMPLES - 2; i++) {
    s = O.fuseOrientation(s, { kind: 'abs', q: moved, magnetic: true });
    assert.ok(angErr(s.yaw, 0) < 1e-9, 'not yet — it has to persist first');
  }
  s = run(repeat(4, { kind: 'abs', q: moved, magnetic: true }), s);
  assert.ok(angErr(s.yaw, 260) < 1e-6, `a persistent change should be taken whole, got ${s.yaw}`);
});

test('the first usable heading is taken whole, not eased into', () => {
  // With no estimate at all, the first heading the phone can be believed
  // about must land the view immediately — a user who raises the phone and
  // waits should not watch the sky slide into place.
  const upright = O.quatFromEuler(0, 90, 0);
  const s = run([{ kind: 'heading', q: relOf(upright, 0), heading: camHeading(upright), trueNorth: true }]);
  assert.strictEqual(O.fusedView(s).trusted, true);
  assert.ok(aimErr(s, upright).az < 1e-9);
});

test('north-gate tuning is sensible', () => {
  assert.ok(O.NORTH_FACE_UP > 0 && O.NORTH_FACE_UP < 0.5);
  assert.ok(O.NORTH_JUMP_DEG >= 30 && O.NORTH_JUMP_DEG <= 90);
  assert.ok(O.NORTH_JUMP_SAMPLES >= 20 && O.NORTH_JUMP_SAMPLES <= 120);
});

// ---------------------------------------------------- readings from a real iPhone
/*
 * Two Sensor details readouts sent from an iPhone on 2026-09-22, both with
 * the phone's camera on the Moon, whose true bearing was ~149 and ~148 (the
 * app's own moonState for 42.10, -72.45 at the time). These are the only
 * hardware evidence there has ever been for which axis iOS's compass heading
 * belongs to, and they settle it: read as the camera's bearing the view lands
 * within ordinary magnetometer error, read as the top of the phone it lands
 * some 180 degrees away.
 *
 * The first reading is the bug report itself — the app said "aimed at az
 * 331" while the phone pointed at az 149.
 */
const IPHONE = [
  { name: 'raised to the Moon, offset had been confirmed', alpha: 333.2, beta: 113.6, gamma: 4.7, heading: 154, moonAz: 149.2, alt: 24 },
  { name: 'raised to the Moon, offset was a first guess', alpha: 12, beta: 114, gamma: -3.1, heading: 166, moonAz: 147.5, alt: 24 },
  // Build v100, 2026-09-23 ~22:40 UTC at 42.11, -72.54 (declination 13.3° W),
  // the Moon just risen at az 120 alt 12: drawn 6° left of the real one. Read
  // as magnetic north (declination applied) it would be 7° out the other way,
  // so this sample, like the confirmed one above, supports iOS giving true
  // north; the residual is the phone's compass, which Align corrects.
  { name: 'Moon just risen, v100', alpha: 321.8, beta: 102.4, gamma: -4.3, heading: 125, moonAz: 120, alt: 12 }
];

for (const r of IPHONE) {
  test(`iPhone reading (${r.name}): the view lands on the Moon`, () => {
    const rel = O.quatFromEuler(r.alpha, r.beta, r.gamma);
    const s = run(repeat(40, { kind: 'heading', q: rel, heading: r.heading, trueNorth: true, acc: 10 }));
    const v = O.fusedView(s);
    assert.strictEqual(v.abs, true, 'a raised phone should establish north');
    const aim = O.aimOf(v.q);
    // The compass itself is only good to a couple of tens of degrees; what is
    // being pinned here is that the view is not reversed.
    assert.ok(angErr(aim.az, r.moonAz) < 25,
      `view az ${aim.az.toFixed(0)} vs Moon ${r.moonAz} — off by ${angErr(aim.az, r.moonAz).toFixed(0)}deg`);
    assert.ok(Math.abs(aim.alt - r.alt) < 1.5, `altitude ${aim.alt.toFixed(1)} should match the readout's ${r.alt}`);
  });
}

test('iPhone reading: reading the heading as the top of the phone reverses the view', () => {
  // Why the app drew the sky behind the observer: this is the old rule, run
  // on the same sample, and it must be seen to fail.
  const r = IPHONE[0];
  const rel = O.quatFromEuler(r.alpha, r.beta, r.gamma);
  const topYaw = topHeading(rel) - r.heading;
  const aimAz = ((O.vecAz(O.quatRotate(rel, [0, 0, -1])) - topYaw) % 360 + 360) % 360;
  assert.ok(angErr(aimAz, r.moonAz) > 170,
    `the old rule should be ~180 deg out here, it was ${angErr(aimAz, r.moonAz).toFixed(0)}`);
});
