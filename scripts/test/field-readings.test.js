'use strict';
/*
 * Real readings from a real phone.
 *
 * Every other orientation test pins the app to the W3C spec. These pin it to
 * what an iPhone actually reported, copied verbatim from Sky View's Sensors
 * panel on 2026-09-16 at 42.10 N, 72.45 W. They are the only tests in the
 * suite with a ground truth that did not come from this codebase's own
 * reasoning — so if one fails, believe the phone.
 *
 * Reading 2 was taken with the real Polaris centred in the crosshair, camera
 * on. Polaris from there sits at az 0 +/- 1, alt 41.4 to 42.8.
 *
 * Reading 1 was taken pointing at where the app DREW Polaris, which the
 * observer judged to be about 30 degrees left of the real one.
 *
 * The fusion state (the north offset) is taken as the phone reported it:
 * learned face-up, from headings the app then treated as true north.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');
const O = require('./orient-lib.js');
const { angErr } = O;

const A = extract([
  'D2R', 'R2D', 'rev', 'sin', 'cos', 'asin', 'atan2', 'acos', 'jd', 'gmst', 'starHcZn',
  'WMM_EPOCH_YEARS', 'WMM_COF', 'wmmCache', 'wmmModel', 'magneticDeclination'
]);
const headingCorrection = new Function('orient', 'decl', 'aimOffset', declSource('headingCorr') + '\nreturn headingCorr;');

const HERE = { lat: 42.10, lon: -72.45 };
const WHEN = new Date('2026-09-17T01:30:00Z'); // evening, local
const decl = A.magneticDeclination(HERE.lat, HERE.lon, WHEN);
const polaris = A.starHcZn(37.95, 89.264, HERE.lat, HERE.lon, WHEN);

const READING_1 = { alpha: 60, beta: 132.6, gamma: 0.9, yaw: 295.4, manual: 0, heading: 346 };
const READING_2 = { alpha: 190.3, beta: 136.1, gamma: -2.6, yaw: 154.9, manual: 15, heading: 190 };

const fusedOf = r => O.quatMul(O.yawQ(r.yaw), O.quatFromEuler(r.alpha, r.beta, r.gamma));

test('the app\'s maths reproduces the readings the phone displayed', () => {
  // The phone showed "Aimed at: az 4° · alt 43°" and "az 33° · alt 46°".
  // Not exact by design: alpha/beta/gamma in the panel are the last raw
  // event, rounded to 0.1, while "Aimed at" is the smoothed view. They should
  // agree to within about a degree.
  const a1 = O.aimOf(O.correctView(fusedOf(READING_1), READING_1.manual));
  const a2 = O.aimOf(O.correctView(fusedOf(READING_2), READING_2.manual));
  assert.ok(angErr(a1.az, 4) < 1.5 && Math.abs(a1.alt - 43) < 1.5, `reading 1 reproduced as az ${a1.az.toFixed(1)} alt ${a1.alt.toFixed(1)}`);
  assert.ok(angErr(a2.az, 33) < 1.5 && Math.abs(a2.alt - 46) < 1.5, `reading 2 reproduced as az ${a2.az.toFixed(1)} alt ${a2.alt.toFixed(1)}`);
});

test('the declination here is what the phone showed', () => {
  assert.ok(Math.abs(decl.deg - -13.4) < 0.05, `panel said 13.4° W, model says ${decl.deg}`);
});

test('with Polaris centred, the corrected app now points at Polaris', () => {
  // The heading is magnetic, so declination applies. Manual correction is
  // taken as zero — the +15 the observer had dialled in was a failed attempt
  // to fix exactly this error, in the wrong direction.
  const o = { magnetic: true };
  const aim = O.aimOf(O.correctView(fusedOf(READING_2), headingCorrection(o, decl, 0)));
  const err = angErr(aim.az, polaris.az);
  // What remains matches the ~4 degrees the altitude is also out by: hand
  // aiming, not the model.
  assert.ok(err < 6, `still ${err.toFixed(1)} deg from Polaris in azimuth`);
  assert.ok(Math.abs(aim.alt - polaris.alt) < 5, `altitude ${aim.alt.toFixed(1)} vs Polaris ${polaris.alt.toFixed(1)}`);
});

test('treating the heading as true north reproduces the reported error', () => {
  // The old assumption, applied to the same reading: 13.4 degrees worse.
  const asTrue = O.aimOf(O.correctView(fusedOf(READING_2), headingCorrection({ magnetic: false }, decl, 0)));
  const asMag = O.aimOf(O.correctView(fusedOf(READING_2), headingCorrection({ magnetic: true }, decl, 0)));
  const errTrue = angErr(asTrue.az, polaris.az), errMag = angErr(asMag.az, polaris.az);
  assert.ok(errTrue > 15, `true-north assumption should be well off, was ${errTrue.toFixed(1)}`);
  assert.ok(errTrue - errMag > 12, `declination should account for most of it (${errTrue.toFixed(1)} vs ${errMag.toFixed(1)})`);
});

test('the phone\'s face-down heading is magnetic, whichever axis it named', () => {
  // Reading 2: camera on Polaris, so the top of the phone points about 180
  // true — 193.4 magnetic. The phone said 190.
  const top2 = O.vecAz(O.quatRotate(O.quatFromEuler(0, 136.1, -2.6), [0, 1, 0])); // camera due north
  const topMag = (top2 - decl.deg + 360) % 360;
  assert.ok(angErr(topMag, READING_2.heading) < 5, `reading 2: top-of-phone magnetic ${topMag.toFixed(1)} vs reported 190`);
  // Reading 1: the observer put the app's Polaris ~30 left of the real one,
  // so the camera faced ~330 true — ~343 magnetic. The phone said 346.
  const cameraMag = (330 - decl.deg + 360) % 360;
  assert.ok(angErr(cameraMag, READING_1.heading) < 6, `reading 1: camera magnetic ${cameraMag.toFixed(1)} vs reported 346`);
  // Those two name different axes of the phone — 180 degrees apart in
  // meaning. That is why a face-down heading is never trusted.
});

test('the app\'s error in reading 1 matches what the observer saw', () => {
  // App believed az 3.4; the camera faced ~332.6 true if the heading named
  // the camera (346 magnetic). The difference is the drawn offset.
  const appAz = O.aimOf(fusedOf(READING_1)).az;
  const trueCamera = (READING_1.heading + decl.deg + 360) % 360;
  const seen = angErr(appAz, trueCamera);
  assert.ok(Math.abs(seen - 30) < 5, `app-vs-real offset ${seen.toFixed(1)}, observer said ~30`);
});
