'use strict';
const { loadPage, ready, check, summary } = require('./helpers');

(async () => {
  // s15 (API testiranje) has known cross-references to Framework/CI-CD/Selenium in its own prose.
  const dom = loadPage('s15.html');
  await ready(dom);
  let d = dom.window.document;
  let box = d.getElementById('related-sections');
  let links = box ? [...box.querySelectorAll('a')] : [];
  check('s15 gets a related-sections box', !!box);
  check('s15 has at most 8 links', links.length <= 8, `(${links.length})`);
  check('s15 never links to itself', !links.some(a => /^15\./.test(a.textContent)));
  const hrefs = links.map(a => a.getAttribute('href'));
  check('no duplicate targets', new Set(hrefs).size === hrefs.length);
  check('all hrefs point to real sXX.html pages', hrefs.every(h => /^s\d\d\.html$/.test(h)));

  // index.html's content is an auto-generated TOC, not prose — it should have no cross-refs and
  // therefore no box at all (not an empty one).
  const domIndex = loadPage('index.html');
  await ready(domIndex);
  check('index.html gets no related-sections box (no prose cross-refs)', !domIndex.window.document.getElementById('related-sections'));

  summary();
})();
