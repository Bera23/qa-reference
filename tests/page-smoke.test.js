'use strict';
// Loads the real script.js on a handful of representative pages (index, a plain content page, a
// heavy-code page, and every page with special init behavior — Q&A/quiz, interview, live
// coding, templates, cheat sheet) and asserts DOMContentLoaded finishes with zero uncaught
// errors. This is the cheapest test in the suite and the one most likely to catch "I broke
// something on a page I wasn't specifically testing."
const { VirtualConsole } = require('jsdom');
const { distFiles, loadPage, ready, check, summary } = require('./helpers');

const allPages = distFiles(/^s\d\d\.html$/);
const pages = ['index.html', 's01.html', 's12.html', 's15.html', 's18.html', 's24.html', 's25.html', 's27.html', 's28.html']
  .filter(p => p === 'index.html' || allPages.includes(p));

(async () => {
  for (const page of pages) {
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => errors.push((e.detail && e.detail.message) || e.message || String(e)));
    const dom = loadPage(page, { virtualConsole: vc });
    await ready(dom);
    check(`${page}: no runtime errors`, errors.length === 0, errors.length ? errors[0].slice(0, 120) : '');
  }
  summary();
})();
