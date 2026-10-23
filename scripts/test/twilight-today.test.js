'use strict';
/*
 * "Twilight today" on the Console: the next twilight stage with its
 * countdown and the day's times, right under the painting (2026-09-25).
 * The app is about twilight; this had been a footnote at the foot of the page.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'asin', 'acos', 'atan2', 'rev', 'jd', 'gmst', 'sunAltitude', 'sunRaDec', 'sunHcZn', 'scanCrossings', 'refineCrossing', 'SUN_THR',
  'TWILIGHT_WORDS', 'twilightWord', 'twilightDay', 'cdHMS', 'cdWords']);

// Boston, 24 September 2026, local midnight (EDT, UTC-4) to midnight.
const BOS = [42.36, -71.06], MID = Date.UTC(2026, 8, 24, 4);
const sunEv = m.scanCrossings(MID, MID + 24 * 3600000, BOS[0], BOS[1], m.sunAltitude, m.SUN_THR, 1);

test('dawn climbs through the stages to sunrise, dusk goes down from sunset', () => {
  const d = m.twilightDay(sunEv, MID);
  assert.deepStrictEqual(d.dawn.map(r => r.label), ['Astronomical dawn', 'Nautical dawn', 'Civil dawn', 'Sunrise']);
  assert.deepStrictEqual(d.dusk.map(r => r.label), ['Sunset', 'Civil dusk', 'Nautical dusk', 'Astronomical dusk']);
  // Each at the Sun's height it names.
  const H = { rise: -0.833, civil: -6, naut: -12, astro: -18 };
  [...d.dawn, ...d.dusk].forEach(r => assert.ok(Math.abs(m.sunAltitude(new Date(r.t), ...BOS) - H[r.key]) < 0.1, r.label));
  // Sunrise about 6:36 and sunset about 18:37 local, as published for Boston.
  const local = t => new Date(t - 4 * 3600000).toISOString().slice(11, 16);
  assert.match(local(d.dawn[3].t), /^06:3\d$/);
  assert.match(local(d.dusk[0].t), /^18:3\d$/);
});

test('what has already happened is marked past', () => {
  const noon = MID + 12 * 3600000;
  const d = m.twilightDay(sunEv, noon);
  assert.ok(d.dawn.every(r => r.past), 'the morning is over');
  assert.ok(d.dusk.every(r => !r.past), 'the evening is to come');
});

test('a summer night far north has no nautical or astronomical dusk, and nothing is invented', () => {
  // Edinburgh at midsummer: the Sun gets only about 10.6° down.
  const mid = Date.UTC(2026, 5, 20, 23);
  const ev = m.scanCrossings(mid, mid + 24 * 3600000, 55.95, -3.19, m.sunAltitude, m.SUN_THR, 1);
  const d = m.twilightDay(ev, mid);
  assert.ok(!d.dusk.some(r => r.key === 'astro' || r.key === 'naut') && !d.dawn.some(r => r.key === 'astro' || r.key === 'naut'));
  assert.deepStrictEqual(d.dusk.map(r => r.key), ['rise', 'civil']);
});

test('the section: heading, next stage and countdown, two columns, a way on', () => {
  const R = { createElement: (t, p, ...c) => ({ t, p, c: c.flat().filter(x => x != null && x !== false) }) };
  let clicked = 0;
  const C = { ink: 'INK', inkDim: 'DIM', inkFaint: 'FAINT', brass: 'AMBER', line: 'LINE' };
  // The countdown is a child with its own clock (2026-10-21); TwilightToday
  // stays hook-free and hands it the moment and the Console's time. Its
  // hooks stubbed: the state is its first value, the effect not run.
  const TC = new Function('React', 'C', 'cdHMS', 'cdWords', 'useState', 'useEffect', `${declSource('TwilightCountdown')}; return TwilightCountdown;`)(
    R, C, m.cdHMS, m.cdWords, v => [v, () => {}], () => {});
  const TT = new Function('React', 'C', 'cdHMS', 'twilightWord', 'TWILIGHT_DOTS', 'TwilightCountdown', `${declSource('TwilightToday')}; return TwilightToday;`)(
    R, C, m.cdHMS, m.twilightWord, {}, TC);
  const text = n => typeof n === 'string' || typeof n === 'number' ? String(n) : n.t === TC ? text(TC(n.p)) : (n.c || []).map(text).join('');
  const noon = MID + 12 * 3600000;
  const sched = { when: 'today', ...m.twilightDay(sunEv, noon) };
  const next = sunEv.find(e => e.t > noon);
  const now = next.t - (2 * 3600000 + 14 * 60000 + 5000);
  const out = TT({ next, now, sched, fmt: t => 'T' + Math.round(t / 1e9), sunUp: true, onMore: () => clicked++ });
  const all = text(out);
  assert.match(all, /^Twilight today/);
  // On screen the seconds; for a screen reader words, to the minute.
  assert.match(all, /Sunset at T\d+in 2 hours 14 minutesin 2h 14m 5s/);
  const cd = out.c[1].c[1];
  assert.strictEqual(cd.t, TC);
  assert.deepStrictEqual(cd.p, { to: next.t, now });
  const shown = TC(cd.p);
  assert.strictEqual(shown.c[0].p.className, 'sr-only');
  assert.strictEqual(shown.c[1].p['aria-hidden'], 'true');
  assert.ok(!/aria-live|"role"/.test(JSON.stringify(shown)), 'not a live region');
  assert.match(all, /Dawn.*Astronomical dawn.*Sunrise.*Dusk.*Sunset.*Astronomical dusk/);
  assert.ok(!JSON.stringify(out).includes('"border":'), 'no boxes: hairlines only');
  const btns = out.c[out.c.length - 1].c, btn = btns[btns.length - 1];
  assert.strictEqual(btn.t, 'button');
  btn.p.onClick(); assert.strictEqual(clicked, 1);
  // Past rows dimmed.
  const dawnRows = out.c[2].c[0].c.slice(1);
  assert.ok(dawnRows.every(r => r.p.style.color === 'FAINT'));
  // No Sun crossings at all: say which way it is.
  const none = { when: 'today', dawn: [], dusk: [] };
  assert.match(text(TT({ next: null, now: 0, sched: none, fmt: String, sunUp: true, onMore() {} })), /The Sun doesn’t set today\./);
  assert.match(text(TT({ next: null, now: 0, sched: { ...none, when: 'tomorrow' }, fmt: String, sunUp: false, onMore() {} })), /The Sun doesn’t rise tomorrow\./);
});

test('on the Console it sits under the painting\'s facts, before the highlights', () => {
  const rt = declSource('RealtimeTwilight');
  assert.match(rt, /React\.createElement\(HorizonHero, \{[\s\S]*?twilight: React\.createElement\(TwilightToday, \{/);
  const hh = declSource('HorizonHero');
  const facts = hh.indexOf('React.createElement(NightFacts'), tw = hh.indexOf('twilight || null'), hl = hh.indexOf('React.createElement(TonightHighlights');
  assert.ok(facts > 0 && facts < tw && tw < hl, 'facts, then twilight, then the highlights');
  // The next stage is looked for two days ahead, not only until midnight.
  assert.match(rt, /scanCrossings\(now - 60000, now \+ 48 \* 3600000/);
  assert.match(rt, /when: "tomorrow"/);
});
