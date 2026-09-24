'use strict';
/*
 * The iPhone app's orientation from CoreMotion (iosAttitudeToEnu,
 * quatFromMatrix), the route native sky apps use instead of the browser's
 * loose angles and separate compass heading.
 *
 * There is no phone here, so the risk is a convention: which way Apple's
 * rotation matrix goes. A wrong guess mirrors every bearing. So CoreMotion is
 * simulated both ways from a known pose, and the conversion must recover the
 * pose either way, using gravity to tell them apart; and the matrix maths is
 * checked against the W3C device-orientation matrix, written out here from
 * the spec rather than from the app's own quaternions.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'asin', 'atan2', 'rev', 'quatAxis', 'quatMul', 'quatFromEuler', 'quatRotate',
  'vecAz', 'quatFromMatrix', 'iosAttitudeToEnu', 'coreMotionAcc']);

// W3C DeviceOrientation spec, section 4.1: R = Rz(alpha) Rx(beta) Ry(gamma),
// device frame to the earth's (east, north, up). Row-major.
function w3c(a, b, g) {
  const r = x => x * Math.PI / 180;
  const cA = Math.cos(r(a)), sA = Math.sin(r(a)), cB = Math.cos(r(b)), sB = Math.sin(r(b)), cG = Math.cos(r(g)), sG = Math.sin(r(g));
  return [
    cA * cG - sA * sB * sG, -cB * sA, cG * sA * sB + cA * sG,
    cG * sA + cA * sB * sG, cA * cB, sA * sG - cA * cG * sB,
    -cB * sG, sB, cB * cG
  ];
}
const mul = (M, v) => [0, 1, 2].map(i => M[3 * i] * v[0] + M[3 * i + 1] * v[1] + M[3 * i + 2] * v[2]);
const T = M => [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]];
const near = (a, b, eps = 1e-9) => a.every((x, i) => Math.abs(x - b[i]) < eps);
const rand = (seed => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646)(7);

test('quatFromMatrix is the rotation the matrix describes (against the W3C matrix)', () => {
  for (let k = 0; k < 300; k++) {
    const a = rand() * 360, b = rand() * 360 - 180, g = rand() * 180 - 90;
    const M = w3c(a, b, g), q = m.quatFromMatrix(M);
    for (const v of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.3, -0.5, 0.8]]) {
      assert.ok(near(m.quatRotate(q, v), mul(M, v), 1e-9), `${a.toFixed(0)}/${b.toFixed(0)}/${g.toFixed(0)}`);
    }
    // And it is the same rotation the web path builds from the same angles.
    const e = m.quatFromEuler(a, b, g), dot = Math.abs(q[0] * e[0] + q[1] * e[1] + q[2] * e[2] + q[3] * e[3]);
    assert.ok(Math.abs(dot - 1) < 1e-9);
  }
});

// CoreMotion as it would report a pose M (device -> east, north, up) in the
// xTrueNorthZVertical frame (north, west, up), under either convention.
const ENU_TO_NWU = [0, 1, 0, -1, 0, 0, 0, 0, 1];
function coreMotion(M, way) {
  const D = [0, 1, 2].flatMap(i => [0, 1, 2].map(j => [0, 1, 2].reduce((s, k) => s + ENU_TO_NWU[3 * i + k] * M[3 * k + j], 0)));
  const r = way === 'refToDevice' ? T(D) : D;
  const up = mul(T(M), [0, 0, 1]);
  return { r, g: up.map(x => -x) };
}

test('CoreMotion read either way round comes out right, once the phone is raised', () => {
  // Gravity can't separate the two readings for one band of compass
  // directions (where the rotation happens to be symmetric), so a decision
  // waits until the phone has turned out of it, and is then kept. Most raised
  // poses decide at once; every one that decides, decides right.
  for (const way of ['refToDevice', 'deviceToRef']) {
    let decided = 0;
    for (let k = 0; k < 400; k++) {
      // Raised toward the sky, as in Sky View: beta 60..150.
      const M = w3c(rand() * 360, 60 + rand() * 90, rand() * 60 - 30);
      const { r, g } = coreMotion(M, way);
      const out = m.iosAttitudeToEnu(r, g, null);
      if (!out.dir) continue;
      decided++;
      assert.strictEqual(out.dir, way, 'gravity decides the convention');
      assert.ok(near(out.m, M, 1e-9));
    }
    assert.ok(decided > 400 * 0.75, `${decided} of 400 decided at once`);
  }
  // A sweep of the horizon, as anyone looking around does, always decides.
  for (const way of ['refToDevice', 'deviceToRef']) {
    let dir = null;
    for (let a = 0; a < 360 && !dir; a += 15) { const { r, g } = coreMotion(w3c(a, 100, 0), way); dir = m.iosAttitudeToEnu(r, g, null).dir; }
    assert.strictEqual(dir, way);
  }
});

test('lying flat the two readings agree on up, so nothing is decided yet', () => {
  const M = w3c(40, 0, 0);
  const { r, g } = coreMotion(M, 'deviceToRef');
  assert.strictEqual(m.iosAttitudeToEnu(r, g, null).dir, null);
  // A decision made earlier sticks, and is applied.
  assert.ok(near(m.iosAttitudeToEnu(r, g, 'deviceToRef').m, M, 1e-9));
});

test('in words: camera to the east, 20° up, reads az 90, alt 20', () => {
  // Build the pose from a physical description, not from Euler angles: the
  // camera looks out of the back of the phone (device -z).
  const az = 90, alt = 20, c = Math.cos(alt * Math.PI / 180), s = Math.sin(alt * Math.PI / 180);
  const look = [Math.sin(az * Math.PI / 180) * c, Math.cos(az * Math.PI / 180) * c, s]; // east, north, up
  const topOfPhone = [-Math.sin(az * Math.PI / 180) * s, -Math.cos(az * Math.PI / 180) * s, c];
  const right = [topOfPhone[1] * -look[2] - topOfPhone[2] * -look[1], topOfPhone[2] * -look[0] - topOfPhone[0] * -look[2], topOfPhone[0] * -look[1] - topOfPhone[1] * -look[0]];
  // Columns: device x (right), y (top), z (out of the screen = -look).
  const M = [right[0], topOfPhone[0], -look[0], right[1], topOfPhone[1], -look[1], right[2], topOfPhone[2], -look[2]];
  for (const way of ['refToDevice', 'deviceToRef']) {
    const { r, g } = coreMotion(M, way);
    const q = m.quatFromMatrix(m.iosAttitudeToEnu(r, g, null).m);
    const cam = m.quatRotate(q, [0, 0, -1]);
    assert.ok(Math.abs(m.vecAz(cam) - 90) < 1e-6, `az ${m.vecAz(cam)}`);
    assert.ok(Math.abs(Math.asin(cam[2]) * 180 / Math.PI - 20) < 1e-6);
  }
});

test('calibration accuracy reads as the web path’s degrees', () => {
  assert.strictEqual(m.coreMotionAcc(-1), -1, 'uncalibrated: unusable');
  assert.ok(m.coreMotionAcc(0) > 25 && m.coreMotionAcc(1) > 10 && m.coreMotionAcc(1) <= 25 && m.coreMotionAcc(2) <= 10);
});

test('the app uses CoreMotion when the native plugin is there, and the browser events otherwise', () => {
  const src = declSource('StarFinder');
  assert.match(src, /const native = nativeMotion\(\);/);
  assert.match(src, /if \(native\) \{/);
  // Native samples go in as a complete absolute orientation; true north
  // unless CoreMotion fell back to magnetic.
  assert.match(src, /kind: 'abs', q: quatFromMatrix\(conv\.m\), magnetic: !d\.trueNorth/);
  // No browser permission prompt for native: CoreMotion needs none.
  assert.match(declSource('StarFinder'), /if \(nativeMotion\(\)\) \{ setAimSensor\('granted'\); return; \}/);
});

test('the Swift plugin and the page agree on names and data', () => {
  // No Swift compiler here, and a name that doesn't match fails silently on a
  // phone (no plugin, so the page quietly falls back to the browser's events).
  const fs = require('fs'), path = require('path');
  const ROOT = path.join(__dirname, '..', '..');
  const swift = fs.readFileSync(path.join(ROOT, 'native/ios/App/App/AppDelegate.swift'), 'utf8');
  const board = fs.readFileSync(path.join(ROOT, 'native/ios/App/App/Base.lproj/Main.storyboard'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(swift, /public let jsName = "TwilyteMotion"/);
  assert.match(html, /c\.Plugins\.TwilyteMotion/);
  assert.match(swift, /notifyListeners\("attitude"/);
  assert.match(declSource('StarFinder'), /native\.addListener\('attitude', onAttitude\)/);
  for (const k of ['"r"', '"g"', '"trueNorth"', '"acc"']) assert.ok(swift.includes(k + ':'), `Swift sends ${k}`);
  assert.match(declSource('StarFinder'), /iosAttitudeToEnu\(d\.r, d\.g, dir\)/);
  assert.match(swift, /r\.m11, r\.m12, r\.m13, r\.m21, r\.m22, r\.m23, r\.m31, r\.m32, r\.m33/, 'row-major, as iosAttitudeToEnu reads it');
  assert.match(swift, /\.xTrueNorthZVertical/);
  assert.match(swift, /CAPPluginMethod\(name: "start"/);
  assert.match(swift, /CAPPluginMethod\(name: "stop"/);
  // Registered by the controller the storyboard actually loads.
  assert.match(swift, /class TwilyteBridgeViewController: CAPBridgeViewController/);
  assert.match(swift, /bridge\?\.registerPluginInstance\(TwilyteMotionPlugin\(\)\)/);
  assert.match(board, /customClass="TwilyteBridgeViewController" customModule="App"/);
});
