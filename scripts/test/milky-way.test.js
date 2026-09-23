'use strict';
/*
 * The Milky Way: milkyway.bin, and the three inverse projections that sample
 * it for the Console painting, the Stars tab's chart and Sky View.
 *
 * The data is checked against the galaxy rather than against the file: the
 * brightest part must be toward the galactic centre in Sagittarius, the
 * galactic poles must be empty, and nearly all of the glow must lie close to
 * the galactic plane. A decoder that transposed the grid, or flipped RA,
 * would still produce a tidy band, just across the wrong part of the sky.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extract } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'asin', 'atan2', 'rev', 'gmst', 'jd', 'starHcZn',
  'decodeMilkyWay', 'mwLevel', 'horizToEq', 'milkyWayField', 'milkyWayVisibility',
  'chartXY', 'chartDir', 'quatFromEuler', 'quatAxis', 'quatRotate', 'quatMul', 'viewBasis', 'toScreen', 'skyProject',
  'vecAz', 'screenDir', 'BORTLE',
  'HZ_SPAN', 'panoX', 'panoY', 'hzRandom', 'COMPASS16', 'compass16', 'drawMoonDisc', 'heroMoonDisc',
  'drawHorizonScene', 'drawHorizonSky', 'drawHorizonGround']);

const MW = m.decodeMilkyWay(new Uint8Array(fs.readFileSync(path.join(__dirname, '..', '..', 'milkyway.bin'))));

// Galactic latitude of an equatorial point (J2000 north galactic pole).
const galLat = (ra, dec) => m.asin(m.sin(dec) * m.sin(27.128) + m.cos(dec) * m.cos(27.128) * m.cos(ra - 192.859));

test('milkyway.bin decodes to a whole-sky 1° grid', () => {
  assert.ok(MW, 'decoded');
  assert.strictEqual(MW.W, 360);
  assert.strictEqual(MW.H, 180);
  assert.strictEqual(MW.v.length, 360 * 180);
  assert.ok(Math.max(...MW.v) === 250, 'the brightest isophote is present');
});

test('the band lies along the galactic plane, brightest toward the centre', () => {
  // Sagittarius, toward the galactic centre (RA 266.4, Dec -28.9), is among
  // the brightest parts; both galactic poles are dark.
  // (The centre itself is behind dust; the star clouds around it are the
  // brightest part of the whole band.)
  let peak = 0;
  for (let ra = 260; ra <= 280; ra++) for (let dec = -35; dec <= -18; dec++) peak = Math.max(peak, m.mwLevel(MW, ra, dec));
  assert.ok(peak > 0.9, `Sagittarius peak ${peak}`);
  assert.strictEqual(m.mwLevel(MW, 192.86, 27.13), 0);
  assert.strictEqual(m.mwLevel(MW, 12.86, -27.13), 0);
  // Weighted by brightness, the glow sits within 20° of the plane.
  let near = 0, all = 0;
  for (let j = 0; j < MW.H; j++) for (let i = 0; i < MW.W; i++) {
    const v = MW.v[j * MW.W + i];
    if (!v) continue;
    all += v;
    if (Math.abs(galLat(i + 0.5, j - 89.5)) < 20) near += v;
  }
  assert.ok(near / all > 0.95, `${(100 * near / all).toFixed(1)}% near the plane`);
  // Cygnus (Deneb's neighbourhood) is in it, Orion's belt is not.
  assert.ok(m.mwLevel(MW, 305, 40) > 0.2);
  assert.strictEqual(m.mwLevel(MW, 83, -1), 0);
});

test('horizToEq undoes starHcZn', () => {
  const d = new Date('2026-08-13T02:30:00Z');
  const lat = 44.26, lon = -72.58, lst = m.rev(m.gmst(d) + lon);
  for (const [ra, dec] of [[10, 20], [266.4, -28.9], [310, 45], [180, -60], [0, 89]]) {
    const h = m.starHcZn(ra, dec, lat, lon, d);
    const e = m.horizToEq(h.az, h.alt, lat, lst);
    assert.ok(Math.abs(e.dec - dec) < 1e-6, `dec ${dec}`);
    if (Math.abs(dec) < 89) assert.ok(Math.abs(((e.ra - ra + 540) % 360) - 180) < 1e-6, `ra ${ra}`);
  }
});

test('the chart and Sky View samplers are the inverses of their projections', () => {
  for (const [az, alt] of [[0, 45], [90, 10], [200, 70], [315, 1]]) {
    const p = m.chartXY(az, alt, 1);
    const d = m.chartDir(p.x, p.y, 1);
    assert.ok(Math.abs(d.alt - alt) < 1e-9 && Math.abs(((d.az - az + 540) % 360) - 180) < 1e-9, `${az}/${alt}`);
  }
  assert.strictEqual(m.chartDir(0.8, 0.8, 1), null, 'outside the disc');
  const basis = m.viewBasis(m.quatFromEuler(40, 100, 10), 0);
  const w = 390, h = 844, fov = 63;
  for (const [az, alt] of [[320, 30], [330, 20], [310, 45]]) {
    const p = m.skyProject(m.toScreen(basis, az, alt), w, h, fov);
    assert.ok(p, 'on screen');
    const d = m.screenDir(basis, p.x, p.y, w, h, fov);
    assert.ok(Math.abs(d.alt - alt) < 1e-6 && Math.abs(((d.az - az + 540) % 360) - 180) < 1e-6, `${az}/${alt}`);
  }
});

test('how much of it shows: all under a dark sky, none in a bright suburb', () => {
  assert.strictEqual(m.milkyWayVisibility(6.3), 1);
  assert.strictEqual(m.milkyWayVisibility(m.BORTLE[7].nelm), 0);
  assert.strictEqual(m.milkyWayVisibility(-10), 0, 'daylight');
  const b5 = m.milkyWayVisibility(m.BORTLE[5].nelm), b6 = m.milkyWayVisibility(m.BORTLE[6].nelm);
  assert.ok(b5 > b6 && b6 > 0 && b5 < 1, 'washed out in between');
});

test('milkyWayField samples where each cell looks, weighted', () => {
  const lst = 0, lat = 0;
  const f = m.milkyWayField(MW, 2, 1, i => i ? null : { az: 0, alt: 90, w: 0.5 }, lat, lst);
  // Overhead at the equator with LST 0 is RA 0, Dec 0, which is not in the band.
  assert.strictEqual(f[0], 0);
  assert.strictEqual(f[1], 0, 'a null cell stays empty');
  // With LST at the galactic centre's RA and the observer at its Dec, the
  // zenith is the centre: its level, halved by the weight.
  const g = m.milkyWayField(MW, 1, 1, () => ({ az: 0, alt: 90, w: 0.5 }), -28.9, 266.4);
  assert.ok(Math.abs(g[0] - 0.5 * m.mwLevel(MW, 266.4, -28.9)) < 1e-3);
});

test('the painting draws the band when there is one to draw, under the stars', () => {
  const calls = [];
  const grad = { addColorStop() {} };
  const g = new Proxy({ createRadialGradient: () => grad, createLinearGradient: () => grad, measureText: t => ({ width: t.length * 6 }) }, {
    get(t, k) { if (k in t) return t[k]; return (...a) => calls.push([k, a]); },
    set(t, k, v) { if (k === 'globalAlpha') calls.push(['alpha', [v]]); t[k] = v; return true; }
  });
  const img = { tag: 'mw' };
  const o = {
    sky: { s: '#000', m: '#000', h: '#000' }, sunAlt: -30, sun: { az: 0, alt: -30 },
    moon: { az: 0, alt: -30, illum: 0 }, facing: 180,
    stars: [{ az: 180, alt: 40, mag: 3 }], planets: [], bortle: 2, lat: 44, lon: -72,
    mw: { img, alpha: 0.4 }
  };
  m.drawHorizonScene(g, 400, 380, Object.assign({}, o, { part: 'sky' }));
  const di = calls.findIndex(c => c[0] === 'drawImage' && c[1][0] === img);
  const star = calls.findIndex(c => c[0] === 'arc');
  assert.ok(di >= 0, 'drawn');
  assert.ok(di < star, 'before the stars, so they sit on it');
  calls.length = 0;
  m.drawHorizonScene(g, 400, 380, Object.assign({}, o, { part: 'sky', mw: { img, alpha: 0 } }));
  assert.ok(!calls.some(c => c[0] === 'drawImage'), 'not when the sky is too bright');
});
