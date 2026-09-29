'use strict';
const { readDist, loadPage, ready, wait, check, summary } = require('./helpers');

const searchIndex = JSON.parse(readDist('search-index.json'));

(async () => {
  const dom = loadPage('s01.html', {
    beforeParse: w => {
      w.fetch = url => url === 'search-index.json'
        ? Promise.resolve({ json: () => Promise.resolve(searchIndex) })
        : Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    },
  });
  await ready(dom, 80);
  const d = dom.window.document;
  const window_ = dom.window;

  const chips = [...d.querySelectorAll('.search-tag')];
  check('tag chips rendered', chips.length > 5, `(${chips.length})`);
  check('chips are alphabetically sorted', chips.map(c => c.textContent).slice().sort().every((v, i) => v === chips[i].textContent));
  const flakyChip = chips.find(c => c.textContent === '#flaky');
  check('#flaky chip exists', !!flakyChip);

  flakyChip.click();
  await wait(220);
  const input = d.getElementById('search');
  check('clicking a chip fills the search box', input.value === '#flaky');
  const results = [...d.querySelectorAll('.search-result')];
  const expectedCount = searchIndex.filter(s => (s.tags || []).includes('flaky')).length;
  check('tag search result count matches the index', results.length === expectedCount, `(${results.length} vs ${expectedCount})`);
  check('tags box hides once results show', !d.getElementById('search-tags').classList.contains('visible'));
  check('search count text shown', d.getElementById('search-count').textContent.includes(String(expectedCount)));

  input.value = 'stale element';
  window_.searchDoc('stale element');
  await wait(220);
  const results2 = [...d.querySelectorAll('.search-result')];
  check('full-text search still works', results2.length > 0, `(${results2.length})`);
  check('snippet contains the searched term', results2.some(r => r.querySelector('.sr-snippet').textContent.toLowerCase().includes('stale')));

  window_.searchDoc('');
  await wait(220);
  check('empty query clears results', d.querySelectorAll('.search-result').length === 0);
  check('empty query hides the results box', !d.getElementById('search-results').classList.contains('visible'));

  window_.searchDoc('#nonexistenttag123');
  await wait(220);
  check('unknown tag gives 0 results, no crash', d.querySelectorAll('.search-result').length === 0 && d.getElementById('search-count').textContent === 'Nema');

  input.value = '';
  window_.showSearchTags();
  check('focusing an empty search shows the tag chips', d.getElementById('search-tags').classList.contains('visible'));

  summary();
})();
