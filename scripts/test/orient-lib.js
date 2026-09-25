'use strict';
/*
 * The orientation pipeline, extracted in one piece so its functions resolve
 * each other. Shared by the orientation, fusion and heading-reference tests.
 */

const { extract } = require('./extract.js');

module.exports = extract([
  'D2R', 'R2D', 'sin', 'cos', 'asin', 'atan2',
  'quatMul', 'quatConj', 'quatNorm', 'quatAxis', 'yawQ', 'quatFromEuler',
  'quatRotate', 'quatSlerp', 'vecAz', 'vecHoriz',
  'viewBasis', 'toScreen', 'aimOf', 'screenUpAz', 'skyProject',
  'ORIENT_SMOOTH', 'NORTH_SMOOTH', 'ORIENT_MIN_MS', 'NORTH_MIN_HORIZ',
  'NORTH_FACE_UP', 'NORTH_JUMP_DEG', 'NORTH_JUMP_SAMPLES', 'NORTH_SETTLE_SAMPLES', 'angGap', 'updateNorth',
  'smoothAngle', 'yawBetween', 'yawFromHeading',
  'FUSION_INIT', 'fuseOrientation', 'fusedView', 'correctView'
]);

// Signed smallest difference between two bearings, in degrees.
module.exports.angErr = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);

// Deterministic PRNG so a failure is reproducible from the seed alone.
module.exports.rng = seed => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};
