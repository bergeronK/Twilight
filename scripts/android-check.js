#!/usr/bin/env node
'use strict';
/*
 * Asks the Android app's web view, in an emulator, what it is showing:
 * through Chrome DevTools (a debug build allows it; the job forwards the
 * web view's socket to port 9222), with Node 22's own WebSocket, so nothing
 * to install. Used by .github/workflows/android-build.yml.
 *
 *   node scripts/android-check.js page            the app is up, as the app
 *   node scripts/android-check.js welcome          the first-run welcome shows
 *   node scripts/android-check.js welcome-closed   and back closed it
 *
 * Prints what it found and exits 1 when a check fails.
 */
const PORT = process.env.CDP_PORT || 9222;
const what = process.argv[2] || 'page';

async function evaluate(expression) {
  const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = pages.find(p => p.type === 'page' && /^https?:\/\/localhost/.test(p.url));
  if (!page) throw new Error('no app page among ' + JSON.stringify(pages.map(p => p.url)));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  const reply = await new Promise((ok, fail) => {
    ws.onmessage = m => { const r = JSON.parse(m.data); if (r.id === 1) ok(r); };
    ws.onerror = fail;
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  });
  ws.close();
  if (reply.result.exceptionDetails) throw new Error(JSON.stringify(reply.result.exceptionDetails));
  return reply.result.result.value;
}

const STATE = `(() => {
  const text = document.body ? document.body.innerText : '';
  return {
    url: location.href,
    build: typeof BUILD === 'string' ? BUILD : null,
    mounted: !/Starting Twilyte/.test(text) && text.trim().length > 200,
    platform: window.Capacitor && window.Capacitor.getPlatform(),
    share: typeof nativeShare === 'function' && !!nativeShare(),
    calendar: typeof nativeCalendar === 'function' && !!nativeCalendar(),
    back: typeof twBack,
    dialog: !!document.querySelector('[role=dialog]')
  };
})()`;

(async () => {
  const s = await evaluate(STATE);
  console.log(what, JSON.stringify(s));
  const want = {
    page: s.mounted && s.platform === 'android' && s.share && s.calendar && s.back === 'function',
    welcome: s.mounted && s.dialog,
    'welcome-closed': s.mounted && !s.dialog
  }[what];
  if (!want) { console.error(`check "${what}" failed`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
