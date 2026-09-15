'use strict';
/*
 * The spoken form of Aim Assist's guidance.
 *
 * Worth testing rather than eyeballing because the failure mode is invisible
 * to a sighted developer: the panel looks identical whether the announcement
 * says "turn 20 degrees right" or "turn 20 degrees left", and only a user who
 * cannot see the arrow finds out.
 *
 * The throttling itself lives in the hook (React state and timers); what is
 * pure, and what decides whether a person ends up pointed at the right part
 * of the sky, is the sentence.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { extract } = require('./extract.js');

const {
  aimAnnouncement, AIM_ANNOUNCE_MS, AIM_ANNOUNCE_STEP
} = extract(['AIM_ANNOUNCE_MS', 'AIM_ANNOUNCE_STEP', 'aimAnnouncement']);

test('direction words match the sign convention Aim Assist uses', () => {
  // aimTurn is signed [-180,180]; positive means turn right/clockwise. The
  // arrow and the sentence must not disagree.
  assert.match(aimAnnouncement(30, null, false, 'Vega'), /turn 30 degrees right/);
  assert.match(aimAnnouncement(-30, null, false, 'Vega'), /turn 30 degrees left/);
  assert.match(aimAnnouncement(0, 30, false, 'Vega'), /tilt 30 degrees up/);
  assert.match(aimAnnouncement(0, -30, false, 'Vega'), /tilt 30 degrees down/);
});

test('degrees are announced without a sign, the direction carries it', () => {
  const s = aimAnnouncement(-45, -20, false, 'Sirius');
  assert.ok(!/-/.test(s), `announcement should not contain a minus sign: ${s}`);
  assert.match(s, /turn 45 degrees left/);
  assert.match(s, /tilt 20 degrees down/);
});

test('values are quantised so the phrasing stops jittering', () => {
  // Sensor noise of a degree or two must not change the sentence, or the
  // region re-announces constantly.
  for (const d of [28, 29, 30, 31, 32]) {
    assert.match(aimAnnouncement(d, null, false, 'Vega'), /turn 30 degrees right/,
      `${d} should quantise to 30`);
  }
  assert.strictEqual(AIM_ANNOUNCE_STEP, 5);
});

test('being on target is announced in place of directions', () => {
  const s = aimAnnouncement(1, 1, true, 'Polaris');
  assert.match(s, /On target/);
  assert.match(s, /Polaris/, 'naming the body confirms which one you landed on');
  assert.ok(!/turn|tilt/i.test(s), `on target should not also give directions: ${s}`);
});

test('sub-threshold movement reads as close rather than as zero', () => {
  // "turn 0 degrees" would be nonsense; below one step there is nothing
  // useful to say except that you are nearly there.
  const s = aimAnnouncement(1, 1, false, 'Vega');
  assert.match(s, /hold steady/i, `expected a hold-steady phrasing, got: ${s}`);
  assert.ok(!/0 degrees/.test(s), `should never announce zero degrees: ${s}`);
});

test('tilt is omitted entirely when the phone is flat', () => {
  // aimTilt is null when lying flat, where only the bearing is meaningful.
  const s = aimAnnouncement(40, null, false, 'Vega');
  assert.match(s, /turn 40 degrees right/);
  assert.ok(!/tilt/i.test(s), `flat phone should not mention tilt: ${s}`);
});

test('no heading yields no announcement', () => {
  assert.strictEqual(aimAnnouncement(null, null, false, 'Vega'), '',
    'with no compass there is nothing to say');
});

test('the throttle interval is long enough to be usable', () => {
  // Turn/Tilt are recomputed on every orientation event — dozens per second.
  // Anything under a second or so makes the live region unusable.
  assert.ok(AIM_ANNOUNCE_MS >= 1500,
    `announcement interval ${AIM_ANNOUNCE_MS}ms is too short for a live region`);
});

test('every announcement is a speakable sentence', () => {
  // No degree signs, no stray punctuation a screen reader would spell out.
  for (const [turn, tilt, on] of [[30, 20, false], [-5, -5, false], [0, 0, true], [120, null, false]]) {
    const s = aimAnnouncement(turn, tilt, on, 'Altair');
    assert.ok(!/[°]/.test(s), `announcement contains a degree sign: ${s}`);
    assert.ok(s.length > 0 && s.length < 120, `announcement length off: ${s}`);
  }
});
