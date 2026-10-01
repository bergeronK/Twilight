'use strict';
/*
 * The header is position: fixed (2026-10-01). It was sticky, and on iOS 26
 * Safari a sticky header counts as scrolling content: Safari blurred it under
 * the status bar, washing out the wordmark and buttons (an owner's iPhone
 * screenshot). A fixed element at the top edge is what Safari samples to paint
 * the status bar instead. A fixed header takes no room in the page, so a
 * spacer of its measured height holds it, ahead of the install banner, which
 * would otherwise sit under the header.
 */
const test = require('node:test');
const assert = require('node:assert');
const { declSource } = require('./extract.js');

const app = declSource('TwilightApp');

test('the header is fixed to the top, not sticky', () => {
  const header = app.slice(app.indexOf('React.createElement("header", {'));
  const style = header.slice(0, header.indexOf('},\n'));
  assert.match(style, /position: "fixed",\s*top: 0,\s*left: 0,\s*right: 0,/);
  assert.doesNotMatch(style, /sticky/);
  assert.match(header, /^React\.createElement\("header", \{\s*ref: headerRef,/);
});

test('a spacer holds the header’s measured height, ahead of the install banner', () => {
  assert.match(app, /const \[headerH, setHeaderH\] = React\.useState\(null\);/);
  // Measured before paint, and again when the header's size changes.
  assert.match(app, /React\.useLayoutEffect\(\(\) => \{[\s\S]*?const measure = \(\) => setHeaderH\(el\.offsetHeight\);[\s\S]*?new ResizeObserver\(measure\)/);
  const spacer = app.indexOf('React.createElement("div", { "aria-hidden": "true", style: { height: headerH == null ?');
  const banner = app.indexOf('offer && React.createElement("div", {');
  const header = app.indexOf('React.createElement("header", {');
  assert.ok(spacer > 0 && spacer < banner && banner < header, 'spacer, then the banner, then the header');
});
