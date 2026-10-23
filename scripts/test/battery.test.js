'use strict';
/*
 * How often the app does its work (2026-10-21). A review of v164 on older
 * iPhones (CPU throttled 4-6x) found the battery going on work nobody saw:
 *
 *   - Intl.DateTimeFormat made afresh for every time written, thousands a
 *     minute: now kept, one per locale, zone and options (`dtf`).
 *   - the whole Console rendered every second for the one line that shows
 *     seconds: now the countdown ticks by itself (TwilightCountdown) and
 *     the Console once a minute, on the minute, and as each stage passes.
 *   - the painting asking for every frame the screen had all night: now
 *     about 15 a second for the twinkling, 30 while a meteor flies.
 *   - Sky View re-rendering the Stars tab's other sections (preview, chart,
 *     Jupiter and Saturn, the space station) on every sensor reading, and
 *     working the Milky Way out afresh for every frame: now those sections
 *     are memoised with props that hold still, and the Milky Way is kept
 *     while the view turns less than a degree, moved to match.
 *
 * None of it changes what is shown; these tests pin the rules that keep it
 * so, and that the old way does not come back.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'asin', 'atan2', 'rev', 'dtf', 'tzOffset', 'localMidnight', 'dateKey', 'localDay',
  'cdHMS', 'cdWords', 'TWINKLE_FRAME_MS', 'skyFrameMs', 'skyFrameDue', 'skyFrameWait',
  'quatFromEuler', 'quatAxis', 'quatRotate', 'quatMul', 'viewBasis', 'toScreen', 'skyProject', 'vecAz', 'screenDir',
  'MW_KEEP_DEG', 'mwReusable', 'mwShift']);

// ---------------------------------------------------------------- formatters

const ZONES = ['America/New_York', 'Europe/London', 'Asia/Kolkata', 'Australia/Lord_Howe', 'Pacific/Chatham', 'America/St_Johns', 'Pacific/Apia', 'UTC'];
// Through a DST change each way, a half-hour zone, a 45-minute one, the date line.
const TIMES = [Date.UTC(2026, 2, 8, 6, 59, 30), Date.UTC(2026, 2, 8, 7, 0, 30), Date.UTC(2026, 9, 25, 0, 59, 59), Date.UTC(2026, 9, 25, 1, 0, 1),
  Date.UTC(2026, 10, 1, 5, 30), Date.UTC(2026, 5, 21, 23, 59, 59), Date.UTC(2026, 11, 31, 12)];

test('a kept formatter writes exactly what a fresh one does, for every zone, option and 12/24 hours', () => {
  const opts = [
    h24 => ({ timeZone: null, hour: 'numeric', minute: '2-digit', hourCycle: h24 ? 'h23' : 'h12' }),
    () => ({ timeZone: null, year: 'numeric', month: '2-digit', day: '2-digit' }),
    () => ({ timeZone: null, weekday: 'long', month: 'long', day: 'numeric' }),
    h24 => ({ timeZone: null, hour: 'numeric', hourCycle: h24 ? 'h23' : 'h12' }),
    () => ({ timeZone: null, weekday: 'long' })];
  for (const locale of [[], 'en-CA', 'en-US']) for (const tz of ZONES) for (const mk of opts) for (const h24 of [true, false]) {
    const o = mk(h24); o.timeZone = tz;
    // Asked for twice, interleaved with others, so a cache keyed too loosely
    // (on the zone alone, or ignoring the 12/24-hour cycle) hands back the
    // wrong one.
    for (const t of TIMES) {
      assert.strictEqual(m.dtf(locale, o).format(new Date(t)), new Intl.DateTimeFormat(locale, o).format(new Date(t)), `${locale} ${tz} ${JSON.stringify(o)}`);
    }
  }
});

test('one formatter is kept per locale, zone and options; with no zone named it is made fresh', () => {
  const o = { timeZone: 'Europe/Paris', hour: 'numeric' };
  assert.strictEqual(m.dtf([], o), m.dtf([], { timeZone: 'Europe/Paris', hour: 'numeric' }), 'kept');
  assert.notStrictEqual(m.dtf([], o), m.dtf('en-CA', o), 'per locale');
  assert.notStrictEqual(m.dtf([], o), m.dtf([], { timeZone: 'Europe/Berlin', hour: 'numeric' }), 'per zone');
  assert.notStrictEqual(m.dtf([], o), m.dtf([], { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' }), 'per option');
  // The device's own zone can change under a running app.
  assert.notStrictEqual(m.dtf('en-CA', {}), m.dtf('en-CA', {}));
  assert.notStrictEqual(m.dtf('en-CA', { timeZone: undefined }), m.dtf('en-CA', { timeZone: undefined }));
  // An unknown zone still throws, as before, and is not kept.
  assert.throws(() => m.dtf([], { timeZone: 'Mars/Olympus_Mons' }), RangeError);
  // Bounded, whatever is asked for.
  for (let i = 0; i < 500; i++) m.dtf([], { timeZone: 'UTC', hour: 'numeric', era: i % 2 ? 'long' : 'short', fractionalSecondDigits: 1 + (i % 3), x: i });
  assert.ok(m.dtf.kept.size <= 200, `kept ${m.dtf.kept.size}`);
});

test('the time helpers read the same through kept formatters as through fresh ones', () => {
  // The functions as they were, each making its formatter every call.
  const tzOffsetFresh = (date, tz) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(date).reduce((a, x) => (a[x.type] = x.value, a), {});
    return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - date.getTime()) / 60000);
  };
  for (const tz of ZONES) for (const t of TIMES) for (const k of [0, 1, 2]) {
    const at = t + k * 7 * 3600000;
    assert.strictEqual(m.tzOffset(new Date(at), tz), tzOffsetFresh(new Date(at), tz), `${tz} ${at}`);
    assert.strictEqual(m.dateKey(at, tz), new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at)));
    assert.strictEqual(m.localDay(at, tz), new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(at)));
    const mid = m.localMidnight(tz, at);
    assert.strictEqual(m.dateKey(mid, tz), m.dateKey(at, tz), 'the same local day');
    assert.strictEqual(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(mid)), '00:00', `${tz} midnight`);
  }
  // fmtT, as the Console writes it, under both clock settings.
  for (const h24 of [true, false]) {
    const fmtT = new Function('prefStore', 'dtf', declSource('fmtT') + '; return fmtT;')({ getH24: () => h24 }, m.dtf);
    for (const tz of ZONES) for (const t of TIMES) {
      const fresh = new Intl.DateTimeFormat([], { timeZone: tz, hour: 'numeric', minute: '2-digit', hourCycle: h24 ? 'h23' : 'h12' }).format(new Date(Math.round(t / 60000) * 60000));
      assert.strictEqual(fmtT(t, tz), fresh);
    }
  }
});

test('no time helper or busy section makes its formatter afresh any more', () => {
  for (const n of ['fmtT', 'dateKey', 'fmtDate', 'tzOffset', 'localMidnight', 'localDay', 'weekPlannerEl', 'RealtimeTwilight', 'StarFinder']) {
    assert.doesNotMatch(declSource(n), /new Intl\.DateTimeFormat\(/, n);
  }
});

// ---------------------------------------------------------------- the Console's clock

test('the countdown ticks by itself, just after each whole second, and stops at zero', () => {
  let clock = 1000000, timers = [], state = null, effect = null;
  const fake = {
    useState: v => { state = state === null ? v : state; return [state, n => { state = n; }]; },
    useEffect: f => { effect = f; },
    setTimeout: (f, ms) => { timers.push({ f, at: clock + ms }); return timers.length; },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].f = null; },
    Date: { now: () => clock }
  };
  const R = { createElement: (t, p, ...c) => ({ t, p, c: c.flat().filter(x => x != null && x !== false) }) };
  const TC = new Function('React', 'C', 'cdHMS', 'cdWords', 'useState', 'useEffect', 'setTimeout', 'clearTimeout', 'Date',
    `${declSource('TwilightCountdown')}; return TwilightCountdown;`)(R, { ink: 'INK' }, m.cdHMS, m.cdWords, fake.useState, fake.useEffect, fake.setTimeout, fake.clearTimeout, fake.Date);
  const to = clock + 3 * 1000 + 400;   // 3.4 s to go
  const shown = () => TC({ to, now: clock - 5000 }).c[1].c.join('');
  assert.strictEqual(TC({ to, now: clock }).c[1].c.join(''), 'in 0m 3s');
  const cleanup = effect();
  // Timers fire late, as a busy phone's do (30 ms here): each tick is set
  // from the time left, so lateness doesn't pile up the way it would on a
  // plain one-second timer.
  const run = () => { const t = timers.filter(x => x.f).sort((a, b) => a.at - b.at)[0]; if (!t) return false; clock = t.at + 30; const f = t.f; t.f = null; f(); return true; };
  const seen = [];
  while (seen.length < 10 && run()) seen.push([clock - (to - 3400), shown()]);
  // Each just after the count crosses a whole second, then nothing.
  assert.deepStrictEqual(seen, [[450, 'in 0m 2s'], [1450, 'in 0m 1s'], [2450, 'in 0m 0s'], [3450, 'in 0m 0s']]);
  assert.strictEqual(timers.filter(x => x.f).length, 0, 'stopped at zero');
  // Unmounted mid-count: its timer goes with it.
  clock = 0; timers = []; state = null; TC({ to: 5000, now: 0 }); const stop = effect();
  assert.strictEqual(timers.filter(x => x.f).length, 1);
  stop(); assert.strictEqual(timers.filter(x => x.f).length, 0);
  assert.strictEqual(typeof cleanup, 'function');
});

test('the countdown in words for a screen reader, to the minute', () => {
  assert.strictEqual(m.cdWords(8 * 3600000 + 33 * 60000 + 51000), '8 hours 33 minutes');
  assert.strictEqual(m.cdWords(3600000 + 60000), '1 hour 1 minute');
  assert.strictEqual(m.cdWords(2 * 3600000), '2 hours');
  assert.strictEqual(m.cdWords(59 * 60000 + 59000), '59 minutes');
  assert.strictEqual(m.cdWords(59000), 'less than a minute');
  assert.strictEqual(m.cdWords(-5), 'less than a minute');
});

test('the Console ticks once a minute, on the minute, and as each stage passes; only the countdown every second', () => {
  const rt = declSource('RealtimeTwilight');
  assert.doesNotMatch(rt, /setInterval\(/, 'no every-second interval');
  assert.match(rt, /setTimeout\(\(\) => \{ setNow\(Date\.now\(\)\); arm\(\); \}, 60000 - Date\.now\(\) % 60000 \+ 50\)/, 'just after each minute turns');
  assert.match(rt, /if \(document\.visibilityState === 'visible'\) setNow\(Date\.now\(\)\)/, 'catches up on return');
  assert.match(rt, /const nextStageAt = nextSunEv \? nextSunEv\.t : null;/);
  assert.match(rt, /setTimeout\(\(\) => setNow\(Date\.now\(\)\), Math\.max\(0, nextStageAt - Date\.now\(\)\) \+ 250\)/, 'wakes as the stage passes');
  assert.match(rt, /\}, \[twToday, minute, nextStageAt, loc\.lat, loc\.lon, loc\.tz\]\);/, 'the day\'s times dim then too');
  const tt = declSource('TwilightToday');
  assert.doesNotMatch(tt, /use(State|Effect|Memo|Ref)\(/, 'TwilightToday stays hook-free');
  assert.match(tt, /React\.createElement\(TwilightCountdown, \{ to: next\.t, now \}\)/);
  assert.doesNotMatch(tt, /cdHMS\(/, 'the seconds are the countdown\'s alone');
});

// ---------------------------------------------------------------- the painting

// The painting's loop as it runs: a 60 Hz screen, a timer then one frame,
// and frames every vsync while the ground follows a tilt.
function simulate(seconds, { tilting = false, meteors = () => 0, vsync = 1000 / 60 } = {}) {
  let last = 0, draws = 0, now = 0;
  const end = seconds * 1000;
  while (now < end) {
    let req;
    if (tilting) req = now;
    else req = now + m.skyFrameWait(last, now, meteors(now));
    const ts = Math.ceil((req + 0.001) / vsync) * vsync;   // the next frame after the request
    now = ts;
    if (m.skyFrameDue(last, ts, meteors(ts))) { last = ts; draws++; }
  }
  return draws / seconds;
}

test('the moving painting draws about 15 frames a second, 30 while a meteor flies', () => {
  for (const vsync of [1000 / 60, 1000 / 120]) {
    const fps = simulate(20, { vsync });
    assert.ok(fps >= 13 && fps <= 16, `twinkling at ${fps.toFixed(1)} a second (vsync ${vsync.toFixed(1)} ms)`);
    const tilt = simulate(20, { vsync, tilting: true });
    assert.ok(tilt >= 13 && tilt <= 16, `the sky still at ${tilt.toFixed(1)} while the ground follows a tilt`);
    const met = simulate(20, { vsync, meteors: () => 1 });
    assert.ok(met >= 27 && met <= 31, `with a meteor in flight ${met.toFixed(1)}`);
  }
  // A frame a little early, on the screen's beat, still counts; much early does not.
  assert.ok(m.skyFrameDue(1000, 1000 + m.TWINKLE_FRAME_MS - 1, 0));
  assert.ok(!m.skyFrameDue(1000, 1000 + 33, 0));
  assert.strictEqual(m.skyFrameWait(0, 5000, 0), 0, 'nothing drawn yet: at once');
});

test('the loop asks for one frame per drawing, and every frame only while the ground follows a tilt', () => {
  const hh = declSource('HorizonHero');
  assert.match(hh, /if \(skyFrameDue\(last, ts, meteors\.length\)\) \{/);
  assert.match(hh, /timer = setTimeout\(\(\) => \{ timer = 0; if \(onScreen && !document\.hidden\) raf = requestAnimationFrame\(frame\); \}, skyFrameWait\(last, performance\.now\(\), meteors\.length\)\)/);
  assert.match(hh, /if \(tilting\) \{\s*if \(timer\) \{ clearTimeout\(timer\); timer = 0; \}\s*raf = requestAnimationFrame\(frame\);/);
  // Still asleep off screen, hidden, and with nothing to move.
  assert.match(hh, /if \(raf \|\| !onScreen \|\| document\.hidden\) return;/);
  assert.match(hh, /timer = setTimeout\(\(\) => \{ timer = 0; schedule\(\); \}, 1000\);/);
  assert.doesNotMatch(hh, /ts - last >= 33/);
});

// ---------------------------------------------------------------- Sky View

const W = 390, H = 844, FOV = 63;
// A phone aimed at az/alt, `gamma` its sideways tilt (which also swings
// where the camera points), `roll` turning the picture in the screen's own
// plane (the camera axis untouched).
const basisAt = (az, alt, gamma = 0, roll = 0) => m.viewBasis(m.quatFromEuler((360 - az) % 360, 90 + alt, gamma), roll);
const view = (basis, more) => Object.assign({ mw: 'MW', lat: 41.7, lst: 123.4, w: W, h: H, fov: FOV, basis }, more);

test('the Milky Way is kept while the view turns less than a degree, and worked out again otherwise', () => {
  const a = view(basisAt(300, 50));
  assert.strictEqual(m.MW_KEEP_DEG, 1);
  assert.ok(m.mwReusable(a, view(basisAt(300, 50))), 'the same view');
  assert.ok(m.mwReusable(a, view(basisAt(300.9, 50))), 'turned 0.9° along the horizon (0.58° of sky at 50° up)');
  assert.ok(m.mwReusable(a, view(basisAt(300, 50.9))), 'tilted 0.9°');
  assert.ok(m.mwReusable(a, view(basisAt(300, 50, 0.9))), 'tipped sideways 0.9°');
  assert.ok(m.mwReusable(a, view(basisAt(300, 50, 0, 0.9))), 'rolled 0.9°');
  assert.ok(!m.mwReusable(a, view(basisAt(300, 51.2))), 'tilted 1.2°');
  assert.ok(!m.mwReusable(a, view(basisAt(300, 50, 1.2))), 'tipped sideways 1.2°');
  assert.ok(!m.mwReusable(a, view(basisAt(300, 50, 0, 1.2))), 'rolled 1.2°, the camera still on the same spot');
  assert.ok(!m.mwReusable(a, view(basisAt(302.5, 50))), 'turned 2.5° along the horizon');
  for (const k of ['mw', 'lat', 'lst', 'w', 'h', 'fov']) {
    assert.ok(!m.mwReusable(a, view(basisAt(300, 50), { [k]: k === 'mw' ? 'other' : a[k] + 1 })), `a new ${k}`);
  }
  assert.ok(!m.mwReusable(null, a), 'nothing kept yet');
});

test('moved with the view, the kept picture lands within half a cell of where a fresh one would', () => {
  // The transform against the exact projection, over the whole screen. The
  // glow is sampled in 10 px cells; a canvas transform can't follow the
  // perspective, so a degree of tilt leaves the corners ~4.5 px out, and
  // the middle of the screen, where one looks, much closer.
  let worst = 0, worstMid = 0, cases = 0;
  for (const [az, alt, gam, roll] of [[300, 50, 0, 0], [10, 5, 3, 0], [180, 80, -20, 90], [95, 30, 45, 270]]) {
    const from = basisAt(az, alt, gam, roll);
    for (const [daz, dalt, dgam, droll] of [[0.9, 0, 0, 0], [0, 0.9, 0, 0], [0, 0, 0.9, 0], [0, 0, 0, 0.9], [0.6, -0.6, 0.5, 0.4], [-0.7, 0.4, -0.5, -0.6]]) {
      const to = basisAt(az + daz, alt + dalt, gam + dgam, roll + droll);
      if (!m.mwReusable(view(from), view(to))) continue;
      cases++;
      const k = m.mwShift(from, to, W, H, FOV);
      for (let y = 0; y <= H; y += 42) for (let x = 0; x <= W; x += 39) {
        const d = m.screenDir(from, x, y, W, H, FOV);
        const p = m.skyProject(m.toScreen(to, d.az, d.alt), W, H, FOV);
        const qx = k[0] * x + k[2] * y + k[4], qy = k[1] * x + k[3] * y + k[5];
        const e = Math.hypot(p.x - qx, p.y - qy);
        worst = Math.max(worst, e);
        if (Math.abs(x - W / 2) <= W / 4 && Math.abs(y - H / 2) <= H / 4) worstMid = Math.max(worstMid, e);
      }
    }
  }
  assert.ok(cases >= 18, `${cases} turns small enough to keep`);
  assert.ok(worst < 5, `worst ${worst.toFixed(2)} px`);
  assert.ok(worstMid < 1.5, `worst in the middle ${worstMid.toFixed(2)} px`);
  // Not turned: no move at all.
  const b = basisAt(200, 40, 5), k = m.mwShift(b, b, W, H, FOV);
  [1, 0, 0, 1, 0, 0].forEach((v, i) => assert.ok(Math.abs(k[i] - v) < 1e-9, `identity ${i}`));
});

test('Sky View draws the kept Milky Way when it will do, and keeps a fresh one otherwise', () => {
  const src = declSource('drawSkyView');
  assert.match(src, /const shift = mwReusable\(kept, mwNow\) \? mwShift\(kept\.basis, basis, w, h, fov\) : null;/);
  assert.match(src, /g\.transform\(shift\[0\], shift\[1\], shift\[2\], shift\[3\], shift\[4\], shift\[5\]\);\s*g\.drawImage\(kept\.img, 0, 0, cols \* 10, rows \* 10\);/);
  assert.match(src, /if \(o\.mwRef\) o\.mwRef\.current = Object\.assign\(mwNow, \{ img \}\);/);
  // The sampling grid is the one it always was.
  assert.match(src, /const d = screenDir\(basis, \(i \+ 0\.5\) \* w \/ cols, \(j \+ 0\.5\) \* h \/ rows, w, h, fov\);/);
});

test('a sensor reading leaves the Stars tab\'s other sections alone', () => {
  // memoOf: React.memo, made once per component.
  const memoOf = new Function('React', declSource('memoOf') + '; return memoOf;')({ memo: C => ({ memo: C }) });
  const C1 = () => null, C2 = () => null;
  assert.strictEqual(memoOf(C1), memoOf(C1), 'the same memo every render, or React would remount it');
  assert.notStrictEqual(memoOf(C1), memoOf(C2));
  assert.strictEqual(memoOf(C1).memo, C1);
  const sf = declSource('StarFinder');
  for (const c of ['SkyViewPreview', 'SkyChart', 'PlanetViews', 'IssPanel']) {
    assert.match(sf, new RegExp(`React\\.createElement\\(memoOf\\(${c}\\), \\{`), c);
    assert.doesNotMatch(sf, new RegExp(`React\\.createElement\\(${c}, `), `${c} only memoised`);
  }
  // Their props hold still between readings: functions and the header made
  // once per change of what they read, the 12/24-hour setting included.
  assert.match(sf, /const h24 = useH24\(\);/);
  assert.match(sf, /const openSky = useCallback\(\(\) => \{ setSkyOpen\(true\); return ensureSensors\(\); \}, \[\]\);/);
  assert.match(sf, /facing: previewFacing, onOpen: openSky,\s*header: previewHeader/);
  assert.match(sf, /\), \[loc\.name, geoMsg\]\);/);
  assert.match(sf, /const planetWhen = useCallback\([^\n]*, \[now, loc\.tz, h24\]\);/);
  assert.match(sf, /const issFmt = useCallback\(t => fmtT\(t, loc\.tz\), \[loc\.tz, h24\]\);/);
  assert.match(sf, /const issWhen = useCallback\([^\n]*, \[loc\.tz, h24\]\);/);
  assert.match(sf, /when: planetWhen/);
  assert.match(sf, /fmt: issFmt,\s*when: issWhen/);
  // ensureSensors, which openSky keeps from the first render, reads no state.
  const ens = sf.slice(sf.indexOf('const ensureSensors = async () => {'), sf.indexOf('const startAim ='));
  assert.ok(ens.length > 100);
  assert.doesNotMatch(ens.replace(/setAimSensor/g, ''), /\b(aimSensor|aimTargetName|skyOpen|orient|loc|now)\b/);
  // And still one corrected rotation for Aim Assist and Sky View alike.
  assert.match(sf, /const viewQ = useMemo\(/);
  assert.match(sf, /\n\s*viewQ,\n/);
});
