'use strict';
/*
 * The weather in the Console's painting (2026-09-27): the hour's forecast
 * read into clouds, fog, rain and snow, and drawn.
 *
 * What is checked against something outside the code: seen from the
 * ground, each layer covers the fraction of the sky the forecast gives
 * (directions spread evenly over the dome, and the painted pixels); every
 * WMO code Open-Meteo documents maps to what it means; clouds are lit the
 * way clouds are (paler by day, warm on the Sun's side at dusk and high
 * cloud last, silvered near the Moon, orange over a town); perspective
 * (clouds large overhead, small toward the horizon, merging on it); a wind
 * from the west carries them left in a painting facing south, low cloud
 * faster. What is checked against the design: the field repeats without a
 * seam and is made once a place, a thicker forecast only adds cloud,
 * cirrus is streaky, low cloud hides high, the drift redraws alternate
 * rows, and clouds sit over the stars and under the ground.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extract, appScript, INDEX } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'atan2', 'hx', 'toHex', 'lerpC', 'skyColors',
  'HZ_SPAN', 'panoX', 'panoY', 'hzRandom', 'MOON_MARIA', 'skyBearing', 'drawMoonDisc', 'COMPASS16', 'compass16',
  'drawHorizonScene', 'drawHorizonSky', 'drawHorizonGround', 'starGlow', 'heroMoonDisc',
  'cloudAt', 'WMO_FALL', 'skyWeather', 'CLOUD_LAYERS', 'CLOUD_TEX', 'cloudSeed', 'overcastOf', 'cloudTexKept',
  'cloudTexture', 'cloudThreshold', 'texAt', 'panoAlt', 'cloudReach', 'cloudPlaneUV', 'cloudLight', 'CLOUD_DAY',
  'CLOUD_NIGHT', 'CLOUD_LIFT', 'cloudShade', 'fogShade', 'precipShade', 'CLOUD_FIELD', 'CLOUD_RES', 'cloudGridKept',
  'cloudPixels', 'cloudCanvas', 'cloudWork', 'drawHorizonClouds', 'drawPrecip', 'paintClouds']);

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
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData(img) { ops.push(['putImageData', img, Uint8ClampedArray.from(img.data)]); },
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

/* ---- Where the clouds are ---- */

const D2R = Math.PI / 180;
const SEEDS = [[42.36, -71.06], [51.5, -0.1], [-33.9, 151.2], [64.1, -21.9], [35.7, 139.7], [19.4, -99.1]].map(([a, b]) => m.cloudSeed(a, b));
const layer = k => m.CLOUD_LAYERS.find(l => l.key === k);
// The painting's cloud opacity (0..1) at each pixel of a cw-by-ch image.
const alphas = (o, t = 0, cw = 200, ch = 118) => {
  const px = m.cloudPixels(o, W, HY, cw, ch, t), a = new Float32Array(cw * ch);
  for (let k = 0; k < a.length; k++) a[k] = px[k * 4 + 3] / 255;
  return { a, cw, ch, px };
};
const rowAlt = (j, ch) => m.panoAlt((j + 0.5) * HY / ch, HY);

test('the cloud field repeats without a seam, is made once for a place, and differs between places', () => {
  for (const key of ['low', 'mid', 'high']) {
    const t = m.cloudTexture(SEEDS[0], key), N = t.N;
    assert.strictEqual(m.cloudTexture(SEEDS[0], key), t, 'made once, then kept');
    // Across the edge where it repeats, neighbouring values differ no more
    // than neighbours inside do: no seam.
    let seam = 0, inner = 0;
    for (let j = 0; j < N; j++) {
      seam = Math.max(seam, Math.abs(t.hi[j * N] - t.hi[j * N + N - 1]), Math.abs(t.hi[j] - t.hi[(N - 1) * N + j]));
      for (let i = 0; i < N - 1; i++) inner = Math.max(inner, Math.abs(t.hi[j * N + i] - t.hi[j * N + i + 1]));
    }
    assert.ok(seam <= inner * 1.2, `${key}: a step of ${seam.toFixed(3)} at the edge, ${inner.toFixed(3)} at most inside`);
    assert.ok(t.hi.every(v => v >= 0 && v <= 1));
    // The coarser fields for far away keep the full field's mean and spread,
    // so the same threshold makes the same fraction of each cloud.
    const st = a => { let s = 0; a.forEach(v => { s += v; }); const mu = s / a.length; let q = 0; a.forEach(v => { q += (v - mu) ** 2; }); return [mu, Math.sqrt(q / a.length)]; };
    const [mh, sh] = st(t.hi);
    for (const f of [t.mid, t.lo]) { const [mu, sd] = st(f); assert.ok(Math.abs(mu - mh) < 1e-4 && Math.abs(sd - sh) < 1e-4, key); }
    assert.notDeepStrictEqual(m.cloudTexture(SEEDS[1], key).hi, t.hi, 'another place, another sky');
  }
});

test('the forecast\u2019s fraction of the field is cloud: none at 0%, all of it at 100%', () => {
  for (const key of ['low', 'mid', 'high']) {
    const t = m.cloudTexture(SEEDS[2], key);
    for (const c of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const thr = m.cloudThreshold(t, c);
      let n = 0; t.hi.forEach(v => { if (v > thr) n++; });
      assert.ok(Math.abs(n / t.hi.length - c) <= 2 / t.hi.length, `${key} ${c}: ${n / t.hi.length}`);
    }
    assert.strictEqual(m.cloudThreshold(t, 0), Infinity);
    assert.ok(t.hi.every(v => v > m.cloudThreshold(t, 1)));
  }
});

test('seen from the ground, each layer covers the forecast’s fraction of the sky', () => {
  // Directions spread evenly over the dome (equal areas) from 12 to 80
  // degrees up, at 24 places: what fraction look at cloud? One place sees
  // only a few clouds overhead, so it takes many to average out.
  const s12 = Math.sin(12 * D2R), s80 = Math.sin(80 * D2R);
  for (const key of ['low', 'mid', 'high']) {
    const hits = { 0.2: 0, 0.5: 0, 0.8: 0 };
    let tot = 0;
    for (let p = 0; p < 24; p++) {
      const seed = m.cloudSeed(-60 + p * 5.3, -170 + p * 13.7), t = m.cloudTexture(seed, key);
      const thr = [0.2, 0.5, 0.8].map(c => m.cloudThreshold(t, c));
      for (let q = 0; q < 600; q++) {
        const alt = Math.asin(s12 + (s80 - s12) * ((q * 0.6180339887) % 1)) / D2R, az = (q * 137.508) % 360;
        const [u, v] = m.cloudPlaneUV(layer(key), az, alt, 0, seed), d = m.texAt(t.hi, t.N, u, v);
        tot++;
        [0.2, 0.5, 0.8].forEach((c, i) => { if (d > thr[i]) hits[c]++; });
      }
    }
    for (const c of [0.2, 0.5, 0.8]) assert.ok(Math.abs(hits[c] / tot - c) < 0.06, `${key} ${c}: ${(hits[c] / tot).toFixed(3)} of the sky`);
  }
});

test('the painted sky shows that cloud, and a thicker forecast only adds to it', () => {
  // In the open sky (30-60 degrees up, where nothing thickens it), the
  // pixels mostly cloud are the forecast's fraction, over six places.
  for (const c of [30, 60]) {
    let n = 0, tot = 0;
    SEEDS.forEach((seed, i) => {
      const { a, cw, ch } = alphas(scene({ weather: wx({ low: c }), lat: [42.36, 51.5, -33.9, 64.1, 35.7, 19.4][i], lon: [-71.06, -0.1, 151.2, -21.9, 139.7, -99.1][i] }));
      for (let j = 0; j < ch; j++) { const alt = rowAlt(j, ch); if (alt < 30 || alt > 60) continue; for (let x = 0; x < cw; x++) { tot++; if (a[j * cw + x] > 0.5 * layer('low').a) n++; } }
    });
    assert.ok(Math.abs(n / tot - c / 100) < 0.12, `${c}%: ${(n / tot).toFixed(3)} of the open sky`);
  }
  // Every pixel at least as cloudy at 50% as at 30%.
  const thin = alphas(scene({ weather: wx({ low: 30, mid: 20 }) })).a, thick = alphas(scene({ weather: wx({ low: 50, mid: 40 }) })).a;
  thin.forEach((v, k) => assert.ok(thick[k] >= v - 1 / 255, `pixel ${k}: ${thick[k]} < ${v}`));
  // None at all under a clear forecast.
  assert.ok(alphas(scene({ weather: wx({}) })).a.every(v => v === 0));
});

test('perspective: large clouds overhead, small toward the horizon, merging on it', () => {
  // The average run of cloud or clear along a row, 55 degrees up and 10.
  const run = (a, cw, j) => { let runs = 0, prev = null; for (let x = 0; x < cw; x++) { const c = a[j * cw + x] > 0.45; if (c !== prev) { runs++; prev = c; } } return cw / runs; };
  let hi = 0, lo = 0;
  SEEDS.forEach((seed, i) => {
    const { a, cw, ch } = alphas(scene({ weather: wx({ low: 40 }), lat: [42.36, 51.5, -33.9, 64.1, 35.7, 19.4][i] }));
    const rowFor = alt => { let best = 0; for (let j = 0; j < ch; j++) if (Math.abs(rowAlt(j, ch) - alt) < Math.abs(rowAlt(best, ch) - alt)) best = j; return best; };
    hi += run(a, cw, rowFor(55)); lo += run(a, cw, rowFor(10));
  });
  assert.ok(hi > 2 * lo, `runs ${(hi / 6).toFixed(1)} px overhead, ${(lo / 6).toFixed(1)} px low`);
  // But whole clouds, not speckle: far off, where a pixel spans many
  // texels, the finest detail gives way to coarser (it broke into blocks).
  // Along the rows 8 and 12 degrees up, low and middle cloud, the mean step
  // in opacity from pixel to pixel: 0.115 with that, 0.151 without.
  assert.ok(lo / 6 >= 4, `runs of ${(lo / 6).toFixed(1)} px 10 degrees up`);
  let rough = 0;
  SEEDS.forEach((seed, i) => {
    const { a, cw, ch } = alphas(scene({ weather: wx({ low: 40, mid: 30 }), sunAlt: 20, sun: { az: 180, alt: 20 }, moon: { az: 0, alt: -10, illum: 0 }, bortle: 3, lat: [42.36, 51.5, -33.9, 64.1, 35.7, 19.4][i], lon: [-71.06, -0.1, 151.2, -21.9, 139.7, -99.1][i] }));
    for (const alt of [8, 12]) {
      let j = 0; for (let r = 0; r < ch; r++) if (Math.abs(rowAlt(r, ch) - alt) < Math.abs(rowAlt(j, ch) - alt)) j = r;
      let st = 0; for (let x = 0; x < cw - 1; x++) st += Math.abs(Math.round(a[j * cw + x] * 255) - Math.round(a[j * cw + x + 1] * 255)) / 255;
      rough += st / (cw - 1) / 6;
    }
  });
  assert.ok(rough < 0.13, `a step of ${rough.toFixed(3)} from pixel to pixel along the low rows`);
  // Low down the line of sight crosses more of the layer, so the same
  // cover looks thicker there.
  let a8 = 0, a45 = 0;
  SEEDS.forEach((seed, i) => {
    const { a, cw, ch } = alphas(scene({ weather: wx({ low: 40 }), sunAlt: 20, sun: { az: 180, alt: 20 }, lat: [42.36, 51.5, -33.9, 64.1, 35.7, 19.4][i], lon: [-71.06, -0.1, 151.2, -21.9, 139.7, -99.1][i] }));
    const mean = alt => { let j = 0; for (let r = 0; r < ch; r++) if (Math.abs(rowAlt(r, ch) - alt) < Math.abs(rowAlt(j, ch) - alt)) j = r; let t = 0; for (let x = 0; x < cw; x++) t += a[j * cw + x]; return t / cw; };
    a8 += mean(8) / 6; a45 += mean(45) / 6;
  });
  assert.ok(a8 > a45 + 0.12, `8 degrees up ${a8.toFixed(2)}, 45 up ${a45.toFixed(2)}`);
  // Overhead the distance to the layer keeps shrinking smoothly past 45
  // degrees but never reaches zero, where the flat painting's top row would
  // stretch a patch of cloud across its whole width.
  assert.ok(Math.abs(m.cloudReach(1, 44.99) - m.cloudReach(1, 45.01)) < 0.001);
  assert.ok(m.cloudReach(1, 60) < m.cloudReach(1, 45) && m.cloudReach(1, 89) > 0.2);
  // On the horizon the clouds merge into an even band, as thick as the cover.
  const { a, cw, ch } = alphas(scene({ weather: wx({ low: 40 }) }));
  for (let j = 0; j < ch; j++) {
    if (rowAlt(j, ch) > 1.5 || rowAlt(j, ch) <= 0) continue;
    for (let x = 0; x < cw; x++) assert.ok(Math.abs(a[j * cw + x] - layer('low').a * 0.6) < 2 / 255, `row ${j}`);
  }
});

test('cirrus is streaky, along the wind', () => {
  const corrOf = t => (di, dj) => {
    const N = t.N;
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = t.hi[j * N + i], y = t.hi[((j + dj) % N) * N + ((i + di) % N)];
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    }
    const n = N * N;
    return (sxy / n - sx * sy / n / n) / Math.sqrt((sxx / n - (sx / n) ** 2) * (syy / n - (sy / n) ** 2));
  };
  const corr = corrOf(m.cloudTexture(SEEDS[0], 'high'));
  assert.ok(corr(6, 0) > corr(0, 6) + 0.2, `along ${corr(6, 0).toFixed(2)}, across ${corr(0, 6).toFixed(2)}`);
  // Low cloud is not.
  const low = corrOf(m.cloudTexture(SEEDS[0], 'low'));
  assert.ok(Math.abs(low(6, 0) - low(0, 6)) < 0.15, `low: ${low(6, 0).toFixed(2)} and ${low(0, 6).toFixed(2)}`);
});

test('a wind from the west carries the clouds left across a painting facing south, low cloud fastest', () => {
  for (const key of ['low', 'mid', 'high']) {
    const [u0, v0] = m.cloudPlaneUV(layer(key), 150, 30, 0, 5), [u1, v1] = m.cloudPlaneUV(layer(key), 150, 30, 100, 5);
    assert.ok(Math.abs((u1 - u0) + layer(key).wind * 100 / layer(key).P) < 1e-9 && Math.abs(v1 - v0) < 1e-12, `${key} moves east`);
  }
  // Where a pixel's cloud has gone a minute later: the best match of a row
  // 40 degrees up, over the middle of the view.
  const shift = key => {
    const o = scene({ weather: wx({ [key]: 50 }), sunAlt: 30, sun: { az: 180, alt: 30 } });
    const A = alphas(o, 0), B = alphas(o, 60), { cw, ch } = A;
    let j = 0; for (let r = 0; r < ch; r++) if (Math.abs(rowAlt(r, ch) - 40) < Math.abs(rowAlt(j, ch) - 40)) j = r;
    let best = 0, bestErr = Infinity;
    for (let s = -20; s <= 20; s++) {
      let e = 0;
      for (let x = 60; x < 140; x++) for (let dj = -2; dj <= 2; dj++) e += (A.a[(j + dj) * cw + x] - B.a[(j + dj) * cw + x + s]) ** 2;
      if (e < bestErr) { bestErr = e; best = s; }
    }
    return best;
  };
  const low = shift('low'), high = shift('high');
  assert.ok(low < 0 && high < 0, `left: low ${low}, high ${high}`);
  assert.ok(-low > -high, `low cloud moves further: ${low} vs ${high}`);
});

test('low cloud is nearest: where it is thick it hides the cloud above', () => {
  const o = over => scene(Object.assign({ sunAlt: 30, sun: { az: 180, alt: 30 } }, over));
  const lowOnly = alphas(o({ weather: wx({ low: 50 }) })), both = alphas(o({ weather: wx({ low: 50, mid: 60, high: 60 }) }));
  let checked = 0;
  for (let k = 0; k < lowOnly.a.length; k++) {
    if (lowOnly.a[k] < 0.94) continue;
    checked++;
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(both.px[k * 4 + c] - lowOnly.px[k * 4 + c]) <= 16, `pixel ${k}`);
  }
  assert.ok(checked > 500, `${checked} thick pixels`);
});

test('the drift redraws alternate rows and leaves the others as they were', () => {
  const o = scene({ weather: wx({ low: 50, high: 30 }) }), cw = 100, ch = 60;
  const full = m.cloudPixels(o, W, HY, cw, ch, 30);
  for (const rows of [0, 1]) {
    const out = new Uint8ClampedArray(cw * ch * 4).fill(7);
    m.cloudPixels(o, W, HY, cw, ch, 30, out, rows);
    for (let j = 0; j < ch; j++) for (let q = 0; q < cw * 4; q++) {
      const k = j * cw * 4 + q;
      assert.strictEqual(out[k], (j & 1) === rows ? full[k] : 7, `row ${j}`);
    }
  }
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

test('a scene’s first drawing is whole; after that, the rows asked for', () => {
  const o = scene({ weather: wx({ low: 50 }) }), base = {};
  // The pixels the drawing last put on its cloud canvas.
  const drawn = g => { const cv = cloudLays(g)[0][1]; return cv.ctx.ops.filter(op => op[0] === 'putImageData').pop()[2]; };
  const same = (x, y, what) => { assert.strictEqual(x.length, y.length); for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) assert.fail(`${what}: byte ${k} is ${x[k]}, not ${y[k]}`); };
  const cw = Math.ceil(W * m.CLOUD_RES), ch = Math.ceil(HY * m.CLOUD_RES);
  const first = drawn(paint(Object.assign({}, o, { part: 'clouds', cloudT: 0, cloudScene: base, cloudRows: 1 })));
  same(first, m.cloudPixels(o, W, HY, cw, ch, 0), 'a new scene is worked out whole');
  const second = drawn(paint(Object.assign({}, o, { part: 'clouds', cloudT: 60000, cloudScene: base, cloudRows: 0 })));
  const later = m.cloudPixels(o, W, HY, cw, ch, 60);
  for (let j = 0; j < ch; j++) {
    const row = x => x.slice(j * cw * 4, (j + 1) * cw * 4);
    same(row(second), row((j & 1) === 0 ? later : first), `row ${j}`);
  }
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

test('rain, drizzle and snow: how much, what shape, and held still', () => {
  const run = w => { const g = recCtx(); m.drawPrecip(g, W, HY, w, m.hzRandom(7), '200,200,200'); return g.ops; };
  assert.strictEqual(run(null).length, 0);
  assert.strictEqual(run(wx({ low: 90 })).length, 0, 'cloud without rain');
  const streaks = ops => { const out = []; ops.forEach((op, i) => { if (op[0] === 'moveTo' && ops[i + 1] && ops[i + 1][0] === 'lineTo') out.push([op[1], op[2], ops[i + 1][1] - op[1], ops[i + 1][2] - op[2]]); }); return out; };
  const heavy = streaks(run(wx({ fall: 'rain', amount: 1 }))), light = streaks(run(wx({ fall: 'rain', amount: 0.35 })));
  const n = a => Math.round(a * W * HY / 650);
  assert.strictEqual(heavy.length, n(1), 'each drop drawn once');
  assert.strictEqual(light.length, n(0.35));
  heavy.forEach(([, y, dx, dy]) => { assert.ok(dy >= 8 && dy <= 20); assert.ok(Math.abs(dx + 0.12 * dy) < 1e-9, 'leaning a little'); assert.ok(y + dy <= HY + 1e-9, 'no streak runs past the horizon'); });
  const drizzle = streaks(run(wx({ fall: 'drizzle', amount: 0.6 })));
  assert.ok(drizzle.length > 0 && drizzle.every(([, , , dy]) => dy >= 3 && dy <= 7), 'drizzle is finer');
  const snow = run(wx({ fall: 'snow', amount: 0.65 })).filter(op => op[0] === 'arc');
  assert.ok(snow.length > 0 && snow.every(op => op[3] >= 0.7 && op[3] <= 2.4), 'snow is flakes');
  assert.strictEqual(run(wx({ fall: 'snow', amount: 0.65 })).filter(op => op[0] === 'lineTo').length, 0);
  // The still picture carries the rain, and so does the moving hero's
  // clouds layer, over the clouds; the sky and ground layers don't.
  const o = scene({ weather: wx({ low: 90, fall: 'rain', amount: 1 }) });
  const rained = g => g.ops.some(op => op[0] === 'stroke' && /^rgba/.test(op[1]));
  assert.ok(rained(paint(o)));
  const layer = part => paint(Object.assign({}, o, { part }));
  assert.ok(rained(layer('clouds')));
  assert.ok(!rained(layer('sky')) && !rained(layer('ground')));
  const cl = layer('clouds').ops, lay = cl.findIndex(op => op[0] === 'drawImage' && op[1] && op[1].ctx);
  assert.ok(lay >= 0 && lay < cl.findIndex(op => op[0] === 'stroke'), 'the rain over the clouds');
  // Held still: the once-a-second redraw puts every drop where it was.
  const drops = t => streaks(paint(Object.assign({}, o, { part: 'clouds', cloudT: t })).ops);
  assert.deepStrictEqual(drops(0), drops(60000));
});

/* ---- Wiring, at source level ---- */

test('the forecast asks for the weather code, and the Console passes the hour’s weather to the painting', () => {
  const src = appScript(fs.readFileSync(INDEX, 'utf8'));
  assert.match(src, /hourly=[^`&]*weather_code/);
  assert.match(src, /skyWeather\(cloudAt\(wx, now\)\)/);
  assert.match(src, /React\.createElement\(HorizonHero, \{[^}]*weather: skyWx/);
});

test('the hero: clouds between the twinkling stars and the ground, redrawn once a second, rain still', () => {
  const src = appScript(fs.readFileSync(INDEX, 'utf8'));
  const hero = src.slice(src.indexOf('function HorizonHero('), src.indexOf('/* Place search, shared by the Console'));
  const at = s => { const i = hero.indexOf(s); assert.ok(i > 0, s); return i; };
  assert.ok(at('ref: animRef') < at('ref: cloudRef') && at('ref: cloudRef') < at('ref: groundRef'));
  assert.match(hero, /ts - lastCloud < 1000/);
  assert.match(hero, /drift\(performance\.now\(\)\); schedule\(\);/, 'the idle tick drifts the clouds too');
  assert.doesNotMatch(hero, /\.animate\(/, 'no drop is animated');
  // The welcome and the share picture paint the same weather.
  assert.strictEqual((hero.match(/mw: mwPaint \? \{ img: mwPaint, alpha: 0\.55 \* mwVis \} : null, weather/g) || []).length, 2);
  // Each drawing shows the clouds where they are now, and the drift asks
  // for alternate rows of the same scene.
  const welcome = src.slice(src.indexOf('function WelcomeSky('), src.indexOf('function HorizonHero('));
  assert.match(welcome, /reserve: null, cloudT: Date\.now\(\)/);
  assert.match(hero, /weather, cloudT: Date\.now\(\)/);
  assert.match(hero, /paintClouds\(cc, c\.w, c\.H, c\.o, Date\.now\(\)\)/);
  const paintSrc = src.slice(src.indexOf('function paintClouds('), src.indexOf('function paintClouds(') + 600);
  assert.match(paintSrc, /cloudScene: o, cloudRows: n & 1/);
});

test('the privacy policy says what the forecast is for', () => {
  const p = fs.readFileSync(path.join(__dirname, '..', '..', 'privacy.html'), 'utf8');
  assert.match(p, /weather painted/);
});
