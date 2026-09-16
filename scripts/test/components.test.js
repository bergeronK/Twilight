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
