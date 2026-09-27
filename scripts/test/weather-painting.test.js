'use strict';
/*
 * The weather in the Console's painting (2026-09-27): the hour's forecast
 * read into clouds, fog, rain and snow, and drawn.
 *
 * What is checked against something outside the code: the cloud painted
 * covers the fraction of the sky the forecast gives, layer by layer; every
 * WMO code Open-Meteo documents maps to what it means; clouds are lit the
 * way clouds are (paler by day, warm on the Sun's side at dusk and high
 * cloud last, silvered near the Moon, orange over a town). What is checked
 * against the design: thin cloud gathers in groups, a thicker forecast adds
 * to the same sky, the layers slide at their own speeds, clouds sit over
 * the stars and under the ground, and a drawing a second doesn't restamp
 * the shapes (which took a slow phone a third of a second).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extract, appScript, INDEX } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'atan2', 'hx', 'toHex', 'lerpC', 'skyColors',
  'HZ_SPAN', 'panoX', 'panoY', 'hzRandom', 'MOON_MARIA', 'skyBearing', 'drawMoonDisc', 'COMPASS16', 'compass16',
  'drawHorizonScene', 'drawHorizonSky', 'drawHorizonGround', 'starGlow', 'heroMoonDisc',
  'cloudAt', 'WMO_FALL', 'skyWeather', 'CLOUD_LAYERS', 'CLOUD_CROSS_S', 'cloudSheet', 'cloudSeed', 'cloudDrift',
  'CLOUD_CANDIDATES', 'cloudPuffs', 'cloudLight', 'CLOUD_DAY', 'CLOUD_NIGHT', 'CLOUD_LIFT', 'cloudShade', 'fogShade',
  'precipShade', 'cloudCanvas', 'CLOUD_FIELD', 'CLOUD_RES', 'cloudSprite', 'cloudMasks', 'cloudWork',
  'drawHorizonClouds', 'PRECIP_FALL_MS', 'drawPrecip', 'paintClouds']);

/* ---- A recording canvas ---- */
function recCtx() {
  const ops = [];
  const lin = () => ({ stops: [], addColorStop(o, c) { this.stops.push([o, c]); } });
  const ctx = {
    ops,
    createRadialGradient: lin, createLinearGradient: lin,
    save() {}, restore() {}, translate() {}, scale() {}, setTransform() {}, clip() {}, setLineDash() {}, ellipse() {}, closePath() {},
    rotate(r) { ops.push(['rotate', r]); },
    beginPath() { ops.push(['beginPath']); },
    moveTo(x, y) { ops.push(['moveTo', x, y]); }, lineTo(x, y) { ops.push(['lineTo', x, y]); },
    arc(x, y, r) { ops.push(['arc', x, y, r]); },
    fill() { ops.push(['fill', this.fillStyle]); }, stroke() { ops.push(['stroke', this.strokeStyle]); },
    fillRect(x, y, w, h) { ops.push(['fillRect', x, y, w, h, this.fillStyle]); },
    clearRect() { ops.push(['clearRect']); },
    drawImage(img, ...a) { ops.push(['drawImage', img, ...a]); },
    fillText(t, x, y) { ops.push(['fillText', t, x, y]); },
    measureText: t => ({ width: t.length * 6 }),
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', font: '', textAlign: 'left', textBaseline: 'alphabetic',
    globalAlpha: 1, globalCompositeOperation: 'source-over', imageSmoothingEnabled: true
  };
  return ctx;
}
let made = [];
const makeCanvas = (W, H) => { const c = { width: W, height: H, ctx: recCtx() }; c.getContext = () => c.ctx; made.push(c); return c; };
const texts = g => g.ops.filter(o => o[0] === 'fillText').map(o => o[1]);
// Composites of a cloud layer onto the picture: images drawn from the
// colouring canvas, which is none of the painting's own.
const cloudLays = g => g.ops.filter(o => o[0] === 'drawImage' && o[1] && o[1].ctx);

const W = 400, H = 380, HY = Math.round(H * 0.62);
const scene = over => Object.assign({
  sky: m.skyColors(-20), sunAlt: -20, sun: { az: 0, alt: -20 },
  moon: { az: 300, alt: -20, illum: 0.5 }, facing: 180,
  stars: [{ az: 170, alt: 40, mag: 1 }, { az: 200, alt: 20, mag: 2 }],
  planets: [{ name: 'Jupiter', az: 160, alt: 30 }],
  bortle: 3, lat: 42, lon: -72, makeCanvas
}, over);
const paint = o => { const g = recCtx(); m.drawHorizonScene(g, W, H, o); return g; };
const wx = over => Object.assign({ low: 0, mid: 0, high: 0, fall: null, amount: 0, storm: false, fog: false }, over);

// The fraction of the painted sky layer `key`'s puffs hide (inside three-
// quarters of their radii), worked out here on a finer grid than the code's
// own, wrapping across the width as the code does.
function hidden(cl, key, cols = 120, rows = 80) {
  const ps = cl.puffs.filter(p => p.layer === key);
  let n = 0;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = (i + 0.5) * cl.w / cols, y = (j + 0.5) * cl.hy / rows;
    if (ps.some(p => {
      const dx = ((x - p.x + 1.5 * cl.w) % cl.w) - cl.w / 2, dy = y - p.y;
      const u = (dx * Math.cos(p.rot) + dy * Math.sin(p.rot)) / (0.75 * p.rx), v = (-dx * Math.sin(p.rot) + dy * Math.cos(p.rot)) / (0.75 * p.ry);
      return u * u + v * v <= 1;
    })) n++;
  }
  return n / (cols * rows);
}
const lum = rgb => { const [r, g, b] = rgb.split(',').map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const warmth = rgb => { const [r, , b] = rgb.split(',').map(Number); return r - b; };

/* ---- The forecast ---- */

test('cloudAt reads the hour’s weather code, and null from a forecast saved without it', () => {
  const hourly = {
    time: ['2026-09-27T00:00', '2026-09-27T01:00'], cloud_cover: [10, 90], cloud_cover_low: [5, 90],
    cloud_cover_mid: [0, 40], cloud_cover_high: [10, 0], precipitation_probability: [0, 80], weather_code: [1, 63]
  };
  const f = { utc_offset_seconds: 0, hourly };
  assert.strictEqual(m.cloudAt(f, Date.UTC(2026, 8, 27, 1, 10)).code, 63, 'the nearest hour');
  assert.strictEqual(m.cloudAt(f, Date.UTC(2026, 8, 27, 0, 20)).code, 1);
  const old = { utc_offset_seconds: 0, hourly: Object.assign({}, hourly, { weather_code: undefined }) };
  assert.strictEqual(m.cloudAt(old, Date.UTC(2026, 8, 27, 1)).code, null);
});

test('every WMO code Open-Meteo documents means what it says', () => {
  const c = code => m.skyWeather({ low: 0, mid: 0, high: 0, code });
  for (const code of [0, 1, 2, 3]) assert.ok(!c(code).fall && !c(code).fog, `code ${code} is cloud only`);
  for (const code of [45, 48]) assert.ok(c(code).fog && !c(code).fall, `code ${code} is fog`);
  for (const code of [51, 53, 55, 56, 57]) assert.strictEqual(c(code).fall, 'drizzle', `code ${code}`);
  for (const code of [61, 63, 65, 66, 67, 80, 81, 82]) assert.strictEqual(c(code).fall, 'rain', `code ${code}`);
  for (const code of [71, 73, 75, 77, 85, 86]) assert.strictEqual(c(code).fall, 'snow', `code ${code}`);
  for (const code of [95, 96, 99]) assert.ok(c(code).fall === 'rain' && c(code).storm, `code ${code} is a storm`);
  assert.ok(!c(3).storm && !c(82).storm);
  // Slight, moderate, heavy in order.
  assert.ok(c(61).amount < c(63).amount && c(63).amount < c(65).amount);
  assert.ok(c(71).amount < c(73).amount && c(73).amount < c(75).amount);
  assert.ok(c(51).amount < c(53).amount && c(53).amount < c(55).amount);
  assert.strictEqual(c(null).fall, null, 'no code: nothing falls');
  assert.strictEqual(m.skyWeather(null), null, 'no forecast: nothing to paint');
});

test('rain is never painted out of a clear sky', () => {
  const w = m.skyWeather({ low: 0, mid: 5, high: 0, code: 61 });
  assert.ok(w.low >= 60, `low cloud thickened to ${w.low}`);
  assert.strictEqual(m.skyWeather({ low: 95, mid: 0, high: 0, code: 65 }).low, 95, 'a thick deck is left alone');
  assert.strictEqual(m.skyWeather({ low: 10, mid: 0, high: 0, code: 2 }).low, 10, 'dry cloud is as forecast');
});

/* ---- Where the clouds go ---- */

test('each layer hides the fraction of the sky the forecast gives', () => {
  const seed = m.cloudSeed(42.36, -71.06);
  for (const key of ['low', 'mid', 'high']) {
    for (const c of [10, 25, 40, 55, 70, 85, 100]) {
      const cl = m.cloudPuffs({ [key]: c }, W, HY, seed);
      assert.ok(Math.abs(cl.cover[key] - c / 100) <= 0.06, `${key} ${c}%: covers ${cl.cover[key].toFixed(3)}`);
      // Measured independently of the code's own grid: clouds, plus the
      // sheet over the rest.
      const f = hidden(cl, key), sheet = m.cloudSheet({ [key]: c }, key);
      const mine = f + (1 - f) * sheet;
      assert.ok(Math.abs(mine - c / 100) <= 0.08, `${key} ${c}%: measured ${mine.toFixed(3)}`);
    }
    const none = m.cloudPuffs({ [key]: 0 }, W, HY, seed);
    assert.strictEqual(none.puffs.length, 0);
    assert.strictEqual(none.cover[key], 0);
  }
});

test('overcast is a sheet over the whole sky; thinner cloud is separate clouds', () => {
  const seed = m.cloudSeed(10, 10);
  const L = k => m.CLOUD_LAYERS.find(l => l.key === k);
  assert.strictEqual(m.cloudPuffs({ low: 50 }, W, HY, seed).deck.low, 0);
  assert.strictEqual(m.cloudPuffs({ low: 100 }, W, HY, seed).deck.low, L('low').a, 'a full sheet at 100%');
  assert.ok(m.cloudPuffs({ low: 85 }, W, HY, seed).deck.low > 0);
  assert.ok(m.cloudPuffs({ high: 50 }, W, HY, seed).deck.high > 0, 'cirrus turns to a veil early');
  assert.strictEqual(m.cloudPuffs({ mid: 60 }, W, HY, seed).deck.mid, 0);
});

test('thin cloud gathers in groups, with clear sky between', () => {
  // At 30% low cloud there is a stretch of clear sky at least a fifth of
  // the painting wide (columns under 10% cloud, wrapping round). Clouds
  // dealt at random, the same number of them, leave at most 17% at these
  // places, since they spread evenly like spots.
  const N = 40;
  for (const [lat, lon] of [[42.36, -71.06], [51.5, -0.1], [-33.9, 151.2], [64.1, -21.9], [35.7, 139.7], [19.4, -99.1]]) {
    const ps = m.cloudPuffs({ low: 30 }, W, HY, m.cloudSeed(lat, lon)).puffs;
    const col = [];
    for (let s = 0; s < N; s++) {
      let n = 0, t = 0;
      for (let j = 0; j < 40; j++) for (let i = 0; i < 3; i++) {
        const x = (s + (i + 0.5) / 3) * W / N, y = (j + 0.5) * HY / 40;
        t++;
        if (ps.some(p => { const dx = ((x - p.x + 1.5 * W) % W) - W / 2, dy = y - p.y; return (dx / (0.75 * p.rx)) ** 2 + (dy / (0.75 * p.ry)) ** 2 <= 1; })) n++;
      }
      col.push(n / t);
    }
    let gap = 0;
    for (let s = 0; s < N; s++) { let r = 0; while (r < N && col[(s + r) % N] < 0.1) r++; gap = Math.max(gap, r); }
    assert.ok(gap / N >= 0.2, `${lat},${lon}: longest clear stretch ${(gap / N).toFixed(2)} of the width`);
  }
});

test('a thicker forecast adds clouds to the same sky', () => {
  const seed = m.cloudSeed(42.36, -71.06);
  for (const key of ['low', 'mid', 'high']) {
    const thin = m.cloudPuffs({ [key]: 25 }, W, HY, seed).puffs, thick = m.cloudPuffs({ [key]: 55 }, W, HY, seed).puffs;
    assert.ok(thick.length > thin.length);
    assert.deepStrictEqual(thick.slice(0, thin.length), thin, `${key}: the 25% sky is the start of the 55% one`);
  }
  // The same place, the same sky; another place, another.
  assert.deepStrictEqual(m.cloudPuffs({ low: 40 }, W, HY, seed), m.cloudPuffs({ low: 40 }, W, HY, seed));
  assert.notDeepStrictEqual(m.cloudPuffs({ low: 40 }, W, HY, m.cloudSeed(51.5, -0.1)).puffs, m.cloudPuffs({ low: 40 }, W, HY, seed).puffs);
});

test('cirrus in tilted streaks, cumulus heaped, all inside the tile, and never too many to draw', () => {
  for (const w of [390, 1080]) for (const c of [10, 40, 70, 100]) {
    const cl = m.cloudPuffs({ low: c, mid: c, high: c }, w, Math.round((w < 560 ? 380 : 420) * 0.62), m.cloudSeed(42, -72));
    assert.ok(cl.puffs.length <= 1500, `${cl.puffs.length} puffs at ${c}%, ${w} px`);
    cl.puffs.forEach(p => assert.ok(p.x >= 0 && p.x < w, 'x wrapped into the tile'));
    const high = cl.puffs.filter(p => p.layer === 'high');
    if (high.length) {
      assert.ok(high.every(p => p.rx / p.ry >= 3), 'cirrus is long and thin');
      assert.ok(high.some(p => Math.abs(p.rot) > 0.12), 'and lies at an angle');
    }
    assert.ok(cl.puffs.filter(p => p.layer !== 'high').every(p => p.rot === 0));
  }
  // Low cloud sits lower in the sky than cirrus.
  const cl = m.cloudPuffs({ low: 30, high: 30 }, W, HY, m.cloudSeed(42, -72));
  const meanY = k => { const ps = cl.puffs.filter(p => p.layer === k); return ps.reduce((a, p) => a + p.y, 0) / ps.length; };
  assert.ok(meanY('low') > meanY('high') + HY * 0.15);
});

/* ---- How the clouds are lit ---- */

const light = over => m.cloudLight(Object.assign({
  sunAlt: 30, sun: { az: 180, alt: 30 }, moon: { az: 0, alt: -30, illum: 0 }, facing: 180, bortle: 2, weather: wx({})
}, over), W, HY);

test('cloud is pale by day and dark by night, greyer the heavier it is', () => {
  const day = light({}), night = light({ sunAlt: -30, sun: { az: 0, alt: -30 } });
  for (const k of ['low', 'mid']) assert.ok(lum(m.cloudShade(k, 50, 100, day)) > 150 && lum(m.cloudShade(k, 50, 100, night)) < 30, k);
  const rain = light({ weather: wx({ low: 100, fall: 'rain', amount: 1, storm: true }) });
  assert.ok(lum(m.cloudShade('low', 50, 100, rain)) < lum(m.cloudShade('low', 50, 100, day)) - 50, 'rain cloud is grey');
});

test('at dusk, cloud glows warm on the Sun’s side, and high cloud keeps it longest', () => {
  // The Sun just set due west; the painting faces north of west, so the
  // Sun is near its left edge and the right edge looks well away from it.
  const L = light({ sunAlt: -1, sun: { az: 270, alt: -1 }, facing: 350 });
  assert.ok(Math.abs(L.sunX - 0.1 * W) < 1e-9);
  assert.ok(warmth(m.cloudShade('mid', L.sunX, 60, L)) > warmth(m.cloudShade('mid', W - 10, 60, L)) + 30, 'toward the Sun, not away from it');
  assert.ok(warmth(m.cloudShade('mid', L.sunX, 60, L)) > 60, 'mid cloud lit orange-pink');
  const dusk = alt => light({ sunAlt: alt, sun: { az: 270, alt }, facing: 270 });
  // Six degrees down the low cloud has lost the Sun; the cirrus still has it.
  const later = dusk(-6);
  assert.ok(warmth(m.cloudShade('high', W / 2, 40, later)) > warmth(m.cloudShade('low', W / 2, 40, later)) + 40);
  // No colour at noon.
  assert.ok(Math.abs(warmth(m.cloudShade('mid', W / 2, 60, light({})))) < 25);
});

test('by night the Moon silvers cloud, most near it, and a town lights it orange from below', () => {
  const moonless = light({ sunAlt: -30, sun: { az: 0, alt: -30 } });
  const moonlit = light({ sunAlt: -30, sun: { az: 0, alt: -30 }, moon: { az: 180, alt: 40, illum: 1 } });
  const mx = moonlit.moonX, my = moonlit.moonY;
  assert.ok(Math.abs(mx - W / 2) < 1);
  assert.ok(lum(m.cloudShade('low', 20, 150, moonlit)) > lum(m.cloudShade('low', 20, 150, moonless)) + 20, 'moonlit');
  assert.ok(lum(m.cloudShade('mid', mx, my, moonlit)) > lum(m.cloudShade('mid', 20, 200, moonlit)) + 40, 'brightest by the Moon');
  const town = light({ sunAlt: -30, sun: { az: 0, alt: -30 }, bortle: 8 });
  const low = m.cloudShade('low', W / 2, HY * 0.9, town), dark = m.cloudShade('low', W / 2, HY * 0.9, moonless);
  assert.ok(lum(low) > lum(dark) + 30 && warmth(low) > 40, `town-lit ${low}`);
  assert.ok(lum(m.cloudShade('low', W / 2, HY * 0.9, town)) > lum(m.cloudShade('low', W / 2, HY * 0.1, town)), 'brightest low, over the lights');
  // By day none of that.
  assert.strictEqual(m.cloudShade('low', W / 2, 100, light({ bortle: 8 })), m.cloudShade('low', W / 2, 100, light({ bortle: 1 })));
});

test('fog takes the sky’s own light; rain and snow are pale by day', () => {
  const fogDay = m.fogShade({ sky: m.skyColors(20) }, light({})), fogNight = m.fogShade({ sky: m.skyColors(-30) }, light({ sunAlt: -30 }));
  assert.ok(lum(fogDay) > 150 && lum(fogNight) < 60);
  assert.ok(lum(m.precipShade(light({}))) > lum(m.precipShade(light({ sunAlt: -30 }))) + 40);
});

/* ---- Drawing ---- */

test('clouds cover the stars and the Moon and lie under the ground', () => {
  const o = scene({ weather: wx({ low: 40, mid: 20, high: 20 }), moon: { az: 180, alt: 30, illum: 0.8 } });
  const g = paint(o);
  const at = pred => g.ops.findIndex(pred);
  const lastStar = g.ops.map((op, i) => op[0] === 'arc' ? i : -1).filter(i => i >= 0 && i < at(op => op[0] === 'drawImage' && op[1] && op[1].ctx)).pop();
  const firstCloud = at(op => op[0] === 'drawImage' && op[1] && op[1].ctx);
  const compass = at(op => op[0] === 'fillText' && op[1] === 'S');
  assert.ok(firstCloud > 0, 'clouds were drawn');
  assert.ok(lastStar < firstCloud, 'after the stars and the Moon');
  assert.ok(firstCloud < compass, 'before the ground and its compass');
});

test('the moving hero’s layers: clouds on their own, and together what the still picture draws', () => {
  const o = scene({ weather: wx({ low: 40, mid: 20, high: 20 }) });
  const whole = paint(o), sky = paint(Object.assign({}, o, { part: 'sky' })),
    clouds = paint(Object.assign({}, o, { part: 'clouds' })), ground = paint(Object.assign({}, o, { part: 'ground' }));
  assert.strictEqual(cloudLays(sky).length, 0, 'none on the sky');
  assert.strictEqual(cloudLays(ground).length, 0, 'none on the ground');
  assert.strictEqual(cloudLays(clouds).length, cloudLays(whole).length, 'all of them on the clouds');
  assert.deepStrictEqual(texts(clouds), [], 'no words on the clouds');
  assert.deepStrictEqual(texts(whole).sort(), [...texts(sky), ...texts(ground)].sort());
  // No weather: no clouds at all, as the painting always was.
  assert.strictEqual(cloudLays(paint(scene({}))).length, 0);
  assert.strictEqual(cloudLays(paint(scene({ weather: wx({}) }))).length, 0, 'a clear forecast draws nothing');
});

test('layers drawn high to low, each slid by its own drift', () => {
  made = [];
  const o = scene({ weather: wx({ low: 40, mid: 40, high: 40 }), cloudOff: 100 });
  o.clouds = m.cloudPuffs(o.weather, W, HY, m.cloudSeed(o.lat, o.lon));
  const g = paint(Object.assign({}, o, { part: 'clouds' }));
  // Five composites: high's top; mid's underside, then top; low's the same.
  assert.strictEqual(cloudLays(g).length, 5);
  const work = cloudLays(g)[0][1];
  // The colouring canvas is kept between drawings; this drawing's slides are its last five.
  const slides = work.ctx.ops.filter(op => op[0] === 'drawImage' && op[1] && op[1].width === Math.ceil(2 * W * m.CLOUD_RES)).map(op => op[2]).slice(-5);
  const k = m.CLOUD_RES, d = key => m.CLOUD_LAYERS.find(l => l.key === key).drift;
  assert.deepStrictEqual(slides, [d('high'), d('mid'), d('mid'), d('low'), d('low')].map(v => -(100 * v % W) * k));
  assert.ok(d('high') < d('mid') && d('mid') < d('low'), 'nearer cloud moves faster');
  // Drift wraps round the width: a whole width on is where it started.
  assert.strictEqual(m.cloudDrift(W, m.CLOUD_CROSS_S), 0);
  assert.ok(Math.abs(m.cloudDrift(W, m.CLOUD_CROSS_S / 4) - W / 4) < 1e-9);
});

test('the shapes are stamped once, not every second', () => {
  made = [];
  const o = scene({ weather: wx({ low: 40, mid: 30, high: 20 }) });
  o.clouds = m.cloudPuffs(o.weather, W, HY, m.cloudSeed(o.lat, o.lon));
  paint(Object.assign({}, o, { part: 'clouds', cloudOff: 0 }));
  const stamps = () => made.reduce((n, c) => n + c.ctx.ops.filter(op => op[0] === 'drawImage' && op[1] && op[1].width === 64).length, 0);
  const first = stamps();
  assert.ok(first >= o.clouds.puffs.length, 'every puff stamped');
  const canvases = made.length;
  for (let s = 1; s <= 5; s++) paint(Object.assign({}, o, { part: 'clouds', cloudOff: s }));
  assert.strictEqual(stamps(), first, 'no puff stamped again as the clouds drift');
  assert.strictEqual(made.length, canvases, 'no new canvases either');
});

test('under a thick sheet the planets are left off; in a gap they stay', () => {
  const o = w => scene({ weather: wx(w) });
  assert.ok(texts(paint(o({ low: 40 }))).includes('Jupiter'));
  assert.ok(!texts(paint(o({ low: 95 }))).includes('Jupiter'), 'overcast: its name showed through');
  assert.ok(!texts(paint(o({ mid: 95 }))).includes('Jupiter'));
  assert.ok(texts(paint(o({ high: 100 }))).includes('Jupiter'), 'a veil of cirrus doesn’t hide Jupiter');
});

test('fog over the sky and on the ground', () => {
  const plain = paint(scene({ weather: wx({ low: 20 }) })), foggy = paint(scene({ weather: wx({ low: 20, fog: true }) }));
  const skyFills = g => g.ops.filter(op => op[0] === 'fillRect' && op[1] === 0 && op[2] === 0 && op[3] === W).length;
  assert.strictEqual(skyFills(foggy), skyFills(plain) + 1, 'a fog over the whole sky');
  const groundFog = g => g.ops.filter(op => op[0] === 'fillRect' && op[2] === HY - 34).length;
  assert.strictEqual(groundFog(foggy), 1);
  assert.strictEqual(groundFog(plain), 0);
});

test('rain, drizzle and snow: how much, what shape, and a pattern that repeats', () => {
  const run = (w, reps = 1) => { const g = recCtx(); m.drawPrecip(g, W, HY, w, m.hzRandom(7), '200,200,200', reps); return g.ops; };
  assert.strictEqual(run(null).length, 0);
  assert.strictEqual(run(wx({ low: 90 })).length, 0, 'cloud without rain');
  const streaks = ops => { const out = []; ops.forEach((op, i) => { if (op[0] === 'moveTo' && ops[i + 1] && ops[i + 1][0] === 'lineTo') out.push([op[1], op[2], ops[i + 1][1] - op[1], ops[i + 1][2] - op[2]]); }); return out; };
  const heavy = streaks(run(wx({ fall: 'rain', amount: 1 }))), light = streaks(run(wx({ fall: 'rain', amount: 0.35 })));
  const n = a => Math.round(a * W * HY / 650);
  assert.strictEqual(heavy.length, 2 * n(1), 'each drop in its strip and the one above');
  assert.strictEqual(light.length, 2 * n(0.35));
  heavy.forEach(([, , dx, dy]) => { assert.ok(dy >= 8 && dy <= 20); assert.ok(Math.abs(dx + 0.12 * dy) < 1e-9, 'leaning a little'); });
  const drizzle = streaks(run(wx({ fall: 'drizzle', amount: 0.6 })));
  assert.ok(drizzle.length > 0 && drizzle.every(([, , , dy]) => dy >= 3 && dy <= 7), 'drizzle is finer');
  const snow = run(wx({ fall: 'snow', amount: 0.65 })).filter(op => op[0] === 'arc');
  assert.ok(snow.length > 0 && snow.every(op => op[3] >= 0.7 && op[3] <= 2.4), 'snow is flakes');
  assert.strictEqual(run(wx({ fall: 'snow', amount: 0.65 })).filter(op => op[0] === 'lineTo').length, 0);
  // Two strips: every drop drawn at the same place in each, so the canvas
  // can slide one strip down and look the same.
  const two = streaks(run(wx({ fall: 'rain', amount: 0.65 }), 2));
  const key = ([x, y]) => `${x.toFixed(3)},${(((y % HY) + HY) % HY).toFixed(3)}`;
  const counts = {};
  two.forEach(s => { counts[key(s)] = (counts[key(s)] || 0) + 1; });
  assert.ok(Object.values(counts).every(c => c === 3), 'three copies of each drop, one strip apart');
  assert.ok(m.PRECIP_FALL_MS.rain < m.PRECIP_FALL_MS.drizzle && m.PRECIP_FALL_MS.drizzle < m.PRECIP_FALL_MS.snow, 'snow drifts down slowest');
  // The still picture carries the rain; the moving hero's clouds layer doesn't.
  const o = scene({ weather: wx({ low: 90, fall: 'rain', amount: 1 }) });
  assert.ok(paint(o).ops.some(op => op[0] === 'stroke'));
  assert.ok(!paint(Object.assign({}, o, { part: 'clouds' })).ops.some(op => op[0] === 'stroke'));
});

/* ---- Wiring, at source level ---- */

test('the forecast asks for the weather code, and the Console passes the hour’s weather to the painting', () => {
  const src = appScript(fs.readFileSync(INDEX, 'utf8'));
  assert.match(src, /hourly=[^`&]*weather_code/);
  assert.match(src, /skyWeather\(cloudAt\(wx, now\)\)/);
  assert.match(src, /React\.createElement\(HorizonHero, \{[^}]*weather: skyWx/);
});

test('the hero: clouds between the twinkling stars and the ground, redrawn once a second, rain on the compositor', () => {
  const src = appScript(fs.readFileSync(INDEX, 'utf8'));
  const hero = src.slice(src.indexOf('function HorizonHero('), src.indexOf('/* Place search, shared by the Console'));
  const at = s => { const i = hero.indexOf(s); assert.ok(i > 0, s); return i; };
  assert.ok(at('ref: animRef') < at('ref: cloudRef') && at('ref: cloudRef') < at('ref: precipRef') && at('ref: precipRef') < at('ref: groundRef'));
  assert.match(hero, /ts - lastCloud < 1000/);
  assert.match(hero, /drift\(performance\.now\(\)\); schedule\(\);/, 'the idle tick drifts the clouds too');
  assert.match(hero, /duration: PRECIP_FALL_MS\[weather\.fall\]/);
  // The welcome and the share picture paint the same weather.
  assert.strictEqual((hero.match(/mw: mwPaint \? \{ img: mwPaint, alpha: 0\.55 \* mwVis \} : null, weather/g) || []).length, 2);
  // The welcome's scene is new every tick; its clouds are laid out only
  // when the forecast or the screen changes, not once a second.
  const welcome = src.slice(src.indexOf('function WelcomeSky('), src.indexOf('function HorizonHero('));
  assert.match(welcome, /const clouds = useMemo\(\(\) => o\.weather \? cloudPuffs\([^;]*\[o\.weather, size\.w, ph, o\.lat, o\.lon\]\)/);
  assert.match(welcome, /reserve: null, clouds \}/);
});

test('the privacy policy says what the forecast is for', () => {
  const p = fs.readFileSync(path.join(__dirname, '..', '..', 'privacy.html'), 'utf8');
  assert.match(p, /weather painted/);
});
