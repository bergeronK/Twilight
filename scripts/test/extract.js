'use strict';
/*
 * Pulls named top-level declarations out of index.html's app script so the
 * pure math can be tested in Node.
 *
 * Why extract rather than import: index.html is deliberately a single file
 * with no build step (see CLAUDE.md), so there is no module to require and
 * no bundler to add one. Evaluating the whole app script is not an option
 * either — it ends by mounting React into `document`. Extracting the handful
 * of pure functions keeps the app exactly as it is and still gets the math
 * under test.
 *
 * The extractor is deliberately strict: it throws if a requested name is
 * missing or defined more than once. If someone renames or refactors one of
 * these functions, the tests fail loudly with "not found" rather than
 * silently testing nothing, which is the failure mode that matters here.
 */

const fs = require('fs');
const path = require('path');

const INDEX = path.join(__dirname, '..', '..', 'index.html');

// The app's own script is the last <script> block; everything before it is
// the inlined React production build and the ld+json metadata. Matching from
// the final block avoids dragging 300KB of minified React into the parse.
function appScript(html) {
  const blocks = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) blocks.push(m[1]);
  if (!blocks.length) throw new Error('no <script> blocks found in index.html');
  // The largest block is the app; the service-worker registration one-liner
  // at the end is tiny, and React's is second largest.
  return blocks.reduce((a, b) => (b.length > a.length ? b : a));
}

// Scan forward from `start` to the end of a declaration, tracking depth in
// (), {} and [] and skipping strings, template literals, regexes-as-strings
// and comments. Returns the index just past the declaration.
function endOfDecl(src, start, terminator) {
  let i = start;
  let depth = 0;
  let inS = null; // quote char when inside a string
  let inLine = false;
  let inBlock = false;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (inLine) {
      if (c === '\n') inLine = false;
      i++;
      continue;
    }
    if (inBlock) {
      if (c === '*' && n === '/') { inBlock = false; i += 2; continue; }
      i++;
      continue;
    }
    if (inS) {
      if (c === '\\') { i += 2; continue; }
      if (c === inS) inS = null;
      i++;
      continue;
    }
    if (c === '/' && n === '/') { inLine = true; i += 2; continue; }
    if (c === '/' && n === '*') { inBlock = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; i++; continue; }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') {
      depth--;
      if (depth === 0 && terminator === '}' && c === '}') return i + 1;
      if (depth < 0) throw new Error('unbalanced brackets while extracting');
    } else if (depth === 0 && terminator === ';' && c === ';') return i + 1;
    i++;
  }
  throw new Error('reached end of script while extracting');
}

// Several helpers share one statement — `const D2R = …, R2D = …;` and
// `const sin = …, cos = …;`. A name can therefore be a *continuation*
// declarator, in which case the span to extract starts at the statement's
// own const/let/var keyword, not at the name. Spans are deduped by caller so
// a shared statement is emitted once however many of its names were asked
// for.
function findDecl(src, name) {
  const fnRe = new RegExp('(^|[^\\w$])function\\s+' + name + '\\s*\\(', 'g');
  const cnRe = new RegExp('(^|[^\\w$])(?:const|let|var)\\s+' + name + '\\s*=', 'g');
  // A continuation declarator: `, NAME =` where the statement began earlier.
  const contRe = new RegExp(',\\s*' + name + '\\s*=', 'g');

  const hits = [];
  let m;
  while ((m = fnRe.exec(src)) !== null) hits.push({ kind: 'fn', at: m.index + m[1].length });
  while ((m = cnRe.exec(src)) !== null) hits.push({ kind: 'const', at: m.index + m[1].length });

  if (hits.length === 0) {
    while ((m = contRe.exec(src)) !== null) {
      const kw = lastKeywordBefore(src, m.index);
      if (kw !== -1) hits.push({ kind: 'const', at: kw });
    }
  }

  if (hits.length === 0) throw new Error(`extract: "${name}" not found in index.html`);
  if (hits.length > 1) throw new Error(`extract: "${name}" defined ${hits.length} times — ambiguous`);

  const h = hits[0];
  if (h.kind === 'fn') {
    // Skip to the opening brace of the body, then brace-match.
    const brace = src.indexOf('{', src.indexOf(')', h.at));
    return { start: h.at, end: endOfDecl(src, brace, '}') };
  }
  return { start: h.at, end: endOfDecl(src, h.at, ';') };
}

// Walk backwards to the const/let/var that opens the statement containing
// `from`. Returns -1 if a statement boundary is hit first, which means the
// comma matched something that is not a declarator continuation.
function lastKeywordBefore(src, from) {
  const head = src.slice(0, from);
  const kw = Math.max(head.lastIndexOf('const '), head.lastIndexOf('let '), head.lastIndexOf('var '));
  if (kw === -1) return -1;
  // No semicolon or brace may sit between the keyword and the comma, or the
  // comma belongs to a different statement (an argument list, say).
  if (/[;{}]/.test(src.slice(kw, from))) return -1;
  return kw;
}

/**
 * Extract `names` from an arbitrary source string and evaluate them in an
 * isolated scope. Returns an object with one property per requested name.
 *
 * Used for twilight-times/twilight-calc.js as well as index.html: that file
 * is an IIFE that ends by touching `document`, so it cannot simply be
 * required, and its functions are closure-scoped with nothing exported.
 */
function extractFrom(src, names) {
  // Dedupe by span: names sharing one statement resolve to the same start.
  const spans = [];
  for (const n of names) {
    const s = findDecl(src, n);
    if (!spans.some(p => p.start === s.start)) spans.push(s);
  }
  spans.sort((a, b) => a.start - b.start);
  const body = spans.map(s => src.slice(s.start, s.end)).join('\n') +
    '\nreturn {' + names.join(',') + '};';
  try {
    return new Function(body)();
  } catch (e) {
    throw new Error('extract: extracted source failed to evaluate — ' + e.message);
  }
}

/** Extract `names` from index.html's app script. */
function extract(names) {
  return extractFrom(appScript(fs.readFileSync(INDEX, 'utf8')), names);
}

/**
 * Return the raw source text of one declaration, so a test can wrap an
 * expression that lives inside a React component in a function of its inputs
 * and exercise the shipped code rather than a restatement of it.
 *
 * This is what lets the Sky View / Aim Assist agreement test be real: the
 * bug fixed in 05a3a16 was not inside any pure function, it was the two
 * call sites disagreeing about whether the manual heading correction had
 * been applied. A test that reimplements that composition cannot see it.
 */
function declSource(name, src) {
  const s = src || appScript(fs.readFileSync(INDEX, 'utf8'));
  const { start, end } = findDecl(s, name);
  return s.slice(start, end);
}

module.exports = { extract, extractFrom, declSource, appScript, INDEX };
