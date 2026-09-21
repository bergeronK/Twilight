'use strict';
/*
 * Magnetic declination (World Magnetic Model 2025).
 *
 * The reference values below are NOAA's own published test vectors for
 * WMM2025, copied verbatim from WMM2025_TEST_VALUES.txt. They are the whole
 * point of this file: a spherical-harmonic sum is easy to get subtly wrong in
 * a way that still looks like a plausible field — during development a single
 * misplaced normalisation factor in the P(1,1) seed produced D = 1.04 deg
 * where the right answer is 1.28, with every other property of the field
 * looking entirely reasonable. Only an external reference catches that.
 *
 * NOAA prints declination to two decimals, so agreement is asserted to within
 * 0.01 deg rather than exactly.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { extract } = require('./extract.js');

const m = extract([
  'D2R', 'R2D', 'sin', 'cos', 'asin', 'atan2',
  'WMM_EPOCH_YEARS', 'WMM_COF', 'wmmCache', 'wmmModel', 'magneticDeclination'
]);

// Decimal year -> a Date the function will map back to that year. The app
// takes a Date because that is what its callers have.
function atYear(y) {
  const whole = Math.floor(y);
  const frac = y - whole;
  const d = new Date(Date.UTC(whole, 0, 1));
  d.setUTCDate(d.getUTCDate() + Math.round(frac * 365.25));
  return d;
}

// [decimal year, lat, lon, declination(deg)] — NOAA WMM2025 test values,
// the height-0 rows only, since the app evaluates at sea level.
// Extracted from the file rather than typed: a first pass at this table got
// four of six values wrong by hand, and a wrong reference value is worse
// than no test, because it either fails a correct implementation or passes
// a wrong one.
const NOAA = [
  [2025.0, 80.0, 0.0, 1.28],
  [2025.0, 0.0, 120.0, -0.16],
  [2025.0, -80.0, 240.0, 68.78],
  [2027.5, 80.0, 0.0, 2.59],
  [2027.5, 0.0, 120.0, -0.24],
  [2027.5, -80.0, 240.0, 68.49]
];

test('declination matches NOAA WMM2025 published test values', () => {
  for (const [year, lat, lon, expected] of NOAA) {
    const got = m.magneticDeclination(lat, lon, atYear(year)).deg;
    assert.ok(
      Math.abs(got - expected) < 0.01,
      `${year} lat ${lat} lon ${lon}: got ${got.toFixed(4)}, NOAA says ${expected}`
    );
  }
});

test('the model is the current epoch and covers today', () => {
  // A WMM is issued every five years. If this starts failing, the model has
  // expired: regenerate with scripts/generate-wmm.js from the new .COF.
  const now = m.magneticDeclination(40.7128, -74.0060, new Date());
  assert.strictEqual(now.stale, false,
    'the bundled WMM no longer covers the current date — regenerate it from the new epoch');
});

test('dates outside the model window are clamped and reported', () => {
  const far = m.magneticDeclination(40.7128, -74.0060, new Date(Date.UTC(2045, 0, 1)));
  assert.strictEqual(far.stale, true, 'a date past the model window must be flagged');
  assert.ok(Number.isFinite(far.deg), 'a clamped result must still be a usable number');
  // Clamping means the answer equals the model's last valid year, not a wild
  // extrapolation 15 years out.
  const edge = m.magneticDeclination(40.7128, -74.0060, atYear(2030.0));
  assert.ok(
    Math.abs(far.deg - edge.deg) < 0.05,
    `clamped value ${far.deg} should match the window edge ${edge.deg}`
  );
});

test('declination is signed east-positive', () => {
  // The sign convention is the one that matters for the correction: true
  // bearing = magnetic bearing + declination. Getting it backwards doubles
  // the error instead of removing it.
  const nyc = m.magneticDeclination(40.7128, -74.0060, new Date()).deg;
  assert.ok(nyc < 0, `New York should be westerly (negative), got ${nyc.toFixed(2)}`);
  const seattle = m.magneticDeclination(47.6062, -122.3321, new Date()).deg;
  assert.ok(seattle > 0, `Seattle should be easterly (positive), got ${seattle.toFixed(2)}`);
  // Rough magnitudes, wide enough not to be brittle as the field drifts.
  assert.ok(Math.abs(nyc) > 8 && Math.abs(nyc) < 18, `New York declination implausible: ${nyc}`);
  assert.ok(seattle > 10 && seattle < 20, `Seattle declination implausible: ${seattle}`);
});

test('declination is finite everywhere, including the poles', () => {
  // cos(colatitude) reaches zero at the poles and divides the East component.
  for (const [lat, lon] of [[90, 0], [-90, 0], [89.999, 45], [-89.999, -120], [0, 0], [0, 180]]) {
    const d = m.magneticDeclination(lat, lon, new Date()).deg;
    assert.ok(Number.isFinite(d), `declination not finite at ${lat},${lon}: ${d}`);
    assert.ok(d >= -180 && d <= 180, `declination out of range at ${lat},${lon}: ${d}`);
  }
});

test('declination varies smoothly with position', () => {
  // A normalisation error in the harmonic sum tends to show up as a field
  // that jumps between neighbouring points rather than one that drifts.
  let worst = 0;
  for (let lat = -80; lat <= 80; lat += 10) {
    for (let lon = -180; lon < 180; lon += 15) {
      const a = m.magneticDeclination(lat, lon, new Date()).deg;
      const b = m.magneticDeclination(lat, lon + 0.1, new Date()).deg;
      let diff = Math.abs(a - b) % 360;
      if (diff > 180) diff = 360 - diff;
      worst = Math.max(worst, diff);
    }
  }
  assert.ok(worst < 1, `declination jumped ${worst.toFixed(3)}° over 0.1° of longitude`);
});

test('the bundled coefficient string is well formed', () => {
  // 12 degrees, (n,m) pairs for n=1..12 and m=0..n, four numbers each,
  // plus one leading epoch token.
  const parts = m.WMM_COF.split(' ');
  const pairs = (12 * 13) / 2 + 12; // sum over n of (n+1) = 90
  assert.strictEqual(parts.length, 1 + pairs * 4,
    `expected ${1 + pairs * 4} tokens for a degree-12 model, got ${parts.length}`);
  assert.ok(parts.every(x => Number.isFinite(Number(x))), 'every token must be numeric');
  const model = m.wmmModel();
  assert.strictEqual(model.epoch, 2025, `unexpected epoch ${model.epoch}`);
  // The dipole term is the one number a reader can sanity-check by eye.
  assert.ok(Math.abs(model.g[1][0] - -29351.8) < 0.1, `g(1,0) was ${model.g[1][0]}`);
});
