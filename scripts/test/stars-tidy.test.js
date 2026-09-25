'use strict';
/*
 * The Stars tab, tidied (2026-09-25). The space station's panel listed every
 * visible pass in three days, often five to eight, two lines each: the
 * tallest thing on the tab. Now the next two are open and the rest folded.
 * The top's eyebrow named the tab by its old name, "Star Finder".
 */
const test = require('node:test');
const assert = require('node:assert');
const { declSource } = require('./extract.js');

const R = { createElement: (t, p, ...c) => ({ t, p: p || {}, c: c.flat(Infinity).filter(x => x != null && x !== false) }) };
const text = n => typeof n === 'string' || typeof n === 'number' ? String(n) : (n.c || []).map(text).join('');
const find = (n, f, out = []) => { if (n && typeof n === 'object') { if (f(n)) out.push(n); (n.c || []).forEach(k => find(k, f, out)); } return out; };
const IssPanel = new Function('React', 'issWords', `const ISS_OPEN = ${/const ISS_OPEN = (\d+);/.exec(require('fs').readFileSync(require('./extract.js').INDEX, 'utf8'))[1]}; ${declSource('IssPanel')}; return IssPanel;`)(R, p => 'rises in the west ' + p.start.t);
const pass = i => ({ start: { t: 1000 * i } });

test('the next two passes open, the rest folded', () => {
  const out = IssPanel({ passes: [1, 2, 3, 4, 5, 6].map(pass), failed: false, when: t => 'at ' + t, fmt: String });
  const fold = find(out, n => n.t === 'details');
  assert.strictEqual(fold.length, 1);
  assert.ok(!fold[0].p.open, 'shut until tapped');
  assert.strictEqual(text(find(fold[0], n => n.t === 'summary')[0]), '4 more passes in the next three days');
  // Open: 1000 and 2000; folded: the other four, in order.
  const open = text(out).split('4 more passes')[0];
  assert.match(open, /at 1000.*at 2000/);
  assert.ok(!/at 3000/.test(open));
  assert.match(text(fold[0]), /at 3000.*at 4000.*at 5000.*at 6000/);
});

test('with one to spare it says so; with two or fewer there is no fold', () => {
  const three = IssPanel({ passes: [1, 2, 3].map(pass), failed: false, when: String, fmt: String });
  assert.strictEqual(text(find(three, n => n.t === 'summary')[0]), 'One more pass in the next three days');
  for (const n of [1, 2]) assert.strictEqual(find(IssPanel({ passes: Array.from({ length: n }, (_, i) => pass(i + 1)), failed: false, when: String, fmt: String }), x => x.t === 'details').length, 0);
  assert.match(text(IssPanel({ passes: [], failed: false, when: String, fmt: String })), /doesn’t pass over/);
});

test('the top names the tab as it is', () => {
  const sf = declSource('StarFinder');
  assert.ok(!/"Star Finder"/.test(sf));
  assert.match(sf, /textTransform: "uppercase" \} \}, "Sky View"\)/);
});
