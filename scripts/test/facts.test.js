'use strict';
/*
 * The Twilight Almanac: facts.json and the deck that deals from it.
 *
 * The deck's promise to the reader is "none repeats until you've read them
 * all", across visits. Its failure mode is quiet: a deck that repeats early
 * still shows a perfectly good fact every time, so nobody notices until they
 * have seen the same one three times in a week. These tests play whole
 * rounds, reload the deck from JSON the way localStorage would, and change
 * the list underneath it.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extract, appScript, INDEX } = require('./extract.js');

const { drawFact } = extract(['drawFact']);
const FACTS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'facts.json'), 'utf8'));

// A seeded generator, so a failure reproduces.
const rng = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

test('facts.json: every fact is complete, and ids and titles are unique', () => {
  assert.ok(FACTS.length >= 330, `expected the tripled almanac, got ${FACTS.length}`);
  const ids = new Set(), titles = new Set();
  for (const f of FACTS) {
    assert.deepStrictEqual(Object.keys(f).sort(), ['body', 'id', 'tag', 'title'], f.id);
    assert.match(f.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `id is a slug: ${f.id}`);
    assert.ok(!ids.has(f.id), `duplicate id ${f.id}`);
    assert.ok(!titles.has(f.title.toLowerCase()), `duplicate title ${f.title}`);
    ids.add(f.id); titles.add(f.title.toLowerCase());
    assert.ok(f.tag.length > 0 && f.tag.length <= 16, `tag fits its chip: ${f.tag}`);
    assert.ok(f.title.length <= 70, `title fits: ${f.title}`);
    assert.ok(f.body.length >= 80 && f.body.length <= 480, `body length: ${f.id} (${f.body.length})`);
    assert.ok(!/'|"/.test(f.title + f.body), `straight quotes in ${f.id}`);
  }
});

test('the app fetches facts.json, and it is precached and bundled', () => {
  assert.ok(appScript(fs.readFileSync(INDEX, 'utf8')).includes("fetch('facts.json')"));
  const root = path.join(__dirname, '..', '..');
  assert.ok(fs.readFileSync(path.join(root, 'sw.js'), 'utf8').includes("'/facts.json'"), 'sw.js ASSETS');
  assert.ok(fs.readFileSync(path.join(root, 'native', 'sync-web.js'), 'utf8').includes("'facts.json'"), 'native bundle');
});

// Draw n facts, storing the deck as JSON between draws the way the app does.
function play(ids, n, stored, rand) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = drawFact(ids, stored === undefined ? null : JSON.parse(stored), rand);
    out.push(d.id);
    stored = JSON.stringify(d.deck);
  }
  return { out, stored };
}

test('no fact repeats until every fact has been shown, even across reloads', () => {
  const ids = FACTS.map(f => f.id);
  const r = rng(7);
  let stored;
  for (let round = 0; round < 3; round++) {
    // Each "visit" reads a few facts, then the page reloads from storage.
    const seenThisRound = [];
    while (seenThisRound.length < ids.length) {
      const visit = play(ids, Math.min(5, ids.length - seenThisRound.length), stored, r);
      stored = visit.stored;
      seenThisRound.push(...visit.out);
    }
    assert.strictEqual(new Set(seenThisRound).size, ids.length, `round ${round} repeated a fact`);
  }
});

test('the last fact of a round is never the first of the next', () => {
  const ids = ['a', 'b', 'c'];
  for (let seed = 1; seed < 200; seed++) {
    const r = rng(seed);
    const { out } = play(ids, 30, undefined, r);
    for (let i = 1; i < out.length; i++) assert.notStrictEqual(out[i], out[i - 1], `seed ${seed}, draw ${i}`);
  }
});

test('a fact added later is unseen; a removed one is forgotten', () => {
  const r = rng(3);
  let { out, stored } = play(['a', 'b', 'c', 'd'], 3, undefined, r);
  const left = ['a', 'b', 'c', 'd'].filter(x => !out.includes(x))[0];
  // Remove one already seen and add two new ones: the round goes on with
  // the one left plus the two new, and nothing seen comes back first.
  const next = ['a', 'b', 'c', 'd', 'e', 'f'].filter(x => x !== out[0]);
  const more = play(next, 3, stored, r);
  assert.deepStrictEqual(new Set(more.out), new Set([left, 'e', 'f']));
  const deck = JSON.parse(more.stored);
  assert.ok(!deck.seen.includes(out[0]), 'the removed id is dropped from storage');
});

test('whatever storage held, the deck still deals', () => {
  const ids = ['a', 'b'];
  for (const junk of [null, 'x', 42, {}, { seen: 'a' }, { seen: [1, null, 'zzz'], last: 'q' }, []]) {
    const d = drawFact(ids, junk, rng(1));
    assert.ok(ids.includes(d.id), JSON.stringify(junk));
  }
  assert.strictEqual(drawFact([], null, Math.random), null);
  assert.strictEqual(drawFact(['only'], { seen: ['only'], last: 'only' }, Math.random).id, 'only');
});
