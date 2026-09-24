#!/usr/bin/env node
'use strict';
/*
 * Generates static SEO landing pages under twilight-times/ — one per city,
 * e.g. twilight-times/new-york-ny.html — plus an index hub page, and
 * appends them all to sitemap.xml.
 *
 * These pages carry no inline script (CSP: script-src 'self' only) and load
 * the shared twilight-times/twilight-calc.js to compute today's civil/
 * nautical/astronomical dawn & dusk client-side at view time, so the times
 * are always current — no scheduled rebuild needed to avoid stale content.
 *
 * Usage: node scripts/generate-city-pages.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'twilight-times');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const TODAY = new Date().toISOString().slice(0, 10);

// Curated, not exhaustive: a mix of major US metros (search volume) and
// well-known dark-sky/astro-tourism towns (topical relevance). Add more
// cities here and re-run to extend the set — no other code changes needed.
const CITIES = [
  { name: "New York", region: "NY", country: "USA", lat: 40.7128, lon: -74.0060, tz: "America/New_York" },
  { name: "Los Angeles", region: "CA", country: "USA", lat: 34.0522, lon: -118.2437, tz: "America/Los_Angeles" },
  { name: "Chicago", region: "IL", country: "USA", lat: 41.8781, lon: -87.6298, tz: "America/Chicago" },
  { name: "Houston", region: "TX", country: "USA", lat: 29.7604, lon: -95.3698, tz: "America/Chicago" },
  { name: "Phoenix", region: "AZ", country: "USA", lat: 33.4484, lon: -112.0740, tz: "America/Phoenix" },
  { name: "Philadelphia", region: "PA", country: "USA", lat: 39.9526, lon: -75.1652, tz: "America/New_York" },
  { name: "San Antonio", region: "TX", country: "USA", lat: 29.4241, lon: -98.4936, tz: "America/Chicago" },
  { name: "San Diego", region: "CA", country: "USA", lat: 32.7157, lon: -117.1611, tz: "America/Los_Angeles" },
  { name: "Dallas", region: "TX", country: "USA", lat: 32.7767, lon: -96.7970, tz: "America/Chicago" },
  { name: "Austin", region: "TX", country: "USA", lat: 30.2672, lon: -97.7431, tz: "America/Chicago" },
  { name: "San Francisco", region: "CA", country: "USA", lat: 37.7749, lon: -122.4194, tz: "America/Los_Angeles" },
  { name: "Seattle", region: "WA", country: "USA", lat: 47.6062, lon: -122.3321, tz: "America/Los_Angeles" },
  { name: "Denver", region: "CO", country: "USA", lat: 39.7392, lon: -104.9903, tz: "America/Denver" },
  { name: "Boston", region: "MA", country: "USA", lat: 42.3601, lon: -71.0589, tz: "America/New_York" },
  { name: "Portland", region: "OR", country: "USA", lat: 45.5152, lon: -122.6784, tz: "America/Los_Angeles" },
  { name: "Miami", region: "FL", country: "USA", lat: 25.7617, lon: -80.1918, tz: "America/New_York" },
  { name: "Atlanta", region: "GA", country: "USA", lat: 33.7490, lon: -84.3880, tz: "America/New_York" },
  { name: "Minneapolis", region: "MN", country: "USA", lat: 44.9778, lon: -93.2650, tz: "America/Chicago" },
  { name: "Las Vegas", region: "NV", country: "USA", lat: 36.1699, lon: -115.1398, tz: "America/Los_Angeles" },
  { name: "Nashville", region: "TN", country: "USA", lat: 36.1627, lon: -86.7816, tz: "America/Chicago" },
  { name: "Salt Lake City", region: "UT", country: "USA", lat: 40.7608, lon: -111.8910, tz: "America/Denver" },
  { name: "Sedona", region: "AZ", country: "USA", lat: 34.8697, lon: -111.7610, tz: "America/Phoenix" },
  { name: "Flagstaff", region: "AZ", country: "USA", lat: 35.1983, lon: -111.6513, tz: "America/Phoenix" },
  { name: "Moab", region: "UT", country: "USA", lat: 38.5733, lon: -109.5498, tz: "America/Denver" },
  { name: "Asheville", region: "NC", country: "USA", lat: 35.5951, lon: -82.5515, tz: "America/New_York" },
  { name: "Stowe", region: "VT", country: "USA", lat: 44.4654, lon: -72.6874, tz: "America/New_York" },
  { name: "London", region: "", country: "UK", lat: 51.5072, lon: -0.1276, tz: "Europe/London" },
  { name: "Sydney", region: "", country: "Australia", lat: -33.8688, lon: 151.2093, tz: "Australia/Sydney" },
  { name: "Toronto", region: "ON", country: "Canada", lat: 43.6532, lon: -79.3832, tz: "America/Toronto" },
  { name: "Reykjavik", region: "", country: "Iceland", lat: 64.1466, lon: -21.9426, tz: "Atlantic/Reykjavik" }
];

function slugify(city) {
  const base = city.region ? `${city.name}-${city.region}` : city.name;
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function place(city) {
  return city.region ? `${city.name}, ${city.region}` : `${city.name}, ${city.country}`;
}

function page(city, slug) {
  const p = place(city);
  const title = `Twilight Times in ${p} — Civil, Nautical & Astronomical Dawn/Dusk`;
  const desc = `Today's civil, nautical, and astronomical twilight times for ${p}: when dawn breaks, when dusk falls, and when the sky is truly dark enough for stargazing.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${desc}" />
<link rel="canonical" href="https://twilyte.info/twilight-times/${slug}.html" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${desc}" />
<meta property="og:url" content="https://twilyte.info/twilight-times/${slug}.html" />
<link rel="icon" type="image/png" sizes="64x64" href="../favicon-64.png" />
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'self'; form-action 'none'; object-src 'none'; upgrade-insecure-requests" />
<style>
  @font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url(../fonts/inter-latin.woff2) format('woff2');unicode-range:U+0000-017F, U+0192, U+0218-021B, U+02B9-02DD, U+0300-0308, U+030A-030C, U+0327-0328, U+03C0, U+2000-206F, U+2070-2079, U+2080-2089, U+20AC, U+2100-2122, U+2190-21BB, U+2212, U+2215, U+2248, U+2260-2265, U+25A0-25FF, U+2600-27BF, U+FB00-FB02, U+FEFF, U+FF0B, U+FFFD;}
  @font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url(../fonts/inter-var.woff2) format('woff2');unicode-range:U+0180-0191, U+0193-01C3, U+01C5-0217, U+021C-0254, U+0256-027B, U+027E-0284, U+0286-0290, U+0292-02A4, U+02A6-02B8, U+02DE-02FF, U+0309, U+030F, U+0313, U+0315, U+031B, U+0323, U+0326, U+032C, U+0337-0338, U+0342-0343, U+0346-036F, U+0374-0376, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03BF, U+03C1-03D7, U+03DC-03DD, U+03F0-03F6, U+03F9-03FA, U+03FC-0479, U+0480-049D, U+04A0-04FF, U+052F, U+0E3F, U+1D00, U+1D0D, U+1D1B, U+1D43, U+1D47-1D49, U+1D4D, U+1D4F-1D50, U+1D52, U+1D56-1D58, U+1D5B, U+1D62-1D65, U+1D9C, U+1DA0, U+1DBB, U+1DBF-1DF5, U+1DFC-1E9B, U+1E9D-1F15, U+1F18-1F1D, U+1F20-1F45, U+1F48-1F4D, U+1F50-1F57, U+1F59, U+1F5B, U+1F5D, U+1F5F-1F7D, U+1F80-1FB4, U+1FB6-1FC4, U+1FC6-1FD3, U+1FD6-1FDB, U+1FDD-1FEF, U+1FF2-1FF4, U+1FF6-1FFE, U+207A-207F, U+208A-208E, U+2090-209C, U+20A0-20AB, U+20AD-20AF, U+20B1-20B5, U+20B8-20BA, U+20BC-20C0, U+20DB-20DE, U+20E8, U+20F0, U+2126, U+212A-212B, U+212E, U+2132, U+213B, U+214D, U+2150-217F, U+2183-2186, U+2189, U+21D0, U+21D2, U+21D4, U+21DE-21DF, U+21E4-21E5, U+21E7, U+21EA, U+2202, U+2205-2206, U+220F, U+2211, U+221A, U+221E, U+222B, U+2236, U+2295-2298, U+2303-2305, U+2318, U+2325-2327, U+232B, U+2380, U+2387, U+238B, U+23CE-23CF, U+2423, U+2460-2468, U+24B6-24CF, U+24EA, U+27EF, U+27F5-27FA, U+2913, U+2A38, U+2B06, U+2B12-2B13, U+2B1C, U+2B24, U+2C7C, U+2C7F, U+2DFF, U+2E18, U+A69F, U+A7FF, U+A92E, U+E000, U+E002-E05E, U+E06A-E0BD, U+E0C8-E0CC, U+E0DC-E0E6, U+E0F3-E0F5, U+E106, U+E109-E10A, U+E10C-E10F, U+E111-E113, U+E117-E118, U+E121-E122, U+E124, U+E12A-E15E, U+E163, U+E1C3, U+E1D2-E1DF, U+E1E1-E2DC, U+EE01-EE07, U+EE09-EE0A, U+EE0C-EE12, U+EE14, U+EE17, U+EE1D-EE45, U+EE47-EE84, U+EE87-EED6, U+EED8-EEE1, U+F6C3, U+1F12F-1F149, U+1F16A-1F16B, U+1F850, U+1F852;}
  @font-face{font-family:'Cormorant Garamond';font-style:normal;font-weight:400 700;font-display:swap;src:url(../fonts/cormorant.woff2) format('woff2');}
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{
    min-height:100vh;
    background:radial-gradient(1200px 760px at 75% -10%, #1b2440 0%, #0a0e1e 45%, #04050d 100%);
    color:#eae7e0;
    font-family:'Inter',system-ui,sans-serif;
  }
  a{color:#e5ba6e;}
  main{max-width:640px;margin:0 auto;padding:clamp(20px,5vw,56px) 20px 60px;}
  .brand{display:flex;align-items:center;gap:10px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:600;text-decoration:none;color:#eae7e0;margin-bottom:28px;}
  .brand svg{display:block;}
  .kicker{font-size:10.5px;font-weight:600;letter-spacing:.07em;color:#7d766a;text-transform:uppercase;}
  h1{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:clamp(26px,5.4vw,40px);line-height:1.05;margin:8px 0 6px;letter-spacing:-.01em;}
  .date{font-size:14px;color:#a09a8f;margin-bottom:22px;}
  p.lede{font-size:15px;line-height:1.6;color:#c9c4b8;margin:0 0 28px;}
  .times{border-top:1px solid #211f1b;margin-bottom:28px;}
  .row{display:flex;justify-content:space-between;align-items:baseline;padding:12px 0;border-bottom:1px solid #211f1b;font-size:14.5px;}
  .row .label{color:#a09a8f;}
  .row .val{font-variant-numeric:tabular-nums;color:#eae7e0;font-weight:500;}
  .row.hl .val{color:#e5ba6e;}
  .cta{display:inline-block;margin:6px 0 34px;padding:11px 20px;border-radius:10px;border:1px solid rgba(210,160,77,.4);background:rgba(210,160,77,.08);color:#e5ba6e;text-decoration:none;font-size:14px;font-weight:550;}
  .explain{font-size:13px;line-height:1.6;color:#a09a8f;margin-bottom:10px;}
  footer{font-size:11.5px;color:#7d766a;border-top:1px solid #211f1b;padding-top:18px;line-height:1.6;}
  footer a{color:#a09a8f;}
</style>
</head>
<body>
<main>
  <a class="brand" href="/" aria-label="Twilyte home">
    <svg width="15" height="15" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 0l1.7 5.3L14 7l-5.3 1.7L7 14 5.3 8.7 0 7l5.3-1.7z" fill="#d2a04d"/></svg>
    Twilyte
  </a>
  <div class="kicker">Twilight times</div>
  <h1>${p}</h1>
  <div class="date" data-tw-field="date">Loading today's date&hellip;</div>
  <p class="lede">Civil, nautical, and astronomical twilight each mark a different stage of darkness: civil twilight is still light enough to work outside without lamps; nautical twilight is when the sea horizon fades but the brightest stars are already out; astronomical twilight ends when the sky is fully dark and faint deep-sky objects become visible.</p>

  <div id="tw-times" class="times" data-lat="${city.lat}" data-lon="${city.lon}" data-tz="${city.tz}">
    <div class="row"><span class="label">Astronomical dawn</span><span class="val" data-tw-field="astroDawn">&hellip;</span></div>
    <div class="row"><span class="label">Nautical dawn</span><span class="val" data-tw-field="nautDawn">&hellip;</span></div>
    <div class="row"><span class="label">Civil dawn</span><span class="val" data-tw-field="civilDawn">&hellip;</span></div>
    <div class="row hl"><span class="label">Sunrise</span><span class="val" data-tw-field="sunrise">&hellip;</span></div>
    <div class="row hl"><span class="label">Sunset</span><span class="val" data-tw-field="sunset">&hellip;</span></div>
    <div class="row"><span class="label">Civil dusk</span><span class="val" data-tw-field="civilDusk">&hellip;</span></div>
    <div class="row"><span class="label">Nautical dusk</span><span class="val" data-tw-field="nautDusk">&hellip;</span></div>
    <div class="row"><span class="label">Astronomical dusk</span><span class="val" data-tw-field="astroDusk">&hellip;</span></div>
  </div>

  <a class="cta" href="/?tab=ephemeris&amp;lat=${city.lat}&amp;lon=${city.lon}">Open full ephemeris for ${p} →</a>

  <p class="explain">Times shown are computed live for ${p} (${city.lat.toFixed(2)}°, ${city.lon.toFixed(2)}°) using the Sun's position for today's date, and use your local time zone (${city.tz.replace('_', ' ')}) automatically, including daylight saving where applicable.</p>

  <footer>
    Part of <a href="/">Twilyte</a> — a live sky dashboard and twilight ephemeris for stargazing and celestial navigation. See twilight times, sun/moon/planet positions, and a clear-and-dark observing score for any location. <a href="/twilight-times/">More cities</a> · <a href="/privacy.html">Privacy</a>
  </footer>
</main>
<script src="twilight-calc.js" defer></script>
</body>
</html>
`;
}

function hubPage(cities) {
  const byCountry = {};
  for (const c of cities) {
    const key = c.country;
    (byCountry[key] = byCountry[key] || []).push(c);
  }
  const sections = Object.keys(byCountry).sort().map(country => {
    const items = byCountry[country]
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(c => `      <li><a href="${slugify(c)}.html">${place(c)}</a></li>`)
      .join('\n');
    return `    <h2>${country}</h2>\n    <ul>\n${items}\n    </ul>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Twilight Times by City — Twilyte</title>
<meta name="description" content="Today's civil, nautical, and astronomical twilight times for cities around the world." />
<link rel="canonical" href="https://twilyte.info/twilight-times/" />
<link rel="icon" type="image/png" sizes="64x64" href="../favicon-64.png" />
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'self'; form-action 'none'; object-src 'none'; upgrade-insecure-requests" />
<style>
  @font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url(../fonts/inter-latin.woff2) format('woff2');unicode-range:U+0000-017F, U+0192, U+0218-021B, U+02B9-02DD, U+0300-0308, U+030A-030C, U+0327-0328, U+03C0, U+2000-206F, U+2070-2079, U+2080-2089, U+20AC, U+2100-2122, U+2190-21BB, U+2212, U+2215, U+2248, U+2260-2265, U+25A0-25FF, U+2600-27BF, U+FB00-FB02, U+FEFF, U+FF0B, U+FFFD;}
  @font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url(../fonts/inter-var.woff2) format('woff2');unicode-range:U+0180-0191, U+0193-01C3, U+01C5-0217, U+021C-0254, U+0256-027B, U+027E-0284, U+0286-0290, U+0292-02A4, U+02A6-02B8, U+02DE-02FF, U+0309, U+030F, U+0313, U+0315, U+031B, U+0323, U+0326, U+032C, U+0337-0338, U+0342-0343, U+0346-036F, U+0374-0376, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03BF, U+03C1-03D7, U+03DC-03DD, U+03F0-03F6, U+03F9-03FA, U+03FC-0479, U+0480-049D, U+04A0-04FF, U+052F, U+0E3F, U+1D00, U+1D0D, U+1D1B, U+1D43, U+1D47-1D49, U+1D4D, U+1D4F-1D50, U+1D52, U+1D56-1D58, U+1D5B, U+1D62-1D65, U+1D9C, U+1DA0, U+1DBB, U+1DBF-1DF5, U+1DFC-1E9B, U+1E9D-1F15, U+1F18-1F1D, U+1F20-1F45, U+1F48-1F4D, U+1F50-1F57, U+1F59, U+1F5B, U+1F5D, U+1F5F-1F7D, U+1F80-1FB4, U+1FB6-1FC4, U+1FC6-1FD3, U+1FD6-1FDB, U+1FDD-1FEF, U+1FF2-1FF4, U+1FF6-1FFE, U+207A-207F, U+208A-208E, U+2090-209C, U+20A0-20AB, U+20AD-20AF, U+20B1-20B5, U+20B8-20BA, U+20BC-20C0, U+20DB-20DE, U+20E8, U+20F0, U+2126, U+212A-212B, U+212E, U+2132, U+213B, U+214D, U+2150-217F, U+2183-2186, U+2189, U+21D0, U+21D2, U+21D4, U+21DE-21DF, U+21E4-21E5, U+21E7, U+21EA, U+2202, U+2205-2206, U+220F, U+2211, U+221A, U+221E, U+222B, U+2236, U+2295-2298, U+2303-2305, U+2318, U+2325-2327, U+232B, U+2380, U+2387, U+238B, U+23CE-23CF, U+2423, U+2460-2468, U+24B6-24CF, U+24EA, U+27EF, U+27F5-27FA, U+2913, U+2A38, U+2B06, U+2B12-2B13, U+2B1C, U+2B24, U+2C7C, U+2C7F, U+2DFF, U+2E18, U+A69F, U+A7FF, U+A92E, U+E000, U+E002-E05E, U+E06A-E0BD, U+E0C8-E0CC, U+E0DC-E0E6, U+E0F3-E0F5, U+E106, U+E109-E10A, U+E10C-E10F, U+E111-E113, U+E117-E118, U+E121-E122, U+E124, U+E12A-E15E, U+E163, U+E1C3, U+E1D2-E1DF, U+E1E1-E2DC, U+EE01-EE07, U+EE09-EE0A, U+EE0C-EE12, U+EE14, U+EE17, U+EE1D-EE45, U+EE47-EE84, U+EE87-EED6, U+EED8-EEE1, U+F6C3, U+1F12F-1F149, U+1F16A-1F16B, U+1F850, U+1F852;}
  @font-face{font-family:'Cormorant Garamond';font-style:normal;font-weight:400 700;font-display:swap;src:url(../fonts/cormorant.woff2) format('woff2');}
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{min-height:100vh;background:radial-gradient(1200px 760px at 75% -10%, #1b2440 0%, #0a0e1e 45%, #04050d 100%);color:#eae7e0;font-family:'Inter',system-ui,sans-serif;}
  a{color:#e5ba6e;}
  main{max-width:640px;margin:0 auto;padding:clamp(20px,5vw,56px) 20px 60px;}
  .brand{display:flex;align-items:center;gap:10px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:600;text-decoration:none;color:#eae7e0;margin-bottom:28px;}
  .brand svg{display:block;}
  h1{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:clamp(26px,5.4vw,40px);line-height:1.05;margin:0 0 8px;letter-spacing:-.01em;}
  p.lede{font-size:15px;line-height:1.6;color:#c9c4b8;margin:0 0 28px;}
  h2{font-family:'Inter',system-ui,sans-serif;font-size:12px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:#7d766a;border-top:1px solid #211f1b;padding-top:18px;margin:26px 0 8px;}
  ul{list-style:none;margin:0 0 4px;padding:0;columns:2;column-gap:20px;}
  li{padding:5px 0;font-size:14.5px;break-inside:avoid;}
  li a{color:#eae7e0;text-decoration:none;}
  li a:hover{color:#e5ba6e;}
  footer{font-size:11.5px;color:#7d766a;border-top:1px solid #211f1b;padding-top:18px;margin-top:26px;line-height:1.6;}
  footer a{color:#a09a8f;}
</style>
</head>
<body>
<main>
  <a class="brand" href="/" aria-label="Twilyte home">
    <svg width="15" height="15" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 0l1.7 5.3L14 7l-5.3 1.7L7 14 5.3 8.7 0 7l5.3-1.7z" fill="#d2a04d"/></svg>
    Twilyte
  </a>
  <h1>Twilight times by city</h1>
  <p class="lede">Today's civil, nautical, and astronomical dawn &amp; dusk for a curated set of cities. Don't see yours? Open the <a href="/">full app</a> for any location.</p>
${sections}
  <footer>
    Part of <a href="/">Twilyte</a> — a live sky dashboard and twilight ephemeris for stargazing and celestial navigation. <a href="/privacy.html">Privacy</a>
  </footer>
</main>
</body>
</html>
`;
}

function updateSitemap(cities) {
  const existing = fs.readFileSync(SITEMAP, 'utf8');
  const urls = [];
  urls.push(`  <url>\n    <loc>https://twilyte.info/twilight-times/</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.5</priority>\n  </url>`);
  for (const c of cities) {
    const slug = slugify(c);
    urls.push(`  <url>\n    <loc>https://twilyte.info/twilight-times/${slug}.html</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.4</priority>\n  </url>`);
  }
  // Idempotent: drop any previously-generated twilight-times entries before re-adding.
  const stripped = existing.replace(/\n\s*<url>\s*<loc>https:\/\/twilyte\.info\/twilight-times\/[^<]*<\/loc>[\s\S]*?<\/url>/g, '');
  const updated = stripped.replace('</urlset>', urls.join('\n') + '\n</urlset>');
  fs.writeFileSync(SITEMAP, updated);
  console.log(`sitemap.xml: ${cities.length + 1} twilight-times URLs`);
}

(function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const slugs = new Set();
  for (const city of CITIES) {
    const slug = slugify(city);
    if (slugs.has(slug)) throw new Error(`duplicate slug: ${slug}`);
    slugs.add(slug);
    fs.writeFileSync(path.join(OUT_DIR, `${slug}.html`), page(city, slug));
  }
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), hubPage(CITIES));
  updateSitemap(CITIES);
  console.log(`wrote ${CITIES.length} city pages + index.html to ${OUT_DIR}`);
})();
