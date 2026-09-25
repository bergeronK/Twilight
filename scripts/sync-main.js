#!/usr/bin/env node
'use strict';
/*
 * Bring the current branch up to date with main, settling the conflicts
 * every pull request has with every other one:
 *
 *   - the CSP <meta> line in index.html (each branch's script hashes differ,
 *     and a branch may have added a connect-src host),
 *   - `const BUILD = "vN"` in index.html,
 *   - `const CACHE = 'twilight-vN'` in sw.js.
 *
 * The CSP line becomes the union of both sides' sources, directive by
 * directive (script-src is regenerated from the scripts afterwards anyway);
 * BUILD and CACHE become the branch's number if it is already above main's,
 * otherwise main's plus one, the same in both files. Any other conflict is
 * left in place for a person, and the script stops without committing.
 *
 *   node scripts/sync-main.js            # fetch, merge origin/main, settle, commit, verify, test
 *   node scripts/sync-main.js --no-test  # the same without the test suite
 *
 * It never pushes.
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CSP_LINE = /^<meta http-equiv="Content-Security-Policy" content="[^"]*" \/>$/;
const BUILD_LINE = /^const BUILD = "v(\d+)";$/;
const CACHE_LINE = /^const CACHE = 'twilight-v(\d+)';$/;

// The version a branch should carry after merging main.
function nextVersion(branchV, mainV) {
  return branchV > mainV ? branchV : mainV + 1;
}

// Two CSP policies merged: every directive either side has, each with the
// sources of both (ours first, in order, without repeats).
function unionCsp(ours, theirs) {
  const parse = s => s.split(';').map(d => d.trim()).filter(Boolean).map(d => d.split(/\s+/));
  const out = parse(ours);
  for (const [name, ...srcs] of parse(theirs)) {
    const have = out.find(d => d[0] === name);
    if (!have) out.push([name, ...srcs]);
    else srcs.forEach(s => { if (!have.includes(s)) have.push(s); });
  }
  return out.map(d => d.join(' ')).join('; ');
}
const cspOf = line => /content="([^"]*)"/.exec(line)[1];

// Resolve the version-only conflict hunks in a file's text. Returns
// { text, left } where `left` counts the hunks it didn't touch.
function resolveVersionHunks(text, version) {
  let left = 0;
  const out = text.replace(/<<<<<<< [^\n]*\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> [^\n]*\n/g, (whole, a, b) => {
    const ours = a.split('\n').filter(Boolean), theirs = b.split('\n').filter(Boolean);
    const kind = l => CSP_LINE.test(l) ? 'csp' : BUILD_LINE.test(l) ? 'build' : CACHE_LINE.test(l) ? 'cache' : null;
    const kinds = [...ours, ...theirs].map(kind);
    if (!ours.length || ours.length !== theirs.length || kinds.includes(null)) { left++; return whole; }
    return ours.map((l, i) => {
      const k = kind(l);
      if (k !== kind(theirs[i])) { left = Infinity; return l; }
      if (k === 'csp') return l.replace(cspOf(l), unionCsp(cspOf(l), cspOf(theirs[i])));
      if (k === 'build') return `const BUILD = "v${version}";`;
      return `const CACHE = 'twilight-v${version}';`;
    }).join('\n') + '\n';
  });
  return { text: out, left };
}

// The build number in a revision of index.html.
function buildAt(rev) {
  const src = execSync(`git show ${rev}:index.html`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  const m = /^const BUILD = "v(\d+)";$/m.exec(src);
  if (!m) throw new Error(`no BUILD in ${rev}:index.html`);
  return +m[1];
}

function run(cmd) { console.log('$ ' + cmd); execSync(cmd, { cwd: ROOT, stdio: 'inherit' }); }

function main() {
  const test = !process.argv.includes('--no-test');
  if (execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim()) {
    console.error('✗ the working tree has changes; commit or stash them first.');
    process.exit(1);
  }
  run('git fetch origin main');
  const version = nextVersion(buildAt('HEAD'), buildAt('origin/main'));
  const merged = spawnSync('git', ['merge', 'origin/main', '--no-edit'], { cwd: ROOT, stdio: 'inherit' }).status === 0;
  const conflicted = execSync('git diff --name-only --diff-filter=U', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const stuck = [];
  for (const f of conflicted) {
    if (f !== 'index.html' && f !== 'sw.js') { stuck.push(f); continue; }
    const file = path.join(ROOT, f);
    const r = resolveVersionHunks(fs.readFileSync(file, 'utf8'), version);
    fs.writeFileSync(file, r.text);
    if (r.left) stuck.push(`${f} (${r.left === Infinity ? 'mixed' : r.left} other conflict${r.left === 1 ? '' : 's'})`);
    else run(`git add ${f}`);
  }
  // Whether or not these conflicted, the branch must end above main.
  for (const [f, re, line] of [['index.html', /^const BUILD = "v\d+";$/m, `const BUILD = "v${version}";`], ['sw.js', /^const CACHE = 'twilight-v\d+';$/m, `const CACHE = 'twilight-v${version}';`]]) {
    const file = path.join(ROOT, f), src = fs.readFileSync(file, 'utf8');
    if (!/^<<<<<<< /m.test(src)) fs.writeFileSync(file, src.replace(re, line));
  }
  if (stuck.length) {
    console.error(`\n✗ settled the version lines, but these need a person:\n  ${stuck.join('\n  ')}\n` +
      'Resolve them, then run: node scripts/update-csp-hashes.js && node scripts/verify-build.js, and commit.');
    process.exit(2);
  }
  run('node scripts/update-csp-hashes.js');
  run('node scripts/verify-build.js');
  run('git add index.html sw.js');
  if (execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim() || !merged) {
    run(`git commit --no-edit${merged ? ` -m "Build v${version}"` : ''}`);
  }
  if (test) run('node --test ' + fs.readdirSync(path.join(ROOT, 'scripts/test')).filter(n => n.endsWith('.test.js')).map(n => 'scripts/test/' + n).join(' '));
  console.log(`\n✓ up to date with main at build v${version}. Check \`git diff origin/main HEAD\`, then push.`);
}

module.exports = { nextVersion, unionCsp, resolveVersionHunks };
if (require.main === module) main();
