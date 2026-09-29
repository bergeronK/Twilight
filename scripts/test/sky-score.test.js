'use strict';
/*
 * What the clear-and-dark score means, in words (2026-09-29). The week
 * planner showed a bare "57" per night, and nothing said what it was. Now
 * it says the scores are out of 100 and each night gets a rating and a
 * short phrase. (The Console showed the score too, until the place's Bortle
 * class took its spot the same day: sky-darkness.test.js.)
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'rev', 'sin', 'cos', 'asin', 'atan2', 'acos', 'jd', 'gmst',
  'sunRaDec', 'sunHcZn', 'sunAltitude', 'MOON_LR', 'MOON_B', 'moonEcliptic', 'moonState', 'scoreHours', 'summarize', 'clearDarkScore',
  'scoreRating', 'SCORE_SHORT']);

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

test('every factor has a short form for the week planner', () => {
  assert.deepStrictEqual(FACTORS.sort(), ['clear & dark', 'cloudy', 'moonlit', 'no astro-dark', 'rain likely', 'some cloud']);
  FACTORS.forEach(f => assert.ok(m.SCORE_SHORT[f], `${f} has a short form`));
});

// A clear forecast for Boston: the Moon alone decides.
function clearForecast(fromMs, hours) {
  const time = [], z = [];
  for (let i = 0; i < hours; i++) { time.push(new Date(fromMs + i * 3600000 - 4 * 3600000).toISOString().slice(0, 16)); z.push(0); }
  return { utc_offset_seconds: -4 * 3600, hourly: { time, cloud_cover: z, cloud_cover_high: z, precipitation_probability: z } };
}
const BOS = { lat: 42.36, lon: -71.06, tz: 'America/New_York' };

test('real nights: a clear sky under the full Moon is poor; at new Moon it is excellent', () => {
  // 27 September 2026, the night after the full Moon, seen at 11 PM: the
  // hours still ahead all have a high, 98%-lit Moon, so a cloudless sky
  // scores almost nothing. That is what the owner saw as a bare "1".
  const late = Date.UTC(2026, 8, 28, 3);
  const s1 = m.clearDarkScore(clearForecast(late - 3 * 3600000, 24), BOS, 4, late);
  assert.ok(s1.score <= 10, `score ${s1.score}`);
  assert.strictEqual(s1.factor, 'moonlit');
  assert.strictEqual(m.scoreRating(s1.score), 'Poor');
  // The same night seen at 6 PM: the first dark hours have the Moon still
  // low, so it is good, which is why the Console says "still ahead".
  const early = Date.UTC(2026, 8, 27, 22);
  const s0 = m.clearDarkScore(clearForecast(early - 3 * 3600000, 24), BOS, 4, early);
  assert.ok(s0.score >= 60 && s0.score < 78, `score ${s0.score}`);
  assert.strictEqual(m.scoreRating(s0.score), 'Good');
  // 10 October 2026, new Moon: the same clear sky is excellent.
  const nw = Date.UTC(2026, 9, 11, 1);
  const s2 = m.clearDarkScore(clearForecast(nw - 3 * 3600000, 24), BOS, 4, nw);
  assert.ok(s2.score >= 78, `score ${s2.score}`);
  assert.strictEqual(m.scoreRating(s2.score), 'Excellent');
});

test('the week planner says what its numbers are', () => {
  const week = declSource('weekPlannerEl');
  assert.match(week, /"scores out of 100"/);
  assert.match(week, /\$\{scoreRating\(n\.sum\.score\)\} · /);
  assert.match(week, /SCORE_SHORT\[n\.sum\.factor\]/);
});
