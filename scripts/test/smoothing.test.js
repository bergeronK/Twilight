'use strict';
/*
 * Orientation smoothing.
 *
 * The whole reason this needs testing is the wrap. Averaging headings
 * arithmetically is correct almost everywhere and catastrophically wrong in
 * one place — crossing north, where 359 and 1 average to 180 and the drawn
 * sky swings right round the compass. A user facing south would never see it.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { extract } = require('./extract.js');

const {
  ORIENT_SMOOTH, ORIENT_MIN_MS, smoothAngle, wrap180, smoothOrientation
} = extract(['ORIENT_SMOOTH', 'ORIENT_MIN_MS', 'smoothAngle', 'wrap180', 'smoothOrientation']);

test('smoothing eases toward the new value, not onto it', () => {
  const out = smoothAngle(0, 100, 0.25);
  assert.ok(Math.abs(out - 25) < 1e-9, `expected a quarter of the way, got ${out}`);
});

test('a null previous value adopts the sample outright', () => {
  assert.strictEqual(smoothAngle(null, 137, 0.25), 137);
  assert.strictEqual(smoothAngle(NaN, 137, 0.25), 137);
});

test('smoothing crosses north the short way', () => {
  // 350 -> 10 is 20 degrees clockwise, not 340 counter-clockwise.
  const out = smoothAngle(350, 10, 0.5);
  assert.ok(Math.abs(out - 0) < 1e-9 || Math.abs(out - 360) < 1e-9,
    `halfway from 350 to 10 should be 0/360, got ${out}`);

  // And the other way round.
  const back = smoothAngle(10, 350, 0.5);
  assert.ok(Math.abs(back - 0) < 1e-9 || Math.abs(back - 360) < 1e-9,
    `halfway from 10 to 350 should be 0/360, got ${back}`);
});

test('output always lands in [0,360)', () => {
  for (let prev = 0; prev < 360; prev += 17) {
    for (let next = 0; next < 360; next += 23) {
      const out = smoothAngle(prev, next, ORIENT_SMOOTH);
      assert.ok(out >= 0 && out < 360, `out of range for ${prev}->${next}: ${out}`);
    }
  }
});

test('repeated smoothing converges on the target', () => {
  // Including across the wrap, where a sign error would send it the long way
  // round forever instead of settling.
  let a = 350;
  for (let i = 0; i < 200; i++) a = smoothAngle(a, 10, ORIENT_SMOOTH);
  const err = Math.abs(((a - 10) % 360 + 540) % 360 - 180);
  assert.ok(err < 0.01, `should have converged on 10, sat at ${a}`);
});

test('smoothing never moves further than the true gap', () => {
  // A filter that overshoots oscillates, which on screen reads as a shake.
  for (let prev = 0; prev < 360; prev += 13) {
    for (let next = 0; next < 360; next += 29) {
      const out = smoothAngle(prev, next, ORIENT_SMOOTH);
      const gap = Math.abs(((next - prev) % 360 + 540) % 360 - 180);
      const moved = Math.abs(((out - prev) % 360 + 540) % 360 - 180);
      assert.ok(moved <= gap + 1e-9, `moved ${moved} on a gap of ${gap} (${prev}->${next})`);
    }
  }
});

test('wrap180 returns beta to the range the sensors report', () => {
  assert.ok(Math.abs(wrap180(350) - -10) < 1e-9, `350 should map to -10, got ${wrap180(350)}`);
  assert.ok(Math.abs(wrap180(10) - 10) < 1e-9);
  assert.ok(Math.abs(wrap180(190) - -170) < 1e-9);
  for (let a = -360; a <= 720; a += 7) {
    const w = wrap180(a);
    assert.ok(w >= -180 && w < 180, `wrap180(${a}) = ${w} out of range`);
  }
});

test('a fresh start snaps rather than eases', () => {
  // Used at a reference change: Android sends a relative yaw first and true
  // north a moment later, and easing between them slews the sky across the
  // screen instead of correcting once.
  const s = smoothOrientation(null, { alpha: 200, beta: 45, gamma: -10 }, ORIENT_SMOOTH);
  assert.deepStrictEqual(s, { alpha: 200, beta: 45, gamma: -10 });
});

test('a whole orientation smooths on every axis', () => {
  const prev = { alpha: 0, beta: 0, gamma: 0 };
  const s = smoothOrientation(prev, { alpha: 100, beta: 40, gamma: -20 }, 0.5);
  assert.ok(Math.abs(s.alpha - 50) < 1e-9, `alpha: ${s.alpha}`);
  assert.ok(Math.abs(s.beta - 20) < 1e-9, `beta: ${s.beta}`);
  assert.ok(Math.abs(s.gamma - -10) < 1e-9, `gamma: ${s.gamma}`);
});

test('beta comes back signed, not as a bare compass angle', () => {
  // beta is reported in [-180,180) and feeds the orientation matrix; handing
  // back 350 instead of -10 tilts the view the wrong way entirely.
  const s = smoothOrientation({ alpha: 0, beta: -20, gamma: 0 }, { alpha: 0, beta: -20, gamma: 0 }, 0.25);
  assert.ok(s.beta < 0, `beta should stay negative, got ${s.beta}`);
  assert.ok(Math.abs(s.beta - -20) < 1e-9, `beta should hold at -20, got ${s.beta}`);
});

test('beta crosses its own wrap the short way', () => {
  const s = smoothOrientation({ alpha: 0, beta: 175, gamma: 0 }, { alpha: 0, beta: -175, gamma: 0 }, 0.5);
  // 175 -> -175 is 10 degrees across the wrap; halfway is ±180.
  assert.ok(Math.abs(Math.abs(s.beta) - 180) < 1e-9, `expected ±180, got ${s.beta}`);
});

test('gamma is smoothed linearly, since it does not wrap', () => {
  // gamma is [-90,90]; treating it as circular would make -80 and 80 average
  // to ±180, which is not even in range.
  const s = smoothOrientation({ alpha: 0, beta: 0, gamma: -80 }, { alpha: 0, beta: 0, gamma: 80 }, 0.5);
  assert.ok(Math.abs(s.gamma) < 1e-9, `expected 0 halfway between -80 and 80, got ${s.gamma}`);
});

test('the filter is responsive enough to aim with', () => {
  // Too much smoothing and the view lags the phone. At ~60Hz this should
  // close most of a gap well inside a second.
  let a = 0;
  let steps = 0;
  while (Math.abs(a - 90) > 90 * 0.1 && steps < 1000) { a = smoothAngle(a, 90, ORIENT_SMOOTH); steps++; }
  assert.ok(steps < 30, `took ${steps} events to get within 10% — too sluggish`);
  assert.ok(ORIENT_SMOOTH > 0 && ORIENT_SMOOTH < 1, `smoothing weight out of range: ${ORIENT_SMOOTH}`);
});

test('the publish floor allows a smooth frame rate', () => {
  // Fast enough to look continuous, slow enough to stop a render per event.
  assert.ok(ORIENT_MIN_MS > 0 && ORIENT_MIN_MS <= 33,
    `publish interval ${ORIENT_MIN_MS}ms should sit between 30 and 60fps`);
});
