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

      // Get client IP (Cloudflare always sets this header)
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

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
        // Store with 1-year expiry so IPs eventually cycle out
        await env.VISITORS.put(ipHash, '1', { expirationTtl: 365 * 24 * 60 * 60 });
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
