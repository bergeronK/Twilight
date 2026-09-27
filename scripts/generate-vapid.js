#!/usr/bin/env node
'use strict';
/*
 * Makes the VAPID key pair the alerts Worker signs with (RFC 8292).
 *
 *   node scripts/generate-vapid.js
 *
 * Prints the public key, for VAPID_PUBLIC in alerts/wrangler.toml, and the
 * private key, for `npx wrangler secret put VAPID_PRIVATE` in alerts/. The
 * private key goes nowhere else: never into the repo. Make the pair once;
 * a new pair orphans every existing subscription, since each browser
 * subscribed with the old public key.
 */
const { webcrypto: { subtle } } = require('crypto');

const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

(async () => {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  const jwk = await subtle.exportKey('jwk', pair.privateKey);
  console.log('VAPID_PUBLIC  (alerts/wrangler.toml):       ' + b64u(pub));
  console.log('VAPID_PRIVATE (wrangler secret, keep safe): ' + jwk.d);
})();
