'use strict';
/*
 * The twilight-times/ city pages (129 since 2026-09-25) and the link from
 * each into the app. The pages are the site's search traffic; the link is
 * where that traffic becomes a visit, so it has to open on the right place,
 * with its name and its clock, on the Console and on the Ephemeris.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extract, declSource } = require('./extract.js');

const ROOT = path.join(__dirname, '..', '..');
const DIR = path.join(ROOT, 'twilight-times');
const pages = fs.readdirSync(DIR).filter(f => f.endsWith('.html') && f !== 'index.html');
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');
const { urlPlace } = extract(['urlPlace']);

test('the address carries a place: coordinates, name and zone', () => {
  const p = urlPlace('?lat=42.3601&lon=-71.0589&name=Boston%2C%20MA&tz=America%2FNew_York');
  assert.deepStrictEqual(p, { lat: 42.3601, lon: -71.0589, name: 'Boston, MA', tz: 'America/New_York' });
  // No name: the coordinates. A zone that isn't one: the device's.
  const bare = urlPlace('?lat=10&lon=20&tz=Mars%2FOlympus');
  assert.strictEqual(bare.name, '10.00°, 20.00°');
  assert.strictEqual(bare.tz, Intl.DateTimeFormat().resolvedOptions().timeZone);
  // Off the globe, or missing: no place.
  for (const q of ['', '?lat=95&lon=0', '?lat=0&lon=181', '?lat=x&lon=1', '?lon=5', '?lat=Infinity&lon=0']) assert.strictEqual(urlPlace(q), null, q);
  // A long or spaced-out name is tidied and capped.
  assert.strictEqual(urlPlace('?lat=1&lon=1&name=' + encodeURIComponent('  A   B ' + 'x'.repeat(100))).name.length, 60);
  assert.strictEqual(urlPlace('?lat=1&lon=1&name=%20%20A%20%20%20B').name, 'A B');
});

test('all three tabs open on a place from the address', () => {
  for (const c of ['RealtimeTwilight', 'TwilightEphemeris', 'StarFinder']) {
    assert.match(declSource(c), /const fromUrl = urlPlace\(window\.location\.search\);\s*if \(fromUrl\) return fromUrl;/, c);
  }
  assert.match(declSource('RealtimeTwilight'), /if \(urlPlace\(window\.location\.search\)\) return 'url';/, 'and the Console knows it came from the address');
});

test('every city page opens the app on its own place', () => {
  assert.ok(pages.length >= 120, `${pages.length} pages`);
  const zones = new Set();
  for (const f of pages) {
    const html = read(f);
    const host = /id="tw-times" class="times" data-lat="([-\d.]+)" data-lon="([-\d.]+)" data-tz="([^"]+)"/.exec(html);
    assert.ok(host, f);
    const [, lat, lon, tz] = host;
    assert.doesNotThrow(() => new Intl.DateTimeFormat([], { timeZone: tz }), `${f}: ${tz}`);
    zones.add(tz);
    const h1 = /<h1>([^<]+)<\/h1>/.exec(html)[1];
    // Both links, read the way the app reads them.
    const links = [...html.matchAll(/href="(\/\?[^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&'));
    assert.strictEqual(links.length, 2, f);
    for (const href of links) {
      const p = urlPlace(href.slice(1));
      assert.deepStrictEqual(p, { lat: +lat, lon: +lon, name: h1, tz }, `${f}: ${href}`);
    }
    assert.ok(links.some(h => h.startsWith('/?tab=ephemeris&')), `${f}: the full day on the Ephemeris`);
    assert.ok(links.some(h => h.startsWith('/?lat=')), `${f}: the Console`);
    // Nearby cities: at most four, each a page that exists.
    const near = /Nearby: (.*)<\/p>/.exec(html);
    if (near) {
      const hrefs = [...near[1].matchAll(/href="([^"]+)"/g)].map(m => m[1]);
      assert.ok(hrefs.length >= 1 && hrefs.length <= 4, f);
      hrefs.forEach(h => assert.ok(pages.includes(h), `${f} → ${h}`));
      assert.ok(!hrefs.includes(f), `${f} lists itself`);
    }
  }
  assert.ok(zones.size >= 40, `${zones.size} time zones`);
});

test('slugs are plain, the hub lists every page, the sitemap has them all', () => {
  for (const f of pages) assert.match(f, /^[a-z0-9]+(-[a-z0-9]+)*\.html$/, f);
  assert.ok(pages.includes('sao-paulo.html') && pages.includes('tromso.html'), 'accents taken off, not dropped');
  const hub = read('index.html');
  const listed = [...hub.matchAll(/<li><a href="([^"]+)">/g)].map(m => m[1]).sort();
  assert.deepStrictEqual(listed, pages.slice().sort());
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  pages.forEach(f => assert.ok(sitemap.includes(`https://twilyte.info/twilight-times/${f}</loc>`), f));
  assert.strictEqual((sitemap.match(/twilight-times\//g) || []).length, pages.length + 1);
});

test('the small grey labels on the pages pass WCAG AA', () => {
  // #7d766a was 4.3:1 on the page's darkest wash; the app moved to #888174.
  for (const f of [...pages, 'index.html']) assert.ok(!read(f).includes('#7d766a'), f);
});
