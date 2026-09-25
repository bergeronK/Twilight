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
  { name: "Reykjavik", region: "", country: "Iceland", lat: 64.1466, lon: -21.9426, tz: "Atlantic/Reykjavik" },
  // Added 2026-09-25: more metros and dark-sky towns across the US, and the
  // world's big cities across every latitude band and time zone.
  { name: "Washington", region: "DC", country: "USA", lat: 38.9072, lon: -77.0369, tz: "America/New_York" },
  { name: "Baltimore", region: "MD", country: "USA", lat: 39.2904, lon: -76.6122, tz: "America/New_York" },
  { name: "Pittsburgh", region: "PA", country: "USA", lat: 40.4406, lon: -79.9959, tz: "America/New_York" },
  { name: "Coudersport", region: "PA", country: "USA", lat: 41.7748, lon: -78.0206, tz: "America/New_York" },
  { name: "Hartford", region: "CT", country: "USA", lat: 41.7658, lon: -72.6734, tz: "America/New_York" },
  { name: "Providence", region: "RI", country: "USA", lat: 41.8240, lon: -71.4128, tz: "America/New_York" },
  { name: "Northampton", region: "MA", country: "USA", lat: 42.3251, lon: -72.6412, tz: "America/New_York" },
  { name: "Burlington", region: "VT", country: "USA", lat: 44.4759, lon: -73.2121, tz: "America/New_York" },
  { name: "Portland", region: "ME", country: "USA", lat: 43.6591, lon: -70.2568, tz: "America/New_York" },
  { name: "Bar Harbor", region: "ME", country: "USA", lat: 44.3876, lon: -68.2039, tz: "America/New_York" },
  { name: "Richmond", region: "VA", country: "USA", lat: 37.5407, lon: -77.4360, tz: "America/New_York" },
  { name: "Raleigh", region: "NC", country: "USA", lat: 35.7796, lon: -78.6382, tz: "America/New_York" },
  { name: "Charlotte", region: "NC", country: "USA", lat: 35.2271, lon: -80.8431, tz: "America/New_York" },
  { name: "Charleston", region: "SC", country: "USA", lat: 32.7765, lon: -79.9311, tz: "America/New_York" },
  { name: "Savannah", region: "GA", country: "USA", lat: 32.0809, lon: -81.0912, tz: "America/New_York" },
  { name: "Jacksonville", region: "FL", country: "USA", lat: 30.3322, lon: -81.6557, tz: "America/New_York" },
  { name: "Orlando", region: "FL", country: "USA", lat: 28.5384, lon: -81.3789, tz: "America/New_York" },
  { name: "Tampa", region: "FL", country: "USA", lat: 27.9506, lon: -82.4572, tz: "America/New_York" },
  { name: "Key West", region: "FL", country: "USA", lat: 24.5551, lon: -81.7800, tz: "America/New_York" },
  { name: "Detroit", region: "MI", country: "USA", lat: 42.3314, lon: -83.0458, tz: "America/Detroit" },
  { name: "Cleveland", region: "OH", country: "USA", lat: 41.4993, lon: -81.6944, tz: "America/New_York" },
  { name: "Columbus", region: "OH", country: "USA", lat: 39.9612, lon: -82.9988, tz: "America/New_York" },
  { name: "Indianapolis", region: "IN", country: "USA", lat: 39.7684, lon: -86.1581, tz: "America/Indiana/Indianapolis" },
  { name: "Milwaukee", region: "WI", country: "USA", lat: 43.0389, lon: -87.9065, tz: "America/Chicago" },
  { name: "Madison", region: "WI", country: "USA", lat: 43.0731, lon: -89.4012, tz: "America/Chicago" },
  { name: "St. Louis", region: "MO", country: "USA", lat: 38.6270, lon: -90.1994, tz: "America/Chicago" },
  { name: "Kansas City", region: "MO", country: "USA", lat: 39.0997, lon: -94.5786, tz: "America/Chicago" },
  { name: "Omaha", region: "NE", country: "USA", lat: 41.2565, lon: -95.9345, tz: "America/Chicago" },
  { name: "Oklahoma City", region: "OK", country: "USA", lat: 35.4676, lon: -97.5164, tz: "America/Chicago" },
  { name: "New Orleans", region: "LA", country: "USA", lat: 29.9511, lon: -90.0715, tz: "America/Chicago" },
  { name: "Marfa", region: "TX", country: "USA", lat: 30.3094, lon: -104.0206, tz: "America/Chicago" },
  { name: "Albuquerque", region: "NM", country: "USA", lat: 35.0844, lon: -106.6504, tz: "America/Denver" },
  { name: "Santa Fe", region: "NM", country: "USA", lat: 35.6870, lon: -105.9378, tz: "America/Denver" },
  { name: "Tucson", region: "AZ", country: "USA", lat: 32.2226, lon: -110.9747, tz: "America/Phoenix" },
  { name: "Bozeman", region: "MT", country: "USA", lat: 45.6770, lon: -111.0429, tz: "America/Denver" },
  { name: "Jackson", region: "WY", country: "USA", lat: 43.4799, lon: -110.7624, tz: "America/Denver" },
  { name: "Boise", region: "ID", country: "USA", lat: 43.6150, lon: -116.2023, tz: "America/Boise" },
  { name: "Spokane", region: "WA", country: "USA", lat: 47.6588, lon: -117.4260, tz: "America/Los_Angeles" },
  { name: "Bend", region: "OR", country: "USA", lat: 44.0582, lon: -121.3153, tz: "America/Los_Angeles" },
  { name: "Sacramento", region: "CA", country: "USA", lat: 38.5816, lon: -121.4944, tz: "America/Los_Angeles" },
  { name: "San Jose", region: "CA", country: "USA", lat: 37.3382, lon: -121.8863, tz: "America/Los_Angeles" },
  { name: "Joshua Tree", region: "CA", country: "USA", lat: 34.1347, lon: -116.3131, tz: "America/Los_Angeles" },
  { name: "Anchorage", region: "AK", country: "USA", lat: 61.2181, lon: -149.9003, tz: "America/Anchorage" },
  { name: "Fairbanks", region: "AK", country: "USA", lat: 64.8378, lon: -147.7164, tz: "America/Anchorage" },
  { name: "Honolulu", region: "HI", country: "USA", lat: 21.3069, lon: -157.8583, tz: "Pacific/Honolulu" },
  { name: "Hilo", region: "HI", country: "USA", lat: 19.7071, lon: -155.0816, tz: "Pacific/Honolulu" },
  { name: "San Juan", region: "PR", country: "USA", lat: 18.4655, lon: -66.1057, tz: "America/Puerto_Rico" },
  { name: "Vancouver", region: "BC", country: "Canada", lat: 49.2827, lon: -123.1207, tz: "America/Vancouver" },
  { name: "Calgary", region: "AB", country: "Canada", lat: 51.0447, lon: -114.0719, tz: "America/Edmonton" },
  { name: "Winnipeg", region: "MB", country: "Canada", lat: 49.8951, lon: -97.1384, tz: "America/Winnipeg" },
  { name: "Ottawa", region: "ON", country: "Canada", lat: 45.4215, lon: -75.6972, tz: "America/Toronto" },
  { name: "Montreal", region: "QC", country: "Canada", lat: 45.5019, lon: -73.5674, tz: "America/Toronto" },
  { name: "Halifax", region: "NS", country: "Canada", lat: 44.6488, lon: -63.5752, tz: "America/Halifax" },
  { name: "Mexico City", region: "", country: "Mexico", lat: 19.4326, lon: -99.1332, tz: "America/Mexico_City" },
  { name: "Edinburgh", region: "", country: "UK", lat: 55.9533, lon: -3.1883, tz: "Europe/London" },
  { name: "Glasgow", region: "", country: "UK", lat: 55.8642, lon: -4.2518, tz: "Europe/London" },
  { name: "Manchester", region: "", country: "UK", lat: 53.4808, lon: -2.2426, tz: "Europe/London" },
  { name: "Dublin", region: "", country: "Ireland", lat: 53.3498, lon: -6.2603, tz: "Europe/Dublin" },
  { name: "Paris", region: "", country: "France", lat: 48.8566, lon: 2.3522, tz: "Europe/Paris" },
  { name: "Amsterdam", region: "", country: "Netherlands", lat: 52.3676, lon: 4.9041, tz: "Europe/Amsterdam" },
  { name: "Berlin", region: "", country: "Germany", lat: 52.5200, lon: 13.4050, tz: "Europe/Berlin" },
  { name: "Zurich", region: "", country: "Switzerland", lat: 47.3769, lon: 8.5417, tz: "Europe/Zurich" },
  { name: "Vienna", region: "", country: "Austria", lat: 48.2082, lon: 16.3738, tz: "Europe/Vienna" },
  { name: "Madrid", region: "", country: "Spain", lat: 40.4168, lon: -3.7038, tz: "Europe/Madrid" },
  { name: "Santa Cruz de La Palma", region: "", country: "Spain", lat: 28.6835, lon: -17.7642, tz: "Atlantic/Canary" },
  { name: "Lisbon", region: "", country: "Portugal", lat: 38.7223, lon: -9.1393, tz: "Europe/Lisbon" },
  { name: "Rome", region: "", country: "Italy", lat: 41.9028, lon: 12.4964, tz: "Europe/Rome" },
  { name: "Athens", region: "", country: "Greece", lat: 37.9838, lon: 23.7275, tz: "Europe/Athens" },
  { name: "Copenhagen", region: "", country: "Denmark", lat: 55.6761, lon: 12.5683, tz: "Europe/Copenhagen" },
  { name: "Oslo", region: "", country: "Norway", lat: 59.9139, lon: 10.7522, tz: "Europe/Oslo" },
  { name: "Tromsø", region: "", country: "Norway", lat: 69.6492, lon: 18.9553, tz: "Europe/Oslo" },
  { name: "Stockholm", region: "", country: "Sweden", lat: 59.3293, lon: 18.0686, tz: "Europe/Stockholm" },
  { name: "Helsinki", region: "", country: "Finland", lat: 60.1699, lon: 24.9384, tz: "Europe/Helsinki" },
  { name: "Istanbul", region: "", country: "Turkey", lat: 41.0082, lon: 28.9784, tz: "Europe/Istanbul" },
  { name: "Cairo", region: "", country: "Egypt", lat: 30.0444, lon: 31.2357, tz: "Africa/Cairo" },
  { name: "Nairobi", region: "", country: "Kenya", lat: -1.2921, lon: 36.8219, tz: "Africa/Nairobi" },
  { name: "Cape Town", region: "", country: "South Africa", lat: -33.9249, lon: 18.4241, tz: "Africa/Johannesburg" },
  { name: "Dubai", region: "", country: "UAE", lat: 25.2048, lon: 55.2708, tz: "Asia/Dubai" },
  { name: "Mumbai", region: "", country: "India", lat: 19.0760, lon: 72.8777, tz: "Asia/Kolkata" },
  { name: "New Delhi", region: "", country: "India", lat: 28.6139, lon: 77.2090, tz: "Asia/Kolkata" },
  { name: "Bangkok", region: "", country: "Thailand", lat: 13.7563, lon: 100.5018, tz: "Asia/Bangkok" },
  { name: "Singapore", region: "", country: "Singapore", lat: 1.3521, lon: 103.8198, tz: "Asia/Singapore" },
  { name: "Hong Kong", region: "", country: "Hong Kong", lat: 22.3193, lon: 114.1694, tz: "Asia/Hong_Kong" },
  { name: "Beijing", region: "", country: "China", lat: 39.9042, lon: 116.4074, tz: "Asia/Shanghai" },
  { name: "Seoul", region: "", country: "South Korea", lat: 37.5665, lon: 126.9780, tz: "Asia/Seoul" },
  { name: "Tokyo", region: "", country: "Japan", lat: 35.6762, lon: 139.6503, tz: "Asia/Tokyo" },
  { name: "Perth", region: "", country: "Australia", lat: -31.9505, lon: 115.8605, tz: "Australia/Perth" },
  { name: "Brisbane", region: "", country: "Australia", lat: -27.4698, lon: 153.0251, tz: "Australia/Brisbane" },
  { name: "Melbourne", region: "", country: "Australia", lat: -37.8136, lon: 144.9631, tz: "Australia/Melbourne" },
  { name: "Auckland", region: "", country: "New Zealand", lat: -36.8485, lon: 174.7633, tz: "Pacific/Auckland" },
  { name: "Lake Tekapo", region: "", country: "New Zealand", lat: -44.0046, lon: 170.4772, tz: "Pacific/Auckland" },
  { name: "Queenstown", region: "", country: "New Zealand", lat: -45.0312, lon: 168.6626, tz: "Pacific/Auckland" },
  { name: "Bogotá", region: "", country: "Colombia", lat: 4.7110, lon: -74.0721, tz: "America/Bogota" },
  { name: "Lima", region: "", country: "Peru", lat: -12.0464, lon: -77.0428, tz: "America/Lima" },
  { name: "Rio de Janeiro", region: "", country: "Brazil", lat: -22.9068, lon: -43.1729, tz: "America/Sao_Paulo" },
  { name: "São Paulo", region: "", country: "Brazil", lat: -23.5505, lon: -46.6333, tz: "America/Sao_Paulo" },
  { name: "Buenos Aires", region: "", country: "Argentina", lat: -34.6037, lon: -58.3816, tz: "America/Argentina/Buenos_Aires" },
  { name: "Santiago", region: "", country: "Chile", lat: -33.4489, lon: -70.6693, tz: "America/Santiago" },
  { name: "San Pedro de Atacama", region: "", country: "Chile", lat: -22.9087, lon: -68.1997, tz: "America/Santiago" }
];

function slugify(city) {
  const base = city.region ? `${city.name}-${city.region}` : city.name;
  // Accents off ("São Paulo" → sao-paulo, "Tromsø" → tromso) so the URL is plain.
  return base.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ø/g, 'o').replace(/Ø/g, 'O')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function place(city) {
  if (city.region) return `${city.name}, ${city.region}`;
  return city.name === city.country ? city.name : `${city.name}, ${city.country}`;
}

// The app, opened on this place: its name and time zone travel with the
// coordinates (index.html's urlPlace), so the Console says "Boston, MA" and
// shows Boston's clock, not the reader's.
function appLink(city, tab) {
  const q = `lat=${city.lat}&lon=${city.lon}&name=${encodeURIComponent(place(city))}&tz=${encodeURIComponent(city.tz)}`;
  return '/?' + (tab ? `tab=${tab}&` : '') + q.replace(/&/g, '&amp;');
}

// Great-circle km between two cities.
function km(a, b) {
  const r = x => x * Math.PI / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
// Up to four other cities within 1,500 km, nearest first.
function nearby(city, all) {
  return all.filter(c => c !== city).map(c => [km(city, c), c]).filter(([d]) => d < 1500)
    .sort((a, b) => a[0] - b[0]).slice(0, 4).map(([, c]) => c);
}

function page(city, slug, all) {
  const p = place(city);
  const near = nearby(city, all);
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
  .kicker{font-size:10.5px;font-weight:600;letter-spacing:.07em;color:#888174;text-transform:uppercase;}
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
  footer{font-size:11.5px;color:#888174;border-top:1px solid #211f1b;padding-top:18px;line-height:1.6;}
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

  <a class="cta" href="${appLink(city)}">See tonight’s sky over ${city.name} →</a>
  <p class="explain"><a href="${appLink(city, 'ephemeris')}">The full day for ${p}</a>, with the Sun’s path, golden and blue hours, moonrise and moonset, and any date you choose.</p>

  <p class="explain">Times shown are computed live for ${p} (${city.lat.toFixed(2)}°, ${city.lon.toFixed(2)}°) using the Sun's position for today's date, in ${city.name}'s own time zone (${city.tz.replace(/_/g, ' ')}), daylight saving included.</p>

${near.length ? `  <p class="explain">Nearby: ${near.map(c => `<a href="${slugify(c)}.html">${place(c)}</a>`).join(' · ')}</p>\n\n` : ''}  <footer>
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
  h2{font-family:'Inter',system-ui,sans-serif;font-size:12px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:#888174;border-top:1px solid #211f1b;padding-top:18px;margin:26px 0 8px;}
  ul{list-style:none;margin:0 0 4px;padding:0;columns:2;column-gap:20px;}
  li{padding:5px 0;font-size:14.5px;break-inside:avoid;}
  li a{color:#eae7e0;text-decoration:none;}
  li a:hover{color:#e5ba6e;}
  footer{font-size:11.5px;color:#888174;border-top:1px solid #211f1b;padding-top:18px;margin-top:26px;line-height:1.6;}
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
    fs.writeFileSync(path.join(OUT_DIR, `${slug}.html`), page(city, slug, CITIES));
  }
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), hubPage(CITIES));
  updateSitemap(CITIES);
  console.log(`wrote ${CITIES.length} city pages + index.html to ${OUT_DIR}`);
})();
