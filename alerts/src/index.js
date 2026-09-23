/**
 * Twilyte clear-and-dark alerts — Cloudflare Worker
 *
 * Sends a web push notification in the afternoon when tonight looks clear
 * and dark where the subscriber is. See alerts/README.md for what it stores,
 * how to deploy it, and what it costs to run.
 *
 *   GET  /key          the VAPID public key a browser subscribes with
 *   POST /subscribe    { sub, lat, lon, tz, h24, hello }  (sub = PushSubscription JSON)
 *   POST /unsubscribe  { endpoint }
 *   cron, hourly       runAlerts: each subscriber whose local time is
 *                      ALERT_HOUR, scored with the Console's own formula
 */
import { clearDarkScore } from './sky.js';
import { sendPush } from './push.js';

// Local hour the day's alert goes out: early enough to plan the evening,
// late enough that the forecast for tonight has settled.
export const ALERT_HOUR = 16;
// The score at which the Console itself says "clear & dark" (summarize in
// index.html). An alert with those words should mean the same thing.
export const MIN_SCORE = 78;

const ORIGINS = ['https://twilyte.info', 'http://127.0.0.1:8137', 'http://localhost:8137'];
// Only real push services. Without this the Worker would POST to any URL
// anyone handed it, every afternoon.
const PUSH_HOST = /^(fcm\.googleapis\.com|android\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/;

export function validSub(sub) {
  if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 1024) return false;
  let u;
  try { u = new URL(sub.endpoint); } catch (e) { return false; }
  if (u.protocol !== 'https:' || !PUSH_HOST.test(u.hostname)) return false;
  const k = sub.keys || {};
  return /^[A-Za-z0-9_-]{80,100}$/.test(k.p256dh || '') && /^[A-Za-z0-9_-]{16,32}$/.test(k.auth || '');
}

export function validTz(tz) {
  if (typeof tz !== 'string' || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
}

// Stored to 0.1° (about 11 km): plenty for a cloud forecast, and no more
// precise than a subscriber's town.
const round1 = x => Math.round(x * 10) / 10;

async function keyFor(endpoint) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)));
  return 's:' + Array.from(h.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
}

// The local calendar date and hour at `ms` in `tz`.
export function localParts(tz, ms) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).reduce((a, x) => (a[x.type] = x.value, a), {});
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour };
}

// What the notification says. Plain sentences, the app's own words.
export function alertMessage(sum, tz, h24) {
  const f = new Intl.DateTimeFormat('en-US', h24
    ? { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
    : { timeZone: tz, hour: 'numeric', hourCycle: 'h12' });
  const from = f.format(new Date(sum.bestMs)), to = f.format(new Date(sum.bestMs + 2 * 3600000));
  return {
    title: 'Clear and dark tonight',
    body: `The best of it is from ${from} to ${to}. Tonight\u2019s sky scores ${sum.score} out of 100.`,
    tag: 'tonight',
    url: '/?tab=console'
  };
}

function forecastUrl(lat, lon) {
  // The Console's request, cut to the two days tonight can span.
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=cloud_cover,cloud_cover_high,precipitation_probability&forecast_days=2&timezone=auto`;
}

function vapidOf(env) {
  if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE) throw new Error('VAPID keys are not set');
  const pub = env.VAPID_PUBLIC;
  const raw = Uint8Array.from(atob(pub.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const b = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return {
    pub,
    jwk: { kty: 'EC', crv: 'P-256', x: b(raw.slice(1, 33)), y: b(raw.slice(33, 65)), d: env.VAPID_PRIVATE },
    sub: env.VAPID_SUBJECT || 'https://twilyte.info'
  };
}

/*
 * The hourly run. Everyone whose local hour is ALERT_HOUR and who hasn't had
 * today's alert is scored, one forecast per rounded place, and sent an alert
 * if tonight reaches MIN_SCORE. Subscriptions the push service says are gone
 * are deleted. Only a sent alert writes to KV, so a cloudy week costs nothing.
 */
export async function runAlerts(env, nowMs, fetchFn = fetch) {
  const vapid = vapidOf(env);
  const due = [];
  let cursor;
  do {
    const page = await env.SUBS.list({ prefix: 's:', cursor });
    for (const k of page.keys) {
      const m = k.metadata;
      if (!m || !validTz(m.tz)) continue;
      const here = localParts(m.tz, nowMs);
      if (here.hour === ALERT_HOUR && m.last !== here.date) due.push({ name: k.name, m, date: here.date });
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);

  const byPlace = new Map();
  for (const d of due) {
    const p = `${d.m.lat},${d.m.lon}`;
    if (!byPlace.has(p)) byPlace.set(p, []);
    byPlace.get(p).push(d);
  }

  const out = { due: due.length, forecasts: 0, sent: 0, gone: 0, failed: 0 };
  for (const [, group] of byPlace) {
    const { lat, lon } = group[0].m;
    let wx;
    try {
      const r = await fetchFn(forecastUrl(lat, lon));
      if (!r.ok) throw new Error('forecast ' + r.status);
      wx = await r.json();
      out.forecasts++;
    } catch (e) { out.failed += group.length; continue; }
    const sum = clearDarkScore(wx, { lat, lon }, 0, nowMs);
    if (!sum || sum.score == null || sum.score < MIN_SCORE) continue;
    for (const d of group) {
      const sub = await env.SUBS.get(d.name, 'json');
      if (!sub) continue;
      const msg = alertMessage(sum, d.m.tz, d.m.h24);
      let status;
      try { status = await sendPush(sub, JSON.stringify(msg), vapid, fetchFn); } catch (e) { status = 0; }
      if (status === 404 || status === 410) { await env.SUBS.delete(d.name); out.gone++; }
      else if (status >= 200 && status < 300) {
        await env.SUBS.put(d.name, JSON.stringify(sub), { metadata: Object.assign({}, d.m, { last: d.date }) });
        out.sent++;
      } else out.failed++;
    }
  }
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
      status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const path = new URL(request.url).pathname;

    try {
      if (request.method === 'GET' && path === '/key') return json({ key: vapidOf(env).pub });
      if (request.method !== 'POST') return json({ error: 'not found' }, 404);

      const text = await request.text();
      if (text.length > 4096) return json({ error: 'too large' }, 413);
      let body;
      try { body = JSON.parse(text); } catch (e) { return json({ error: 'bad json' }, 400); }

      if (path === '/subscribe') {
        const { sub, lat, lon, tz } = body || {};
        if (!validSub(sub)) return json({ error: 'bad subscription' }, 400);
        if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) return json({ error: 'bad location' }, 400);
        if (!validTz(tz)) return json({ error: 'bad time zone' }, 400);
        const name = await keyFor(sub.endpoint);
        const prev = await env.SUBS.getWithMetadata(name);
        const keep = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
        const meta = { lat: round1(lat), lon: round1(lon), tz, h24: !!body.h24, last: (prev.metadata && prev.metadata.last) || '' };
        await env.SUBS.put(name, JSON.stringify(keep), { metadata: meta });
        if (body.hello) {
          const hello = { title: 'Alerts are on', body: `Twilyte will tell you around ${body.h24 ? '16:00' : '4 PM'} on days when tonight looks clear and dark here.`, tag: 'hello', url: '/?tab=console' };
          ctx.waitUntil(sendPush(keep, JSON.stringify(hello), vapidOf(env)).catch(() => {}));
        }
        return json({ ok: true });
      }
      if (path === '/unsubscribe') {
        const ep = body && body.endpoint;
        if (typeof ep !== 'string' || ep.length > 1024) return json({ error: 'bad endpoint' }, 400);
        await env.SUBS.delete(await keyFor(ep));
        return json({ ok: true });
      }
      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAlerts(env, event.scheduledTime || Date.now()));
  }
};
