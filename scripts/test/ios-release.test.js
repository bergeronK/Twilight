'use strict';
/*
 * What the iPhone app's first App Store version needs (2026-10-02; owner:
 * 1.0 free with everything unlocked, category Reference):
 * - no "PRO" or "preview" wording in the app while it sells nothing (App
 *   Review turns away an app that calls itself a preview), the website
 *   unchanged;
 * - the privacy policy and a Help page reachable inside the app, offline;
 * - an app icon iOS can mask itself: square, opaque, no ring (the round art
 *   showed a light circle on the Home Screen);
 * - listing text inside Apple's limits.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { extract, declSource } = require('./extract.js');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const HTML = read('index.html');

test('the week planner says Pro and preview on the website only', () => {
  const { proShown } = extract(['RC_KEYS', 'rcPlugin', 'proShown']);
  const saved = global.window;
  try {
    global.window = {};
    assert.strictEqual(proShown(), 'preview', 'website');
    global.window = { Capacitor: { getPlatform: () => 'ios', Plugins: {} } };
    assert.strictEqual(proShown(), null, 'iPhone app, nothing for sale');
    global.window = { Capacitor: { getPlatform: () => 'ios', Plugins: { Purchases: {} } }, __TW_RC_KEY: 'appl_x' };
    assert.strictEqual(proShown(), 'sold', 'once the store sells it');
  } finally {
    global.window = saved;
  }
  // Every badge and preview line goes through it.
  const planner = declSource('weekPlannerEl');
  assert.match(planner, /proShown\(\) && React\.createElement\("span", \{[^}]*\} \}, "PRO"\)/);
  assert.match(planner, /proShown\(\) === 'preview' && React\.createElement\("span", \{[^}]*\} \}, "free preview"\)/);
  const app = declSource('TwilightApp');
  assert.match(app, /"Week planner ", proShown\(\) && React\.createElement\("span"/);
  assert.match(app, /iapMode \? \([^)]*" One-time purchase\."\) : proShown\(\) === 'preview' \? " Free during preview\." : ""/);
  assert.strictEqual((HTML.match(/"PRO"/g) || []).length, 2);
  assert.strictEqual((HTML.match(/free preview|Free during preview/g) || []).length, 2);
});

test('the privacy policy and the Help page are linked from the app and bundled into it', () => {
  const footer = declSource('TwilightApp');
  assert.match(footer, /href: "\/privacy\.html", style: \{[^}]*\} \}, "Privacy"\),\s*" · ",\s*React\.createElement\("a", \{ href: "\/support\.html", style: \{[^}]*\} \}, "Help"\)/);
  const sync = read('native/sync-web.js');
  for (const f of ['privacy.html', 'support.html']) {
    assert.ok(sync.includes(`'${f}'`), `${f} bundled into the apps`);
    assert.ok(read('sw.js').includes(`'/${f}'`), `${f} precached for the website`);
  }
  assert.ok(read('sitemap.xml').includes('<loc>https://twilyte.info/support.html</loc>'));
  const yml = read('.github/workflows/ios-build.yml');
  assert.match(yml, /test -f "\$app\/public\/privacy\.html"/);
  assert.match(yml, /test -f "\$app\/public\/support\.html"/);
});

test('the Help page: contact, no scripts, links that resolve, the app’s own words', () => {
  const page = read('support.html');
  assert.match(page, /script-src 'none'/);
  assert.doesNotMatch(page, /<script/);
  assert.match(page, /<link rel="canonical" href="https:\/\/twilyte\.info\/support\.html" \/>/);
  assert.ok(page.includes('https://github.com/bergeronK/Twilight/issues/new?template=feedback.md'), 'a way to get in touch');
  assert.ok(page.includes('href="privacy.html"'));
  // Every local file it uses exists (the app bundles the same files).
  for (const [, f] of page.matchAll(/url\(([^)]+)\)|href="([^"#:]+\.(?:png|html))"/g)) {
    if (f) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  }
  for (const [, f] of page.matchAll(/url\((fonts\/[^)]+)\)/g)) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  // Labels it tells people to tap are the app's.
  for (const label of ['Find', 'Align', 'Sensors', 'Copy', 'Auto-detect from location', 'Settings']) {
    assert.ok(HTML.includes(`'${label}'`) || HTML.includes(`"${label}"`), label);
  }
  // The privacy policy no longer says the apps sell anything.
  const policy = read('privacy.html');
  assert.match(policy, /The current iOS and Android apps sell nothing/);
  assert.doesNotMatch(policy, /apps offer an optional one-time purchase/);
});

// A PNG's pixels, enough for 8-bit RGB and RGBA without interlacing.
function readPng(file) {
  const buf = fs.readFileSync(path.join(ROOT, file));
  let pos = 8, w, h, type, idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString('latin1', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9];
      assert.strictEqual(data[8], 8, 'bit depth');
      assert.strictEqual(data[12], 0, 'interlace');
    }
    if (kind === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const bpp = { 2: 3, 6: 4 }[type];
  assert.ok(bpp, `colour type ${type}`);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[y * stride + i - bpp] : 0, b = y ? px[(y - 1) * stride + i] : 0;
      const c = i >= bpp && y ? px[(y - 1) * stride + i - bpp] : 0;
      const pr = () => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
      px[y * stride + i] = (row[i] + [0, a, b, (a + b) >> 1, pr()][f]) & 255;
    }
  }
  return { w, h, bpp, at: (x, y) => [...px.subarray((y * w + x) * bpp, (y * w + x) * bpp + bpp)] };
}

test('the iPhone app icon is full-bleed: square, opaque, no ring, no black corners', () => {
  for (const [file, size] of [['native/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024], ['apple-touch-icon.png', 180]]) {
    const im = readPng(file);
    assert.deepStrictEqual([im.w, im.h], [size, size], file);
    if (im.bpp === 4) for (let y = 0; y < size; y += 7) for (let x = 0; x < size; x += 7) assert.strictEqual(im.at(x, y)[3], 255, `${file} opaque at ${x},${y}`);
    // Corners carry the sky and the ground, not black.
    const lum = p => p[0] + p[1] + p[2];
    for (const [x, y] of [[2, 2], [size - 3, 2], [2, size - 3], [size - 3, size - 3]]) {
      assert.ok(lum(im.at(x, y)) > 20, `${file} corner ${x},${y} is ${im.at(x, y)}`);
    }
    // No light ring where the round art's edge was: around the old circle
    // nothing is much brighter than the sky just inside it (stars aside).
    const c = (size - 1) / 2, R = size * 254 / 512;
    let ringy = 0, n = 0;
    for (let k = 0; k < 720; k++) {
      const t = 2 * Math.PI * k / 720;
      const on = im.at(Math.round(c + R * Math.cos(t)), Math.round(c + R * Math.sin(t)));
      const inside = im.at(Math.round(c + (R - size / 40) * Math.cos(t)), Math.round(c + (R - size / 40) * Math.sin(t)));
      n++;
      if (lum(on) - lum(inside) > 60) ringy++;
    }
    assert.ok(ringy / n < 0.02, `${file}: ${ringy} of ${n} points on the old edge are a bright ring`);
  }
});

// The text blocks of docs/app-store-listing.md, by heading.
function listing() {
  const md = read('docs/app-store-listing.md'), out = {};
  for (const m of md.matchAll(/^### ([^\n]+)\n```\n([\s\S]*?)\n```/gm)) out[m[1]] = m[2];
  return out;
}

test('the App Store listing fits Apple’s limits and says nothing the app doesn’t do', () => {
  const L = listing();
  const limits = { 'Name (30)': 30, 'Subtitle (30)': 30, 'Promotional text (170)': 170, 'Description (4000)': 4000, 'Keywords (100)': 100, 'Notes (4000)': 4000 };
  for (const [k, max] of Object.entries(limits)) {
    assert.ok(L[k], `${k} present`);
    assert.ok([...L[k]].length <= max, `${k}: ${[...L[k]].length} > ${max}`);
  }
  assert.strictEqual(L['Name (30)'], 'Twilyte');
  const kw = L['Keywords (100)'].split(',');
  assert.ok(kw.every(k => k === k.trim() && k), 'no spaces around commas, no empty keywords');
  assert.strictEqual(new Set(kw).size, kw.length, 'no repeats');
  assert.strictEqual(L['Support URL'], 'https://twilyte.info/support.html');
  assert.strictEqual(L['Privacy Policy URL'], 'https://twilyte.info/privacy.html');
  assert.ok(fs.existsSync(path.join(ROOT, 'support.html')) && fs.existsSync(path.join(ROOT, 'privacy.html')));
  // 1.0 sells nothing, and says so to the reviewer.
  assert.match(L['Notes (4000)'], /no in-app purchases in this version/);
  assert.doesNotMatch(L['Description (4000)'], /\bPro\b|purchase|subscription|preview/i);
  // Left out until seen working in the app (CelesTrak's and NOAA's replies).
  assert.doesNotMatch(L['Description (4000)'], /space station|northern lights|aurora/i);
});

/*
 * The apps ask for location through Capacitor's Geolocation plugin, so iOS
 * itself asks "Allow Twilyte to use your location?". navigator.geolocation
 * inside the app's web view asked again, on behalf of "localhost" (owner's
 * iPhone, 2026-10-02).
 */
test('in the apps, location comes from the system, with the browser’s error codes', async () => {
  const { getPosition, canLocate } = extract(['nativeGeo', 'canLocate', 'getPosition']);
  const savedW = global.window, savedN = Object.getOwnPropertyDescriptor(global, 'navigator');
  const setNav = v => Object.defineProperty(global, 'navigator', { value: v, configurable: true, writable: true });
  const run = () => new Promise(res => getPosition(p => res({ ok: p }), e => res({ err: e }), { timeout: 8000 }));
  try {
    let browserAsked = 0, asked = null;
    setNav({ geolocation: { getCurrentPosition: (ok) => { browserAsked++; ok({ coords: { latitude: 1, longitude: 2 } }); } } });
    // The website: the browser's own.
    global.window = {};
    assert.ok(canLocate());
    assert.deepStrictEqual((await run()).ok.coords, { latitude: 1, longitude: 2 });
    assert.strictEqual(browserAsked, 1);
    // The iPhone app: the plugin, with time to answer the system's question.
    const plugin = result => ({ getCurrentPosition: o => { asked = o; return result(); } });
    global.window = { Capacitor: { getPlatform: () => 'ios', Plugins: { Geolocation: plugin(() => Promise.resolve({ coords: { latitude: 42.1, longitude: -72.45 } })) } } };
    assert.deepStrictEqual((await run()).ok.coords, { latitude: 42.1, longitude: -72.45 });
    assert.strictEqual(browserAsked, 1, 'the web view was not asked');
    assert.ok(asked.timeout >= 20000, `timeout ${asked.timeout}`);
    for (const [code, want] of [['OS-PLUG-GLOC-0003', 1], ['OS-PLUG-GLOC-0008', 1], ['OS-PLUG-GLOC-0010', 3], ['OS-PLUG-GLOC-0002', 2], ['OS-PLUG-GLOC-0007', 2]]) {
      global.window.Capacitor.Plugins.Geolocation = plugin(() => Promise.reject({ code, message: 'x' }));
      assert.strictEqual((await run()).err.code, want, code);
    }
    // No plugin and no browser API: nothing to ask.
    global.window = { Capacitor: { getPlatform: () => 'ios', Plugins: {} } };
    setNav({});
    assert.strictEqual(canLocate(), false);
  } finally {
    global.window = savedW;
    if (savedN) Object.defineProperty(global, 'navigator', savedN); else delete global.navigator;
  }
  // Every place that asks for a position goes through it.
  const calls = HTML.match(/navigator\.geolocation\.getCurrentPosition/g) || [];
  assert.strictEqual(calls.length, 1, 'only getPosition itself calls the browser');
  for (const name of ['RealtimeTwilight', 'TwilightEphemeris', 'StarFinder']) {
    assert.match(declSource(name), /getPosition\(/, name);
  }
});
