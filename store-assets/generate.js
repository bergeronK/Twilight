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
 * Usage: node store-assets/generate.js [serverUrl]
 *   serverUrl defaults to http://localhost:8137
 */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const SERVER = process.argv[2] || 'http://localhost:8137';
const OUT = path.join(__dirname, 'ios');

// Apple App Store Connect 6.9" iPhone requirement (per developer.apple.com/
// help/app-store-connect/reference/app-information/screenshot-specifications):
// 1260 x 2736 px portrait, required for any app that runs on iPhone. A
// 420x912 CSS viewport at 3x device scale factor renders at exactly that
// pixel size.
const W = 420, H = 912, DSR = 3;

// Synthetic Open-Meteo response: clear for the next 48h (so tonight's card
// and the week planner's first rows agree), then a varied pattern so the
// planner shows a mix of clear/cloudy/rain nights — a more representative
// store screenshot than an all-clear week.
function mkForecast() {
  const off = -4 * 3600; // EDT
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
  return { utc_offset_seconds: off, timezone: "America/New_York", hourly: { time, cloud_cover: cc, cloud_cover_high: hi, precipitation_probability: pp } };
}

// Fixed instant: tonight at ~22:15 local, so the mock forecast (anchored to
// the real current hour) lines up with what the app's clock shows.
const tonight = new Date(Math.floor(Date.now() / 86400000) * 86400000 + 26.25 * 3600000);

async function capture(browser, tab, outPath, after) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSR, isMobile: true, timezoneId: 'America/New_York' });
  await ctx.grantPermissions(['geolocation']);
  await ctx.setGeolocation({ latitude: 44.2601, longitude: -72.5806 }); // Stowe, VT — moderately dark sky, shows the star field well
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('tw_loc', JSON.stringify({ lat: 44.2601, lon: -72.5806, name: "Stowe, VT", tz: "America/New_York" }));
    localStorage.setItem('tw_bortle_mode', 'auto');
    localStorage.setItem('tw_hint', '1'); // dismiss the onboarding banner for a cleaner shot
  });
  await page.route('**/api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mkForecast()) }));
  await page.clock.install({ time: tonight });
  // Do NOT swallow navigation failures. These images get committed, and a
  // silently-captured "This site can't be reached" page overwrites a good
  // asset with a broken one that looks fine until someone opens it.
  const resp = await page.goto(`${SERVER}/index.html?tab=${tab}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  if (!resp || !resp.ok()) throw new Error(`${SERVER} returned ${resp ? resp.status() : 'no response'} — is the local server running?`);
  await page.waitForTimeout(2600);
  // Belt and braces: confirm the app actually mounted, so a CSP break or a
  // JS error can't be captured as a blank/placeholder screenshot either.
  const mounted = await page.evaluate(() => !/Starting Twilight/.test(document.body.innerText) && document.body.innerText.trim().length > 200);
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
  const target = await page.evaluate(() => {
    // Star table rows read "Arcturusm0.0\n29°\n270° W" (the name and the
    // magnitude chip are adjacent inline spans, hence no space).
    const stars = [...document.body.innerText.matchAll(/([A-Z][a-z]+)m(-?\d+\.\d+)\s*\n\s*(-?\d+)°\s*\n\s*(\d+)°/g)]
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

// generate-android.js reuses openSkyView, so only run the iOS set when this
// file is the entry point rather than a require().
module.exports = { openSkyView };

if (require.main === module) (async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // Sandbox-local Chromium if present (this repo's dev environment); falls
  // back to Playwright's own managed browser install everywhere else.
  const sandboxChrome = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const launchOpts = fs.existsSync(sandboxChrome) ? { executablePath: sandboxChrome } : {};
  const browser = await chromium.launch(launchOpts);
  await capture(browser, 'console', path.join(OUT, 'iphone-6.9-01-console.png'));
  await capture(browser, 'stars', path.join(OUT, 'iphone-6.9-02-stars.png'));
  await capture(browser, 'ephemeris', path.join(OUT, 'iphone-6.9-03-ephemeris.png'));
  await capture(browser, 'stars', path.join(OUT, 'iphone-6.9-04-skyview.png'), openSkyView);
  await browser.close();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
