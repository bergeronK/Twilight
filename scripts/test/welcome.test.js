'use strict';
/*
 * The first-run welcome. Its words are the first thing Twilyte says to
 * anyone, and its one rule is that it appears once: the checks here are the
 * line itself, and the source-level wiring that makes "once" true (the flag
 * written on the way out, a deep link skipping it, the store screenshots
 * skipping it) and keeps it above the bottom tab bar.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extract, declSource } = require('./extract.js');

const { welcomeLine } = extract(['welcomeLine']);

test('the line names the place, or "you", or says it is still looking', () => {
  assert.strictEqual(welcomeLine({ name: 'Stowe, VT' }, false), 'This is the sky over Stowe right now.');
  assert.strictEqual(welcomeLine({ name: 'Your location' }, false), 'This is the sky over you right now.');
  assert.strictEqual(welcomeLine({ name: 'Boston' }, true), 'Finding your sky…');
  assert.strictEqual(welcomeLine(null, false), 'This is the sky over you right now.');
});

test('shown once: the flag is written on the way out, and a deep link skips it', () => {
  const rt = declSource('RealtimeTwilight');
  assert.match(rt, /!localStorage\.getItem\('tw_welcomed'\) && !new URLSearchParams\(window\.location\.search\)\.get\('tab'\)/);
  assert.match(rt, /localStorage\.setItem\('tw_welcomed', '1'\)/);
  assert.match(rt, /if \(pick\) setPickerOpen\(true\)/, '"Not here?" opens the place picker');
});

test('above everything, the tab bar included', () => {
  // The tab content's fade-in makes its own stacking context; only a portal
  // to <body> gets out of it.
  assert.match(declSource('WelcomeSky'), /ReactDOM\.createPortal\([\s\S]*document\.body\)/);
});

test('the store screenshots skip it', () => {
  for (const f of ['generate.js', 'generate-android.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'store-assets', f), 'utf8');
    assert.match(src, /localStorage\.setItem\('tw_welcomed', '1'\)/, f);
  }
});
