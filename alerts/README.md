# Clear-and-dark alerts Worker

Sends a web push notification around 4 PM local time when tonight looks
clear and dark where the subscriber is. It's a Cloudflare Worker, like the
visit counter in `worker/`, but a separate one, with its own KV namespace,
so the counter's privacy statements stay as they are.

The app side is in `index.html` (`ClearAlerts`, the "Tell me when it's clear"
row on the Console under the clear-and-dark strip) and `sw.js` (the `push` and
`notificationclick` handlers). **The row stays hidden until `ALERTS_LIVE` in
`index.html` is `true`.** Deploy this Worker first, try it with
`https://twilyte.info/?alerts=1`, then flip the flag.

## What it does

| Request | |
|---|---|
| `GET /key` | `{"key": VAPID_PUBLIC}`, the key a browser subscribes with |
| `POST /subscribe` | `{sub, lat, lon, tz, h24, hello}`. `sub` is the browser's `PushSubscription` JSON. Stores it, overwriting any earlier entry for the same browser. With `hello: true` (first turning on) it sends "Alerts are on" straight away, which proves the whole path works. |
| `POST /unsubscribe` | `{endpoint}`. Deletes it. |
| cron, on the hour | `runAlerts`: for every subscriber whose local time is now 4 PM (`ALERT_HOUR`) and who hasn't had today's alert, fetch tonight's forecast for their place (once per place), score it, and send an alert if it reaches 78 (`MIN_SCORE`, the score at which the Console says "clear & dark"). |

The score is the Console's own: `src/sky.js` is **generated** from
`index.html` by `node scripts/generate-alerts-sky.js`, and
`scripts/test/alerts.test.js` fails if it is stale. Change the score in
`index.html`, re-run the script, redeploy.

Push encryption (RFC 8291) and the VAPID signature (RFC 8292) are written out
in `src/push.js` on WebCrypto, with no dependencies. The encryption is tested
byte for byte against the worked example in the RFC.

Only real push services are accepted as endpoints (Google, Mozilla, Apple,
Microsoft), so the Worker never posts to an arbitrary URL.

## What it stores

KV namespace `TWILYTE-ALERTS`, bound as `SUBS`. One entry per browser:

| Key | Value | Metadata |
|---|---|---|
| `s:` + first 32 hex of SHA-256(endpoint) | `{endpoint, keys: {p256dh, auth}}` | `{lat, lon, tz, h24, last}` |

`lat`/`lon` are rounded to 0.1° (about 11 km). `last` is the local date of the
last alert sent. The metadata comes back with each key in a listing, so the
hourly run reads nothing else and writes only when it sends. Entries are
deleted on unsubscribe and whenever a push service answers 404 or 410 (the
browser dropped the subscription). No IP address, name or other identifier is
stored. `/privacy.html` describes exactly this; change what is stored and
update it in the same PR.

## Deploying (owner, once)

From `alerts/`, logged in with `npx wrangler login`:

1. **KV namespace.** `npx wrangler kv namespace create TWILYTE-ALERTS`, then
   put the printed `id` into `wrangler.toml` in place of
   `REPLACE_WITH_KV_NAMESPACE_ID`. (Namespace ids aren't secret; the counter's
   is committed too.)
2. **VAPID keys.** `node ../scripts/generate-vapid.js`. Put the public key into
   `VAPID_PUBLIC` in `wrangler.toml` and commit it. Store the private key with
   `npx wrangler secret put VAPID_PRIVATE` and nowhere else. Make the pair
   **once**: a new pair strands every existing subscription, since each
   browser subscribed with the old public key.
3. `npx wrangler deploy`. It must come up at
   `https://twilyte-alerts.ken-b39.workers.dev`, which is `ALERTS_URL` in
   `index.html` and the address the page's CSP allows.
4. Check: `curl https://twilyte-alerts.ken-b39.workers.dev/key` returns the
   public key. (Unlike the counter, a GET here counts nothing.)
5. On a phone or desktop browser, open `https://twilyte.info/?alerts=1`, tap
   **Turn on**, and allow notifications. "Alerts are on" should arrive within
   seconds. On iPhone this only works from the Home Screen app (iOS 16.4+).
   Tapping it opens Twilyte.
6. Set `ALERTS_LIVE = true` in `index.html` (in a PR, with the usual CSP hash
   step) to show the row to everyone.

`npx wrangler tail` shows the hourly runs as they happen.

## Limits worth knowing

- **Free plan:** each cron run gets 50 subrequests (one per place's forecast,
  one per notification) and 10 ms of CPU. That is fine for dozens of
  subscribers in any one hour's time zone; beyond that some alerts in that hour
  fail and are tried again the next day. The $5 Workers Paid plan raises this
  to thousands. KV free tier: 1,000 writes a day, which is one per alert sent
  plus one per subscribe.
- One alert a day at most, at 4 PM local. A forecast that clears later in the
  evening isn't followed up.
- The subscribe endpoint is open (as any web push signup is). Someone could
  store junk subscriptions, but each must be a real push-service URL, and junk
  ones are deleted the first time a send gets 404/410.
