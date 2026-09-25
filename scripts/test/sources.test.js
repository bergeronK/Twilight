'use strict';
/*
 * ?sources: each fetch of another site's data notes how it went, so the live
 * site can say whether CelesTrak and NOAA answer this browser at all. A
 * refusal (CORS) reaches the page only as a TypeError, the same as being
 * offline; when another source worked within the hour, the words say it
 * was the site refusing.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const m = extract(['SOURCE_NAMES', 'noteSource', 'agoWords', 'sourceLines', 'SourceList', 'ISS_TLE_URL', 'loadIssTle', 'KP_URL', 'parseKp', 'loadKp']);
const memStore = () => { const mem = {}; return { mem, getItem: k => mem[k] || null, setItem: (k, v) => { mem[k] = v; } }; };
const T = Date.UTC(2026, 8, 25, 12);

test('what is noted, and the words for it', () => {
  const s = memStore();
  m.noteSource(s, 'openmeteo', null, T - 5 * 60000);
  m.noteSource(s, 'celestrak', new TypeError('Failed to fetch'), T - 4 * 60000);
  m.noteSource(s, 'swpc', new Error('HTTP 503'), T - 3 * 3600000);
  const all = JSON.parse(s.mem.tw_src);
  assert.deepStrictEqual(all.openmeteo, { ok: true, at: T - 5 * 60000 });
  assert.deepStrictEqual(all.celestrak, { ok: false, at: T - 4 * 60000, why: 'refused or offline' });
  assert.deepStrictEqual(m.sourceLines(all, T), [
    ['Open-Meteo, the weather forecast', 'worked, 5 min ago'],
    ['CelesTrak, the space station’s orbit', 'failed, 4 min ago: refused by the browser (the site doesn’t allow it; another source worked)'],
    ['NOAA SWPC, the aurora forecast', 'failed, 3 h ago: HTTP 503']
  ]);
  // With nothing else working at the time, it could just as well be offline.
  const alone = { celestrak: all.celestrak };
  assert.strictEqual(m.sourceLines(alone, T)[1][1], 'failed, 4 min ago: refused or offline');
  assert.strictEqual(m.sourceLines(alone, T)[0][1], 'not fetched in this browser yet');
  assert.strictEqual(m.sourceLines('junk', T).length, 3);
  // Storage that throws is not the fetch's problem.
  m.noteSource({ getItem() { throw new Error('no'); }, setItem() {} }, 'swpc', null, T);
  assert.strictEqual(m.agoWords(20000), 'just now');
  assert.strictEqual(m.agoWords(3 * 86400000), '3 days ago');
});

test('the station and aurora fetches note their outcome', async () => {
  const s = memStore();
  const TLE = '1 25544U 98067A   19366.82137887  .00016717  00000-0  10270-3 0  9129\n2 25544  51.6392  96.6358 0005156  88.7140 271.4601 15.49497216  6061\n';
  await m.loadIssTle(T, async () => ({ ok: true, text: async () => TLE }), s);
  await m.loadKp(T, async () => { throw new TypeError('Failed to fetch'); }, s);
  const all = JSON.parse(s.mem.tw_src);
  assert.strictEqual(all.celestrak.ok, true);
  assert.deepStrictEqual(all.swpc, { ok: false, at: T, why: 'refused or offline' });
  // A kept copy served without fetching notes nothing new.
  const before = s.mem.tw_src;
  await m.loadIssTle(T + 60000, async () => { throw new Error('should not fetch'); }, s);
  assert.strictEqual(s.mem.tw_src, before);
});

test('listed only at ?sources, and the forecast notes its outcome too', () => {
  const R = { createElement: (t, p, ...c) => ({ t, p, c: c.flat() }) };
  global.React = R;
  const text = n => typeof n === 'string' ? n : n ? n.c.map(text).join('') : '';
  const out = m.SourceList({ lines: [['A', 'worked, just now'], ['B', 'failed']] });
  assert.strictEqual(out.p['aria-label'], 'Data sources');
  assert.match(text(out), /A: worked, just nowB: failed/);
  delete global.React;
  const app = declSource('TwilightApp');
  assert.match(app, /new URLSearchParams\(window\.location\.search\)\.has\('sources'\); \} catch \(e\) \{ return false; \} \}\)\(\) && React\.createElement\(SourcesNote\)/);
  const rt = declSource('RealtimeTwilight');
  assert.match(rt, /noteSource\(localStorage, 'openmeteo'\)/);
  assert.match(rt, /noteSource\(localStorage, 'openmeteo', err\)/);
});
