'use strict';
/*
 * Clear-and-dark alerts: the Worker in alerts/ and the app's side of it.
 *
 * alerts/package.json marks that directory as ES modules, so the Worker's own
 * files are imported here as they are deployed (dynamic import works from
 * CommonJS on Node 20). The things that matter:
 *
 *  - Encryption. A push service delivers whatever it is given, and a browser
 *    that can't decrypt it drops it without a word, so a mistake here looks
 *    exactly like "no alert tonight". encryptPush is checked byte for byte
 *    against the worked example in the Web Push encryption spec (RFC 8291,
 *    appendix A), taken from the working group's source, not typed.
 *  - The score. The Worker scores tonight with a copy of the Console's
 *    clearDarkScore generated from index.html; the copy must be current.
 *  - The run: only those whose local time is 4 PM, once a day, one forecast
 *    per place, only when tonight reaches the Console's "clear & dark", and
 *    subscriptions the push service calls gone are deleted.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extract, declSource, appScript, INDEX } = require('./extract.js');

const ROOT = path.join(__dirname, '..', '..');
const load = f => import(path.join(ROOT, 'alerts', 'src', f));
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => new Uint8Array(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));

// RFC 8291 appendix A.
const RFC = {
  plain: 'When I grow up, I want to be a watermelon',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'
};

test('encryption matches the Web Push spec example byte for byte', async () => {
  const { encryptPush } = await load('push.js');
  const out = await encryptPush(RFC.plain, RFC.uaPublic, RFC.auth, { asPublic: RFC.asPublic, asPrivate: RFC.asPrivate, salt: RFC.salt });
  assert.strictEqual(b64u(out), RFC.body);
});

test('a real message: fresh keys and salt each time, the spec header layout', async () => {
  const { encryptPush } = await load('push.js');
  const a = await encryptPush('hi', RFC.uaPublic, RFC.auth), b = await encryptPush('hi', RFC.uaPublic, RFC.auth);
  assert.notDeepStrictEqual(a.slice(0, 16), b.slice(0, 16), 'salt');
  assert.notDeepStrictEqual(a.slice(21, 86), b.slice(21, 86), 'sender key');
  assert.strictEqual(new DataView(a.buffer).getUint32(16), 4096, 'record size');
  assert.strictEqual(a[20], 65);
  assert.strictEqual(a.length, 86 + 2 + 1 + 16, 'header, text, delimiter, tag');
  await assert.rejects(encryptPush('hi', RFC.uaPublic.slice(0, 40), RFC.auth), /p256dh/);
});

test('VAPID: a signed token for the push service, 12 hours, verifiable with the public key', async () => {
  const { vapidAuth } = await load('push.js');
  const { subtle } = globalThis.crypto;
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = b64u(new Uint8Array(await subtle.exportKey('raw', pair.publicKey)));
  const jwk = await subtle.exportKey('jwk', pair.privateKey);
  const now = Date.UTC(2026, 9, 10, 20);
  const h = await vapidAuth('https://fcm.googleapis.com/fcm/send/abc', jwk, pub, 'https://twilyte.info', now);
  const m = h.match(/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/);
  assert.ok(m, h);
  assert.strictEqual(m[4], pub);
  assert.deepStrictEqual(JSON.parse(Buffer.from(unb64u(m[1])).toString()), { typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(Buffer.from(unb64u(m[2])).toString());
  assert.deepStrictEqual(claims, { aud: 'https://fcm.googleapis.com', exp: now / 1000 + 43200, sub: 'https://twilyte.info' });
  const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, unb64u(m[3]), new TextEncoder().encode(m[1] + '.' + m[2]));
  assert.ok(ok, 'signature verifies');
});

test("the Worker's score is the Console's, generated from index.html and current", async () => {
  const { build, OUT } = require('../generate-alerts-sky.js');
  assert.strictEqual(fs.readFileSync(OUT, 'utf8'), build(), 'alerts/src/sky.js is stale: run node scripts/generate-alerts-sky.js');
  // And it runs the same: one clear, moonless night scored both ways.
  const sky = await load('sky.js');
  const app = extract(['D2R', 'R2D', 'rev', 'sin', 'cos', 'asin', 'atan2', 'acos', 'jd', 'gmst', 'sunRaDec', 'sunHcZn', 'sunAltitude', 'MOON_LR', 'MOON_B', 'moonEcliptic', 'moonState', 'scoreHours', 'summarize', 'clearDarkScore']);
  const wx = forecast('2026-10-10', -14400, () => 10);
  const now = Date.UTC(2026, 9, 10, 20);
  assert.deepStrictEqual(sky.clearDarkScore(wx, { lat: 42.4, lon: -72.5 }, 0, now), app.clearDarkScore(wx, { lat: 42.4, lon: -72.5 }, 0, now));
});

// An Open-Meteo reply: two days of hours from local midnight, cloud from fn.
function forecast(day, off, cloudAt) {
  const t0 = Date.parse(day + 'T00:00:00Z');
  const time = [], cloud = [], high = [], pp = [];
  for (let i = 0; i < 48; i++) {
    time.push(new Date(t0 + i * 3600000).toISOString().slice(0, 16));
    cloud.push(cloudAt(i)); high.push(0); pp.push(0);
  }
  return { utc_offset_seconds: off, hourly: { time, cloud_cover: cloud, cloud_cover_high: high, precipitation_probability: pp } };
}

// Workers KV, in memory, with metadata and paged listing.
function kv() {
  const m = new Map();
  const ops = { list: 0, get: 0, put: 0, delete: 0 };
  return {
    m, ops,
    async list({ prefix, cursor }) {
      ops.list++;
      const keys = [...m.keys()].filter(k => k.startsWith(prefix)).sort();
      const at = cursor ? +cursor : 0, page = keys.slice(at, at + 2);
      const done = at + 2 >= keys.length;
      return { keys: page.map(name => ({ name, metadata: m.get(name).meta })), list_complete: done, cursor: done ? undefined : String(at + 2) };
    },
    async get(k, type) { ops.get++; const v = m.get(k); return v ? (type === 'json' ? JSON.parse(v.value) : v.value) : null; },
    async getWithMetadata(k) { const v = m.get(k); return { value: v ? v.value : null, metadata: v ? v.meta : null }; },
    async put(k, value, o) { ops.put++; m.set(k, { value, meta: o && o.metadata }); },
    async delete(k) { ops.delete++; m.delete(k); }
  };
}

async function browserKeys() {
  const { subtle } = globalThis.crypto;
  const p = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { p256dh: b64u(new Uint8Array(await subtle.exportKey('raw', p.publicKey))), auth: b64u(globalThis.crypto.getRandomValues(new Uint8Array(16))) };
}
async function vapidEnv(SUBS) {
  const { subtle } = globalThis.crypto;
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  return { SUBS, VAPID_PUBLIC: b64u(new Uint8Array(await subtle.exportKey('raw', pair.publicKey))), VAPID_PRIVATE: (await subtle.exportKey('jwk', pair.privateKey)).d };
}

test('the hourly run: 4 PM locally, once a day, one forecast a place, only a clear and dark night', async () => {
  const w = await load('index.js');
  const SUBS = kv();
  const env = await vapidEnv(SUBS);
  const put = async (id, endpoint, meta) => SUBS.put('s:' + id, JSON.stringify({ endpoint, keys: await browserKeys() }), { metadata: Object.assign({ h24: false, last: '' }, meta) });
  // 20:00 UTC on 10 October 2026, a day before new Moon: 4 PM in New York.
  const now = Date.UTC(2026, 9, 10, 20);
  await put('a', 'https://fcm.googleapis.com/fcm/send/a', { lat: 42.4, lon: -72.5, tz: 'America/New_York' });
  await put('b', 'https://fcm.googleapis.com/fcm/send/b', { lat: 42.4, lon: -72.5, tz: 'America/New_York' });
  await put('c', 'https://fcm.googleapis.com/fcm/send/c', { lat: 40.7, lon: -74, tz: 'America/New_York' });
  await put('d', 'https://web.push.apple.com/d', { lat: 51.5, lon: -0.1, tz: 'Europe/London' });
  await put('e', 'https://web.push.apple.com/e', { lat: 42.4, lon: -72.5, tz: 'America/New_York', last: '2026-10-10' });
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push(url);
    if (url.startsWith('https://api.open-meteo.com/')) {
      const cloudy = url.includes('latitude=40.7');
      return { ok: true, json: async () => forecast('2026-10-10', -14400, () => (cloudy ? 30 : 5)) };
    }
    assert.strictEqual(init.headers['Content-Encoding'], 'aes128gcm');
    assert.match(init.headers.Authorization, /^vapid t=/);
    return { status: url.endsWith('/b') ? 410 : 201 };
  };
  const r = await w.runAlerts(env, now, fetchFn);
  assert.deepStrictEqual(r, { due: 3, forecasts: 2, sent: 1, gone: 1, failed: 0 });
  assert.strictEqual(calls.filter(u => u.includes('open-meteo')).length, 2, 'one forecast per place');
  assert.ok(!calls.some(u => u.endsWith('/c')), 'partly cloudy (about 70, short of 78): nothing sent');
  assert.ok(!calls.some(u => u.endsWith('/d')), '9 PM in London: not due');
  assert.ok(!calls.some(u => u.endsWith('/e')), 'already sent today');
  assert.strictEqual(SUBS.m.get('s:a').meta.last, '2026-10-10');
  assert.ok(!SUBS.m.has('s:b'), 'a gone subscription is deleted');
  // The same hour again (a retried cron): nothing more.
  const again = await w.runAlerts(env, now + 60000, fetchFn);
  assert.strictEqual(again.sent, 0);
  // The next day at 4 PM: due again.
  const next = await w.runAlerts(env, now + 86400000, fetchFn);
  assert.ok(next.due >= 1);
});

test('the run sends nothing below the Console’s "clear & dark"', async () => {
  const w = await load('index.js');
  assert.strictEqual(w.MIN_SCORE, 78);
  assert.match(declSource('summarize'), /score >= 78\) factor = "clear & dark"/);
  assert.strictEqual(w.ALERT_HOUR, 16);
});

test('what the alert says', async () => {
  const w = await load('index.js');
  const bestMs = Date.UTC(2026, 9, 11, 2); // 10 PM in New York
  const m = w.alertMessage({ score: 91, bestMs }, 'America/New_York', false);
  assert.strictEqual(m.title, 'Clear and dark tonight');
  assert.strictEqual(m.body, 'The best of it is from 10 PM to 12 AM. Tonight’s sky scores 91 out of 100.');
  assert.match(w.alertMessage({ score: 91, bestMs }, 'America/New_York', true).body, /from 22:00 to 00:00\./);
  assert.strictEqual(m.url, '/?tab=console', 'a deep link, so the welcome screen stays away');
});

async function call(w, env, method, p, body, origin = 'https://twilyte.info') {
  const waits = [];
  const res = await w.default.fetch(new Request('https://alerts.test' + p, {
    method, headers: { Origin: origin, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body)
  }), env, { waitUntil: p => waits.push(p) });
  await Promise.all(waits);
  return { status: res.status, headers: res.headers, json: method === 'OPTIONS' ? null : await res.json() };
}

test('subscribe and unsubscribe: validated, rounded, stored; a hello on first turning on', async () => {
  const w = await load('index.js');
  const SUBS = kv();
  const env = await vapidEnv(SUBS);
  const keys = await browserKeys();
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/xyz', keys };
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push(url); return { status: 201 }; };
  try {
    assert.strictEqual((await call(w, env, 'GET', '/key')).json.key, env.VAPID_PUBLIC);
    assert.strictEqual((await call(w, env, 'OPTIONS', '/subscribe')).headers.get('Access-Control-Allow-Origin'), 'https://twilyte.info');
    // Not a push service: refused, so the Worker never posts to arbitrary URLs.
    assert.strictEqual((await call(w, env, 'POST', '/subscribe', { sub: { endpoint: 'https://evil.example/x', keys }, lat: 42, lon: -72, tz: 'America/New_York' })).status, 400);
    assert.strictEqual((await call(w, env, 'POST', '/subscribe', { sub, lat: 42, lon: -72, tz: 'Mars/Olympus' })).status, 400);
    assert.strictEqual((await call(w, env, 'POST', '/subscribe', { sub, lat: 95, lon: -72, tz: 'America/New_York' })).status, 400);
    assert.strictEqual(SUBS.m.size, 0);

    const ok = await call(w, env, 'POST', '/subscribe', { sub, lat: 42.1146, lon: -72.5389, tz: 'America/New_York', h24: false, hello: true });
    assert.strictEqual(ok.status, 200);
    const [name] = [...SUBS.m.keys()];
    assert.match(name, /^s:[0-9a-f]{32}$/, 'keyed by a hash, not the endpoint');
    assert.deepStrictEqual(SUBS.m.get(name).meta, { lat: 42.1, lon: -72.5, tz: 'America/New_York', h24: false, last: '' });
    assert.deepStrictEqual(sent, [sub.endpoint], 'the hello went out');
    // A move keeps the day's "already sent" mark and sends no second hello.
    SUBS.m.get(name).meta.last = '2026-10-10';
    await call(w, env, 'POST', '/subscribe', { sub, lat: 40.71, lon: -74.01, tz: 'America/New_York' });
    assert.deepStrictEqual(SUBS.m.get(name).meta, { lat: 40.7, lon: -74, tz: 'America/New_York', h24: false, last: '2026-10-10' });
    assert.strictEqual(sent.length, 1);

    assert.strictEqual((await call(w, env, 'POST', '/unsubscribe', { endpoint: sub.endpoint })).status, 200);
    assert.strictEqual(SUBS.m.size, 0);
  } finally { globalThis.fetch = realFetch; }
});

// ---- The app's side ----

const app = extract(['alertsSupport', 'b64uBytes', 'alertsPlace', 'samePlace', 'readAlerts', 'saveAlerts', 'ALERTS_URL', 'alertsPost', 'alertsOn', 'alertsOff']);

function fakeWindow(o = {}) {
  const store = new Map();
  const log = [];
  const sub = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/me',
    toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'P', auth: 'A' } }; },
    async unsubscribe() { log.push(['unsubscribe']); }
  };
  let current = o.subscribed ? sub : null;
  const w = {
    navigator: Object.assign({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', serviceWorker: {
      ready: Promise.resolve({ pushManager: {
        getSubscription: async () => current,
        subscribe: async opts => { log.push(['subscribe', opts]); current = sub; return sub; }
      } })
    } }, o.nav || {}),
    PushManager: function () {},
    Notification: { permission: o.permission || 'default', requestPermission: async () => { log.push(['ask']); return o.answer || 'granted'; } },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) },
    fetch: async (url, init) => {
      log.push(['fetch', url, init && JSON.parse(init.body)]);
      return url.endsWith('/key') ? { ok: true, json: async () => ({ key: 'BGeeNLwlX3uhUuWPb4vLn5bVc2R95S6eN2lJNEBpl5Io9MAfaFGg2FXIYTZYoOsNMPmpGOnnL_lppOxOKAV8xkE' }) } : { ok: true };
    },
    matchMedia: () => ({ matches: !!o.standalone })
  };
  if (o.noPush) { delete w.PushManager; delete w.Notification; }
  return { w, log, store };
}

test('which browsers are offered alerts', () => {
  assert.strictEqual(app.alertsSupport(Object.assign(fakeWindow().w, { Capacitor: {} })), 'native');
  assert.strictEqual(app.alertsSupport(fakeWindow().w), 'ok');
  assert.strictEqual(app.alertsSupport(fakeWindow({ permission: 'denied' }).w), 'blocked');
  const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' };
  assert.strictEqual(app.alertsSupport(fakeWindow({ noPush: true, nav: iphone }).w), 'install', 'Safari tab: add to Home Screen first');
  assert.strictEqual(app.alertsSupport(fakeWindow({ nav: iphone, standalone: true }).w), 'ok', 'from the Home Screen');
  assert.strictEqual(app.alertsSupport(fakeWindow({ noPush: true }).w), 'none');
});

test('turning alerts on asks first, subscribes with the Worker key, and sends the place to 0.1°', async () => {
  const loc = { name: 'Holyoke', lat: 42.2043, lon: -72.6162, tz: 'America/New_York' };
  const no = fakeWindow({ answer: 'denied' });
  assert.strictEqual(await app.alertsOn(no.w, loc, false, true), 'denied');
  assert.deepStrictEqual(no.log, [['ask']], 'nothing subscribed, nothing sent');

  const f = fakeWindow();
  assert.strictEqual(await app.alertsOn(f.w, loc, true, true), 'on');
  assert.deepStrictEqual(f.log[0], ['ask'], 'permission is the first thing asked');
  const s = f.log.find(l => l[0] === 'subscribe')[1];
  assert.strictEqual(s.userVisibleOnly, true);
  assert.strictEqual(s.applicationServerKey.length, 65);
  const post = f.log.find(l => l[0] === 'fetch' && l[1].endsWith('/subscribe'));
  assert.strictEqual(post[1], app.ALERTS_URL + '/subscribe');
  assert.deepStrictEqual(post[2], { sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/me', keys: { p256dh: 'P', auth: 'A' } }, hello: true, lat: 42.2, lon: -72.6, tz: 'America/New_York', h24: true });
  assert.deepStrictEqual(app.readAlerts(f.w), { lat: 42.2, lon: -72.6, tz: 'America/New_York', h24: true });
  assert.ok(app.samePlace(app.readAlerts(f.w), app.alertsPlace(loc, true)));
  assert.ok(!app.samePlace(app.readAlerts(f.w), app.alertsPlace(Object.assign({}, loc, { lat: 42.3 }), true)));
});

test('a move while on updates the Worker without asking again; off unsubscribes and forgets', async () => {
  const f = fakeWindow({ subscribed: true });
  await app.alertsOn(f.w, { lat: 40.7128, lon: -74.006, tz: 'America/New_York' }, false, false);
  assert.ok(!f.log.some(l => l[0] === 'ask' || l[0] === 'subscribe'));
  assert.strictEqual(f.log.find(l => l[0] === 'fetch')[2].hello, false);
  f.log.length = 0;
  assert.strictEqual(await app.alertsOff(f.w), 'off');
  assert.deepStrictEqual(f.log.map(l => l[0] === 'fetch' ? [l[1], l[2]] : l[0]), ['unsubscribe', [app.ALERTS_URL + '/unsubscribe', { endpoint: 'https://fcm.googleapis.com/fcm/send/me' }]]);
  assert.strictEqual(app.readAlerts(f.w), null);
});

test('the row: its words for each case, a button only where it can work', () => {
  const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false) }) };
  const C = new Proxy({}, { get: () => 'token' });
  const AlertsRow = new Function('React', 'C', declSource('AlertsRow') + '\nreturn AlertsRow;')(React, C);
  const text = n => (n && typeof n === 'object') ? n.children.map(text).join(' ') : String(n);
  const buttons = n => (n && typeof n === 'object') ? (n.type === 'button' ? [n] : []).concat(...n.children.map(buttons)) : [];
  const off = AlertsRow({ support: 'ok', on: false, place: 'Holyoke' });
  assert.match(text(off), /Tell me when it.s clear/);
  assert.match(text(off), /around 4 PM on days when tonight looks clear and dark here/);
  assert.strictEqual(text(buttons(off)[0]), 'Turn on');
  assert.match(text(AlertsRow({ support: 'ok', on: false, h24: true })), /around 16:00 on days/);
  const on = AlertsRow({ support: 'ok', on: true, place: 'Holyoke', msg: '' });
  assert.match(text(on), /On for Holyoke\./);
  assert.strictEqual(text(buttons(on)[0]), 'Turn off');
  assert.strictEqual(buttons(on)[0].props['aria-pressed'], true);
  assert.strictEqual(buttons(AlertsRow({ support: 'install' })).length, 0);
  assert.match(text(AlertsRow({ support: 'install' })), /add Twilyte to your Home Screen/);
  assert.strictEqual(buttons(AlertsRow({ support: 'blocked' })).length, 0);
});

test('wiring: CSP allows the Worker, the service worker shows the alert, the row waits on ALERTS_LIVE', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const csp = html.match(/connect-src ([^;]+);/)[1].split(/\s+/);
  assert.ok(csp.includes(app.ALERTS_URL), 'connect-src');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /addEventListener\('notificationclick'/);
  assert.match(declSource('RealtimeTwilight'), /\(ALERTS_LIVE \|\| \/\[\?&\]alerts=1\\b\/\.test\(window\.location\.search\)\) && React\.createElement\(ClearAlerts/);
  // The Worker deploys to the address the app calls.
  const toml = fs.readFileSync(path.join(ROOT, 'alerts', 'wrangler.toml'), 'utf8');
  assert.match(toml, /^name = "twilyte-alerts"$/m);
  assert.ok(app.ALERTS_URL.startsWith('https://twilyte-alerts.'));
  assert.ok(appScript(html).includes('const ALERTS_LIVE = '));
});
