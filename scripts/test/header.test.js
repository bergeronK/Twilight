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
  // The border box: the status bar's height arrives as padding, after the
  // first layout, and the content box doesn't change with it.
  assert.match(app, /ro\.observe\(el, \{ box: 'border-box' \}\);/);
  const spacer = app.indexOf('React.createElement("div", { "aria-hidden": "true", style: { height: headerH == null ?');
  const banner = app.indexOf('offer && React.createElement("div", {');
  const header = app.indexOf('React.createElement("header", {');
  assert.ok(spacer > 0 && spacer < banner && banner < header, 'spacer, then the banner, then the header');
});

/*
 * The fixed header was not enough for the installed app (2026-10-01, the
 * owner's iPhone again). With the status bar style "black-translucent" the
 * page is drawn under the status bar, and iOS 26+ lays its Liquid Glass edge
 * blur over that strip and about 35 points below it, whatever is there. With
 * "default" the page starts below an opaque bar painted in theme-color, so
 * theme-color is the header's own --bg, in red light mode too.
 */
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const meta = name => (html.match(new RegExp(`<meta name="${name}" content="([^"]*)"`)) || [])[1];
const rootBg = html.match(/:root\s*\{[\s\S]*?--bg:(#[0-9a-f]{6});/)[1];
const redBg = app.match(/redMode && React\.createElement\("style", null, `\s*#root\{\s*--bg:(#[0-9a-f]{6});/)[1];

test('the installed app starts below an opaque status bar, not under a translucent one', () => {
  assert.strictEqual(meta('apple-mobile-web-app-status-bar-style'), 'default');
  assert.doesNotMatch(html, /content="black-translucent"/);
});

test('the status bar is the header’s colour, in red light mode too', () => {
  assert.strictEqual(meta('theme-color'), rootBg);
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.theme_color, rootBg);
  const effect = app.match(/React\.useEffect\(\(\) => \{\s*const m = document\.querySelector\('meta\[name="theme-color"\]'\);\s*if \(m\) m\.setAttribute\('content', redMode \? '(#[0-9a-f]{6})' : '(#[0-9a-f]{6})'\);\s*\}, \[redMode\]\);/);
  assert.ok(effect, 'theme-color follows red light mode');
  assert.deepStrictEqual([effect[1], effect[2]], [redBg, rootBg]);
});

/*
 * The iPhone app (2026-10-02, owner's screenshot): with Capacitor's
 * contentInset "automatic" iOS started the page below the status bar and the
 * header then added the status bar's height again as padding, leaving an
 * empty band above the wordmark. "never" lets the page run under the status
 * bar as it does on the website, where the header's env() padding is the one
 * inset; the status bar's text is white over the dark header, and the web
 * view's own background is the header's colour.
 */
test('the iPhone app draws under the status bar once, with white status bar text', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'native', 'capacitor.config.json'), 'utf8'));
  assert.strictEqual(cfg.ios.contentInset, 'never');
  assert.strictEqual(cfg.backgroundColor, rootBg);
  const plist = fs.readFileSync(path.join(__dirname, '..', '..', 'native', 'ios', 'App', 'App', 'Info.plist'), 'utf8');
  assert.match(plist, /<key>UIStatusBarStyle<\/key>\s*<string>UIStatusBarStyleLightContent<\/string>/);
  assert.match(plist, /<key>UIViewControllerBasedStatusBarAppearance<\/key>\s*<true\/>/);
  // The header pads itself by the status bar's height; the page doesn't.
  assert.match(app, /paddingTop: "env\(safe-area-inset-top\)"/);
});
