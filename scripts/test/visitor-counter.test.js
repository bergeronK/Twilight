'use strict';
/*
 * The header's visitor count: pingVisitorCounter in index.html.
 *
 * Two properties matter and neither is visible on screen. A returning browser
 * must not ping (and so risk a +1) inside COUNTER_WINDOW_MS; and a ping that
 * fails must not start that window, or an outage silently drops a day of
 * visits. The second one had a hole: the Worker reports failures as
 * {"count":0} with status 500, and 0 passes a typeof check.
 *
 * Runs the shipped function via declSource, with the clock, storage and
 * network injected.
 */
const test = require('node:test');
const assert = require('node:assert');
const { declSource } = require('./extract.js');

const WINDOW = 24 * 3600e3;
const HOUR = 3600e3;
const T0 = 1_000_000_000_000;

function store({ broken = false } = {}) {
  const m = {};
  return {
    getItem: k => { if (broken) throw new Error('denied'); return k in m ? m[k] : null; },
    setItem: (k, v) => { if (broken) throw new Error('denied'); m[k] = String(v); },
    m
  };
}

// One page load at time `now`. `respond` builds the fetch outcome.
async function load(ls, now, respond) {
  const pings = [];
  const shown = [];
  const fetchStub = url => { pings.push(url); return respond(); };
  const fn = new Function(
    'COUNTER_WORKER_URL', 'COUNTER_WINDOW_MS', 'localStorage', 'Date', 'fetch',
    declSource('pingVisitorCounter') + '\nreturn pingVisitorCounter;'
  )('https://counter.test/', WINDOW, ls, { now: () => now }, fetchStub);
  fn(v => shown.push(v));
  for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r));
  return { pinged: pings.length > 0, shown };
}

const ok = count => () => Promise.resolve({ ok: true, json: () => Promise.resolve({ count, new: true }) });
const serverError = () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ count: 0, error: 'boom' }) });
const offline = () => Promise.reject(new TypeError('Failed to fetch'));

test('pings once per window, not once per page load', async () => {
  const ls = store();
  let n = 358;
  const pinged = [];
  for (const t of [0, 5 * 60e3, HOUR, 8 * HOUR, 25 * HOUR, 25 * HOUR + 10 * 60e3, 50 * HOUR]) {
    const r = await load(ls, T0 + t, () => ok(n++)());
    pinged.push(r.pinged);
  }
  assert.deepStrictEqual(pinged, [true, false, false, false, true, false, true]);
});

test('inside the window the cached total is shown without a ping', async () => {
  const ls = store();
  await load(ls, T0, ok(358));
  const r = await load(ls, T0 + HOUR, ok(999));
  assert.strictEqual(r.pinged, false);
  assert.deepStrictEqual(r.shown, [358]);
});

test('a 500 {"count":0} is not a total: nothing shown, cached, or windowed', async () => {
  const ls = store();
  const r = await load(ls, T0, serverError);
  assert.strictEqual(r.pinged, true);
  assert.deepStrictEqual(r.shown, [], 'must not display "0 visitors"');
  assert.strictEqual(ls.m.tw_count, undefined, 'must not cache the 0');
  assert.strictEqual(ls.m.tw_counted_at, undefined, 'must not start the window');
  const next = await load(ls, T0 + 5 * 60e3, ok(358));
  assert.strictEqual(next.pinged, true, 'the next load retries');
  assert.deepStrictEqual(next.shown, [358]);
});

test('a network failure does not start the window either', async () => {
  const ls = store();
  await load(ls, T0, offline);
  assert.strictEqual(ls.m.tw_counted_at, undefined);
  assert.strictEqual((await load(ls, T0 + 60e3, ok(1))).pinged, true);
});

test('a failure inside the window keeps the last good total', async () => {
  const ls = store();
  await load(ls, T0, ok(358));
  const r = await load(ls, T0 + 25 * HOUR, serverError);
  assert.deepStrictEqual(r.shown, [358], 'cached total shown, the 0 ignored');
  assert.strictEqual(ls.m.tw_count, '358');
});

test('with storage unavailable it pings every load and does not throw', async () => {
  const ls = store({ broken: true });
  for (const t of [0, 5 * 60e3, HOUR]) {
    const r = await load(ls, T0 + t, ok(7));
    assert.strictEqual(r.pinged, true);
    assert.deepStrictEqual(r.shown, [7]);
  }
});
