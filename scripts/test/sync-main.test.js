'use strict';
/*
 * scripts/sync-main.js: the version lines every branch conflicts on are
 * settled the same way by hand each time (CSP sources united, BUILD and
 * CACHE one above main), and anything else is left for a person. These
 * tests use conflict text shaped like the real ones from 2026-09-25.
 */
const test = require('node:test');
const assert = require('node:assert');
const { nextVersion, unionCsp, resolveVersionHunks } = require('../sync-main.js');

const meta = csp => `<meta http-equiv="Content-Security-Policy" content="${csp}" />`;
const hunk = (a, b) => `<<<<<<< HEAD\n${a}\n=======\n${b}\n>>>>>>> origin/main\n`;

test('the branch ends one above main, or keeps its own if already higher', () => {
  assert.strictEqual(nextVersion(121, 125), 126);
  assert.strictEqual(nextVersion(125, 125), 126);
  assert.strictEqual(nextVersion(127, 125), 127);
});

test('the CSP line keeps every source either side allows', () => {
  const ours = "default-src 'self'; script-src 'self' 'sha256-A='; connect-src 'self' https://twilyte-alerts.ken-b39.workers.dev https://celestrak.org";
  const theirs = "default-src 'self'; script-src 'self' 'sha256-B='; connect-src 'self' https://celestrak.org https://services.swpc.noaa.gov; worker-src 'self'";
  assert.strictEqual(unionCsp(ours, theirs),
    "default-src 'self'; script-src 'self' 'sha256-A=' 'sha256-B='; connect-src 'self' https://twilyte-alerts.ken-b39.workers.dev https://celestrak.org https://services.swpc.noaa.gov; worker-src 'self'");
});

test('version-only hunks are settled; anything else is left alone', () => {
  const text = 'a\n' + hunk(meta("connect-src 'self' https://x.org"), meta("connect-src 'self' https://y.org")) +
    'b\n' + hunk('const BUILD = "v121";', 'const BUILD = "v125";') + 'c\n';
  const r = resolveVersionHunks(text, 126);
  assert.strictEqual(r.left, 0);
  assert.strictEqual(r.text, 'a\n' + meta("connect-src 'self' https://x.org https://y.org") + '\nb\nconst BUILD = "v126";\nc\n');
  const sw = resolveVersionHunks(hunk("const CACHE = 'twilight-v121';", "const CACHE = 'twilight-v125';"), 126);
  assert.deepStrictEqual(sw, { text: "const CACHE = 'twilight-v126';\n", left: 0 });
  // A real code conflict stays exactly as it was, markers and all.
  const code = hunk('const x = 1;', 'const x = 2;');
  assert.deepStrictEqual(resolveVersionHunks(code, 126), { text: code, left: 1 });
  // A hunk mixing a version line with code is not guessed at either.
  const mixed = hunk('const BUILD = "v121";\nconst x = 1;', 'const BUILD = "v125";\nconst x = 2;');
  assert.strictEqual(resolveVersionHunks(mixed, 126).text, mixed);
  assert.ok(resolveVersionHunks(mixed, 126).left > 0);
});

test('the script reads the same lines the build guard and the app use', () => {
  const fs = require('fs'), path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', '..', 'sw.js'), 'utf8');
  assert.match(html, /^<meta http-equiv="Content-Security-Policy" content="[^"]*" \/>$/m);
  assert.match(html, /^const BUILD = "v\d+";$/m);
  assert.match(sw, /^const CACHE = 'twilight-v\d+';$/m);
  assert.strictEqual(/^const BUILD = "v(\d+)";$/m.exec(html)[1], /^const CACHE = 'twilight-v(\d+)';$/m.exec(sw)[1], 'BUILD and CACHE agree');
});
