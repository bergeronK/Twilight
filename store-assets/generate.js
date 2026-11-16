#!/usr/bin/env node
'use strict';
/*
 * Regenerates App Store screenshots for store-assets/ios/.
 *
 * Requires: a local server for the repo root (e.g.
 * `python3 -m http.server 8137` from the repo root) and Playwright
 * (`require('playwright')` — adjust the path below if it's not on your
 * module resolution path).
 *
 * Usage: node store-assets/generate.js [serverUrl] [--store-only]
 *   serverUrl defaults to http://localhost:8137; --store-only leaves the
 *   PWA's two screenshots at the repo root alone (they are the website's,
 *   in sw.js's precache, so changing them means bumping CACHE).
 */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const SERVER = process.argv.slice(2).find(a => !a.startsWith('--')) || 'http://localhost:8137';
const OUT = path.join(__dirname, 'ios');

// Apple App Store Connect 6.9" iPhone requirement (per developer.apple.com/
// help/app-store-connect/reference/app-information/screenshot-specifications):
// 1260 x 2736 px portrait, required for any app that runs on iPhone. A
// 420x912 CSS viewport at 3x device scale factor renders at exactly that
// pixel size.
const W = 420, H = 912, DSR = 3;
// app: 'ios' loads the page as the iPhone app does (see capture), so the
// shots show the app, not the website.
const IPHONE = { w: W, h: H, dsr: DSR, mobile: true, app: 'ios' };
// 13" iPad: 2064 x 2752 px portrait, required because the Xcode project
// targets Universal (TARGETED_DEVICE_FAMILY = "1,2"). A 1032x1376 CSS
// viewport at 2x renders exactly that. isMobile is false here — iPadOS
// Safari reports a desktop-class viewport, and forcing mobile emulation
// would screenshot a layout no real iPad shows.
const IPAD = { w: 1032, h: 1376, dsr: 2, mobile: false, app: 'ios' };
// 6.5" iPhone: 1284 x 2778 px (428 x 926 at 3x). App Store Connect showed
// the owner a 6.5" slot that refused the 6.9" set (2026-10-05), so both go
// up; Apple scales whichever it has to the other sizes.
const IPHONE_65 = { w: 428, h: 926, dsr: 3, mobile: true, app: 'ios' };
// 12.9" iPad: 2048 x 2732 px (1024 x 1366 at 2x), for an iPad slot that asks
// for the older size rather than the 13" one.
const IPAD_129 = { w: 1024, h: 1366, dsr: 2, mobile: false, app: 'ios' };

// Where the shots are taken (owner, 2026-10-05): the Grand Canyon's South
// Rim, recognised everywhere and a dark sky (Bortle 2 by the app's own
// satellite data), so the painting and Sky View are full of stars. Arizona
// keeps standard time all year (UTC-7), so the clock never shifts.
const PLACE = { lat: 36.0544, lon: -112.1401, name: "Grand Canyon, AZ", tz: "America/Phoenix" };
const UTC_OFFSET_H = -7;

// Synthetic Open-Meteo response: clear for the next 48h (so tonight's card
// and the week planner's first rows agree), then a varied pattern so the
// planner shows a mix of clear/cloudy/rain nights — a more representative
// store screenshot than an all-clear week.
function mkForecast() {
  const off = UTC_OFFSET_H * 3600;
  const base = Math.floor(Date.now() / 3600000) * 3600000;
  const time = [], cc = [], hi = [], pp = [];
  for (let i = -1; i < 8 * 24; i++) {
    const ep = base + i * 3600000;
    time.push(new Date(ep + off * 1000).toISOString().slice(0, 16));
    let v;
    if (i < 48) v = 8;
    else { const day = Math.floor(i / 24); v = [8, 8, 65, 20, 90, 35, 12, 55][day % 8]; }
    cc.push(v); hi.push(0); pp.push(i >= 96 && i < 120 ? 60 : 0);
  }
  return { utc_offset_seconds: off, timezone: PLACE.tz, hourly: { time, cloud_cover: cc, cloud_cover_high: hi, precipitation_probability: pp } };
}

// Fixed instant: tonight at 22:15 local, so the mock forecast (anchored to
// the real current hour) lines up with what the app's clock shows.
const tonight = new Date(Math.floor(Date.now() / 86400000) * 86400000 + (22.25 - UTC_OFFSET_H) * 3600000);

async function capture(browser, tab, outPath, after, device, at) {
  const d = device || IPHONE;
  const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.dsr, isMobile: d.mobile, timezoneId: PLACE.tz });
  // Location isn't granted: with a saved place the app's own try is quiet,
  // and a refusal keeps the place, so the shots name it rather than say
  // "Your location".
  const page = await ctx.newPage();
  // The App Store shots must show the app, not the website: the page looks
  // for Capacitor's bridge to leave out the website's "PRO" badge and "free
  // preview" (App Review turns away a "preview"), its Share link, the visit
  // count and the install banner. With no plugins, location and motion fall
  // back to the browser's, which Playwright supplies.
  if (d.app) await page.addInitScript(platform => {
    window.Capacitor = { getPlatform: () => platform, Plugins: {} };
  }, d.app);
  await page.addInitScript(place => {
    localStorage.setItem('tw_loc', JSON.stringify(place));
    localStorage.setItem('tw_bortle_mode', 'auto');
    localStorage.setItem('tw_hint', '1'); // dismiss the onboarding banner for a cleaner shot
    localStorage.setItem('tw_welcomed', '1'); // and skip the first-run welcome
  }, PLACE);
  await page.route('**/api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mkForecast()) }));
  await page.clock.install({ time: at || tonight });
  // Do NOT swallow navigation failures. These images get committed, and a
  // silently-captured "This site can't be reached" page overwrites a good
  // asset with a broken one that looks fine until someone opens it.
  const resp = await page.goto(`${SERVER}/index.html?tab=${tab}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  if (!resp || !resp.ok()) throw new Error(`${SERVER} returned ${resp ? resp.status() : 'no response'} — is the local server running?`);
  await page.waitForTimeout(2600);
  // Belt and braces: confirm the app actually mounted, so a CSP break or a
  // JS error can't be captured as a blank/placeholder screenshot either.
  const mounted = await page.evaluate(() => !/Starting Twilyte/.test(document.body.innerText) && document.body.innerText.trim().length > 200);
  if (!mounted) throw new Error('app did not render — stale CSP hashes? run scripts/verify-build.js');
  if (after) await after(page);
  await page.screenshot({ path: outPath });
  await ctx.close();
  console.log(outPath, 'captured');
}

/* Opens Sky View aimed at the brightest star that's well placed right now.
   Headless Chromium has no magnetometer, so we feed one synthetic
   DeviceOrientationEvent to put the view in the live state every real iPhone
   is in. That's the app's genuine on-device behaviour, not a mock-up: the
   rendering, the positions and the labels are all the app's own, and the
   aim direction is read out of the app's own star table rather than
   invented here.

   Aiming a few degrees below the star leaves it in the upper half of the
   frame with its neighbours visible, instead of dead centre behind the
   reticle. */
async function openSkyView(page) {
  // The star table lives in the folded "For navigators" section, and a shut
  // <details> has no text to read; open it to read, then shut it again.
  await page.evaluate(() => { const f = document.getElementById('for-navigators'); if (f) f.open = true; });
  await page.waitForTimeout(400);
  const target = await page.evaluate(() => {
    // Star table rows read "Arcturusm0.0\n, magnitude 0.0\n29°\n270° W"
    // (the name and the magnitude chip are adjacent inline spans, hence no
    // space; the second line is the screen reader's words for the chip,
    // since 2026-10-21).
    const stars = [...document.body.innerText.matchAll(/([A-Z][a-z]+)m(-?\d+\.\d+)\s*\n(?:\s*, magnitude -?\d+\.\d+\s*\n)?\s*(-?\d+)°\s*\n\s*(\d+)°/g)]
      .map(x => ({ name: x[1], mag: +x[2], alt: +x[3], az: +x[4] }));
    const R = Math.PI / 180;
    const sep = (a, b) => Math.acos(Math.max(-1, Math.min(1,
      Math.sin(a.alt * R) * Math.sin(b.alt * R) +
      Math.cos(a.alt * R) * Math.cos(b.alt * R) * Math.cos((a.az - b.az) * R)))) / R;
    // Below 25° the horizon crowds the frame; above 70° azimuth gets twitchy
    // near the zenith and the horizon leaves the shot entirely.
    const cands = stars.filter(s => s.alt > 25 && s.alt < 70);
    if (!cands.length) return null;
    // Prefer a populated patch of sky over a lone bright star — a store shot
    // wants to show that the view is full of labelled things.
    cands.forEach(c => { c.near = stars.filter(s => s !== c && sep(c, s) < 22).length; });
    cands.sort((a, b) => (b.near - a.near) || (a.mag - b.mag));
    return cands[0];
  });
  await page.evaluate(() => { const f = document.getElementById('for-navigators'); if (f) f.open = false; });
  if (!target) throw new Error('no well-placed star found in the star table');
  const btn = page.getByRole('button', { name: 'Open Sky View' });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await page.waitForTimeout(900);
  await page.evaluate(([az, alt]) => {
    const e = new Event('deviceorientation');
    Object.assign(e, { alpha: (360 - az) % 360, beta: 90 + alt, gamma: 0, absolute: true });
    window.dispatchEvent(e);
  }, [target.az, target.alt - 12]);
  await page.waitForTimeout(800);
  if (!await page.evaluate(() => /Live —/.test(document.body.innerText)))
    throw new Error('Sky View did not enter live mode');
  console.log(`  sky view aimed near ${target.name} (alt ${target.alt}°, az ${target.az}°)`);
}

/* The painting at golden hour, for the shot that leads the set: twilight
   is the app's name. The Sun 3° below the horizon this evening, found with
   the app's own sunAltitude, so the sky's colours are the app's too and the
   time follows the season. */
function goldenHour() {
  const { extract } = require('../scripts/test/extract.js');
  const { sunAltitude } = extract(['D2R', 'R2D', 'rev', 'sin', 'cos', 'asin', 'atan2', 'acos', 'jd', 'gmst', 'sunRaDec', 'sunHcZn', 'sunAltitude']);
  const noon = Math.floor(Date.now() / 86400000) * 86400000 + (12 - UTC_OFFSET_H) * 3600000;
  for (let t = noon; t < noon + 12 * 3600000; t += 60000)
    if (sunAltitude(new Date(t), PLACE.lat, PLACE.lon) < -3) return new Date(t);
  throw new Error('the Sun never got 3° down this evening');
}

/* Sky View in use: Find picks a constellation and the guide turns you to it.
   The view is aimed with synthetic orientation events, as openSkyView does,
   until the guide says the constellation is in the ring, then turned a
   little so the whole figure is in frame and the guide says which way to
   go. Orion first, as everyone knows it; otherwise the first of a few
   well-known figures that Find offers tonight. */
async function openSkyViewFind(page) {
  const btn = page.getByRole('button', { name: 'Open Sky View' });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await page.waitForTimeout(900);
  const orient = (az, alt) => page.evaluate(([az, alt]) => {
    const e = new Event('deviceorientation');
    Object.assign(e, { alpha: ((360 - az) % 360 + 360) % 360, beta: 90 + alt, gamma: 0, absolute: true });
    window.dispatchEvent(e);
  }, [az, alt]);
  await orient(180, 30);
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Find/ }).click();
  await page.waitForTimeout(500);
  const list = await page.locator('[role=dialog]').innerText();
  const name = ['Orion', 'Scorpius', 'Cygnus', 'Ursa Major', 'Cassiopeia', 'Leo']
    .find(n => new RegExp('^' + n + '$', 'm').test(list));
  if (!name) throw new Error('none of the well-known constellations is in Find');
  await page.getByRole('button', { name: new RegExp('^' + name) }).first().click();
  await page.waitForTimeout(500);
  // "Orion is 31° up, in the east." gives the height; the east is ~90°.
  const words = await page.locator('[role=dialog]').innerText();
  const up = words.match(new RegExp(name + ' is (\\d+)° up'));
  const COMPASS = { north: 0, 'north-east': 45, east: 90, 'south-east': 135, south: 180, 'south-west': 225, west: 270, 'north-west': 315 };
  const dir = words.match(new RegExp(name + ' is \\d+° up, in the ([a-z-]+)'));
  let alt = up ? +up[1] : 30, az = dir && COMPASS[dir[1]] != null ? COMPASS[dir[1]] : 180;
  let ok = false;
  for (let i = 0; i < 24 && !ok; i++) {
    await orient(az, alt);
    await page.waitForTimeout(400);
    const g = await page.locator('[role=dialog]').innerText();
    if (/That’s .*in the ring/.test(g)) { ok = true; break; }
    const turn = g.match(/Turn (left|right) (\d+)°/), tilt = g.match(/tilt (up|down) (\d+)°/i);
    if (turn) az += (turn[1] === 'right' ? 1 : -1) * Math.max(1, Math.round(turn[2] / 2));
    if (tilt) alt += (tilt[1].toLowerCase() === 'up' ? 1 : -1) * Math.max(1, Math.round(tilt[2] / 2));
  }
  if (!ok) throw new Error('could not bring ' + name + ' into the ring');
  // The label point sits beside the figure; turning right brings the rest
  // of it into frame, and the guide then says how to get back.
  await orient(az + 12, alt + 2);
  await page.waitForTimeout(800);
  console.log(`  sky view: ${name}, aimed at az ${az + 12}°, alt ${alt + 2}°`);
}

/* The store shots: a few words over each screenshot, on the app's own night
   colours. The screen is drawn at the device's own size and scale, so the
   framed picture is exactly the size App Store Connect asks for. The
   screenshot itself is the app, untouched. */
async function frame(browser, rawPath, outPath, d, head, sub) {
  const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.dsr });
  const page = await ctx.newPage();
  // Any page of the local server, so the fonts load from the same origin.
  await page.goto(`${SERVER}/store-assets/feature-graphic.html`, { waitUntil: 'domcontentloaded' });
  const img = 'data:image/png;base64,' + fs.readFileSync(rawPath).toString('base64');
  const tall = d.h / d.w > 1.6;            // phone, or iPad
  const k = d.w / 100;                      // 1% of the width, in CSS px
  const shotW = (tall ? 84 : 78) * k, top = (tall ? 37 : 22) * k; // top: until measured below
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face{font-family:'Inter';font-weight:100 900;src:url(${SERVER}/fonts/inter-latin.woff2) format('woff2');}
    @font-face{font-family:'Cormorant Garamond';font-weight:400 700;src:url(${SERVER}/fonts/cormorant.woff2) format('woff2');}
    html,body{margin:0;width:${d.w}px;height:${d.h}px;overflow:hidden;}
    body{background:radial-gradient(${d.w * 1.4}px ${d.h * 0.6}px at 70% -8%, #1b2440 0%, #0a0e1e 48%, #04050d 100%);}
    .glow{position:absolute;inset:0;background:radial-gradient(${d.w}px ${d.w * 0.5}px at 18% 0%, rgba(210,160,77,.14), rgba(210,160,77,0) 70%);}
    .cap{position:absolute;left:0;right:0;top:${(tall ? 9 : 5) * k}px;text-align:center;padding:0 ${7 * k}px;}
    h1{margin:0;font-family:'Cormorant Garamond',serif;font-weight:600;color:#f1ede4;font-size:${(tall ? 9.4 : 5.8) * k}px;line-height:1.08;letter-spacing:.005em;}
    p{margin:${(tall ? 2.6 : 1.5) * k}px 0 0;font-family:'Inter',sans-serif;font-weight:450;color:#b9b2a5;font-size:${(tall ? 3.9 : 2.4) * k}px;line-height:1.35;}
    img{position:absolute;left:${(d.w - shotW) / 2}px;top:${top}px;width:${shotW}px;
      border-radius:${(tall ? 6 : 2.4) * k}px;border:1px solid rgba(234,231,224,.16);
      box-shadow:0 ${2 * k}px ${8 * k}px rgba(0,0,0,.55);}
  </style></head><body><div class="glow"></div>
    <div class="cap"><h1>${head}</h1><p>${sub}</p></div>
    <img src="${img}"></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  // The screenshot starts under the words, however many lines they took, and
  // is made smaller rather than cut off at the foot: Sky View's guide and
  // the tab bar are at the bottom.
  await page.evaluate(([k, maxW, ratio, H, tall]) => {
    const cap = document.querySelector('.cap').getBoundingClientRect();
    const top = cap.bottom + (tall ? 5 : 3.5) * k;
    const w = Math.min(maxW, (H - top - (tall ? 4 : 3) * k) / ratio);
    const img = document.querySelector('img');
    Object.assign(img.style, { top: top + 'px', width: w + 'px', left: (innerWidth - w) / 2 + 'px' });
  }, [k, shotW, d.h / d.w, d.h, tall]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: outPath });
  await ctx.close();
  console.log(outPath, 'framed');
}

// The store set, in upload order: each a tab (or Sky View), the moment, and
// the words over it. The first three are what a search result shows.
const SHOTS = [
  { name: 'golden-hour', tab: 'console', at: 'golden', head: 'Your sky, right now', sub: 'The twilight’s colours, the Moon and the planets, where you stand' },
  { name: 'sky-view', tab: 'stars', after: openSkyViewFind, head: 'Point your phone.<br>Name the stars.', sub: 'Find anything that’s up, and Twilyte turns you toward it' },
  { name: 'tonight', tab: 'console', head: 'When it’s truly dark', sub: 'Tonight’s dark hours, the Moon, and how dark your sky gets' },
  { name: 'ephemeris', tab: 'ephemeris', head: 'Every stage of twilight', sub: 'Civil, nautical and astronomical, for any date and place' },
  { name: 'whole-sky', tab: 'stars', head: 'The whole sky tonight', sub: 'Every bright star, planet and galaxy that’s up, as it is now' },
];

// generate-android.js takes its shots through the same capture (place,
// clock, forecast, as an app) and openSkyView, so only run the iOS set when
// this file is the entry point rather than a require().
module.exports = { capture, openSkyView, openSkyViewFind, frame };

if (require.main === module) (async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // Sandbox-local Chromium if present (this repo's dev environment); falls
  // back to Playwright's own managed browser install everywhere else.
  const sandboxChrome = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const launchOpts = fs.existsSync(sandboxChrome) ? { executablePath: sandboxChrome } : {};
  const browser = await chromium.launch(launchOpts);
  // Old sets, named by tab before the shots had words, would sit beside the
  // new ones and be uploaded by mistake.
  for (const f of fs.readdirSync(OUT)) if (/^(iphone|ipad)-.*\.png$/.test(f)) fs.unlinkSync(path.join(OUT, f));
  const RAW = fs.mkdtempSync(path.join(require('os').tmpdir(), 'twilyte-shots-'));
  const golden = goldenHour();
  const sets = [['iphone-6.9', IPHONE], ['iphone-6.5', IPHONE_65], ['ipad-13', IPAD], ['ipad-12.9', IPAD_129]];
  for (const [prefix, d] of sets) {
    for (const [i, sh] of SHOTS.entries()) {
      const file = `${prefix}-0${i + 1}-${sh.name}.png`;
      const raw = path.join(RAW, file);
      await capture(browser, sh.tab, raw, sh.after || null, d, sh.at === 'golden' ? golden : null);
      await frame(browser, raw, path.join(OUT, file), d, sh.head, sh.sub);
    }
  }
  if (process.argv.includes('--store-only')) { await browser.close(); console.log('done'); return; }
  // The PWA install-prompt screenshots at the repo root. Sizes must match
  // manifest.json's "screenshots" entries: 780x1688 (narrow) and 1280x800
  // (wide). They are in sw.js's precache list, so bump CACHE when they change.
  const ROOT = path.join(__dirname, '..');
  await capture(browser, 'console', path.join(ROOT, 'screenshot-narrow.png'), null, { w: 390, h: 844, dsr: 2, mobile: true });
  await capture(browser, 'console', path.join(ROOT, 'screenshot-wide.png'), null, { w: 1280, h: 800, dsr: 1, mobile: false });
  await browser.close();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
