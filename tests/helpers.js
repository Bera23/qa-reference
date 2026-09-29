'use strict';
// Shared helpers for tests/*.test.js. Each test file requires this, runs its own checks against
// dist/ (built by `npm test` before any test runs — see package.json), and calls summary() at
// the end, which exits the process non-zero if anything failed. tests/run.js relies on that
// exit code, so every test file MUST call summary() as its last action.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const BASE_URL = 'https://bera23.github.io/qa-reference/';

let passCount = 0;
let failCount = 0;

function check(name, ok, extra) {
  const line = (ok ? 'PASS  ' : 'FAIL  ') + name + (extra !== undefined && extra !== '' ? '  ' + extra : '');
  console.log(line);
  if (ok) passCount++; else failCount++;
  return ok;
}

function summary() {
  console.log(failCount ? `\n${failCount} FAILED, ${passCount} passed` : `\nAll ${passCount} checks passed`);
  process.exit(failCount ? 1 : 0);
}

function readDist(file) {
  return fs.readFileSync(path.join(DIST, file), 'utf8');
}

function distFiles(pattern) {
  return fs.readdirSync(DIST).filter(f => pattern.test(f));
}

// Loads a built page with its real script.js inlined and executed. beforeParse lets a test add
// its own fetch/localStorage/etc. polyfills; a fetch() stub that resolves empty JSON is always
// provided as a baseline so pages that call loadSearchIndex() don't throw when a test doesn't
// care about search.
function loadPage(page, { beforeParse, virtualConsole } = {}) {
  const html = readDist(page);
  const js = readDist('script.js');
  const withInline = html.replace('<script src="script.js"></script>', () => '<script>' + js + '</script>');
  const opts = {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: BASE_URL + page,
    beforeParse(w) {
      w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
        get() { return this.textContent; }, configurable: true,
      });
      if (beforeParse) beforeParse(w);
    },
  };
  if (virtualConsole) opts.virtualConsole = virtualConsole;
  return new JSDOM(withInline, opts);
}

// Waits for the page's load event (DOMContentLoaded init has run by then) plus a small buffer
// for any setTimeout-based work (e.g. the search debounce) to settle.
function ready(dom, extraMs) {
  return new Promise(resolve => dom.window.addEventListener('load', () => {
    setTimeout(resolve, extraMs || 50);
  }));
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { check, summary, readDist, distFiles, loadPage, ready, wait, DIST, BASE_URL };
