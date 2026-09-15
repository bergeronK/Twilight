'use strict';
/*
 * What the Console says about tonight, and how it counts down.
 *
 * This is the first thing most visitors read, and it is pure branch logic
 * over thresholds — the kind of code that stays wrong for a long time,
 * because every branch returns a sentence that reads perfectly well even when
 * it is the wrong one for the sky outside.
 *
 * CLAUDE.md's voice rule applies to these strings: plain words on the
 * Console, and the Navigator's vocabulary must not leak outward.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { extract } = require('./extract.js');

const { tonightGlance, cdText, cdHMS } = extract(['tonightGlance', 'cdText', 'cdHMS']);

const sky = (phase, alt, illum) => ({ phase, m: { alt, illum } });

test('twilight phase outranks the Moon', () => {
  // A bright Moon during nautical twilight is still nautical twilight — the
  // phase branches have to come first or the Console mislabels dusk.
  const bright = sky('naut', 45, 0.95);
  assert.strictEqual(tonightGlance(bright).head, 'Nautical twilight');
  assert.strictEqual(tonightGlance(sky('civil', 45, 0.95)).head, 'Golden hour');
  assert.strictEqual(tonightGlance(sky('day', 45, 0.95)).head, 'Daylight');
});

test('a dark sky with no Moon is the best verdict', () => {
  const g = tonightGlance(sky('night', -20, 0));
  assert.strictEqual(g.head, 'Excellent stargazing');
  assert.match(g.sub, /Moon is down/);
});

test('a Moon below the horizon does not count however full it is', () => {
  // illum is the phase of the Moon, not its contribution to the sky — a full
  // Moon that has set makes no difference to what you can see.
  const g = tonightGlance(sky('night', -1, 1.0));
  assert.strictEqual(g.head, 'Excellent stargazing');
  assert.match(g.sub, /Moon is down/);
});

test('moonlight grades in the right direction', () => {
  assert.strictEqual(tonightGlance(sky('night', 30, 0.9)).head, 'Bright Moon');
  assert.strictEqual(tonightGlance(sky('night', 30, 0.4)).head, 'Good stargazing');
  assert.strictEqual(tonightGlance(sky('night', 30, 0.1)).head, 'Excellent stargazing');
});

test('the illumination thresholds are where they claim to be', () => {
  // Just either side of 0.6 and 0.25.
  assert.strictEqual(tonightGlance(sky('night', 30, 0.61)).head, 'Bright Moon');
  assert.strictEqual(tonightGlance(sky('night', 30, 0.59)).head, 'Good stargazing');
  assert.strictEqual(tonightGlance(sky('night', 30, 0.26)).head, 'Good stargazing');
  assert.strictEqual(tonightGlance(sky('night', 30, 0.24)).head, 'Excellent stargazing');
});

test('every verdict has a head, a sub and a tone', () => {
  const cases = [
    sky('day', 0, 0), sky('civil', 0, 0), sky('naut', 0, 0),
    sky('night', 30, 0.9), sky('night', 30, 0.4), sky('night', 30, 0.05), sky('night', -5, 0.5)
  ];
  for (const c of cases) {
    const g = tonightGlance(c);
    assert.ok(g.head && g.sub && g.tone, `incomplete verdict for ${JSON.stringify(c)}`);
    assert.ok(g.tone.startsWith('var(--'), `tone should be a design token, got ${g.tone}`);
    assert.ok(/[.!]$/.test(g.sub), `sub should be a full sentence: "${g.sub}"`);
  }
});

test('Console copy keeps the Navigator vocabulary out', () => {
  // The voice rule: a casual stargazer lands on the Console first, and terms
  // like Bortle, limiting magnitude and marine horizon do not belong there.
  const banned = /bortle|limiting magnitude|marine horizon|\bcut\b|\bHs\b|index error/i;
  const cases = [
    sky('day', 0, 0), sky('civil', 0, 0), sky('naut', 0, 0),
    sky('night', 30, 0.9), sky('night', 30, 0.4), sky('night', 20, 0.05), sky('night', -5, 0.5)
  ];
  for (const c of cases) {
    const g = tonightGlance(c);
    assert.ok(!banned.test(g.head + ' ' + g.sub), `Navigator vocabulary leaked: "${g.head} — ${g.sub}"`);
  }
});

test('illumination is reported as a whole percentage', () => {
  const g = tonightGlance(sky('night', 30, 0.837));
  assert.match(g.sub, /84%-lit/, `expected a rounded percentage, got "${g.sub}"`);
  assert.ok(!/\d\.\d/.test(g.sub), `no decimals in the percentage: "${g.sub}"`);
});

test('cdText is minute resolution and rolls over into hours', () => {
  assert.strictEqual(cdText(0), '0m');
  assert.strictEqual(cdText(60000), '1m');
  assert.strictEqual(cdText(59 * 60000), '59m');
  assert.strictEqual(cdText(60 * 60000), '1h 0m');
  assert.strictEqual(cdText(3720000), '1h 2m');
  assert.strictEqual(cdText(-5000), '0m', 'a passed deadline should not go negative');
});

test('cdHMS is second resolution and hides a zero hour', () => {
  assert.strictEqual(cdHMS(0), '0m 0s');
  assert.strictEqual(cdHMS(5000), '0m 5s');
  assert.strictEqual(cdHMS(65000), '1m 5s');
  assert.strictEqual(cdHMS(3725000), '1h 2m 5s');
  assert.strictEqual(cdHMS(-1000), '0m 0s', 'a passed deadline should not go negative');
});

test('the two formatters stay distinct on purpose', () => {
  // Not a duplication to merge: one is a planning number, the other ticks.
  assert.ok(!cdText(3725000).includes('s'), 'cdText must not show seconds');
  assert.ok(cdHMS(3725000).includes('s'), 'cdHMS must show seconds');
});
