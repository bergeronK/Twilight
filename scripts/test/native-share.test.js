'use strict';
/*
 * Two bugs from the owner's iPhone (app build v153, 2026-10-02):
 * - The Console's Share did nothing. The web view's navigator.share didn't
 *   bring up a sheet, and the clipboard fallback failed silently; the link it
 *   would have sent was capacitor://localhost. The owner chose to leave that
 *   link out of the apps (twilyte.info will become the apps' website, not the
 *   web app). "Share tonight's sky" had the same problem, and its download
 *   fallback has nowhere to save to in an app, so its picture now goes to
 *   iOS's own share sheet through TwilyteSharePlugin (AppDelegate.swift).
 * - Sky View's sensor readout sat at a fixed height under the first row of
 *   buttons, so when they wrapped to two rows (a phone) it covered the
 *   Sensors button that closes it. It is now the top bar's last row, like
 *   Find's list, with its own Close button.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extract, declSource } = require('./extract.js');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SWIFT = read('native/ios/App/App/AppDelegate.swift');
const PLIST = read('native/ios/App/App/Info.plist');

function withWindow(w, fn) {
  const saved = global.window;
  global.window = w;
  try { return fn(); } finally { global.window = saved; }
}
const app = plugins => ({ Capacitor: { getPlatform: () => 'ios', Plugins: plugins } });

test('the share sheet is the iPhone app’s plugin, and nothing on the website', () => {
  const { nativeShare } = extract(['nativeShare']);
  const plugin = { share() {} };
  assert.strictEqual(withWindow({}, nativeShare), null, 'website');
  assert.strictEqual(withWindow(app({}), nativeShare), null, 'an app without the plugin');
  assert.strictEqual(withWindow({ Capacitor: { getPlatform: () => 'android', Plugins: { TwilyteShare: plugin } } }, nativeShare), null, 'Android has no such plugin');
  assert.strictEqual(withWindow(app({ TwilyteShare: plugin }), nativeShare), plugin);
});

test('the Share link is the website’s only: the apps have no link to give', () => {
  // twilyte.info is to become the apps' website and stop serving the web app
  // (owner, 2026-10-02), so a link sent from an app would land on the wrong
  // thing. The apps share tonight's sky as a picture instead.
  const html = read('index.html');
  const link = html.match(/(.{0,40})React\.createElement\("div", \{\s*style: \{[^}]*\}\s*\},\s*React\.createElement\("button", \{\s*onClick: doShare,/);
  assert.ok(link, 'the Share link');
  assert.match(link[1], /!window\.Capacitor && $/);
  // On the website it is as it was: the page's own address with this place.
  assert.match(declSource('doShare'), /url = `\$\{location\.origin\}\$\{location\.pathname\}\?lat=/);
});

// "Share tonight's sky", with a canvas that records how it was asked for the picture.
function card({ plugin, canShare }) {
  const { shareSkyCard, nativeShare } = extract(['shareSkyCard', 'nativeShare']);
  const asked = [];
  const cv = {
    getContext: () => ({}),
    toDataURL: t => { asked.push('dataURL ' + t); return 'data:image/png;base64,iVBORw0KGgo='; },
    toBlob: (cb, t) => { asked.push('blob ' + t); cb({ size: 1 }); }
  };
  const saved = {};
  for (const k of ['window', 'document', 'navigator', 'drawShareCard', 'File', 'URL']) saved[k] = Object.getOwnPropertyDescriptor(global, k);
  const set = (k, v) => Object.defineProperty(global, k, { value: v, configurable: true, writable: true });
  set('window', plugin ? app({ TwilyteShare: plugin }) : {});
  const clicked = [];
  set('document', {
    createElement: t => t === 'canvas' ? cv : { click() { clicked.push(this.download); }, remove() {} },
    body: { appendChild() {} }
  });
  set('navigator', { canShare: canShare && (() => true), share: () => Promise.resolve() });
  set('drawShareCard', () => asked.push('drawn'));
  set('File', function File(parts, name) { this.name = name; });
  set('URL', { createObjectURL: () => 'blob:x', revokeObjectURL() {} });
  const restore = () => { for (const k in saved) saved[k] ? Object.defineProperty(global, k, saved[k]) : delete global[k]; };
  return shareSkyCard({ place: 'Boston', head: 'Dark skies and the Moon is down' })
    .then(r => { restore(); return { r, asked, clicked }; }, e => { restore(); throw e; });
}

test('in the iPhone app the sky picture goes to the share sheet, as PNG data', async () => {
  const calls = [];
  const plugin = { share: o => { calls.push(o); return Promise.resolve({ completed: true }); } };
  const { r, asked, clicked } = await card({ plugin });
  assert.strictEqual(r, 'shared');
  assert.deepStrictEqual(asked, ['drawn', 'dataURL image/png']);
  assert.deepStrictEqual(calls, [{ image: 'iVBORw0KGgo=', text: 'Boston: Dark skies and the Moon is down. twilyte.info' }]);
  assert.deepStrictEqual(clicked, [], 'no download link in the app');
  const closed = await card({ plugin: { share: () => Promise.resolve({ completed: false }) } });
  assert.strictEqual(closed.r, 'cancelled', 'closing the sheet saves nothing and says nothing');
});

test('on the website the sky picture is shared as a file, or saved', async () => {
  const shared = await card({ canShare: true });
  assert.strictEqual(shared.r, 'shared');
  assert.deepStrictEqual(shared.asked, ['drawn', 'blob image/png']);
  const saved = await card({});
  assert.strictEqual(saved.r, 'saved');
  assert.deepStrictEqual(saved.clicked, ['twilyte-tonight.png']);
});

test('the Swift plugin is registered under the name the page looks for', () => {
  assert.match(SWIFT, /@objc\(TwilyteSharePlugin\)\npublic class TwilyteSharePlugin: CAPPlugin, CAPBridgedPlugin \{/);
  assert.match(SWIFT, /public let jsName = "TwilyteShare"/);
  assert.match(SWIFT, /CAPPluginMethod\(name: "share", returnType: CAPPluginReturnPromise\)/);
  assert.match(SWIFT, /@objc func share\(_ call: CAPPluginCall\)/);
  for (const key of ['image', 'text', 'url']) assert.ok(SWIFT.includes(`call.getString("${key}")`), key);
  assert.match(SWIFT, /Data\(base64Encoded: b64\)/);
  assert.match(SWIFT, /call\.resolve\(\["completed": completed\]\)/);
  // An iPad shows the sheet as a popover, and UIKit throws if it has no anchor.
  assert.match(SWIFT, /popoverPresentationController \{\s*pop\.sourceView = vc\.view\s*pop\.sourceRect = /);
  assert.match(SWIFT, /DispatchQueue\.main\.async/);
  const vc = SWIFT.slice(SWIFT.indexOf('class TwilyteBridgeViewController'));
  assert.match(vc, /bridge\?\.registerPluginInstance\(TwilyteMotionPlugin\(\)\)/);
  assert.match(vc, /bridge\?\.registerPluginInstance\(TwilyteSharePlugin\(\)\)/);
});

test('Save Image in the sheet has the photo permission it needs', () => {
  // Without it iOS stops the app the moment Save Image is tapped.
  assert.match(PLIST, /<key>NSPhotoLibraryAddUsageDescription<\/key>\s*<string>[^<]{20,}<\/string>/);
  assert.doesNotMatch(PLIST, /NSPhotoLibraryUsageDescription/, 'add-only: the app never reads photos');
  assert.match(read('docs/app-store-privacy-answers.md'), /NSPhotoLibraryAddUsageDescription/);
});

test('Sky View’s sensor readout sits under the buttons and can be closed from itself', () => {
  const dome = declSource('SkyDome');
  const bar = dome.indexOf('// Top bar');
  const bottom = dome.indexOf('// Bottom status');
  const find = dome.indexOf('findOpen && React.createElement(\'div\'');
  const panel = dome.indexOf('diag && diag.open && React.createElement(\'div\'');
  assert.ok(bar > 0 && find > bar && panel > find && bottom > panel, 'the readout follows the Find list');
  // Inside the bar, not after it: count the bar's brackets up to the panel.
  let depth = 0;
  for (const c of dome.slice(dome.indexOf('React.createElement(\'div\'', bar), panel)) {
    if (c === '(') depth++; else if (c === ')') depth--;
  }
  assert.strictEqual(depth, 1, 'the readout is a child of the top bar');
  const body = dome.slice(panel, bottom);
  assert.match(body, /flexBasis: '100%'/);
  assert.doesNotMatch(body, /position: 'absolute'|\+ 52px/, 'a fixed height covered the Sensors button');
  assert.match(body, /React\.createElement\('button', \{ onClick: diag\.onToggle, 'aria-label': 'Close sensor details'[^}]*\} \}, 'Close'\)/);
});
