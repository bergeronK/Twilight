'use strict';
/*
 * Tonight's sunset on the Console (2026-09-25): whether it is likely to be
 * colourful, from the cloud forecast here and 150 km toward the sunset, and a
 * calendar event with a reminder half an hour before.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'asin', 'acos', 'atan2', 'rev', 'jd', 'gmst', 'sunAltitude', 'sunHcZn', 'scanCrossings', 'SUN_THR',
  'TWILIGHT_WORDS', 'twilightWord', 'twilightDay', 'cdHMS',
  'pointToward', 'wxOf', 'cloudAt', 'sunsetGlow', 'sunsetICS', 'sunsetBearing', 'nextSunset']);

const BOS = [42.36, -71.06];
// Great-circle distance, written independently of pointToward.
function km(a, b) {
  const r = x => x * Math.PI / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

test('the point toward the sunset is 150 km away, on the bearing', () => {
  const w = m.pointToward(0, 0, 270, 150);
  assert.ok(Math.abs(w.lat) < 0.01 && Math.abs(w.lon + 1.35) < 0.01, JSON.stringify(w));
  assert.ok(Math.abs(m.pointToward(0, 0, 0, 111.2).lat - 1) < 0.01, 'north is up the meridian');
  const b = m.pointToward(...BOS, 300, 150);
  assert.ok(Math.abs(km({ lat: BOS[0], lon: BOS[1] }, b) - 150) < 1, 'distance');
  assert.ok(b.lat > BOS[0] && b.lon < BOS[1], 'north-west of Boston');
  // Across the date line, longitudes stay in range.
  const d = m.pointToward(0, 179.5, 90, 150);
  assert.ok(d.lon < -179 && d.lon >= -180, JSON.stringify(d));
});

test('the sunset bearing through the year from Boston', () => {
  // About 302° at the June solstice, 270° at the equinox, 238° in December.
  const at = iso => m.sunsetBearing(...BOS, Date.parse(iso));
  assert.ok(Math.abs(at('2026-06-21T12:00Z') - 302.5) < 1.5, at('2026-06-21T12:00Z'));
  assert.ok(Math.abs(at('2026-09-23T12:00Z') - 270) < 1.5, at('2026-09-23T12:00Z'));
  assert.ok(Math.abs(at('2026-12-21T12:00Z') - 237.5) < 1.5, at('2026-12-21T12:00Z'));
  // No sunset in the next day and a half: due west.
  assert.strictEqual(m.sunsetBearing(78.2, 15.6, Date.parse('2026-06-21T12:00Z')), 270);
});

const hours = (t0, n) => Array.from({ length: n }, (_, i) => new Date(t0 + i * 3600000).toISOString().slice(0, 16));
function wx(fill, { off = 0, t0 = Date.UTC(2026, 8, 24), n = 48 } = {}) {
  const time = hours(t0 + off * 1000, n), f = v => Array(n).fill(v);
  return { utc_offset_seconds: off, hourly: { time, cloud_cover: f(fill.total), cloud_cover_low: f(fill.low), cloud_cover_mid: f(fill.mid), cloud_cover_high: f(fill.high), precipitation_probability: f(fill.precip || 0) } };
}

test('the forecast for two places, or one from an old cache', () => {
  const a = { hourly: { time: [] } }, b = { hourly: { time: ['x'] } };
  assert.deepStrictEqual(m.wxOf([a, b]), { hourly: a.hourly, west: b });
  assert.deepStrictEqual(m.wxOf([a]), { hourly: a.hourly, west: null });
  assert.strictEqual(m.wxOf(a), a, 'a cached single-place reply is kept as it is');
  assert.strictEqual(m.wxOf(null), null);
  assert.strictEqual(m.wxOf([]), null);
});

test('cloud layers at the hour nearest the sunset', () => {
  const w = wx({ total: 50, low: 10, mid: 20, high: 40 }, { off: -4 * 3600 });
  w.hourly.cloud_cover_high[26] = 77; // 22:00 local on the 24th = 02:00 UTC on the 25th
  const t = Date.UTC(2026, 8, 25, 2, 20);
  assert.strictEqual(m.cloudAt(w, t).high, 77, 'local wall clock read with the offset');
  assert.deepStrictEqual(Object.keys(m.cloudAt(w, t)).sort(), ['high', 'low', 'mid', 'precip', 'total']);
  assert.strictEqual(m.cloudAt(w, Date.UTC(2026, 8, 28)), null, 'past the end of the forecast');
  const old = wx({ total: 50, low: 10, mid: 20, high: 40 });
  delete old.hourly.cloud_cover_low;
  assert.strictEqual(m.cloudAt(old, Date.UTC(2026, 8, 24, 5)), null, 'a forecast without layers says nothing');
  assert.strictEqual(m.cloudAt(null, 0), null);
});

test('the colour rule', () => {
  const g = (here, west) => m.sunsetGlow(here, west).level;
  const c = (total, low, mid, high, precip = 0) => ({ total, low, mid, high, precip });
  assert.strictEqual(g(c(50, 5, 10, 45), c(20, 5, 5, 10)), 'vivid', 'high cloud and a clear way west');
  assert.strictEqual(g(c(50, 5, 40, 10), null), 'vivid', 'middle cloud counts too');
  assert.strictEqual(g(c(50, 5, 10, 45), c(80, 70, 5, 10)), 'muted', 'low cloud toward the sunset blocks it');
  assert.strictEqual(g(c(95, 85, 30, 30)), 'grey', 'thick low cloud overhead');
  assert.strictEqual(g(c(40, 10, 10, 30, 70)), 'grey', 'rain');
  assert.strictEqual(g(c(5, 0, 2, 5)), 'plain', 'nothing to light up');
  assert.strictEqual(g(c(95, 5, 20, 95)), 'some', 'a thick high sheet');
  assert.strictEqual(g(c(60, 50, 20, 30)), 'some', 'a mixed sky');
  assert.strictEqual(m.sunsetGlow(null, null), null);
  assert.match(m.sunsetGlow(c(50, 5, 10, 45), null).detail, /little low cloud/, 'says only what it knows without the west');
});

const MID = Date.UTC(2026, 8, 24, 4);
const sunEv = m.scanCrossings(MID, MID + 48 * 3600000, ...BOS, m.sunAltitude, m.SUN_THR, 1);

test('the next sunset and the dusk after it', () => {
  const set = m.nextSunset(sunEv, MID + 12 * 3600000);
  const local = t => new Date(t - 4 * 3600000).toISOString().slice(11, 16);
  assert.match(local(set.t), /^18:3\d$/, 'Boston sunset about 18:37');
  assert.ok(set.t < set.civil && set.civil < set.naut && set.naut < set.astro);
  assert.ok(set.astro - set.t < 2 * 3600000, 'this evening\'s dusk, not a later one');
  assert.ok(!('rise' in set), 'nothing from the morning after');
  // After this evening's sunset, the next is tomorrow's.
  const tomorrow = m.nextSunset(sunEv, set.t + 60000);
  assert.ok(tomorrow.t - set.t > 23.9 * 3600000 && tomorrow.t - set.t < 24.1 * 3600000);
  // Edinburgh at midsummer: sunset and civil dusk, nothing darker.
  const mid = Date.UTC(2026, 5, 20, 23);
  const ed = m.nextSunset(m.scanCrossings(mid, mid + 24 * 3600000, 55.95, -3.19, m.sunAltitude, m.SUN_THR, 1), mid);
  assert.ok(ed.civil && !ed.naut && !ed.astro, JSON.stringify(ed));
  assert.strictEqual(m.nextSunset([], 0), null);
});

test('the calendar event: sunset to civil dusk, a reminder half an hour before', () => {
  const set = m.nextSunset(sunEv, MID + 12 * 3600000);
  const ics = m.sunsetICS(set, 'Boston, MA', Date.UTC(2026, 8, 24, 12), t => 'T' + new Date(t).toISOString().slice(11, 16));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR'));
  assert.ok(!/[^\r]\n/.test(ics), 'CRLF line ends only');
  const dt = t => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  assert.match(ics, new RegExp('DTSTART:' + dt(set.t) + '\r\nDTEND:' + dt(set.civil) + '\r\n'));
  assert.match(ics, /SUMMARY:Sunset at Boston\\, MA\r\n/, 'commas escaped');
  assert.match(ics, /BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Sunset in 30 minutes\r\nTRIGGER:-PT30M\r\nEND:VALARM/);
  assert.match(ics, /DESCRIPTION:Sunset T22:3\d\. Civil dusk T23:0\d: the last of the colour\. Nautical dusk .*Fully dark T00:1\d\./);
  // No civil dusk (a polar evening): half an hour long, nothing invented.
  const bare = m.sunsetICS({ t: set.t }, 'X', 0, String);
  assert.match(bare, new RegExp('DTEND:' + dt(set.t + 30 * 60000)));
  assert.ok(!/dusk|dark/.test(bare.split('DESCRIPTION:')[1].split('\r\n')[0]));
});

test('in the Twilight section: the colour line and the calendar button', () => {
  const R = { createElement: (t, p, ...c) => ({ t, p, c: c.flat().filter(x => x != null && x !== false) }) };
  const TT = new Function('React', 'C', 'cdHMS', 'twilightWord', 'TWILIGHT_DOTS', `${declSource('TwilightToday')}; return TwilightToday;`)(
    R, { ink: 'INK', inkDim: 'DIM', inkFaint: 'FAINT', brass: 'AMBER', line: 'LINE' }, m.cdHMS, m.twilightWord, {});
  const text = n => typeof n === 'string' || typeof n === 'number' ? String(n) : (n.c || []).map(text).join('');
  const sched = { when: 'today', ...m.twilightDay(sunEv.filter(e => e.t < MID + 86400000), MID) };
  let cal = 0;
  const base = { next: sunEv[0], now: MID, sched, fmt: String, sunUp: false, onMore() {} };
  const out = TT({ ...base, glow: { when: 'Tonight’s', level: 'vivid', title: 'Likely colourful', detail: 'High cloud.' }, sunset: { when: 'today' }, onCalendar: () => cal++ });
  const all = text(out);
  assert.match(all, /Tonight’s sunset colourLikely colourfulHigh cloud\. An estimate from the cloud forecast\./);
  assert.ok(!JSON.stringify(out).includes('"border":'), 'no boxes');
  const btns = out.c[out.c.length - 1].c;
  assert.strictEqual(text(btns[0]), 'Add tonight’s sunset to your calendar');
  btns[0].p.onClick(); assert.strictEqual(cal, 1);
  // The vivid title in amber, anything else in ink.
  const title = o => JSON.stringify(o).match(/"color":"(\w+)"\}\},"c":\["(Likely colourful|Probably grey)"/)[1];
  assert.strictEqual(title(out), 'AMBER');
  assert.strictEqual(title(TT({ ...base, glow: { when: 'x', level: 'grey', title: 'Probably grey', detail: '' } })), 'INK');
  // No forecast, no sunset: neither shows.
  const none = TT(base);
  assert.ok(!/sunset colour|calendar/.test(text(none)));
});

test('the Console asks for the cloud layers here and toward the sunset', () => {
  const rt = declSource('RealtimeTwilight');
  assert.match(rt, /const west = pointToward\(loc\.lat, loc\.lon, sunsetBearing\(loc\.lat, loc\.lon, Date\.now\(\)\), 150\);/);
  assert.match(rt, /latitude=\$\{loc\.lat\},\$\{west\.lat\}&longitude=\$\{loc\.lon\},\$\{west\.lon\}&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation_probability/);
  // Every way the forecast arrives goes through wxOf.
  assert.strictEqual((rt.match(/setWx\(wxOf\(/g) || []).length, 3);
  assert.ok(!/setWx\((?!wxOf|null)/.test(rt), 'no raw reply reaches setWx');
  assert.match(rt, /sunsetGlow\(cloudAt\(wx, sunset\.t\), wx && wx\.west \? cloudAt\(wx\.west, sunset\.t\) : null\)/);
  assert.match(rt, /glow, sunset, onCalendar: downloadSunsetICS/);
});

test('the almanac button over the painting deals a fact and goes to it', async () => {
  const rt = declSource('RealtimeTwilight');
  assert.match(rt, /corner: factCorner,/);
  assert.match(rt, /const factCorner = React\.createElement\("button", \{\s*onClick: jumpToFact,\s*"aria-label": "A twilight fact from the almanac"/);
  // Run jumpToFact from source: a fact is dealt only when none is showing,
  // and the almanac is scrolled to and focused.
  const src = rt.slice(rt.indexOf('const jumpToFact = '), rt.indexOf('const factCorner = '));
  const run = async fact => {
    let dealt = 0, loaded = false; const calls = [];
    const el = { scrollIntoView: o => calls.push(['scroll', o.block, loaded]), focus: o => calls.push(['focus', o.preventScroll]) };
    new Function('fact', 'nextFact', 'factRef', 'matchMedia', 'requestAnimationFrame', src + '; jumpToFact();')(
      fact, () => { dealt++; return new Promise(res => setTimeout(() => { loaded = true; res(); }, 5)); }, { current: el }, () => ({ matches: false }), f => f());
    await new Promise(res => setTimeout(res, 20));
    return { dealt, calls };
  };
  // Scrolled only once the fact is in, focus first (focus during a smooth
  // scroll stops it).
  assert.deepStrictEqual(await run(null), { dealt: 1, calls: [['focus', true], ['scroll', 'start', true]] });
  assert.strictEqual((await run('error')).dealt, 1);
  const shown = await run({ f: {} });
  assert.strictEqual(shown.dealt, 0, 'a fact already showing stays');
  assert.deepStrictEqual(shown.calls, [['focus', true], ['scroll', 'start', false]], 'and it still goes there');
  assert.strictEqual((await run('loading')).dealt, 0);
  // The almanac can take focus, and the painting keeps labels clear of the button.
  assert.match(rt, /ref: factRef,\s*tabIndex: -1,/);
  const hh = declSource('HorizonHero');
  assert.match(hh, /reserve, reserveRight,/);
  assert.match(hh, /ref: cornerRef/);
});
