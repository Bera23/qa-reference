'use strict';
const { readDist, loadPage, ready, check, summary } = require('./helpers');

(async () => {
  const dom = loadPage('index.html');
  await ready(dom);
  const d = dom.window.document;

  check('intro sections present', ['O ovom dokumentu', 'Mapa dokumenta', 'Sta nije u ovom dokumentu'].every(t => d.body.textContent.includes(t)));
  const version = d.querySelector('.doc-version');
  check('version footer rendered', !!version);
  check('version footer has a date (YYYY-MM-DD)', /azurirano: \d{4}-\d{2}-\d{2}/.test(version.textContent), version.textContent);
  check('index page still lists both Deo groups below the intro', d.body.textContent.includes('Deo I') && d.body.textContent.includes('Deo II'));
  check('no related-sections box on the index page itself', !d.getElementById('related-sections'));

  // The mini-map table cites 25.17/25.18 for the journal/lessons-learned pair — regression test
  // for the mistake caught during review (an earlier draft said "24.17", which doesn't exist).
  check('mini-map does not reference a non-existent 24.17', !d.body.textContent.includes('24.17'));
  check('mini-map correctly cites 25.17 and 25.18', d.body.textContent.includes('25.17') && d.body.textContent.includes('25.18'));

  summary();
})();
