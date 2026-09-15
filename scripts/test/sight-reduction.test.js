'use strict';
/*
 * Navigator: sight reduction (Hs -> Ho), the Marcq St. Hilaire intercept, the
 * least-squares fix, and the guards that keep a bad sight out of the fix.
 *
 * The guards are the reason this file exists. Navigator v1 matched
 * docs/navigator-spec.md's happy path completely and skipped its edge-case
 * section, so a star 79° below the horizon reduced to a confident 5,981 nm
 * intercept and was averaged into the fix without comment. v1.6 added the
 * guards; these tests keep them.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { extract } = require('./extract.js');

const m = extract([
  'D2R', 'R2D', 'sin', 'cos', 'asin', 'atan2',
  'dipCorr', 'refractionCorr', 'SUN_SD', 'moonSD', 'moonHP', 'moonParallaxCorr',
  'sightToHo', 'intercept', 'solveFix', 'cutQuality', 'sightWarnings'
]);

test('dip grows with height of eye and is zero at sea level', () => {
  assert.strictEqual(m.dipCorr(0), 0, 'no dip from an artificial horizon');
  assert.ok(m.dipCorr(4) > m.dipCorr(1), 'dip should grow with height');
  // 1.76*sqrt(h): the standard table gives ~3.5' at 4 m.
  assert.ok(Math.abs(m.dipCorr(4) - 3.52) < 0.01, `dip at 4 m was ${m.dipCorr(4)}'`);
  assert.strictEqual(m.dipCorr(-5), 0, 'negative height must not produce NaN');
  assert.ok(Number.isFinite(m.dipCorr(-5)), 'negative height must not produce NaN');
});

test('refraction is largest at the horizon and small at altitude', () => {
  assert.ok(m.refractionCorr(0) > 30, `refraction at the horizon was ${m.refractionCorr(0)}'`);
  assert.ok(m.refractionCorr(45) < 1.5, `refraction at 45° was ${m.refractionCorr(45)}'`);
  assert.ok(m.refractionCorr(90) < 0.1, `refraction at the zenith was ${m.refractionCorr(90)}'`);
  for (let h = 0; h < 90; h += 5) {
    assert.ok(m.refractionCorr(h) > m.refractionCorr(h + 5), `refraction should fall from ${h}° to ${h + 5}°`);
  }
});

test('Bennett refraction really does run away just below the horizon', () => {
  // Establishes that the clamp in sightToHo is guarding something real.
  // Bennett's tangent argument is h + 7.31/(h+4.4). As h approaches -4.4
  // from above that term grows without bound, so the argument sweeps through
  // whole turns; wherever it crosses a multiple of 180°, tan goes to zero and
  // 1/tan goes to infinity. Near h = -4.36 the "correction" reaches some 337
  // degrees, and at exactly -4.4 it is NaN.
  assert.ok(
    Math.abs(m.refractionCorr(-4.36035)) > 20000,
    `expected a runaway refraction near h = -4.36, got ${m.refractionCorr(-4.36035)}'`
  );
  assert.ok(Number.isNaN(m.refractionCorr(-4.4)), 'refraction should be NaN at the singularity');
  // ...while remaining well-behaved anywhere a real sight can land.
  assert.ok(m.refractionCorr(-0.5) < 60, 'refraction at the clamp point should be under a degree');
});

test('sightToHo clamps refraction below the horizon instead of running away', () => {
  // Without the clamp, a sight anywhere in (-4.4, -0.5) can pick up an
  // enormous or NaN refraction correction and carry it into the intercept
  // and the fix. Sweep finely enough to cross the pole.
  const samples = [];
  for (let hs = -0.5; hs >= -6; hs -= 0.0005) samples.push(Number(hs.toFixed(4)));
  samples.push(-4.3225, -4.4, -10, -20, -45, -80, -89);

  for (const hs of samples) {
    const ho = m.sightToHo({ hs, body: 'star' });
    assert.ok(Number.isFinite(ho), `Ho was not finite for Hs ${hs} (got ${ho})`);
    // The clamped correction is refraction at -0.5°, about 42' — so Ho can
    // never sit more than ~1° from Hs no matter how far below the horizon.
    assert.ok(
      Math.abs(ho - hs) < 1,
      `correction below the horizon should stay bounded, Hs ${hs} -> Ho ${ho}`
    );
  }
});

test('the clamp does not disturb sights above the horizon', () => {
  // The clamp must not change any legitimate sight — only sights below
  // -0.5° should see the clamped value.
  for (let hs = 0; hs <= 90; hs += 0.5) {
    const ho = m.sightToHo({ hs, body: 'star' });
    const expected = hs - m.refractionCorr(hs) / 60;
    assert.ok(
      Math.abs(ho - expected) < 1e-9,
      `clamp altered a valid sight at ${hs}°: ${ho} vs ${expected}`
    );
  }
});

test('sightToHo applies index error and dip in the right direction', () => {
  // Index error and dip both shift the altitude that refraction is then
  // evaluated at, so neither moves Ho by exactly its own size — there is a
  // second-order refraction term of order 0.002' at 45°. The tolerance below
  // is what that coupling is worth; it is not slack for a sign error, which
  // would show up as a whole arcminute or more.
  const TOL = 0.01; // arcminutes

  const base = m.sightToHo({ hs: 45, body: 'star' });

  const withIE = m.sightToHo({ hs: 45, indexErrorMin: 2, body: 'star' });
  assert.ok(withIE > base, 'a positive index error should raise the observed altitude');
  assert.ok(
    Math.abs((withIE - base) * 60 - 2) < TOL,
    `index error of 2' moved Ho by ${((withIE - base) * 60).toFixed(4)}'`
  );

  const negIE = m.sightToHo({ hs: 45, indexErrorMin: -2, body: 'star' });
  assert.ok(negIE < base, 'a negative index error should lower the observed altitude');

  const withDip = m.sightToHo({ hs: 45, heightM: 4, body: 'star' });
  assert.ok(withDip < base, 'dip should lower the observed altitude');
  assert.ok(
    Math.abs((base - withDip) * 60 - m.dipCorr(4)) < TOL,
    `dip moved Ho by ${((base - withDip) * 60).toFixed(4)}', dipCorr says ${m.dipCorr(4).toFixed(4)}'`
  );
});

test('sun limb correction moves the right way and by a semi-diameter', () => {
  const lower = m.sightToHo({ hs: 30, body: 'sun', limb: 'lower' });
  const upper = m.sightToHo({ hs: 30, body: 'sun', limb: 'upper' });
  assert.ok(lower > upper, 'lower limb should reduce higher than upper limb');
  assert.ok(
    Math.abs((lower - upper) - 2 * m.SUN_SD / 60) < 1e-9,
    'limbs should differ by two semi-diameters'
  );
});

test('moon parallax is the dominant correction and vanishes at the zenith', () => {
  const r = 60.27; // mean distance, Earth radii
  // Horizontal parallax is ~57' at mean distance — the largest correction
  // in the whole reduction, and it falls off as cos(altitude).
  assert.ok(Math.abs(m.moonHP(r) - 57.04) < 0.5, `moon HP was ${m.moonHP(r)}'`);
  assert.ok(m.moonParallaxCorr(r, 0) > m.moonParallaxCorr(r, 60), 'parallax should fall with altitude');
  assert.ok(Math.abs(m.moonParallaxCorr(r, 90)) < 1e-9, 'no parallax correction at the zenith');
  // Closer moon -> larger parallax and larger semi-diameter.
  assert.ok(m.moonHP(56) > m.moonHP(63), 'perigee should give a larger parallax than apogee');
  assert.ok(m.moonSD(56) > m.moonSD(63), 'perigee should give a larger semi-diameter');
});

test('intercept is signed toward the body and in nautical miles', () => {
  assert.strictEqual(m.intercept(45, 45), 0, 'a sight matching the computed altitude gives no intercept');
  assert.ok(Math.abs(m.intercept(45 + 1 / 60, 45) - 1) < 1e-9, "1' higher than computed is 1 nm toward");
  assert.ok(Math.abs(m.intercept(45 - 1 / 60, 45) + 1) < 1e-9, "1' lower than computed is 1 nm away");
});

test('a below-horizon sight is named as impossible', () => {
  // The v1.6 regression case: Canopus at Hc -79 once gave a confident
  // 5,981 nm intercept with no warning at all.
  const w = m.sightWarnings({ hc: -79, ho: -79, nm: 5981 }, 'Canopus');
  assert.ok(w.length > 0, 'a below-horizon sight must produce a warning');
  assert.ok(
    w.some(s => /below the horizon/i.test(s)),
    `expected a below-horizon warning, got: ${JSON.stringify(w)}`
  );
  assert.ok(
    w.some(s => /Check the date, time and time zone/i.test(s)),
    'the warning should say what to check'
  );
});

test('a near-zenith sight is rejected as unusable', () => {
  const w = m.sightWarnings({ hc: 89, ho: 89, nm: 2 }, 'Vega');
  assert.ok(w.some(s => /azimuth is poorly defined/i.test(s)), `expected a zenith warning, got: ${JSON.stringify(w)}`);
});

test('a low sight is warned as weak but not rejected', () => {
  const w = m.sightWarnings({ hc: 3, ho: 3, nm: 2 }, 'Sirius');
  assert.ok(w.some(s => /weak/i.test(s)), `expected a weak-sight warning, got: ${JSON.stringify(w)}`);
  assert.ok(!w.some(s => /below the horizon/i.test(s)), 'a sight at 3° is above the horizon');
});

test('an implausibly large intercept is flagged as a probable blunder', () => {
  const w = m.sightWarnings({ hc: 40, ho: 41.5, nm: 90 }, 'Arcturus');
  assert.ok(w.some(s => /unusually large/i.test(s)), `expected a blunder warning, got: ${JSON.stringify(w)}`);
  const ok = m.sightWarnings({ hc: 40, ho: 40.1, nm: 6 }, 'Arcturus');
  assert.strictEqual(ok.length, 0, `a good sight should produce no warnings, got: ${JSON.stringify(ok)}`);
});

test('solveFix recovers a known offset from crossing position lines', () => {
  // Place the observer 10 nm east and 5 nm north of the assumed position and
  // synthesise the position lines three bodies would give.
  const lat0 = 40, lon0 = -70;
  const east = 10, north = 5;
  const lines = [0, 120, 240].map(zn => ({
    zn,
    nm: east * m.sin(zn) + north * m.cos(zn) // projection onto the bearing
  }));
  const fix = m.solveFix(lat0, lon0, lines);
  assert.ok(fix, 'three well-spread lines should give a fix');
  assert.ok(Math.abs(fix.lat - (lat0 + north / 60)) < 1e-9, `latitude off: ${fix.lat}`);
  assert.ok(Math.abs(fix.lon - (lon0 + east / 60 / m.cos(lat0))) < 1e-9, `longitude off: ${fix.lon}`);
  assert.ok(Math.abs(fix.nm - Math.hypot(east, north)) < 1e-9, `distance off: ${fix.nm}`);
});

test('solveFix refuses parallel position lines instead of inventing a fix', () => {
  // Two bodies on the same bearing give no cut; the determinant vanishes.
  assert.strictEqual(m.solveFix(40, -70, [{ zn: 90, nm: 3 }, { zn: 90, nm: 5 }]), null);
  assert.strictEqual(m.solveFix(40, -70, [{ zn: 45, nm: 3 }, { zn: 225, nm: 5 }]), null,
    'reciprocal bearings are the same line');
});

test('solveFix stays finite at the poles', () => {
  // cosLat is floored at 0.01 so a high-latitude fix cannot divide by zero.
  const fix = m.solveFix(89.999, 0, [{ zn: 0, nm: 2 }, { zn: 90, nm: 2 }]);
  assert.ok(fix && Number.isFinite(fix.lat) && Number.isFinite(fix.lon), 'a polar fix must stay finite');
});

test('cutQuality grades the weakest angle between bearings', () => {
  assert.strictEqual(m.cutQuality([]), '');
  assert.strictEqual(m.cutQuality([90]), '', 'one bearing is not a cut');
  assert.match(m.cutQuality([0, 120, 240]), /well spread/);
  assert.match(m.cutQuality([0, 40, 80]), /fair spread/);
  assert.match(m.cutQuality([0, 10, 20]), /poorly spread/);
  // Grading must use the smallest separation, not the largest.
  assert.match(m.cutQuality([0, 5, 180]), /poorly spread/, 'one tight pair should dominate the grade');
  // And it must wrap: 350° and 10° are 20° apart, not 340°.
  assert.match(m.cutQuality([350, 10]), /poorly spread/, 'bearing separation must wrap at 360°');
});
