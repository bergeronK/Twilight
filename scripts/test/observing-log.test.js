'use strict';
/*
 * The observing log: what you've marked as seen, kept in this browser only.
 * The store, the key rule (a Messier number for deep-sky objects, else the
 * name), the Stars tab's log and checklist, and Sky View's button, rendered
 * with a stub React.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const m = extract(['parseSeen', 'toggleSeen', 'seenKey', 'logSummary']);
const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(c => c != null && c !== false) }) };
const textOf = n => n == null || typeof n === 'boolean' ? '' : typeof n !== 'object' ? String(n) : n.children.map(textOf).join('');
const all = (n, pred, out = []) => { if (n && typeof n === 'object') { if (pred(n)) out.push(n); n.children.forEach(c => all(c, pred, out)); } return out; };

test('what is stored survives junk, and only well-formed entries are kept', () => {
  assert.deepStrictEqual(m.parseSeen(null), {});
  assert.deepStrictEqual(m.parseSeen('not json'), {});
  assert.deepStrictEqual(m.parseSeen('[1,2]'), {});
  assert.deepStrictEqual(m.parseSeen('{"M31": 1760000000000, "Jupiter": "yesterday", "x": -1, "' + 'y'.repeat(50) + '": 5}'), { M31: 1760000000000 });
});

test('marking and unmarking, without touching the old log', () => {
  const a = {}, b = m.toggleSeen(a, 'M31', 100), c = m.toggleSeen(b, 'M31', 200);
  assert.deepStrictEqual(a, {});
  assert.deepStrictEqual(b, { M31: 100 });
  assert.deepStrictEqual(c, {});
  // Marking again keeps nothing of the first time: a fresh mark, a fresh date.
  assert.deepStrictEqual(m.toggleSeen(c, 'M31', 300), { M31: 300 });
});

test('keys: the Messier number for a galaxy, the name for everything else', () => {
  assert.strictEqual(m.seenKey({ kind: 'dso', id: 'M31', name: 'Andromeda Galaxy' }), 'M31');
  assert.strictEqual(m.seenKey({ kind: 'planet', name: 'Jupiter' }), 'Jupiter');
  assert.strictEqual(m.seenKey({ kind: 'const', id: 'Ori', name: 'Orion' }), 'Orion');
  assert.strictEqual(m.seenKey(null), null);
});

test('the store persists, tells its readers, and carries on without storage', () => {
  const mk = storage => new Function('localStorage', declSource('parseSeen') + declSource('toggleSeen') + declSource('seenStore') + '\nreturn seenStore;')(storage);
  const mem = {};
  const store = mk({ getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } });
  let told = 0;
  const off = store.subscribe(() => told++);
  store.toggle('M42');
  assert.ok(JSON.parse(mem.tw_seen).M42 > 0);
  assert.strictEqual(told, 1);
  store.toggle(null);
  assert.strictEqual(told, 1, 'nothing to mark, nothing said');
  off(); store.toggle('M42');
  assert.strictEqual(told, 1);
  assert.deepStrictEqual(JSON.parse(mem.tw_seen), {});
  // A private window whose storage throws still marks, for this visit.
  const broken = mk({ getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } });
  broken.toggle('Jupiter');
  assert.ok(broken.get().Jupiter);
});

test('the log in words', () => {
  assert.match(m.logSummary({}), /^Nothing yet\. In Sky View, pick something and tap “I’ve seen it”/);
  assert.strictEqual(m.logSummary({ Jupiter: 1 }), 'You’ve marked 1 thing as seen.');
  assert.strictEqual(m.logSummary({ Jupiter: 1, M31: 2, M45: 3 }), 'You’ve marked 3 things as seen, 2 of them from the Messier list of galaxies, nebulae and clusters.');
});

test('the Stars tab: the count, what else was seen, and the checklist of 110', () => {
  const Log = new Function('React', 'logSummary', declSource('ObservingLog') + '\nreturn ObservingLog;')(React, m.logSummary);
  const seen = { M31: 3, Saturn: 2, Orion: 1, M45: 4 };
  let toggled = null, opened = 0;
  const shut = Log({ seen, names: { M31: 'Andromeda Galaxy' }, open: false, onOpen: () => opened++, onToggle: k => { toggled = k; } });
  assert.match(textOf(shut), /Seen: Orion, Saturn\./, 'in the order they were seen');
  const btn = all(shut, n => n.type === 'button');
  assert.strictEqual(btn.length, 1);
  assert.strictEqual(textOf(btn[0]), 'Messier checklist, 2 of 110');
  btn[0].props.onClick();
  assert.strictEqual(opened, 1);
  const open = Log({ seen, names: { M31: 'Andromeda Galaxy' }, open: true, onOpen: () => {}, onToggle: k => { toggled = k; } });
  const grid = all(open, n => n.type === 'button').slice(1);
  assert.strictEqual(grid.length, 110);
  assert.strictEqual(grid[30].props['aria-label'], 'M31, Andromeda Galaxy: seen');
  assert.strictEqual(grid[30].props['aria-pressed'], true);
  assert.strictEqual(grid[0].props['aria-label'], 'M1');
  grid[41].props.onClick();
  assert.strictEqual(toggled, 'M42');
});

test('Sky View offers it once something is picked, and Find says what you have seen', () => {
  const sd = declSource('SkyDome');
  assert.match(sd, /onClick: \(\) => seenStore\.toggle\(seenKey\(target\)\), 'aria-pressed': !!seen\[seenKey\(target\)\]/);
  assert.match(sd, /target\.kind !== 'sun' && React\.createElement\('div', \{ \.\.\.keepTap/);
  assert.match(sd, /seen\[it\.id \|\| it\.name\] \? React\.createElement\('span'/);
  assert.match(declSource('findList'), /items: deep\.map\(b => \(\{ name: b\.name, id: b\.id,/);
  assert.match(declSource('StarFinder'), /React\.createElement\(ObservingLog, \{\n\s+seen, open: logOpen/);
});
