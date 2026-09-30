'use strict';
/*
 * How dark the place's sky is, on the Console (2026-09-29). The owner's
 * original idea for the spot under tonight's ribbon was the location's
 * Bortle number; the 0-100 clear-and-dark score had taken it, and a bare
 * "1" there meant nothing to anyone. Now it is the Bortle class, 1 to 9,
 * with its scale said and what that sky shows on a clear, moonless night.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const m = extract(['BORTLE', 'BORTLE_WORD', 'skyWord', 'BORTLE_SEE', 'staleNote']);
const R = { createElement: (t, p, ...c) => ({ t, p, c: c.flat().filter(x => x != null && x !== false) }) };
const C = { ink: 'INK', inkDim: 'DIM', inkFaint: 'FAINT', brass: 'AMBER', line: 'LINE' };
const SkyDarkness = new Function('React', 'C', 'skyWord', 'BORTLE_SEE', `${declSource('SkyDarkness')}; return SkyDarkness;`)(R, C, m.skyWord, m.BORTLE_SEE);
const texts = n => typeof n === 'string' ? [n] : (n.c || []).flatMap(texts);

test('every class from 1 to 9 has a sentence, darkest first', () => {
  for (let b = 1; b <= 9; b++) {
    assert.match(m.BORTLE_SEE[b], /^[a-z].*\.$/, `class ${b} reads on from "On a clear, moonless night"`);
    assert.ok(m.BORTLE[b] && m.BORTLE_WORD[b], `class ${b} is one the settings offer`);
  }
  assert.strictEqual(Object.keys(m.BORTLE_SEE).length, 9);
  // The ends of the scale: the Milky Way casts shadows; only the brightest show.
  assert.match(m.BORTLE_SEE[1], /Milky Way.*shadows/);
  assert.match(m.BORTLE_SEE[9], /only the Moon, the planets/);
  // The Milky Way is gone from 7 on, and there before that.
  for (let b = 1; b <= 6; b++) assert.ok(!/gone|only the/.test(m.BORTLE_SEE[b]), `class ${b}`);
  assert.match(m.BORTLE_SEE[7], /Milky Way is gone/);
});

test('the Console shows the class, its scale, what it means, and where it came from', () => {
  const t = texts(SkyDarkness({ bortle: 5, auto: true, from: 'towns' }));
  assert.deepStrictEqual(t.slice(0, 3), ['5', 'of 9 on the Bortle scale', 'Suburban sky']);
  assert.strictEqual(t[3], 'On a clear, moonless night the Milky Way is faint, and washed out toward the horizon.');
  assert.strictEqual(t[4], '1 is the darkest sky on Earth, 9 an inner city. Estimated from the towns around you.');
  // Where the satellite tiles answered (light-pollution.test.js has the rest).
  assert.match(texts(SkyDarkness({ bortle: 5, auto: true, from: 'satellite' }))[4], /satellite measurements/);
  const dark = texts(SkyDarkness({ bortle: 1, auto: false }));
  assert.deepStrictEqual(dark.slice(0, 3), ['1', 'of 9 on the Bortle scale', 'Excellent dark sky']);
  assert.match(dark[4], /Set by you in settings\.$/);
  assert.deepStrictEqual(texts(SkyDarkness({ bortle: 9, auto: true })).slice(0, 3), ['9', 'of 9 on the Bortle scale', 'Inner-city sky']);
});

test('before the class is known: a dash, no scale, and why', () => {
  const detecting = texts(SkyDarkness({ bortle: 0, auto: true }));
  assert.deepStrictEqual(detecting.slice(0, 2), ['—', 'How dark your sky is']);
  assert.match(detecting[2], /Working out/);
  assert.ok(!detecting.some(x => /Bortle scale/.test(x)));
  const unset = texts(SkyDarkness({ bortle: 0, auto: false }));
  assert.match(unset[2], /Choose it in settings/);
});

test('an old forecast is still said, now on the twilight section’s forecast line', () => {
  const TT = new Function('React', 'C', 'cdHMS', 'twilightWord', 'TWILIGHT_DOTS', `${declSource('TwilightToday')}; return TwilightToday;`)(
    R, C, () => '', () => '', {});
  const glows = [{ kind: 'set', label: 'Tonight’s sunset', level: 'some', title: 'Some colour possible', detail: 'x' }];
  const base = { next: null, now: 0, sched: { when: 'today', dawn: [], dusk: [] }, fmt: String, sunUp: true, onMore: () => {}, glows };
  const line = n => typeof n === 'string' ? n : (n.c || []).map(line).join('');
  const find = (n, re) => typeof n === 'string' ? (re.test(n) ? n : null) : (n.c || []).reduce((a, c) => a || find(c, re), null);
  assert.strictEqual(find(TT(base), /forecast\./), 'An estimate from the cloud forecast.');
  const old = find(TT({ ...base, stale: m.staleNote(0, 3 * 3600000 + 5) }), /forecast/);
  assert.strictEqual(old, 'An estimate from the cloud forecast. Forecast from 3 hours ago.');
});
