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
<link rel="icon" type="image/png" sizes="512x512" href="../icon-512.png" />
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'self'; form-action 'none'; object-src 'none'; upgrade-insecure-requests" />
<style>
  @font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url(../fonts/inter-var.woff2) format('woff2');}
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
  <a class="brand" href="/" aria-label="Twilight home">
    <svg width="15" height="15" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 0l1.7 5.3L14 7l-5.3 1.7L7 14 5.3 8.7 0 7l5.3-1.7z" fill="#d2a04d"/></svg>
    Twilight
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
    Part of <a href="/">Twilight</a> — a live sky dashboard and twilight ephemeris for stargazing and celestial navigation. See twilight times, sun/moon/planet positions, and a clear-and-dark observing score for any location. <a href="/twilight-times/">More cities</a> · <a href="/privacy.html">Privacy</a>
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
<title>Twilight Times by City — Twilight</title>
<meta name="description" content="Today's civil, nautical, and astronomical twilight times for cities around the world." />
<link rel="canonical" href="https://twilyte.info/twilight-times/" />
<link rel="icon" type="image/png" sizes="512x512" href="../icon-512.png" />
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'self'; form-action 'none'; object-src 'none'; upgrade-insecure-requests" />
<style>
  @font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url(../fonts/inter-var.woff2) format('woff2');}
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
  <a class="brand" href="/" aria-label="Twilight home">
    <svg width="15" height="15" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 0l1.7 5.3L14 7l-5.3 1.7L7 14 5.3 8.7 0 7l5.3-1.7z" fill="#d2a04d"/></svg>
    Twilight
  </a>
  <h1>Twilight times by city</h1>
  <p class="lede">Today's civil, nautical, and astronomical dawn &amp; dusk for a curated set of cities. Don't see yours? Open the <a href="/">full app</a> for any location.</p>
${sections}
  <footer>
    Part of <a href="/">Twilight</a> — a live sky dashboard and twilight ephemeris for stargazing and celestial navigation. <a href="/privacy.html">Privacy</a>
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
