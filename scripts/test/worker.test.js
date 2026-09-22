'use strict';
/*
 * The visit-counter Worker, worker/src/index.js.
 *
 * CI runs Node 20, which can't import a .js file written as an ES module, so
 * the source is read as text and evaluated with its `export default` turned
 * into a local — the same approach extract.js takes with index.html, and it
 * runs the shipped file rather than a copy. Request, Response and
 * crypto.subtle are globals in Node 20.
 *
 * What matters here is identity: the Worker decides whether a visitor is new
 * from a salted hash of visitorKey(ip). Get that wrong and the count silently
 * inflates (IPv6 privacy addresses rotate), or every existing visitor is
 * counted again (a key that no longer matches what was stored before).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'worker', 'src', 'index.js'), 'utf8');
if (SRC.split('export default {').length !== 2) throw new Error('worker: expected exactly one `export default {`');
const { worker, visitorKey } = new Function(
  SRC.replace('export default {', 'const __worker = {') + '\nreturn { worker: __worker, visitorKey };'
)();

const SALT = 'test-salt';

function kv() {
  const m = new Map();
  const puts = [];
  return {
    get: async k => (m.has(k) ? m.get(k) : null),
    put: async (k, v, o) => { m.set(k, v); puts.push([k, o]); },
    m, puts
  };
}
async function hit(env, ip, method = 'GET') {
  const r = await worker.fetch(
    new Request('https://counter.test/', { method, headers: { 'CF-Connecting-IP': ip, Origin: 'https://twilyte.info' } }),
    env
  );
  const json = (r.headers.get('Content-Type') || '').includes('application/json');
  return { status: r.status, body: json ? await r.json() : null };
}
// The key the Worker writes for a given key input, computed independently.
async function hashOf(input) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input + SALT));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
}

test('visitorKey: IPv4 is the address itself', () => {
  assert.strictEqual(visitorKey('203.0.113.7'), '203.0.113.7');
});

test('visitorKey: IPv6 reduces to its /64, however it is written', () => {
  const k = '2600:6c65:6a40:653::/64';
  for (const ip of [
    '2600:6c65:6a40:653:f9e8:ee8d:73f5:27e',     // a Windows temporary address
    '2600:6c65:6a40:0653:1111:2222:3333:4444',   // leading zero, different suffix
    '2600:6C65:6A40:653::1',                     // compressed, upper case
    '2600:6c65:6a40:653::'
  ]) assert.strictEqual(visitorKey(ip), k, ip);
});

test('visitorKey: :: inside the prefix expands to zero groups', () => {
  assert.strictEqual(visitorKey('2001:db8::1'), '2001:db8:0:0::/64');
  assert.strictEqual(visitorKey('2001:db8:0:0:abcd::1'), '2001:db8:0:0::/64');
});

test('visitorKey: an IPv4-mapped IPv6 address is the IPv4 client', () => {
  assert.strictEqual(visitorKey('::ffff:203.0.113.7'), '203.0.113.7');
});

test('visitorKey: different /64s stay different', () => {
  assert.notStrictEqual(visitorKey('2600:6c65:6a40:653::1'), visitorKey('2600:6c65:6a40:654::1'));
});

test('two IPv6 privacy addresses on one network count once', async () => {
  const env = { VISITORS: kv(), IP_SALT: SALT };
  assert.deepStrictEqual((await hit(env, '2600:6c65:6a40:653:f9e8:ee8d:73f5:27e')).body, { count: 1, new: true });
  assert.deepStrictEqual((await hit(env, '2600:6c65:6a40:653:aaaa:bbbb:cccc:dddd')).body, { count: 1, new: false });
  assert.deepStrictEqual((await hit(env, '2600:6c65:6a40:654::1')).body, { count: 2, new: true });
});

test('IPv4 keys are unchanged, so entries stored before this change still match', async () => {
  const env = { VISITORS: kv(), IP_SALT: SALT };
  await hit(env, '203.0.113.7');
  // The pre-change Worker hashed the raw IP string with the salt appended.
  assert.ok(env.VISITORS.m.has(await hashOf('203.0.113.7')));
});

test('per-visitor entries expire after 24 hours; the total never does', async () => {
  const env = { VISITORS: kv(), IP_SALT: SALT };
  await hit(env, '198.51.100.2');
  const byKey = Object.fromEntries(env.VISITORS.puts);
  assert.strictEqual(byKey[await hashOf('198.51.100.2')].expirationTtl, 86400);
  assert.strictEqual(byKey.__total__, undefined);
});

test('no IP_SALT: refuses with 500 and writes nothing', async () => {
  const env = { VISITORS: kv() };
  const r = await hit(env, '203.0.113.7');
  assert.strictEqual(r.status, 500);
  assert.strictEqual(env.VISITORS.m.size, 0);
});

test('preflight is 204, other methods 405', async () => {
  const env = { VISITORS: kv(), IP_SALT: SALT };
  assert.strictEqual((await hit(env, '203.0.113.7', 'OPTIONS')).status, 204);
  assert.strictEqual((await hit(env, '203.0.113.7', 'POST')).status, 405);
});
