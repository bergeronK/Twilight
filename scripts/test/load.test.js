'use strict';
/*
 * First load and offline: the split Inter font, the favicon, the service
 * worker leaving other sites' replies alone, and the saved forecast used
 * when a fresh one can't be had.
 *
 * The font split fails silently: if any character the app shows falls in
 * the fallback face's range, every visit downloads the full 344 KB font
 * again and nothing looks different. That happened once while this was
 * built (the fullwidth ＋ on "Add to calendar"), so the text the app ships is
 * checked against the ranges here.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extract } = require('./extract.js');

const ROOT = path.join(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const HTML = read('index.html');

const parse = s => s.split(',').map(x => x.trim().replace(/^U\+/, '').split('-').map(h => parseInt(h, 16)))
  .map(a => [a[0], a[1] === undefined ? a[0] : a[1]]);
const inRanges = (cp, rs) => rs.some(([a, b]) => cp >= a && cp <= b);
function interFaces(src) {
  const faces = [...src.matchAll(/@font-face\{font-family:'Inter';[^}]*src:url\(([^)]+)\)[^}]*unicode-range:([^;]+);\}/g)];
  return faces.map(m => ({ file: m[1].replace(/^\.\.\//, ''), ranges: parse(m[2]) }));
}

test('Inter comes in two parts: the Latin core, and the full font only for the rest', () => {
  const f = interFaces(HTML);
  assert.deepStrictEqual(f.map(x => x.file), ['fonts/inter-latin.woff2', 'fonts/inter-var.woff2']);
  assert.ok(!/@font-face\{font-family:'Inter';[^}]*inter-var\.woff2\) format\('woff2'\);\}/.test(HTML), 'no face without a range left');
  const [core, rest] = f.map(x => x.ranges);
  // The core is exactly what scripts/subset-inter.sh cut.
  const sh = read('scripts/subset-inter.sh').match(/RANGE="([^"]+)"/)[1];
  assert.deepStrictEqual(core, parse(sh));
  // The two never overlap, so no character can pull both files.
  for (const [a, b] of rest) assert.ok(!inRanges(a, core) && !inRanges(b, core), `U+${a.toString(16)}`);
  // The city pages use the same two faces.
  // (the generator has two templates: the city pages and their index)
  const gen = interFaces(read('scripts/generate-city-pages.js'));
  assert.deepStrictEqual(gen.map(x => x.ranges), [core, rest, core, rest]);
  assert.ok(interFaces(read('twilight-times/boston-ma.html')).length === 2, 'pages regenerated');
  // Preloaded, and precached instead of the full font.
  assert.match(HTML, /<link rel="preload" href="fonts\/inter-latin\.woff2" as="font" type="font\/woff2" crossorigin \/>/);
  const sw = read('sw.js');
  assert.match(sw, /'\/fonts\/inter-latin\.woff2'/);
  assert.ok(!/'\/fonts\/inter-var\.woff2'/.test(sw), 'the full font is not precached');
  assert.match(read('native/sync-web.js'), /'fonts\/inter-latin\.woff2'/);
  assert.ok(fs.existsSync(path.join(ROOT, 'fonts/inter-latin.woff2')));
});

test('nothing the app writes needs the full font', () => {
  const rest = interFaces(HTML)[1].ranges;
  const texts = { 'index.html': HTML, 'facts.json': read('facts.json'), 'constellation-names.json': read('constellation-names.json') };
  for (const [name, t] of Object.entries(texts)) {
    const bad = [...new Set([...t])].filter(c => inRanges(c.codePointAt(0), rest))
      // index.html's own CSS lists the ranges as text, not characters.
      .filter(c => c.codePointAt(0) > 0x7f);
    assert.deepStrictEqual(bad.map(c => c + ' U+' + c.codePointAt(0).toString(16).toUpperCase()), [], name);
  }
});

test('the tab icon is the small one', () => {
  assert.match(HTML, /<link rel="icon" type="image\/png" sizes="64x64" href="favicon-64\.png" \/>/);
  assert.ok(!/rel="icon"[^>]*icon-512/.test(HTML + read('privacy.html') + read('twilight-times/boston-ma.html')));
  assert.ok(fs.statSync(path.join(ROOT, 'favicon-64.png')).size < 10000);
  assert.match(read('sw.js'), /'\/favicon-64\.png'/);
});

// sw.js's fetch handler, run against a fake service-worker scope.
function swFetch() {
  const handlers = {};
  const self = { addEventListener: (k, f) => { handlers[k] = f; }, location: { origin: 'https://twilyte.info' }, registration: {}, clients: {}, skipWaiting() {} };
  const caches = { match: () => Promise.resolve(undefined), open: () => Promise.resolve({ put() {} }) };
  new Function('self', 'caches', 'fetch', read('sw.js'))(self, caches, () => Promise.reject(new Error('offline')));
  return url => {
    let responded = false;
    handlers.fetch({ request: { url, method: 'GET', mode: 'cors', headers: { get: () => '' } }, respondWith: () => { responded = true; } });
    return responded;
  };
}

test('the service worker leaves other sites’ replies to the network', () => {
  const handled = swFetch();
  assert.strictEqual(handled('https://api.open-meteo.com/v1/forecast?latitude=42'), false, 'forecast: never served stale from the cache');
  assert.strictEqual(handled('https://geocoding-api.open-meteo.com/v1/search?name=x'), false);
  assert.strictEqual(handled('https://twilight-counter.ken-b39.workers.dev/'), false, 'visit count');
  assert.strictEqual(handled('https://twilyte.info/stars.bin'), true, 'its own files still cached');
});

const m = extract(['wxCacheUse', 'staleNote']);

test('a saved forecast: fresh under an hour, a fallback up to a day, then gone', () => {
  const now = Date.UTC(2026, 8, 24, 20);
  const at = h => ({ t: now - h * 3600000, d: { hourly: {} } });
  assert.strictEqual(m.wxCacheUse(at(0.5), now), 'fresh');
  assert.strictEqual(m.wxCacheUse(at(1), now), 'stale');
  assert.strictEqual(m.wxCacheUse(at(23.9), now), 'stale');
  assert.strictEqual(m.wxCacheUse(at(24), now), null);
  assert.strictEqual(m.wxCacheUse(null, now), null);
  assert.strictEqual(m.wxCacheUse({ t: 'x', d: {} }, now), null, 'junk in storage');
  assert.strictEqual(m.wxCacheUse(at(-2), now), null, 'from the future: a clock that jumped');
  assert.strictEqual(m.staleNote(now - 20 * 60000, now), 'forecast from under an hour ago');
  assert.strictEqual(m.staleNote(now - 90 * 60000, now), 'forecast from an hour ago');
  assert.strictEqual(m.staleNote(now - 5 * 3600000, now), 'forecast from 5 hours ago');
});

test('offline, the Console shows the saved forecast and says how old it is', () => {
  const { declSource } = require('./extract.js');
  const src = declSource('RealtimeTwilight');
  // The failure path falls back to the saved copy instead of blanking the score.
  assert.match(src, /\.catch\(err => \{\s*try \{ noteSource\(localStorage, 'openmeteo', err\); \} catch \(e\) \{\}\s*if \(seq !== wxSeq\.current\) return;\s*if \(wxCacheUse\(cached, Date\.now\(\)\)\) \{ setWx\(cached\.d\); setWxStale\(cached\.t\); \}/);
  assert.match(src, /wxStale \? wxScore\.factor \+ " \\u00b7 " \+ staleNote\(wxStale, now\)/);
});
