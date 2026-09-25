'use strict';
/*
 * planetAltAz against dated events, not against itself.
 *
 * At opposition a planet sits opposite the Sun; at inferior conjunction
 * Venus sits beside it. The dates are published and unambiguous, so the
 * angle between planet and Sun on those dates is ground truth that no
 * rearrangement of the same formula can fake. This is what caught the
 * planets being placed tens of degrees off for years: the orbital-element
 * code subtracted the node twice, and nothing had ever checked it against
 * the sky.
 *
 * Tolerances allow for what this model leaves out on purpose: the planets'
 * own ecliptic latitude (a few degrees) and Jupiter-Saturn perturbations.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'rev', 'sin', 'cos', 'asin', 'acos', 'atan2', 'jd', 'gmst', 'planetGeo', 'planetAltAz', 'sunHcZn', 'sunRaDec']);
const D = Math.PI / 180;
const sep = (a, b) => Math.acos(Math.min(1,
  Math.sin(a.alt * D) * Math.sin(b.alt * D) + Math.cos(a.alt * D) * Math.cos(b.alt * D) * Math.cos((a.az - b.az) * D))) / D;
const fromSun = (planet, day) => {
  const d = new Date(day + 'T06:00:00Z');
  return sep(m.planetAltAz(planet, d, 0, 0), m.sunHcZn(d, 0, 0));
};

for (const [planet, day] of [
  ['Saturn', '2024-09-08'], ['Saturn', '2025-09-21'],
  ['Jupiter', '2024-12-07'], ['Jupiter', '2026-01-10'],
  ['Mars', '2025-01-16']
]) {
  test(`${planet} at opposition on ${day} is opposite the Sun`, () => {
    const a = fromSun(planet, day);
    assert.ok(a > 172, `${planet} was ${a.toFixed(1)}° from the Sun`);
  });
}

test('Venus at inferior conjunction on 2025-03-23 is beside the Sun', () => {
  // That conjunction passed about 8° north of the Sun, not across its face.
  const a = fromSun('Venus', '2025-03-23');
  assert.ok(a < 12, `Venus was ${a.toFixed(1)}° from the Sun`);
});

test('Saturn is below the Boston horizon mid-afternoon two weeks before opposition', () => {
  // 22 Sep 2026, 14:00 EDT: near opposition, Saturn rises around sunset.
  const alt = m.planetAltAz('Saturn', new Date('2026-09-22T18:00:00Z'), 42.36, -71.06).alt;
  assert.ok(alt < -20, `Saturn altitude ${alt.toFixed(1)}°`);
});
