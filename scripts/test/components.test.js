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
 * Only hook-free components can be tested this way — anything calling
 * useState or useMemo needs a real React runtime. That is also a reason to
 * prefer extracting hook-free markup in the first place.
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
