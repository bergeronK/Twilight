'use strict';
/*
 * A sideways swipe over a tab changes tab. On the owner's iPhone (v156) it
 * also fired at the end of a drag along the Ephemeris chart, whose readout
 * follows the finger along the day: lifting the finger switched to the
 * Console. Sky View, a dialog drawn inside the Stars tab, had the same
 * trouble: a sideways drag to look around closed it onto the Ephemeris
 * (checked in Chromium with touch events, before and after). Swipes now
 * start only outside such places.
 */
const test = require('node:test');
const assert = require('node:assert');
const { extract, declSource } = require('./extract.js');

const { swipeAllowed, NO_SWIPE } = extract(['NO_SWIPE', 'swipeAllowed']);

// A stand-in element: `closest` finds the nearest of itself and its
// ancestors matching the selector list, by the few attributes used here.
function el(attrs, parent) {
  const self = {
    attrs, parent,
    closest(sel) {
      const parts = sel.split(',').map(x => x.trim());
      for (let e = self; e; e = e.parent) {
        if (parts.some(p => matches(e.attrs, p))) return e;
      }
      return null;
    }
  };
  return self;
}
function matches(a, p) {
  if (p === '[data-noswipe]') return 'data-noswipe' in a;
  if (p === '[role="dialog"]') return a.role === 'dialog';
  if (p === 'input[type="range"]') return a.tag === 'input' && a.type === 'range';
  throw new Error('unexpected selector ' + p);
}

test('a swipe changes tab from the page, not from things that drag sideways themselves', () => {
  const main = el({ tag: 'main' });
  const para = el({ tag: 'p' }, main);
  assert.strictEqual(swipeAllowed(para), true, 'ordinary content');
  const chart = el({ tag: 'svg', 'data-noswipe': '' }, main);
  const line = el({ tag: 'path' }, chart);
  assert.strictEqual(swipeAllowed(line), false, 'anywhere inside the Ephemeris chart');
  const sky = el({ tag: 'div', role: 'dialog' }, main);
  assert.strictEqual(swipeAllowed(el({ tag: 'canvas' }, sky)), false, 'Sky View and the welcome');
  assert.strictEqual(swipeAllowed(el({ tag: 'input', type: 'range' }, main)), false, 'a slider');
  assert.strictEqual(swipeAllowed(el({ tag: 'input', type: 'text' }, main)), true);
  assert.strictEqual(swipeAllowed(null), true);
  assert.strictEqual(swipeAllowed({}), true, 'a target without closest (a text node in old browsers)');
  assert.strictEqual(NO_SWIPE, '[data-noswipe], [role="dialog"], input[type="range"]');
});

test('the tabs’ swipe asks first, and the chart is marked', () => {
  const app = declSource('TwilightApp');
  assert.match(app, /const handleTouchStart = e => \{ touchStart\.current = swipeAllowed\(e\.target\) \? \{ x: e\.touches\[0\]\.clientX, y: e\.touches\[0\]\.clientY \} : null; \};/);
  // A swipe that never started does nothing at the end, and the end asks swipeDir.
  assert.match(app, /const handleTouchEnd = e => \{\s*if \(touchStart\.current === null\) return;/);
  assert.match(app, /step = swipeDir\(t\.clientX - touchStart\.current\.x, t\.clientY - touchStart\.current\.y\)/);
  assert.match(declSource('TwilightEphemeris'), /touchAction: "pan-y"\s*\},\s*\/\/[^\n]*\n\s*"data-noswipe": "",\s*onMouseMove:/);
});

test('a swipe changes tab only when it is mostly sideways', () => {
  // Review, 2026-10-10: a scroll up the Ephemeris that drifted 85 px across
  // on its way 450 px up switched to the Console.
  const { swipeDir } = extract(['swipeDir']);
  assert.strictEqual(swipeDir(-85, -450), 0, 'a scroll with a drift');
  assert.strictEqual(swipeDir(-120, -30), 1, 'left: the next tab');
  assert.strictEqual(swipeDir(120, 40), -1, 'right: the one before');
  assert.strictEqual(swipeDir(60, 0), 0, 'not far enough');
  assert.strictEqual(swipeDir(-150, -100), 0, 'as much up as across');
  assert.strictEqual(swipeDir(-151, -100), 1);
});
