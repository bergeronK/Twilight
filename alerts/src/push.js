/*
 * Web Push, by hand: the message encryption of RFC 8291 (aes128gcm, RFC 8188)
 * and the VAPID signature of RFC 8292, on nothing but WebCrypto, so the Worker
 * has no dependencies to audit or keep up to date.
 *
 * `encryptPush` is checked byte for byte against the worked example in the
 * RFC (alerts.test.js), which is why it takes the sender's key pair and salt
 * as optional arguments: a real message uses fresh random ones.
 */

const enc = new TextEncoder();

export function b64u(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64u(str) {
  const s = atob(String(str).replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// An uncompressed P-256 point (65 bytes, 0x04 || x || y) as a JWK.
function pointJwk(pub, d) {
  const jwk = { kty: 'EC', crv: 'P-256', x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true };
  if (d) jwk.d = d;
  return jwk;
}

/*
 * Encrypt `payload` (a string) for one subscription. `p256dh` and `auth` are
 * the subscription's keys as the browser gives them (base64url). Returns the
 * request body: salt, record size, the sender's public key, then the one
 * record, as RFC 8291 section 4 lays out.
 */
export async function encryptPush(payload, p256dh, auth, fixed) {
  const uaPublic = unb64u(p256dh);
  const authSecret = unb64u(auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('bad p256dh key');
  if (authSecret.length !== 16) throw new Error('bad auth secret');

  let asPrivate, asPublic;
  if (fixed) {
    asPublic = unb64u(fixed.asPublic);
    asPrivate = await crypto.subtle.importKey('jwk', pointJwk(asPublic, fixed.asPrivate), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  } else {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    asPrivate = pair.privateKey;
    asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  }
  const salt = fixed ? unb64u(fixed.salt) : crypto.getRandomValues(new Uint8Array(16));

  // Importing the browser's key also checks that it is a point on the curve,
  // which the RFC requires of the sender.
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPrivate, 256));

  const prkKey = await hmac(authSecret, ecdhSecret);
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hmac(prkKey, concat(keyInfo, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, enc.encode('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16);
  const nonce = (await hmac(prk, enc.encode('Content-Encoding: nonce\0\x01'))).slice(0, 12);

  const key = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  // One record, so it ends with the last-record delimiter, 0x02, and no padding.
  const plain = concat(enc.encode(payload), new Uint8Array([2]));
  if (plain.length + 16 > 4096) throw new Error('payload too long for one record');
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plain));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

/*
 * The VAPID Authorization header for one push service. `jwk` is the
 * application server's private key; `pub` its public key, base64url, which is
 * also what the browser subscribed with. The token is good for 12 hours, and
 * `sub` is the contact the push service may use, a mailto: or https: URL.
 */
export async function vapidAuth(endpoint, jwk, pub, sub, nowMs = Date.now()) {
  const aud = new URL(endpoint).origin;
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub })));
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // WebCrypto's ECDSA signature is already r || s, the form JWS wants.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${pub}`;
}

/* Send one message. Returns the push service's status: 201 is delivered to
   the service; 404 and 410 mean the subscription is gone for good. */
export async function sendPush(sub, payload, vapid, fetchFn = fetch) {
  const body = await encryptPush(payload, sub.keys.p256dh, sub.keys.auth);
  const res = await fetchFn(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(sub.endpoint, vapid.jwk, vapid.pub, vapid.sub),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      // Tonight's news is worthless tomorrow.
      TTL: '43200',
      Urgency: 'normal'
    },
    body
  });
  return res.status;
}
