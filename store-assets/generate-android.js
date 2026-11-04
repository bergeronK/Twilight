#!/usr/bin/env node
'use strict';
/*
 * Regenerates Google Play Store assets into store-assets/android/:
 *   - feature-graphic.png   1024 x 500  (Play Store listing header art)
 *   - phone-01..04.png      1080 x 1920 (Console / Stars / Ephemeris / Sky View)
 *
 * The phone shots go through generate.js's own capture, so they are taken
 * the way the App Store's are: the Grand Canyon, tonight at 22:15 with a
 * clear forecast, and the page loaded as the Android app (app: 'android',
 * a Capacitor bridge with no plugins), with none of the website's "PRO",
 * "free preview", Share link or visit count (2026-11-04; until then they
 * showed the website, at Stowe, VT).
 *
 * Requires: a local server for the repo root (e.g.
 * `python3 -m http.server 8137` from the repo root) and Playwright.
 *
 * Usage: node store-assets/generate-android.js [serverUrl]
 *   serverUrl defaults to http://localhost:8137
 */
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const { capture, openSkyView } = require('./generate.js');

const OUT = path.join(__dirname, 'android');

// Google Play has no fixed phone-screenshot size, only bounds (320-3840 px a
// side, the long side at most twice the short). 1080 x 1920 (9:16), at
// least 1080 px wide, is what Play asks for a listing to be eligible for
// its recommendations; a 360 x 640 CSS viewport at 3x renders exactly that.
const PHONE = { w: 360, h: 640, dsr: 3, mobile: true, app: 'android' };

async function captureFeatureGraphic(browser, outPath) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`file://${path.join(__dirname, 'feature-graphic.html')}`, { waitUntil: 'load' });
  await page.waitForTimeout(150);
  await page.screenshot({ path: outPath });
  await ctx.close();
  console.log(outPath, 'captured');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const sandboxChrome = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const launchOpts = fs.existsSync(sandboxChrome) ? { executablePath: sandboxChrome } : {};
  const browser = await chromium.launch(launchOpts);
  await captureFeatureGraphic(browser, path.join(OUT, 'feature-graphic.png'));
  await capture(browser, 'console', path.join(OUT, 'phone-01-console.png'), null, PHONE);
  await capture(browser, 'stars', path.join(OUT, 'phone-02-stars.png'), null, PHONE);
  await capture(browser, 'ephemeris', path.join(OUT, 'phone-03-ephemeris.png'), null, PHONE);
  await capture(browser, 'stars', path.join(OUT, 'phone-04-skyview.png'), openSkyView, PHONE);
  await browser.close();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
