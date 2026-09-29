'use strict';
const { loadPage, ready, wait, check, summary } = require('./helpers');

(async () => {
  const dom = loadPage('s24.html', {
    beforeParse: w => {
      // Blob/createObjectURL polyfill for the export test — jsdom's own localStorage works fine
      // with a real https:// url passed to JSDOM(), no polyfill needed for that part.
      w.URL.createObjectURL = b => { w.__lastBlob = b; return 'blob:mock'; };
      w.URL.revokeObjectURL = () => {};
    },
  });
  const { window } = dom;
  let alertMsg = null;

  await ready(dom);
  const d = window.document;
  window.alert = m => { alertMsg = m; };

  // ── build sanity ─────────────────────────────────────────────────────────
  const items = [...d.querySelectorAll('.qa-item')];
  check('75+ quiz items built', items.length >= 75, `(${items.length})`);
  check('every item has a data-key', items.every(i => i.dataset.key && i.dataset.key.startsWith('q-')));
  check('all keys unique', new Set(items.map(i => i.dataset.key)).size === items.length);
  check('Deo I/II/III all present among items', ['Deo I', 'Deo II', 'Deo III'].every(p => items.some(i => i.dataset.deo.startsWith(p))));
  check('rate buttons exist per item (2 each)', items[0].querySelectorAll('.qa-rate-btn').length === 2);

  // ── enter quiz mode, rate a few questions ───────────────────────────────
  const quizBtn = d.querySelector('.quiz-toggle-btn');
  check('quiz toggle button present', !!quizBtn);
  quizBtn.click();
  check('content gets quiz-active class', d.getElementById('content').classList.contains('quiz-active'));
  check('all items collapsed on entering quiz mode', items.every(i => i.classList.contains('qa-collapsed')));

  items[0].querySelector('h3').click();
  check('item 0 opens on click', !items[0].classList.contains('qa-collapsed'));
  items[0].querySelector('.qa-rate-btn.correct').click();
  check('item 0 re-collapses after rating', items[0].classList.contains('qa-collapsed'));

  items[1].querySelector('h3').click();
  items[1].querySelector('.qa-rate-btn.incorrect').click();
  items[1].querySelector('h3').click();
  items[1].querySelector('.qa-rate-btn.incorrect').click();   // rated twice: still just one entry, incorrect=2

  items[2].querySelector('h3').click();
  items[2].querySelector('.qa-rate-btn.incorrect').click();

  const stats = JSON.parse(window.localStorage.getItem('qa_quiz_stats'));
  check('stats recorded for 3 questions', Object.keys(stats).length === 3, JSON.stringify(Object.keys(stats)));
  const k0 = items[0].dataset.key, k1 = items[1].dataset.key, k2 = items[2].dataset.key;
  check('item0 correct=1,incorrect=0,lastResult=correct', stats[k0].correct === 1 && stats[k0].incorrect === 0 && stats[k0].lastResult === 'correct');
  check('item1 correct=0,incorrect=2,lastResult=incorrect', stats[k1].correct === 0 && stats[k1].incorrect === 2 && stats[k1].lastResult === 'incorrect');
  check('item2 correct=0,incorrect=1', stats[k2].correct === 0 && stats[k2].incorrect === 1);

  // ── regression: per-question Deo must not leak the LAST question's Deo (closure bug found
  // and fixed during development — currentDeo was a shared variable the .map() loop kept
  // mutating, so by the time any rating fired the whole loop had already finished and every
  // answer recorded against the final question's Deo, not its own) ──
  check('item0 deo is Deo I (not last-iteration leak)', stats[k0].deo === 'Deo I — Manuelno testiranje', stats[k0].deo);
  check('item1 deo is Deo I', stats[k1].deo === 'Deo I — Manuelno testiranje', stats[k1].deo);
  check('item2 deo is Deo I', stats[k2].deo === 'Deo I — Manuelno testiranje', stats[k2].deo);
  const lastItem = items[items.length - 1];
  lastItem.querySelector('h3').click();
  lastItem.querySelector('.qa-rate-btn.incorrect').click();
  const statsAfterLast = JSON.parse(window.localStorage.getItem('qa_quiz_stats'));
  check('last question on the page gets Deo III, not leaked onto earlier items',
    statsAfterLast[lastItem.dataset.key].deo === 'Deo III — Behavioral / Situaciona pitanja', statsAfterLast[lastItem.dataset.key].deo);
  check('rating the last question did not retroactively change item0 deo',
    JSON.parse(window.localStorage.getItem('qa_quiz_stats'))[k0].deo === 'Deo I — Manuelno testiranje');

  // ── stats panel ──────────────────────────────────────────────────────────
  const statsBtn = [...d.querySelectorAll('.quiz-toolbar-btn')].find(b => b.textContent.includes('Statistika'));
  statsBtn.click();
  const panel = d.getElementById('quiz-stats-panel');
  check('stats panel opens', panel.classList.contains('open'));
  const overall = d.querySelector('.qs-overall');
  check('overall = 25% (1 of 4 correct)', overall.textContent.includes('25%'), overall.textContent);
  const missedItems = [...d.querySelectorAll('.qs-missed li')];
  check('top-missed: 3 questions, item1 ranked first (2 incorrect)',
    missedItems.length === 3 && missedItems[0].querySelector('.qs-count').textContent.includes('2/2'), missedItems.map(x => x.textContent).join(' | '));
  check('the other two missed entries show 1/1 (attempts, not just a raw count)',
    missedItems.slice(1).every(x => x.querySelector('.qs-count').textContent.includes('1/1')));
  statsBtn.click();
  check('stats panel closes on second click', !panel.classList.contains('open'));

  // ── random subset + reset filter ────────────────────────────────────────
  const random10Btn = [...d.querySelectorAll('.quiz-toolbar-btn')].find(b => b.textContent.includes('10 nasumicnih'));
  random10Btn.click();
  const visible = items.filter(i => !i.classList.contains('qa-filtered'));
  check('random 10 shows exactly 10 items', visible.length === 10, `(${visible.length})`);
  check('random 10 items are collapsed', visible.every(i => i.classList.contains('qa-collapsed')));

  const resetFilterBtn = [...d.querySelectorAll('.quiz-toolbar-btn')].find(b => b.textContent.includes('Sve'));
  resetFilterBtn.click();
  check('reset shows all items again', items.every(i => !i.classList.contains('qa-filtered')));

  // ── weak points ──────────────────────────────────────────────────────────
  const weakBtn = [...d.querySelectorAll('.quiz-toolbar-btn')].find(b => b.textContent.includes('Slabe tacke'));
  weakBtn.click();
  const weakVisible = items.filter(i => !i.classList.contains('qa-filtered'));
  check('weak points shows exactly the 3 incorrect questions',
    weakVisible.length === 3 && weakVisible.every(i => [k1, k2, lastItem.dataset.key].includes(i.dataset.key)), `(${weakVisible.length})`);
  resetFilterBtn.click();

  // ── leaving quiz mode ────────────────────────────────────────────────────
  quizBtn.click();
  check('leaving quiz mode removes quiz-active', !d.getElementById('content').classList.contains('quiz-active'));
  check('leaving quiz mode expands everything', items.every(i => !i.classList.contains('qa-collapsed')));

  // ── per-question reset ───────────────────────────────────────────────────
  check('missed list shows attempts, not just raw count', [...d.querySelectorAll('.qs-missed li')][0].querySelector('.qs-count').textContent.includes('pokusaja'));
  statsBtn.click();
  const item1Li = [...d.querySelectorAll('.qs-missed li')].find(li => li.querySelector('.qs-missed-text').textContent.includes('Error, Defect'));
  item1Li.querySelector('.qs-reset').click();
  check('reset removes that question from localStorage', !(k1 in JSON.parse(window.localStorage.getItem('qa_quiz_stats'))));
  check('remaining questions untouched by single reset', k0 in JSON.parse(window.localStorage.getItem('qa_quiz_stats')));
  check('stats panel re-renders after reset (fewer missed rows)', d.querySelectorAll('.qs-missed li').length === 2);

  // ── export .md ───────────────────────────────────────────────────────────
  const exportBtn = [...d.querySelectorAll('.quiz-toolbar-btn')].find(b => b.textContent.includes('Export'));
  let clickedAnchor = null;
  const origClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () { clickedAnchor = this; };
  exportBtn.click();
  window.HTMLAnchorElement.prototype.click = origClick;
  check('export triggers a download anchor', !!clickedAnchor && clickedAnchor.download === 'qa-kviz-rezultati.md');
  const blobText = await window.__lastBlob.text();
  check('export contains a Deo I heading', blobText.includes('## Deo I'), blobText.slice(0, 60));
  check('export contains the missed-question section', blobText.includes('Najcesce promaseno'));
  check('export lists item2\'s actual question text', blobText.includes(items[2].querySelector('h3').textContent.trim()));
  check('export line count reasonable', blobText.split('\n').length > 10);

  // ── reset all ────────────────────────────────────────────────────────────
  window.confirm = () => true;
  d.querySelector('.qs-reset-all').click();
  check('reset-all clears every entry', Object.keys(JSON.parse(window.localStorage.getItem('qa_quiz_stats') || '{}')).length === 0);
  check('panel shows empty state after reset-all', d.getElementById('quiz-stats-body').querySelector('.qs-empty') !== null);

  // ── weak points empty-state ──────────────────────────────────────────────
  window.localStorage.clear();
  alertMsg = null;
  weakBtn.click();
  check('weak points with no data shows an alert, no crash', /nema slabih/i.test(alertMsg || ''), alertMsg);

  summary();
})();
