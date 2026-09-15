'use strict';
/*
 * Sky View / Aim Assist orientation math.
 *
 * These invariants were each verified once during development by a throwaway
 * script and then described in a commit message. That is how the v1.3 note in
 * CLAUDE.md came to claim both registration axes were user-correctable while
 * the heading offset never reached the renderer — the claim was true of the
 * intent and untested against the code. Committing the sweeps means a later
 * change to the matrices has to keep them true.
 *
 * The central invariant (from 05a3a16): a body that Aim Assist reports as
 * "on target" must project to the centre of the screen. Aim Assist and Sky
 * View read the same sensors about the same phone, so if they disagree, one
 * of them is lying to the user.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const {
  D2R, sin, cos, asin, atan2,
  orientationToAim, worldToScreenDir, skyProject, screenUpHeading
} = extract([
  'D2R', 'R2D', 'sin', 'cos', 'asin', 'atan2',
  'orientationToAim', 'worldToScreenDir', 'skyProject', 'screenUpHeading'
]);

// Deterministic PRNG so a failure is reproducible from the seed alone.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const SCREEN_ANGLES = [0, 90, 180, 270];

test('aiming at a body puts it at the centre of the screen', () => {
  // The invariant 05a3a16 restored. Before that fix the same sweep put the
  // aimed body up to 376.8 px off centre on a 400 px-wide screen.
  const rand = rng(20250915);
  const W = 400, H = 800, FOV = 63;
  let worst = 0;
  let n = 0;
  for (let i = 0; i < 4000; i++) {
    const alpha = rand() * 360;
    const beta = rand() * 360 - 180;
    const gamma = rand() * 180 - 90;
    const aim = orientationToAim(alpha, beta, gamma);
    if (!aim.stable) continue; // near-vertical: azimuth undefined by design
    for (const sa of SCREEN_ANGLES) {
      const d = worldToScreenDir(aim.az, aim.alt, alpha, beta, gamma, sa);
      const p = skyProject(d, W, H, FOV);
      assert.ok(p, `body being aimed at should be in front of the camera (a=${alpha} b=${beta} g=${gamma})`);
      const off = Math.hypot(p.x - W / 2, p.y - H / 2);
      worst = Math.max(worst, off);
      n++;
    }
  }
  assert.ok(n > 1000, `expected a meaningful number of stable samples, got ${n}`);
  assert.ok(worst < 1e-6, `aimed body landed ${worst} px off centre (want < 1e-6)`);
});

/*
 * The two call sites that 05a3a16 had to reconcile, evaluated as the source
 * actually ships them rather than restated here. Aim Assist adds the manual
 * correction to the heading it reports; Sky View subtracts it from the view
 * alpha it renders with (az = 360 - alpha, so the signs are opposite by
 * construction). If either stops applying the correction — the v1.3 bug —
 * the two disagree by exactly the offset and the test below fails.
 */
const skyViewAlpha = new Function(
  'live', 'orient', 'aimOffset', 'manual', 'screenAngle',
  declSource('view') + '\nreturn view;'
);
const aimAssistHeading = new Function(
  'aimAz', 'aimOffset',
  declSource('aimAzC') + '\nreturn aimAzC;'
);

test('Sky View and Aim Assist agree once a manual correction is applied', () => {
  const rand = rng(51515);
  const W = 400, H = 800, FOV = 63;
  let worst = 0;
  let n = 0;
  for (let i = 0; i < 3000; i++) {
    const alpha = rand() * 360;
    const beta = rand() * 360 - 180;
    const gamma = rand() * 180 - 90;
    const aimOffset = rand() * 360 - 180; // the persisted "Align to <body>" nudge
    const screenAngle = SCREEN_ANGLES[i % SCREEN_ANGLES.length];

    const aim = orientationToAim(alpha, beta, gamma);
    if (!aim.stable) continue;

    // What Aim Assist tells the user they are pointing at.
    const heading = aimAssistHeading(aim.az, aimOffset);
    // What Sky View renders with, for the same phone and the same offset.
    const view = skyViewAlpha(true, { alpha, beta, gamma }, aimOffset, null, screenAngle);

    // A body at exactly that heading is what Aim Assist calls "on target",
    // so Sky View must draw it at the centre of the screen.
    const d = worldToScreenDir(heading, aim.alt, view.alpha, view.beta, view.gamma, view.sa);
    const p = skyProject(d, W, H, FOV);
    assert.ok(p, `on-target body must be in front of the camera (offset ${aimOffset})`);
    const off = Math.hypot(p.x - W / 2, p.y - H / 2);
    worst = Math.max(worst, off);
    n++;
  }
  assert.ok(n > 800, `expected a meaningful number of stable samples, got ${n}`);
  assert.ok(
    worst < 1e-6,
    `Sky View drew the on-target body ${worst.toFixed(1)} px off centre — ` +
    'the manual heading correction is not reaching both call sites (see 05a3a16)'
  );
});

test('a zero correction leaves the rendered view untouched', () => {
  // Guards the test above from passing vacuously if `view` stopped depending
  // on orient.alpha altogether.
  const v = skyViewAlpha(true, { alpha: 123.5, beta: 80, gamma: 10 }, 0, null, 90);
  assert.ok(Math.abs(v.alpha - 123.5) < 1e-9, `expected alpha 123.5 with no offset, got ${v.alpha}`);
  assert.strictEqual(v.beta, 80);
  assert.strictEqual(v.gamma, 10);
  assert.strictEqual(v.sa, 90);
});

test('the drag-to-look fallback ignores the sensor correction', () => {
  // With no sensors there is no sensor error to correct, so the offset must
  // not leak into the synthesised angles.
  const a = skyViewAlpha(false, null, 0, { az: 200, alt: 30 }, 0);
  const b = skyViewAlpha(false, null, 45, { az: 200, alt: 30 }, 0);
  assert.deepStrictEqual(a, b, 'manual correction must not affect the drag-to-look view');
  assert.ok(Math.abs(a.alpha - 160) < 1e-9, `az 200 should give alpha 160, got ${a.alpha}`);
});

test('a body behind the phone never projects onto the canvas', () => {
  const rand = rng(77777);
  for (let i = 0; i < 2000; i++) {
    const alpha = rand() * 360;
    const beta = rand() * 360 - 180;
    const gamma = rand() * 180 - 90;
    const aim = orientationToAim(alpha, beta, gamma);
    if (!aim.stable) continue;
    // The point directly opposite where the camera looks.
    const backAz = (aim.az + 180) % 360;
    const backAlt = -aim.alt;
    const d = worldToScreenDir(backAz, backAlt, alpha, beta, gamma, 0);
    assert.strictEqual(skyProject(d, 400, 800, 63), null, 'body behind the phone must not be drawn');
  }
});

test('projection is invariant to roll', () => {
  // Rolling the phone about the camera axis moves where a body appears on
  // screen, but not how far off-axis it is. This is what makes the full
  // matrix worth carrying instead of reading beta off as "tilt".
  const rand = rng(31337);
  const W = 400, H = 800, FOV = 63;
  for (let i = 0; i < 500; i++) {
    const alpha = rand() * 360;
    const beta = rand() * 360 - 180;
    const az = rand() * 360;
    const alt = rand() * 80 - 10;
    const radii = [];
    for (const gamma of [-60, -20, 0, 20, 60]) {
      const aim = orientationToAim(alpha, beta, gamma);
      if (!aim.stable) { radii.length = 0; break; }
      const d = worldToScreenDir(az, alt, alpha, beta, gamma, 0);
      const p = skyProject(d, W, H, FOV);
      if (!p) { radii.length = 0; break; }
      // Angular separation between the aim direction and the body is the
      // roll-invariant quantity; check the projected radius tracks it.
      const sep = Math.acos(Math.max(-1, Math.min(1,
        cos(alt) * cos(aim.alt) * cos(az - aim.az) + sin(alt) * sin(aim.alt)
      ))) / D2R;
      radii.push({ r: Math.hypot(p.x - W / 2, p.y - H / 2), sep });
    }
    if (!radii.length) continue;
    for (const s of radii) {
      const f = (H / 2) / Math.tan((FOV / 2) * D2R);
      const expected = f * Math.tan(s.sep * D2R);
      assert.ok(
        Math.abs(s.r - expected) < 1e-6 * Math.max(1, expected),
        `projected radius ${s.r} does not match separation ${s.sep}° (expected ${expected})`
      );
    }
  }
});

test('orientationToAim reports the directions a person would expect', () => {
  // Hand-reasoned postures, as a guard on the matrix's sign conventions —
  // a sweep can be self-consistent and still have east and west swapped.
  const upright = (az) => orientationToAim((360 - az) % 360, 90, 0);
  for (const az of [0, 90, 180, 270]) {
    const a = upright(az);
    assert.ok(Math.abs(a.alt) < 1e-6, `phone upright should aim at the horizon, got alt ${a.alt}`);
    const d = Math.abs(((a.az - az + 540) % 360) - 180);
    assert.ok(d < 1e-6, `phone upright facing ${az}° reported az ${a.az}`);
  }
  // Phone flat on its back, screen up: camera looks straight down.
  assert.ok(orientationToAim(0, 0, 0).alt < -89.9, 'flat on its back should aim at the ground');
  // Phone flat, screen down: camera looks straight up.
  assert.ok(orientationToAim(0, 180, 0).alt > 89.9, 'flat screen-down should aim at the zenith');
});

test('near-vertical aim is reported as unstable', () => {
  // Azimuth is meaningless when the camera points at the ground or zenith;
  // callers depend on `stable` to fall back to the screen-up heading.
  assert.strictEqual(orientationToAim(0, 0, 0).stable, false, 'straight down should be unstable');
  assert.strictEqual(orientationToAim(0, 180, 0).stable, false, 'straight up should be unstable');
  assert.strictEqual(orientationToAim(0, 90, 0).stable, true, 'horizontal should be stable');
});

test('screenUpHeading follows the displayed top, not the device top', () => {
  // A phone held flat and rotated into landscape reports a device-top 90°
  // away from the top the user sees; the screenAngle term corrects that.
  const flatNorth = 0;
  const portrait = screenUpHeading(flatNorth, 0, 0, 0);
  const landscape = screenUpHeading(flatNorth, 0, 0, 90);
  const delta = ((landscape - portrait) + 360) % 360;
  assert.ok(
    Math.abs(delta - 90) < 1e-6,
    `rotating the UI 90° should move the screen-up heading 90°, moved ${delta}`
  );
});
