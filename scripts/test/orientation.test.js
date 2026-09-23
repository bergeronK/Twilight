'use strict';
/*
 * Sky View / Aim Assist orientation geometry.
 *
 * Two kinds of test live here, and it matters which is which.
 *
 * SELF-CONSISTENCY — aim at a body and it lands at screen centre; a body
 * behind the phone is never drawn; projection is roll-invariant. These hold
 * by construction, because the projection and the aim are derived from the
 * same rotation. They catch a broken refactor. They cannot catch a wrong
 * convention: mirror or transpose the whole thing and every one still passes.
 * An earlier version of this suite consisted only of tests like these, and
 * the feature was reported "way off all around" on a real phone while all of
 * them were green.
 *
 * CORRESPONDENCE — does the rotation mean what the W3C spec says it means?
 * The spec's matrix is written out longhand below, independently of the
 * app's quaternion code, and the two are compared; and a handful of physical
 * postures are checked with the expected answer described in words, so a
 * reviewer can verify each one with a phone in hand. These pin the app to the
 * spec. They still cannot pin it to what a particular browser actually sends
 * — only a device reading can do that — but they are the tests that fail if
 * the convention is wrong.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { declSource } = require('./extract.js');
const O = require('./orient-lib.js');
const { angErr, rng } = O;

const SCREEN_ANGLES = [0, 90, 180, 270];

/* The W3C DeviceOrientation rotation, R = Rz(alpha) Rx(beta) Ry(gamma),
   written out by hand and sharing no code with the app. Columns are the
   device's x, y and z axes expressed in Earth East/North/Up. */
function specMatrix(a, b, g) {
  const r = Math.PI / 180;
  const cA = Math.cos(a * r), sA = Math.sin(a * r);
  const cB = Math.cos(b * r), sB = Math.sin(b * r);
  const cG = Math.cos(g * r), sG = Math.sin(g * r);
  return [
    [cA * cG - sA * sB * sG, -sA * cB, cA * sG + sA * sB * cG],
    [sA * cG + cA * sB * sG, cA * cB, sA * sG - cA * sB * cG],
    [-cB * sG, sB, cB * cG]
  ];
}
const col = (M, j) => [M[0][j], M[1][j], M[2][j]];

// ---------------------------------------------------------------- correspondence

test('the quaternion is the rotation the W3C spec defines', () => {
  const rand = rng(424242);
  let worst = 0;
  for (let i = 0; i < 5000; i++) {
    const a = rand() * 360, b = rand() * 360 - 180, g = rand() * 180 - 90;
    const M = specMatrix(a, b, g);
    const q = O.quatFromEuler(a, b, g);
    const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    axes.forEach((v, j) => {
      const got = O.quatRotate(q, v), want = col(M, j);
      for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(got[k] - want[k]));
    });
  }
  assert.ok(worst < 1e-12, `quaternion disagrees with the spec matrix by ${worst}`);
});

test('the camera looks along the device\'s -z axis, as the spec places it', () => {
  // z points out of the screen toward the user, so the rear camera faces -z.
  const rand = rng(99);
  for (let i = 0; i < 500; i++) {
    const a = rand() * 360, b = rand() * 360 - 180, g = rand() * 180 - 90;
    const camera = col(specMatrix(a, b, g), 2).map(x => -x);
    const aim = O.aimOf(O.quatFromEuler(a, b, g));
    assert.ok(Math.abs(aim.alt - Math.asin(camera[2]) * 180 / Math.PI) < 1e-9);
    if (aim.stable) {
      const az = (Math.atan2(camera[0], camera[1]) * 180 / Math.PI + 360) % 360;
      assert.ok(angErr(aim.az, az) < 1e-9, `azimuth ${aim.az} vs spec ${az}`);
    }
  }
});

test('flat on a table, top pointing north: the camera looks at the table', () => {
  const aim = O.aimOf(O.quatFromEuler(0, 0, 0));
  assert.ok(aim.alt < -89.9, `expected straight down, got alt ${aim.alt}`);
  assert.strictEqual(aim.stable, false, 'straight down has no meaningful azimuth');
});

test('flat, turned so the top points west, is alpha = 90', () => {
  // The spec's own example: alpha increases counter-clockwise seen from
  // above, so a quarter turn anticlockwise from north points the top west.
  const top = O.quatRotate(O.quatFromEuler(90, 0, 0), [0, 1, 0]);
  assert.ok(angErr(O.vecAz(top), 270) < 1e-9, `top should point west (270), got ${O.vecAz(top)}`);
  const east = O.quatRotate(O.quatFromEuler(270, 0, 0), [0, 1, 0]);
  assert.ok(angErr(O.vecAz(east), 90) < 1e-9, `alpha 270 should point the top east, got ${O.vecAz(east)}`);
});

test('held upright facing a direction, the camera looks at that horizon', () => {
  // Stand facing north holding the phone up in front of you, screen toward
  // your face: beta = 90, and the rear camera looks north along the horizon.
  // Turning to face east lowers alpha by 90 (alpha runs counter-clockwise).
  for (const [facing, alpha] of [[0, 0], [90, 270], [180, 180], [270, 90]]) {
    const aim = O.aimOf(O.quatFromEuler(alpha, 90, 0));
    assert.ok(Math.abs(aim.alt) < 1e-9, `upright should aim level, got alt ${aim.alt}`);
    assert.ok(angErr(aim.az, facing) < 1e-9, `facing ${facing}: camera az ${aim.az}`);
  }
});

test('tipping the top of the phone toward you raises the camera', () => {
  // Facing north, to look up at the sky you tip the top of the phone back
  // toward yourself: beta goes past 90. At beta = 135 the camera points north,
  // 45 degrees up — while the top of the phone points SOUTH. That reversal is
  // exactly why a compass heading taken from the top of the device cannot be
  // used as the camera's heading.
  const q = O.quatFromEuler(0, 135, 0);
  const aim = O.aimOf(q);
  assert.ok(angErr(aim.az, 0) < 1e-9, `camera should face north, got ${aim.az}`);
  assert.ok(Math.abs(aim.alt - 45) < 1e-9, `camera should be 45 deg up, got ${aim.alt}`);
  const top = O.quatRotate(q, [0, 1, 0]);
  assert.ok(angErr(O.vecAz(top), 180) < 1e-9, `top should point south, got ${O.vecAz(top)}`);
});

test('rolling the phone onto its side swings the camera sideways', () => {
  // Flat, top north, then gamma = 90: the phone rolls about its long axis
  // until the screen faces east, so the camera faces west.
  const aim = O.aimOf(O.quatFromEuler(0, 0, 90));
  assert.ok(Math.abs(aim.alt) < 1e-9, `expected level, got ${aim.alt}`);
  assert.ok(angErr(aim.az, 270) < 1e-9, `expected west, got ${aim.az}`);
});

test('the screen\'s right-hand side is where a body to the right is drawn', () => {
  // Upright facing north, a body a little east of north must appear right of
  // centre, and one a little above the horizon above centre. A mirrored
  // convention would pass every self-consistency test and fail this.
  const basis = O.viewBasis(O.quatFromEuler(0, 90, 0), 0);
  const right = O.skyProject(O.toScreen(basis, 10, 0), 400, 800, 63);
  assert.ok(right.x > 200, `a body east of north should draw right of centre, x=${right.x}`);
  assert.ok(Math.abs(right.y - 400) < 1e-6, 'and level with the centre');
  const up = O.skyProject(O.toScreen(basis, 0, 10), 400, 800, 63);
  assert.ok(up.y < 400, `a body above the horizon should draw above centre, y=${up.y}`);
});

test('landscape rotates the drawing with the screen', () => {
  // Turned into landscape (screen angle 90), "right on the screen" is what
  // was "up the device" — so a body above the horizon moves to the side.
  const q = O.quatFromEuler(0, 90, 0);
  const portrait = O.toScreen(O.viewBasis(q, 0), 0, 10);
  const landscape = O.toScreen(O.viewBasis(q, 90), 0, 10);
  assert.ok(portrait.y > 0 && Math.abs(portrait.x) < 1e-9, 'portrait: straight up the screen');
  assert.ok(Math.abs(landscape.y) < 1e-9 && Math.abs(landscape.x) > 0.1, 'landscape: sideways');
  assert.ok(Math.abs(landscape.z - portrait.z) < 1e-12, 'screen rotation never changes depth');
});

// ---------------------------------------------------------------- self-consistency

test('aiming at a body puts it at the centre of the screen', () => {
  const rand = rng(20250915);
  let worst = 0, n = 0;
  for (let i = 0; i < 4000; i++) {
    const q = O.quatFromEuler(rand() * 360, rand() * 360 - 180, rand() * 180 - 90);
    const aim = O.aimOf(q);
    if (!aim.stable) continue;
    for (const sa of SCREEN_ANGLES) {
      const p = O.skyProject(O.toScreen(O.viewBasis(q, sa), aim.az, aim.alt), 400, 800, 63);
      assert.ok(p, 'the body being aimed at must be in front of the camera');
      worst = Math.max(worst, Math.hypot(p.x - 200, p.y - 400));
      n++;
    }
  }
  assert.ok(n > 1000, `expected plenty of stable samples, got ${n}`);
  assert.ok(worst < 1e-6, `aimed body landed ${worst} px off centre`);
});

test('a body behind the phone never projects onto the canvas', () => {
  const rand = rng(77777);
  for (let i = 0; i < 2000; i++) {
    const q = O.quatFromEuler(rand() * 360, rand() * 360 - 180, rand() * 180 - 90);
    const aim = O.aimOf(q);
    if (!aim.stable) continue;
    const d = O.toScreen(O.viewBasis(q, 0), (aim.az + 180) % 360, -aim.alt);
    assert.strictEqual(O.skyProject(d, 400, 800, 63), null);
  }
});

test('projection is invariant to roll about the camera axis', () => {
  // Rolling moves where a body appears but not how far from centre.
  const rand = rng(31337);
  const f = 400 / Math.tan(31.5 * Math.PI / 180);
  for (let i = 0; i < 300; i++) {
    const base = O.quatFromEuler(rand() * 360, 60 + rand() * 90, 0);
    const aim = O.aimOf(base);
    const camAxis = O.quatRotate(base, [0, 0, -1]);
    const az = aim.az + (rand() * 30 - 15), alt = Math.max(-80, Math.min(80, aim.alt + (rand() * 30 - 15)));
    const radii = [-60, -20, 0, 20, 60].map(roll => {
      const q = O.quatMul(O.quatAxis(camAxis[0], camAxis[1], camAxis[2], roll), base);
      const p = O.skyProject(O.toScreen(O.viewBasis(q, 0), az, alt), 400, 800, 63);
      return p ? Math.hypot(p.x - 200, p.y - 400) : null;
    });
    if (radii.some(r => r === null)) continue;
    for (const r of radii) assert.ok(Math.abs(r - radii[2]) < 1e-6 * Math.max(1, radii[2]),
      `roll changed the distance from centre: ${radii}`);
    const e = Math.cos(alt * Math.PI / 180) * Math.sin(az * Math.PI / 180);
    const n = Math.cos(alt * Math.PI / 180) * Math.cos(az * Math.PI / 180);
    const u = Math.sin(alt * Math.PI / 180);
    const sep = Math.acos(Math.max(-1, Math.min(1, e * camAxis[0] + n * camAxis[1] + u * camAxis[2])));
    assert.ok(Math.abs(radii[2] - f * Math.tan(sep)) < 1e-6 * Math.max(1, radii[2]));
  }
});

test('near-vertical aim is reported as unstable', () => {
  assert.strictEqual(O.aimOf(O.quatFromEuler(0, 0, 0)).stable, false);
  assert.strictEqual(O.aimOf(O.quatFromEuler(0, 180, 0)).stable, false);
  assert.strictEqual(O.aimOf(O.quatFromEuler(0, 90, 0)).stable, true);
});

test('screen-up follows the displayed top, not the device top', () => {
  const q = O.quatFromEuler(0, 0, 0);
  const d = ((O.screenUpAz(q, 90) - O.screenUpAz(q, 0)) + 360) % 360;
  assert.ok(Math.abs(d - 90) < 1e-9, `rotating the UI 90 deg should move screen-up 90 deg, moved ${d}`);
});

test('the heading correction adds to every azimuth and leaves altitude alone', () => {
  const rand = rng(8080);
  for (let i = 0; i < 500; i++) {
    const q = O.quatFromEuler(rand() * 360, 30 + rand() * 120, rand() * 60 - 30);
    const c = rand() * 360 - 180;
    const before = O.aimOf(q), after = O.aimOf(O.correctView(q, c));
    if (!before.stable) continue;
    assert.ok(angErr(after.az, before.az + c) < 1e-9, `az ${before.az} + ${c} gave ${after.az}`);
    assert.ok(Math.abs(after.alt - before.alt) < 1e-9, 'correction must not change altitude');
  }
});

// ---------------------------------------------------------------- the shipped wiring

/*
 * The expressions StarFinder and SkyDome actually ship, evaluated from
 * source. Aim Assist reads aimAzC; Sky View draws with `view`/`basis`. The
 * v1.3 bug was these two disagreeing, so they are tested together.
 */
const useMemo = f => f();
const starFinderView = new Function(
  'useMemo', 'correctView', 'aimOf', 'screenUpAz', 'orient', 'headingCorr', 'screenAngle',
  declSource('viewQ') + '\n' + declSource('aimNow') + '\n' + declSource('aimAzC') +
  '\nreturn { viewQ, aimNow, aimAzC };'
);
const skyDomeView = new Function(
  'useMemo', 'quatFromEuler', 'viewBasis', 'live', 'viewQ', 'screenAngle', 'manual',
  declSource('view') + '\n' + declSource('basis') + '\nreturn { view, basis };'
);
const shipped = (orient, headingCorr, screenAngle) =>
  starFinderView(useMemo, O.correctView, O.aimOf, O.screenUpAz, orient, headingCorr, screenAngle);
const dome = (live, viewQ, screenAngle, manual) =>
  skyDomeView(useMemo, O.quatFromEuler, O.viewBasis, live, viewQ, screenAngle, manual);

test('Sky View draws Aim Assist\'s target at the centre, correction included', () => {
  const rand = rng(51515);
  let worst = 0, n = 0;
  for (let i = 0; i < 3000; i++) {
    const q = O.quatFromEuler(rand() * 360, rand() * 360 - 180, rand() * 180 - 90);
    const corr = rand() * 360 - 180;
    const sa = SCREEN_ANGLES[i % 4];
    const sf = shipped({ q }, corr, sa);
    if (!sf.aimNow || !sf.aimNow.stable) continue;
    const { basis } = dome(true, sf.viewQ, sa, { az: 0, alt: 0 });
    const p = O.skyProject(O.toScreen(basis, sf.aimAzC, sf.aimNow.alt), 400, 800, 63);
    assert.ok(p, 'on-target body must be in front of the camera');
    worst = Math.max(worst, Math.hypot(p.x - 200, p.y - 400));
    n++;
  }
  assert.ok(n > 800, `expected plenty of stable samples, got ${n}`);
  assert.ok(worst < 1e-6, `Sky View drew the on-target body ${worst} px off centre`);
});

test('the correction reaches Aim Assist\'s bearing', () => {
  const q = O.quatFromEuler(0, 90, 0);   // upright, facing north
  assert.ok(angErr(shipped({ q }, 0, 0).aimAzC, 0) < 1e-9);
  assert.ok(angErr(shipped({ q }, 15, 0).aimAzC, 15) < 1e-9, 'a +15 correction should read 15');
  assert.ok(angErr(shipped({ q }, -12.5, 0).aimAzC, 347.5) < 1e-9, 'a westerly correction should read 347.5');
});

test('held flat, Aim Assist falls back to the bearing of the screen top', () => {
  const q = O.quatFromEuler(270, 0, 0);  // flat, top pointing east
  const sf = shipped({ q }, 0, 0);
  assert.strictEqual(sf.aimNow.stable, false);
  assert.ok(angErr(sf.aimAzC, 90) < 1e-9, `expected east, got ${sf.aimAzC}`);
});

test('no sensor means no bearing', () => {
  const sf = shipped(null, 10, 0);
  assert.strictEqual(sf.viewQ, null);
  assert.strictEqual(sf.aimAzC, null);
});

test('drag-to-look points the view where it says', () => {
  const { view } = dome(false, null, 90, { az: 200, alt: 30 });
  const aim = O.aimOf(view.q);
  assert.ok(angErr(aim.az, 200) < 1e-9, `expected az 200, got ${aim.az}`);
  assert.ok(Math.abs(aim.alt - 30) < 1e-9, `expected alt 30, got ${aim.alt}`);
  assert.strictEqual(view.sa, 0, 'drag-to-look ignores the physical screen angle');
});

test('the live view uses the corrected rotation untouched', () => {
  const q = O.correctView(O.quatFromEuler(30, 100, 5), 12);
  const { view } = dome(true, q, 180, { az: 0, alt: 0 });
  assert.strictEqual(view.q, q, 'Sky View must draw with the very object Aim Assist read');
  assert.strictEqual(view.sa, 180);
});

// ---------------------------------------------------------------- Align

/*
 * The "Align to <body>" button, run from source. alignHere lives inside
 * StarFinder and only runs on a tap, so no test had ever executed it — and
 * it read `aimAz`, a variable the quaternion rewrite removed, so every tap
 * threw and took the whole app down from 2026-09-15 until a user pressed it
 * in the field. Evaluated here with exactly the names in scope, a stale
 * reference throws instead of passing.
 */
const alignScope = extra => {
  const scope = Object.assign({
    aimTurn: null, aimOffset: 0,
    prefStore: { setAimOffset: v => { scope.stored = v; } },
    setNeedsCal: () => {}, setShowCalHelp: () => {}
  }, extra);
  const fn = new Function('aimTurn', 'aimOffset', 'prefStore', 'setNeedsCal', 'setShowCalHelp',
    declSource('alignHere') + '\nreturn alignHere;')(scope.aimTurn, scope.aimOffset, scope.prefStore, scope.setNeedsCal, scope.setShowCalHelp);
  return { run: fn, scope };
};
const norm180 = a => ((a % 360) + 540) % 360 - 180;
const turnTo = (targetAz, aimAzC) => norm180(targetAz - aimAzC);   // the shipped aimTurn

test('Align runs without throwing, using only what is in scope', () => {
  const a = alignScope({ aimTurn: 12, aimOffset: 3 });
  assert.doesNotThrow(() => a.run());
  assert.strictEqual(a.scope.stored, 15);
});

test('Align with no target does nothing', () => {
  const a = alignScope({ aimTurn: null, aimOffset: 7 });
  a.run();
  assert.strictEqual(a.scope.stored, undefined);
});

test('one tap of Align lands the view on the body, whatever was applied before', () => {
  // Through the shipped wiring: the correction feeds viewQ, viewQ gives
  // aimAzC, and after Align the view must read the body's bearing.
  const rand = rng(424242);
  for (let i = 0; i < 2000; i++) {
    const q = O.quatFromEuler(rand() * 360, 40 + rand() * 100, rand() * 40 - 20);
    const decl = rand() * 40 - 20, offset = rand() * 60 - 30, magnetic = rand() < 0.5;
    const corr = (magnetic ? decl : 0) + offset;
    const target = rand() * 360;
    const before = shipped({ q }, corr, 0).aimAzC;
    const a = alignScope({ aimTurn: turnTo(target, before), aimOffset: offset });
    a.run();
    // prefStore normalises the stored offset into (-180, 180].
    const newOffset = norm180(a.scope.stored);
    const after = shipped({ q }, (magnetic ? decl : 0) + newOffset, 0).aimAzC;
    assert.ok(angErr(after, target) < 1e-6, `case ${i}: after Align the view reads ${after.toFixed(3)}, body is at ${target.toFixed(3)}`);
  }
});
