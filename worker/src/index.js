/**
 * Twilight Visitor Counter — Cloudflare Worker
 *
 * Source of the Worker deployed at https://twilight-counter.ken-b39.workers.dev/.
 * Committed 2026-09-22 from the dashboard copy; see worker/README.md for what
 * it stores, how to deploy it from here, and its known limitations.
 *
 * The one change from the dashboard copy: the IP-hash salt is read from the
 * IP_SALT secret instead of being written in the code, because this repo is
 * public and a salted IPv4 hash is only as private as its salt. Set the
 * secret BEFORE the first deploy from this repo (README, step 1), to the
 * value currently in the dashboard code, or every returning visitor is
 * counted again once.
 */

// What a visitor is recognised by. IPv4: the address. IPv6: only the /64
// network prefix. Windows, iOS and Android give each device temporary IPv6
// addresses whose second half is random and rotates (often daily), so the
// full address makes one visitor look new every rotation. The /64 is what the
// network assigns the household or phone and stays put across rotations, and
// it is less specific than a full address. IPv4 is unchanged, so every IPv4
// entry written before this change still matches.
function visitorKey(ip) {
  ip = String(ip || '').trim().toLowerCase();
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) is an IPv4 client.
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return mapped[1];
  if (!ip.includes(':')) return ip;
  const [head, tail] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : null;
  const groups = t === null ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  if (groups.length < 4 || groups.slice(0, 4).some(g => !/^[0-9a-f]{1,4}$/.test(g))) return ip;
  return groups.slice(0, 4).map(g => parseInt(g, 16).toString(16)).join(':') + '::/64';
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = {
      'Access-Control-Allow-Origin': origin.includes('twilyte.info') || origin.includes('github.io')
        ? origin : 'https://twilyte.info',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    try {
      // Refuse to run without the salt rather than hashing with a missing one:
      // a different salt makes every returning visitor look new.
      if (!env.IP_SALT) throw new Error('IP_SALT secret is not set');

      // Get client IP (Cloudflare always sets this header), reduced to what
      // identifies the visitor — see visitorKey.
      const ip = visitorKey(request.headers.get('CF-Connecting-IP') || 'unknown');

      // Hash the IP for privacy — we store the hash, never the raw IP
      const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(ip + env.IP_SALT)
      );
      const ipHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 20);

      // Check if this visitor has been seen before
      const seen = await env.VISITORS.get(ipHash);
      let total = parseInt(await env.VISITORS.get('__total__') || '0');

      if (!seen) {
        // New unique visitor
        total += 1;
        // Keep the hash only as long as it is needed: 24 hours, matching the
        // browser's own window (COUNTER_WINDOW_MS in index.html), which does
        // the real deduping. This is only the backstop for browsers with no
        // stored record, so holding a per-IP value longer buys little and is
        // exactly what the privacy policy has to disclose. (Was 1 year.)
        await env.VISITORS.put(ipHash, '1', { expirationTtl: 24 * 60 * 60 });
        await env.VISITORS.put('__total__', String(total));
      }

      return new Response(JSON.stringify({ count: total, new: !seen }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ count: 0, error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
