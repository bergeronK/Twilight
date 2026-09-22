# Visitor counter Worker

The Cloudflare Worker behind the visitor total in `index.html`'s header,
deployed at `https://twilight-counter.ken-b39.workers.dev/`. It was written
and deployed from the Cloudflare dashboard and had no copy in this repo until
2026-09-22.

## What it does

`GET /` returns `{"count": <total>, "new": <bool>}`. A visitor is recognised
by their IP address: the first request from an unseen IP adds one to the
total, later requests don't. `OPTIONS` answers the CORS preflight; anything
else is `405`.

## What it stores

In the `TWILIGHT-VISITORS` KV namespace (bound as `VISITORS`):

| Key | Value | Expires |
|---|---|---|
| `__total__` | the running total | never |
| first 20 hex chars of SHA-256(IP + `IP_SALT`) | `"1"` | 24 hours |

The raw IP is never written. The salt is a Worker secret, not in this file,
because the repo is public: an IPv4 address has only about 4 billion possible
values, so a salted hash is only as private as its salt.

Until 2026-09-22 the per-IP entries expired after **1 year**. Changing the
TTL only affects new writes: entries written before the change keep their
1-year expiry until they lapse, unless deleted from the namespace. The
privacy policy's 24-hour statement is fully true only once those are gone.

## How it fits with the client

The Worker can only recognise a returning visitor by IP, and an IP is not a
person: a phone's address changes whenever its network does. So `index.html`
also keeps its own window: it pings at most once per `COUNTER_WINDOW_MS`
(24h), tracked in `tw_counted_at`. The Worker's per-IP check is the backstop
for when that local record is gone (cleared storage, private browsing), and
its 24h TTL matches that window.

**What the total means.** Both windows are 24 hours, so the count is
*visitor-days*: one person visiting on five different days counts five
times. With the old 1-year TTL, a returning visitor on an unchanged IP was
counted once a year, so the total now grows noticeably faster than it did.

## Deploying from here

Deploying from this directory **replaces the code currently running in the
dashboard**. Run from `worker/`:

1. **Set the salt first**, to the value in the dashboard's current code (the
   string appended to `ip` in the `crypto.subtle.digest` call):

   ```
   npx wrangler secret put IP_SALT
   ```

   Same value means the same hashes, so every existing visitor stays deduped.
   A different or missing value makes every returning visitor count once more;
   a missing one makes the Worker refuse to count at all (`500`) rather than
   hash with nothing.

2. `npx wrangler deploy`

`wrangler.toml`'s `compatibility_date` was not recorded at the original
dashboard deploy; see the comment there.

## Known limitations

These are properties of the code as deployed, recorded rather than changed:

- **KV is eventually consistent.** A write can take up to about 60 seconds to
  be visible at other Cloudflare locations, so two requests from one IP in
  quick succession through different locations can both count.
- **The total is not updated atomically.** It is read, incremented and
  written back, so two first visits landing at the same moment can produce
  one increment instead of two. It undercounts, never overcounts. A Durable
  Object would make it exact.
- **The CORS origin check is a substring match** (`origin.includes(...)`),
  so it also matches look-alike hosts. Harmless here: the count is public
  and the endpoint takes no input.
- **Errors return `{"count": 0}` with status 500.** Clients have to check the
  status, not only whether `count` is a number.

## Testing

No test runs in CI. To exercise it locally, import `src/index.js` from an
`.mjs` file in Node 22+ (which has `Request`, `Response` and `crypto.subtle`)
and call `fetch(request, env)` with an in-memory stand-in for `env.VISITORS`.
