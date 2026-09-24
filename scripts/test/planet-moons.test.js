'use strict';
/*
 * Jupiter's moons and Saturn's rings on the Stars tab. The positions are
 * checked against PyEphem (written out by script, never typed): each moon's
 * distance from Jupiter, which side it is on, whether it is in front or
 * behind, and that all four share one rotation from PyEphem's sky-aligned
 * frame to Jupiter's equator (a single moon's error would break it). The
 * rings' tilt against PyEphem's earth_tilt and two dated facts: edge-on on
 * 23 March 2025, open 27 degrees in October 2017.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract } = require('./extract.js');

const m = extract(['D2R', 'R2D', 'sin', 'cos', 'asin', 'acos', 'atan2', 'rev', 'jd', 'gmst', 'sunAltitude', 'planetGeo', 'planetAltAz',
  'JUPITER_MOONS', 'jupiterMoons', 'moonStatus', 'jupiterWords', 'saturnRings', 'saturnWords', 'planetViewTime', 'PlanetViews']);

// PyEphem 4.2: [ms, then per moon [x east +, y south +, z toward Earth +]]
// in Jupiter radii, Io to Callisto.
const JREF = [[1767225600000,[-3.403,-0.502,4.811],[2.614,0.65,9.081],[-11.158,-1.786,9.832],[-9.586,-2.233,-24.444]],[1768578624000,[1.56,0.401,5.676],[-6.536,-1.238,-6.541],[-12.883,-2.351,-7.314],[-17.311,-3.246,-19.504]],[1769931648000,[5.371,0.868,2.249],[9.128,1.468,2.164],[2.373,-0.044,-14.836],[-22.991,-3.679,-12.089]],[1771284672000,[5.062,0.634,-2.942],[-8.78,-1.221,2.871],[14.566,1.965,-3.087],[-25.787,-3.621,-2.893]],[1772637696000,[0.726,-0.051,-5.858],[6.172,0.727,-7.158],[8.108,1.439,12.536],[-25.056,-3.168,6.981]],[1773990720000,[-4.261,-0.676,-4.051],[-1.125,0.013,9.284],[-8.495,-0.817,12.314],[-20.522,-2.389,16.158]],[1775343744000,[-5.769,-0.787,1.141],[-3.88,-0.719,-8.56],[-14.514,-2.148,-3.095],[-12.545,-1.282,23.057]],[1776696768000,[-2.413,-0.241,5.417],[8.119,1.36,4.566],[-2.94,-0.833,-14.696],[-2.242,0.171,26.252]],[1778049792000,[3.024,0.628,5.057],[-9.207,-1.595,0.601],[12.025,1.835,-8.822],[8.641,1.906,24.899]],[1779402816000,[5.8,1.104,0.262],[7.087,1.285,-6.15],[12.843,2.619,7.323],[18.098,3.71,18.986]],[1780755840000,[3.401,0.623,-4.773],[-2.394,-0.406,9],[-1.149,0.083,14.946],[24.246,5.205,9.46]],[1782108864000,[-2.042,-0.579,-5.491],[-3.29,-0.872,-8.864],[-13.646,-3.115,5.318],[25.823,5.95,-1.947]],[1783461888000,[-5.582,-1.463,-1.202],[7.582,2.019,5.038],[-10.4,-2.891,-10.413],[22.462,5.571,-13.066]],[1784814912000,[-4.018,-1.076,4.195],[-9.108,-2.587,0.349],[4.621,1.089,-14.259],[14.804,3.9,-21.695]],[1786167936000,[1.159,0.421,5.796],[6.895,2.096,-5.988],[14.259,4.35,-1.925],[4.373,1.105,-26.122]],[1787520960000,[5.241,1.732,2.184],[-2.533,-0.826,9.035],[7.695,2.658,12.591],[-6.754,-2.326,-25.454]],[1788873984000,[4.62,1.578,-3.371],[-3.248,-1.103,-8.785],[-7.536,-2.527,12.688],[-16.388,-5.668,-19.866]],[1790227008000,[-0.057,-0.043,-5.921],[7.208,2.59,5.378],[-13.96,-5.115,-1.897],[-22.69,-8.158,-10.49]],[1791580032000,[-4.607,-1.747,-3.25],[-8.864,-3.348,0.242],[-4.217,-1.636,-14.337],[-24.573,-9.182,0.74]],[1792933056000,[-5.074,-1.985,2.236],[7.061,2.802,-5.398],[10.367,4.074,-10.1],[-21.877,-8.478,11.674]],[1794286080000,[-1.171,-0.489,5.75],[-3.036,-1.319,8.895],[12.738,5.097,6.065],[-15.373,-6.182,20.294]],[1795639104000,[3.674,1.463,4.377],[-2.098,-0.712,-9.064],[-0.196,-0.152,14.96],[-6.458,-2.781,25.262]],[1796992128000,[5.45,2.224,-0.59],[6.267,2.429,6.661],[-12.916,-5.322,5.416],[3.196,1.038,26.055]],[1798345152000,[2.868,1.206,-5.051],[-8.553,-3.419,-1.79],[-9.493,-3.792,-11.013],[12.059,4.592,22.955]]];
// PyEphem 4.2: [ms, Saturn.earth_tilt in degrees].
const SREF = [[1577836800000,23.558],[1588835520000,20.512],[1599834240000,22.707],[1610832960000,20.263],[1621831680000,16.747],[1632830400000,19.399],[1643829120000,16.07],[1654827840000,12.318],[1665826560000,15.287],[1676825280000,11.16],[1687824000000,7.373],[1698822720000,10.51],[1709821440000,5.723],[1720820160000,2.068],[1731818880000,5.221],[1742817600000,-0.042],[1753816320000,-3.427],[1764815040000,-0.407],[1775813760000,-5.915],[1786812480000,-8.916],[1797811200000,-6.174],[1808809920000,-11.645],[1819808640000,-14.161],[1830807360000,-11.833],[1841806080000,-16.931],[1852804800000,-18.871],[1863803520000,-17.087],[1874802240000,-21.422],[1885800960000,-22.71],[1896799680000,-21.577]];

test('the four moons where PyEphem has them', () => {
  let worst = 0, sides = 0, fronts = 0;
  for (const [ms, ...ref] of JREF) {
    const js = m.jupiterMoons(ms);
    const rot = [];
    js.forEach((mo, i) => {
      const [x, y, z] = ref[i];
      // Our x is west-positive: east is -x. Distances don't depend on frame.
      const dr = Math.abs(Math.hypot(mo.x, mo.y) - Math.hypot(x, y));
      worst = Math.max(worst, dr);
      if (Math.abs(x) > 2) { sides++; assert.strictEqual(Math.sign(-mo.x), Math.sign(x), `${mo.name} side at ${ms}`); }
      if (Math.abs(z) > 2) { fronts++; assert.strictEqual(mo.front, z > 0, `${mo.name} front at ${ms}`); }
      if (Math.hypot(x, y) > 3) {
        const a = Math.atan2(mo.y, -mo.x), b = Math.atan2(-y, x);
        rot.push(((b - a) * 180 / Math.PI + 540) % 360 - 180);
      }
    });
    // One rotation (Jupiter's axis against celestial north) for them all.
    if (rot.length > 1) assert.ok(Math.max(...rot) - Math.min(...rot) < 3, `rotations ${rot.map(r => r.toFixed(1))} at ${ms}`);
  }
  assert.ok(worst < 0.15, `worst ${worst}`);
  assert.ok(sides > 60 && fronts > 40, `${sides} sides, ${fronts} fronts checked`);
});

test('behind, in front, and at the edge', () => {
  assert.strictEqual(m.moonStatus({ x: 0.5, y: 0.2, front: false }), 'hidden');
  assert.strictEqual(m.moonStatus({ x: 0.5, y: 0.2, front: true }), 'transit');
  assert.strictEqual(m.moonStatus({ x: 1.1, y: 0, front: false }), 'near');
  assert.strictEqual(m.moonStatus({ x: 0, y: 0.97, front: false }), 'near', 'the disc is flattened');
  assert.strictEqual(m.moonStatus({ x: -4, y: 0.1, front: true }), 'clear');
  const w = m.jupiterWords([{ name: 'Io', x: 0.3, y: 0, front: false }, { name: 'Europa', x: -1.1, y: 0, front: true },
    { name: 'Ganymede', x: 7, y: 0, front: true }, { name: 'Callisto', x: 0.2, y: 0, front: true }]);
  assert.strictEqual(w, 'Left to right: Europa, Jupiter, Ganymede. Io is behind Jupiter. Callisto is crossing in front of it, too close to the disc to pick out. Europa is right at Jupiter’s edge and hard to pick out.');
});

test('Saturn’s rings tilted as PyEphem has them, edge-on in March 2025', () => {
  for (const [ms, e] of SREF) assert.ok(Math.abs(m.saturnRings(new Date(ms)).B - e) < 0.35, `${new Date(ms).toISOString()}: ${m.saturnRings(new Date(ms)).B} vs ${e}`);
  assert.ok(Math.abs(m.saturnRings(new Date(Date.UTC(2025, 2, 23))).B) < 0.5, 'edge-on');
  assert.ok(Math.abs(m.saturnRings(new Date(Date.UTC(2017, 9, 16))).B - 27) < 0.3, 'wide open, north face');
  const r = m.saturnRings(new Date(Date.UTC(2026, 9, 4)));
  assert.ok(r.dist > 8.3 && r.dist < 8.5, 'Saturn at opposition, about 8.4 AU');
  assert.ok(Math.abs(r.disc / r.ring - 165.46 / 375.35) < 1e-9);
  assert.match(m.saturnWords({ B: 0.4 }), /almost edge-on to us \(less than a degree\)/);
  assert.match(m.saturnWords({ B: -6.6 }), /tilted only 7° .* south side/);
  assert.match(m.saturnWords({ B: 12 }), /tilted 12° .* north side/);
  assert.match(m.saturnWords({ B: 26 }), /wide open/);
});

test('shown now when it is up in the dark, else when it next is', () => {
  const lat = 42.36, lon = -71.06;
  // 10 PM in Boston, 25 Sep 2026: Saturn (opposition on the 4th) is up;
  // Jupiter rises in the small hours.
  const now = Date.UTC(2026, 8, 25, 2);
  assert.strictEqual(m.planetViewTime('Saturn', now, lat, lon), now);
  const jt = m.planetViewTime('Jupiter', now, lat, lon);
  assert.ok(jt > now && jt % (15 * 60000) === 0);
  assert.ok(m.planetAltAz('Jupiter', new Date(jt), lat, lon).alt >= 10);
  assert.ok(m.planetAltAz('Jupiter', new Date(jt - 15 * 60000), lat, lon).alt < 10 || m.sunAltitude(new Date(jt - 15 * 60000), lat, lon) > -6);
  // Noon: never "now", whatever is up.
  assert.notStrictEqual(m.planetViewTime('Saturn', Date.UTC(2026, 8, 25, 16), lat, lon), Date.UTC(2026, 8, 25, 16));
});

test('the section, drawn with a stub React', () => {
  const h = (type, props, ...kids) => ({ type, props: props || {}, kids: kids.flat(Infinity).filter(k => k !== false && k != null) });
  global.React = { createElement: h };
  const text = n => typeof n === 'string' || typeof n === 'number' ? String(n) : n ? n.kids.map(text).join('') : '';
  const find = (n, f, out = []) => { if (n && typeof n === 'object') { if (f(n)) out.push(n); n.kids.forEach(k => find(k, f, out)); } return out; };
  assert.strictEqual(m.PlanetViews({ jup: null, sat: null, when: String }), null);
  const moons = [{ name: 'Io', x: 3, y: 0, front: true }, { name: 'Europa', x: -6, y: 0.1, front: true }, { name: 'Ganymede', x: 0.2, y: 0, front: false }, { name: 'Callisto', x: 20, y: 0, front: true }];
  const tree = m.PlanetViews({ jup: { t: 1, moons }, sat: { t: 2, rings: { B: -6.6, ring: 44, disc: 19.5 } }, when: t => t === 1 ? 'now' : 'at 22:00' });
  const t = text(tree);
  assert.match(t, /Jupiter’s moonsnow/);
  assert.match(t, /Saturn’s ringsat 22:00/);
  assert.match(t, /Left to right: Europa, Jupiter, Io, Callisto\. Ganymede is behind Jupiter\./);
  // Hidden Ganymede isn't drawn; the others are, west (positive x) on the right.
  const dots = find(tree, n => n.type === 'circle');
  assert.strictEqual(dots.length, 3);
  const cx = Object.fromEntries(find(tree, n => n.type === 'g').map(g => [g.props.key, g.kids[0].props.cx]));
  assert.ok(cx.Europa < 160 && cx.Io > 160 && cx.Callisto > cx.Io);
  // Saturn: south face seen, so the far half of the ring is the bottom one,
  // drawn before the planet; the near (top) half after it.
  const sv = find(tree, n => n.type === 'svg')[1];
  assert.deepStrictEqual(sv.kids.map(k => k.type), ['path', 'ellipse', 'path']);
  assert.match(sv.kids[0].props.d, / 0 0 0 /, 'far half sweeps under');
  assert.match(sv.kids[2].props.d, / 0 0 1 /, 'near half sweeps over');
  delete global.React;
});
