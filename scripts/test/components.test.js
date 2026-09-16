'use strict';
/*
 * Smoke tests for presentational components lifted out of the big three.
 *
 * There is no render harness in this repo and no browser in CI, so the usual
 * way to check an extraction — load the page and look — is not available.
 * What is available: a React function component is just a function that
 * returns createElement output. Calling it with a stubbed React executes
 * every line of its body, so anything the extraction failed to pass down
 * surfaces immediately as a ReferenceError or a TypeError on undefined.
 *
 * That is the specific risk when you lift markup out of a component: the
 * moved code silently loses a closure variable it used to see. This catches
 * exactly that, which is why these are worth having even though they assert
 * very little about appearance.
 *
 * Components that use hooks can still be rendered once by handing them
 * stand-in hooks: state returns its initial value, effects never run, memos
 * compute immediately. That exercises the render body — which is where a
 * missing variable would throw — but not anything an effect does, and not a
 * second render. It is a smoke test, not a render harness.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { declSource } = require('./extract.js');

// Minimal React stand-in: records the tree instead of rendering it.
const React = {
  createElement: (type, props, ...children) => ({
    type, props: props || {},
    children: children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false)
  })
};

// Stubbed rather than extracted: the real `C` shares its name with a local
// in solarParams, and a component smoke test should not care what the palette
// actually is — only that every token it reaches for resolves to something.
const C = new Proxy({}, { get: (_, k) => (typeof k === 'string' ? 'token(' + k + ')' : undefined) });

function build(name, deps) {
  const names = Object.keys(deps);
  return new Function(...names, declSource(name) + `\nreturn ${name};`)(...names.map(n => deps[n]));
}

// Walk a rendered tree collecting every string leaf.
function textOf(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node.children || []).map(textOf).join(' ');
}
function walk(node, fn) {
  if (!node || typeof node !== 'object') return;
  fn(node);
  (node.children || []).forEach(c => walk(c, fn));
}

test('TwilightBands renders without needing anything it was not given', () => {
  // The whole point: if the extraction dropped a closure variable, calling
  // the function throws here rather than blanking the Console in the field.
  const TwilightBands = build('TwilightBands', { React, C });
  const tree = TwilightBands();
  assert.ok(tree && tree.type, 'component should return an element');
  assert.strictEqual(tree.type, 'section');
});

test('TwilightBands still names all three twilight bands', () => {
  const TwilightBands = build('TwilightBands', { React, C });
  const text = textOf(TwilightBands());
  for (const band of ['Civil', 'Nautical', 'Astronomical']) {
    assert.ok(text.includes(band), `the ${band} band went missing from the legend`);
  }
  // The degree ranges are the substance of the legend, not decoration.
  for (const range of ['0°', '−6°', '−12°', '−18°']) {
    assert.ok(text.includes(range), `the range ${range} went missing`);
  }
});

test('each band keeps its explanatory sentence', () => {
  // The names and ranges come from one field and the prose from another, so
  // asserting only the names leaves half the legend unguarded.
  const TwilightBands = build('TwilightBands', { React, C });
  const text = textOf(TwilightBands());
  for (const phrase of ['photographers', 'navigation stars', 'deep-sky']) {
    assert.ok(text.includes(phrase), `a band description went missing (looking for "${phrase}")`);
  }
  // Three descriptions, each a real sentence rather than an empty node.
  const sentences = text.split('.').filter(t => t.trim().length > 30);
  assert.ok(sentences.length >= 3, `expected 3 band descriptions, found ${sentences.length}`);
});

test('TwilightBands resolves its design tokens', () => {
  // A dropped `C` would not throw — C.inkDim would just be undefined and the
  // colours would silently vanish — so check the tokens actually landed.
  const TwilightBands = build('TwilightBands', { React, C });
  let sawToken = false;
  walk(TwilightBands(), n => {
    const s = n.props && n.props.style;
    if (s && typeof s.color === 'string' && s.color.length) sawToken = true;
    if (s) for (const v of Object.values(s)) {
      assert.ok(v !== undefined, `a style value came out undefined: ${JSON.stringify(n.props.style)}`);
    }
  });
  assert.ok(sawToken, 'expected at least one resolved colour token');
});

test('every band row carries a key', () => {
  // Lifting a .map() out of a component is where keys get lost.
  const TwilightBands = build('TwilightBands', { React, C });
  const rows = [];
  walk(TwilightBands(), n => { if (n.props && n.props.key) rows.push(n.props.key); });
  assert.strictEqual(rows.length, 3, `expected 3 keyed band rows, got ${rows.length}`);
  assert.strictEqual(new Set(rows).size, 3, 'band keys must be unique');
});

// ---------------------------------------------------------------- Sky View

const O = require('./orient-lib.js');
const hooks = {
  useState: v => [typeof v === 'function' ? v() : v, () => {}],
  useRef: v => ({ current: v === undefined ? null : v }),
  useEffect: () => {},
  useMemo: f => f()
};
function renderSkyDome(props) {
  const SkyDome = build('SkyDome', {
    React, ...hooks,
    useSkyFov: () => 63,
    prefStore: { setSkyFov: () => {} },
    SKY_FOV_DEFAULT: 63,
    compass16: az => 'N',
    quatFromEuler: O.quatFromEuler, viewBasis: O.viewBasis,
    toScreen: O.toScreen, skyProject: O.skyProject, atan2: O.atan2
  });
  return SkyDome(Object.assign({
    bodies: [{ name: 'Moon', az: 120, alt: 30, kind: 'moon', mag: -12 }],
    viewQ: O.quatFromEuler(240, 120, 0),
    screenAngle: 0, targetName: 'Moon',
    onPick: () => {}, onClose: () => {}, sensorMsg: null, relativeHeading: false
  }, props));
}
const diagProp = open => ({
  open, onToggle: () => {}, onCopy: () => {}, copyLabel: 'Copy',
  entries: [['Fusion', 'gyro + compass'], ['Aimed at', 'az 120° · alt 30°'], ['App says move', 'turn 0° right · tilt 0° up']],
  summary: 'Sensors are working.'
});
const find = (tree, pred) => { let hit = null; walk(tree, n => { if (!hit && pred(n)) hit = n; }); return hit; };

test('Sky View renders with the sensor panel closed and offers a Sensors button', () => {
  const tree = renderSkyDome({ diag: diagProp(false) });
  const btn = find(tree, n => n.type === 'button' && textOf(n).trim() === 'Sensors');
  assert.ok(btn, 'Sky View should have a Sensors button');
  assert.strictEqual(btn.props['aria-expanded'], false);
  assert.ok(!textOf(tree).includes('gyro + compass'), 'the readout should be hidden while closed');
});

test('Sky View shows every readout row when the panel is open', () => {
  const tree = renderSkyDome({ diag: diagProp(true) });
  const text = textOf(tree);
  for (const k of ['Fusion', 'gyro + compass', 'Aimed at', 'App says move', 'Sensors are working.']) {
    assert.ok(text.includes(k), `open panel is missing "${k}"`);
  }
  assert.ok(find(tree, n => n.type === 'button' && textOf(n).trim() === 'Copy'), 'the panel needs a Copy button');
  assert.ok(text.includes('Centre Moon on screen'), 'with a target, the panel should say what to do');
});

test('without a target the panel says how to get one', () => {
  const tree = renderSkyDome({ diag: diagProp(true), targetName: null });
  assert.ok(textOf(tree).includes('Pick a target in Aim Assist'));
});

test('Sky View still renders with no diagnostics passed at all', () => {
  const tree = renderSkyDome({ diag: undefined });
  assert.ok(!find(tree, n => n.type === 'button' && textOf(n).trim() === 'Sensors'),
    'no diag prop, no Sensors button');
});

test('Sky View renders in drag-to-look mode with no sensors', () => {
  const tree = renderSkyDome({ viewQ: null, diag: diagProp(true) });
  assert.ok(tree && tree.type === 'div');
});

test('a press on any Sky View button never reaches the sky beneath', () => {
  // The overlay treats a press-and-release as "identify what is here", and
  // clears the target when nothing is. So every button needs some ancestor,
  // below the overlay itself, that stops the press — or tapping Camera or
  // Sensors silently drops the Aim Assist target.
  const tree = renderSkyDome({ diag: diagProp(true) });
  const guarded = n => {
    if (typeof n.props.onTouchStart !== 'function' || typeof n.props.onMouseDown !== 'function') return false;
    let t = false, m = false;
    n.props.onTouchStart({ stopPropagation: () => { t = true; } });
    n.props.onMouseDown({ stopPropagation: () => { m = true; } });
    return t && m;
  };
  const buttons = [];
  (function visit(node, chain) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'button') buttons.push({ node, chain });
    (node.children || []).forEach(c => visit(c, node === tree ? chain : chain.concat(node)));
  })(tree, []);
  assert.ok(buttons.length >= 4, `expected Back, Camera, Sensors and Copy, found ${buttons.length}`);
  for (const { node, chain } of buttons) {
    assert.ok(chain.some(guarded), `"${textOf(node).trim()}" can leak a tap to the sky`);
  }
  // And the overlay itself must still be the one handling taps on the sky.
  assert.strictEqual(typeof tree.props.onTouchStart, 'function');
});

// ---------------------------------------------------------------- the readout rows

/* diagEntries is computed on every render of the Stars tab, open or not, so
   an error in it would blank the whole tab. Evaluated from the shipped source
   across the states a phone can be in. */
const entriesFor = new Function(
  'orient', 'aimNow', 'aimTarget', 'aimTurn', 'aimTilt', 'decl', 'aimOffset', 'headingCorr',
  'screenAngle', 'sensorStats', 'dl', 'window', 'DeviceOrientationEvent', 'loc', 'BUILD',
  declSource('turnWord') + '\n' + declSource('tiltWord') + '\n' + declSource('diagEntries') + '\nreturn diagEntries;'
);
const base = {
  orient: null, aimNow: null, aimTarget: null, aimTurn: null, aimTilt: null,
  decl: { deg: -12.4, stale: false }, aimOffset: 0, headingCorr: 0, screenAngle: 0,
  sensorStats: null, dl: null, window: {}, DeviceOrientationEvent: undefined,
  loc: { lat: 40.71, lon: -74.01 }, BUILD: 'test'
};
const rows = over => {
  const a = Object.assign({}, base, over);
  return entriesFor(a.orient, a.aimNow, a.aimTarget, a.aimTurn, a.aimTilt, a.decl, a.aimOffset,
    a.headingCorr, a.screenAngle, a.sensorStats, a.dl, a.window, a.DeviceOrientationEvent, a.loc, a.BUILD);
};
const asMap = r => Object.fromEntries(r);

test('the readout builds before any sensor has spoken', () => {
  const r = rows({});
  assert.ok(r.every(e => Array.isArray(e) && e.length === 2), 'every row is a [label, value] pair');
  const m = asMap(r);
  assert.strictEqual(m['Fusion'], '—');
  assert.ok(!('App says move' in m), 'no target, no error row');
  assert.ok(r.every(([, v]) => typeof v === 'string' && !v.includes('undefined') && !v.includes('NaN')),
    `a row rendered undefined or NaN: ${JSON.stringify(r)}`);
});

test('the readout reports a fused view and the error against a target', () => {
  const m = asMap(rows({
    orient: { q: [0, 0, 0, 1], abs: true, magnetic: true, frame: 'rel', yaw: 33.25, haveRel: true, trusted: true, northKind: 'abs' },
    aimNow: { az: 118.6, alt: 31.2, stable: true },
    aimTarget: { name: 'Moon', az: 120.4, alt: 29.9 },
    aimTurn: -12.3, aimTilt: 4.4, aimOffset: 5, headingCorr: -7.4, screenAngle: 90,
    sensorStats: { rel: 40, abs: 38, usable: 78, last: null },
    dl: { type: 'deviceorientation', absolute: false, alpha: 10.5, beta: 101.2, gamma: -3.1, wk: null }
  }));
  assert.strictEqual(m['Fusion'], 'gyro + compass');
  assert.strictEqual(m['North offset'], '33.3° (confirmed)');
  assert.strictEqual(m['North source'], 'absolute orientation');
  assert.match(m['Aimed at'], /az 119° · alt 31°/);
  assert.match(m['Target'], /Moon · az 120° · alt 30°/);
  assert.strictEqual(m['App says move'], 'turn 12° left · tilt 4° up');
  assert.strictEqual(m['Heading reference'], 'magnetic (declination applied)');
  assert.strictEqual(m['Declination'], '12.4° W');
  assert.strictEqual(m['Total applied'], '-7.4°');
  assert.strictEqual(m['Screen angle'], '90°');
  assert.ok(!('webkitCompassHeading' in m), 'no compass heading row when the event had none');
});

test('the readout distinguishes the fusion modes', () => {
  assert.strictEqual(asMap(rows({ orient: { abs: true, magnetic: true, frame: 'abs', yaw: null } }))['Fusion'], 'compass only');
  const guess = asMap(rows({ orient: { abs: true, magnetic: false, frame: 'rel', yaw: 12, trusted: false, northKind: 'heading' } }));
  assert.strictEqual(guess['North offset'], '12.0° (first guess)');
  assert.match(guess['North source'], /screen facing up/);
  const rel = asMap(rows({ orient: { abs: false, magnetic: false, frame: 'rel', yaw: null } }));
  assert.strictEqual(rel['Fusion'], 'gyro only (no north yet)');
  assert.strictEqual(rel['Heading reference'], 'arbitrary (relative)');
  assert.strictEqual(rel['North offset'], '—');
});

test('a flat phone with a target has no tilt in the error row', () => {
  const m = asMap(rows({
    orient: { abs: true, magnetic: false, frame: 'rel', yaw: 0 },
    aimNow: { az: 10, alt: -80, stable: false },
    aimTarget: { name: 'Vega', az: 40, alt: 60 }, aimTurn: 30, aimTilt: null
  }));
  assert.strictEqual(m['App says move'], 'turn 30° right');
  assert.match(m['Aimed at'], /\(flat\)/);
  assert.strictEqual(m['Heading reference'], 'true north');
});

test('Sky View puts a north warning above everything else', () => {
  const msg = 'Finding north — lower the phone flat for a moment.';
  const tree = renderSkyDome({ diag: diagProp(false), northMsg: msg });
  const text = textOf(tree);
  assert.ok(text.includes(msg), 'the north message should be shown');
  assert.ok(text.indexOf(msg) < text.indexOf('Moon ·'), 'and before the target line');
});

test('Sky View shows no north warning when north is settled', () => {
  const text = textOf(renderSkyDome({ diag: diagProp(false), northMsg: null }));
  assert.ok(!text.includes('first guess') && !text.includes('Finding north') && !text.includes('no true-north'));
});

test('Sky View does not show a north warning in drag-to-look mode', () => {
  // With no sensors there is no north to find; the drag hint is what matters.
  const text = textOf(renderSkyDome({ viewQ: null, targetName: null, northMsg: 'Finding north — x', diag: diagProp(false) }));
  assert.ok(!text.includes('Finding north'));
  assert.ok(text.includes('drag to look around'));
});
