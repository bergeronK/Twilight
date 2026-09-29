'use strict';
/*
 * What the clear-and-dark score means, in words (2026-09-29). The Console
 * showed a bare "1" under "Sky tonight" and a bare "57" per night in the
 * week planner, and nothing said what either number was. Now every score
 * says it is out of 100, gets a rating, and the Console says why and how
 * it is worked out.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'rev', 'sin', 'cos', 'asin', 'atan2', 'acos', 'jd', 'gmst',
  'sunRaDec', 'sunHcZn', 'sunAltitude', 'MOON_LR', 'MOON_B', 'moonEcliptic', 'moonState', 'scoreHours', 'summarize', 'clearDarkScore',
  'scoreRating', 'scoreReason', 'SCORE_SHORT']);

// Every factor summarize() can return, read from its source, so a new one
// can't go without words.
const FACTORS = [...new Set([...declSource('summarize').matchAll(/factor = "([^"]+)"/g), ...declSource('summarize').matchAll(/"(cloudy|some cloud|moonlit)"/g)].map(x => x[1]))];

test('a rating for every score: 78 and up is excellent, as the factor and the alerts have it', () => {
  const r = s => m.scoreRating(s);
  assert.deepStrictEqual([100, 78, 77, 60, 59, 40, 39, 1, 0].map(r), ['Excellent', 'Excellent', 'Good', 'Good', 'Fair', 'Fair', 'Poor', 'Poor', 'Poor']);
  assert.strictEqual(r(null), null);
  // "clear & dark" starts where "Excellent" does.
  assert.match(declSource('summarize'), /else if \(score >= 78\) factor = "clear & dark"/);
});

test('every factor has a sentence and a short form', () => {
  assert.deepStrictEqual(FACTORS.sort(), ['clear & dark', 'cloudy', 'moonlit', 'no astro-dark', 'rain likely', 'some cloud']);
  FACTORS.forEach(f => {
    const line = m.scoreReason({ score: 50, factor: f });
    assert.match(line, /^[A-Z].*\.$/, `${f}: "${line}" is a sentence`);
    assert.ok(m.SCORE_SHORT[f], `${f} has a short form`);
  });
  // The Moon's sentence is gentler when the score is still good.
  assert.match(m.scoreReason({ score: 1, factor: 'moonlit' }), /bright Moon will wash out/);
  assert.match(m.scoreReason({ score: 65, factor: 'moonlit' }), /faintest stars/);
  // No forecast, and no night in it.
  assert.match(m.scoreReason(null), /couldn’t be loaded/);
  assert.match(m.scoreReason({ score: null, factor: 'no night ahead', hours: [] }), /no dark stretch/);
});

// A clear forecast for Boston: the Moon alone decides.
function clearForecast(fromMs, hours) {
  const time = [], z = [];
  for (let i = 0; i < hours; i++) { time.push(new Date(fromMs + i * 3600000 - 4 * 3600000).toISOString().slice(0, 16)); z.push(0); }
  return { utc_offset_seconds: -4 * 3600, hourly: { time, cloud_cover: z, cloud_cover_high: z, precipitation_probability: z } };
}
const BOS = { lat: 42.36, lon: -71.06, tz: 'America/New_York' };

test('real nights: a clear sky under the full Moon is poor, and says why; at new Moon it is excellent', () => {
  // 27 September 2026, the night after the full Moon, seen at 11 PM: the
  // hours still ahead all have a high, 98%-lit Moon, so a cloudless sky
  // scores almost nothing. That is what the owner saw as a bare "1".
  const late = Date.UTC(2026, 8, 28, 3);
  const s1 = m.clearDarkScore(clearForecast(late - 3 * 3600000, 24), BOS, 4, late);
  assert.ok(s1.score <= 10, `score ${s1.score}`);
  assert.strictEqual(s1.factor, 'moonlit');
  assert.strictEqual(m.scoreRating(s1.score), 'Poor');
  assert.match(m.scoreReason(s1), /bright Moon will wash out/);
  // The same night seen at 6 PM: the first dark hours have the Moon still
  // low, so it is good, which is why the Console says "still ahead".
  const early = Date.UTC(2026, 8, 27, 22);
  const s0 = m.clearDarkScore(clearForecast(early - 3 * 3600000, 24), BOS, 4, early);
  assert.ok(s0.score >= 60 && s0.score < 78, `score ${s0.score}`);
  assert.strictEqual(m.scoreRating(s0.score), 'Good');
  assert.match(m.scoreReason(s0), /faintest stars/);
  // 10 October 2026, new Moon: the same clear sky is excellent.
  const nw = Date.UTC(2026, 9, 11, 1);
  const s2 = m.clearDarkScore(clearForecast(nw - 3 * 3600000, 24), BOS, 4, nw);
  assert.ok(s2.score >= 78, `score ${s2.score}`);
  assert.strictEqual(m.scoreRating(s2.score), 'Excellent');
  assert.strictEqual(m.scoreReason(s2), 'Clear skies, with the Moon out of the way.');
});

const R = { createElement: (t, p, ...c) => ({ t, p, c: c.flat().filter(x => x != null && x !== false) }) };
const SkyScore = new Function('React', 'C', 'scoreRating', 'scoreReason', `${declSource('SkyScore')}; return SkyScore;`)(
  R, { ink: 'INK', inkDim: 'DIM', inkFaint: 'FAINT', brass: 'AMBER' }, m.scoreRating, m.scoreReason);
const texts = n => typeof n === 'string' ? [n] : (n.c || []).flatMap(texts);

test('the Console says the score is out of 100, rates it, says why and how it is worked out', () => {
  const t = texts(SkyScore({ sum: { score: 1, factor: 'moonlit' } }));
  assert.deepStrictEqual(t.slice(0, 3), ['1', 'out of 100', 'Poor night for stargazing']);
  assert.match(t[3], /bright Moon/);
  assert.match(t[4], /^Scored for the best two hours still ahead tonight: 100 is a clear sky with no Moon/);
  assert.ok(!/Forecast from/.test(t[4]));
  const good = texts(SkyScore({ sum: { score: 84, factor: 'clear & dark' } }));
  assert.deepStrictEqual(good.slice(0, 3), ['84', 'out of 100', 'Excellent night for stargazing']);
  // An old forecast says so, as a sentence.
  const old = texts(SkyScore({ sum: { score: 57, factor: 'some cloud' }, stale: 'forecast from 3 hours ago' }));
  assert.match(old[4], / Forecast from 3 hours ago\.$/);
  // No forecast: a dash, no scale, and the reason.
  const none = texts(SkyScore({ sum: null }));
  assert.deepStrictEqual(none.slice(0, 2), ['—', 'Sky tonight']);
  assert.ok(!none.includes('out of 100'));
  assert.match(none[2], /couldn’t be loaded/);
});

test('the strip and the week planner say what their numbers are too', () => {
  const strip = declSource('skyStripEl');
  assert.match(strip, /\$\{Math\.round\(hr\.score\)\} out of 100/);
  assert.ok(!/wxScore\.factor/.test(strip), 'the factor word is said, as a sentence, just above');
  const week = declSource('weekPlannerEl');
  assert.match(week, /"scores out of 100"/);
  assert.match(week, /\$\{scoreRating\(n\.sum\.score\)\} · /);
  assert.match(week, /SCORE_SHORT\[n\.sum\.factor\]/);
});
