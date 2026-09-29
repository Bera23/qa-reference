'use strict';
// Confirms resetQuizQuestion() leaves no "ghost" of the removed question in any view that reads
// quiz stats — see the INVARIANT comment on getQuizStats() in assets/script.js: every view reads
// localStorage fresh on each call, so there's nothing to separately invalidate today. This test
// is what should catch it if that ever stops being true (e.g. a cache gets added later).
const { loadPage, ready, check, summary } = require('./helpers');

(async () => {
  const dom = loadPage('s24.html', {
    beforeParse: w => {
      w.URL.createObjectURL = b => { w.__lastBlob = b; return 'blob:mock'; };
      w.URL.revokeObjectURL = () => {};
    },
  });
  const { window } = dom;
  await ready(dom);
  const d = window.document;
  const items = [...d.querySelectorAll('.qa-item')];
  d.querySelector('.quiz-toggle-btn').click();

  // Rate 3 questions incorrect; make one unambiguously the WORST (3x wrong) so it's #1 in the
  // ranking before removal, and clearly identifiable after.
  const targets = [items[0], items[1], items[2]];
  const wrongTimes = [3, 1, 1];
  targets.forEach((it, i) => {
    for (let n = 0; n < wrongTimes[i]; n++) {
      it.querySelector('h3').click();
      it.querySelector('.qa-rate-btn.incorrect').click();
    }
  });
  const worstKey = targets[0].dataset.key;
  const worstQuestionText = targets[0].querySelector('h3').textContent.trim();

  const statsBtn = [...d.querySelectorAll('.quiz-toolbar-btn')].find(b => b.textContent.includes('Statistika'));
  const weakBtn = [...d.querySelectorAll('.quiz-toolbar-btn')].find(b => b.textContent.includes('Slabe tacke'));
  const resetFilterBtn = [...d.querySelectorAll('.quiz-toolbar-btn')].find(b => b.textContent.includes('Sve'));

  statsBtn.click();
  check('BEFORE reset: worst question appears in top-missed', [...d.querySelectorAll('.qs-missed-text')].some(t => t.textContent.trim() === worstQuestionText));
  const deoRowsBefore = [...d.querySelectorAll('.qs-row span:last-child')].map(s => s.textContent);
  check('BEFORE reset: Deo I shows 3 answered', deoRowsBefore.some(t => t.startsWith('0/3')));

  weakBtn.click();
  check('BEFORE reset: worst question is in the weak-points filtered view',
    items.filter(i => !i.classList.contains('qa-filtered')).some(i => i.dataset.key === worstKey));
  resetFilterBtn.click();

  // ── remove the worst question via its own reset button ──────────────────
  statsBtn.click();
  const targetLi = [...d.querySelectorAll('.qs-missed li')].find(li => li.querySelector('.qs-missed-text').textContent.trim() === worstQuestionText);
  targetLi.querySelector('.qs-reset').click();

  check('AFTER reset: key removed from localStorage', !(worstKey in JSON.parse(window.localStorage.getItem('qa_quiz_stats'))));
  check('AFTER reset: worst question not in top-missed DOM anymore', ![...d.querySelectorAll('.qs-missed-text')].some(t => t.textContent.trim() === worstQuestionText));
  const deoRowsAfter = [...d.querySelectorAll('.qs-row span:last-child')].map(s => s.textContent);
  check('AFTER reset: Deo I count dropped from 3 to 2 answered', deoRowsAfter.some(t => t.startsWith('0/2')) && !deoRowsAfter.some(t => t.startsWith('0/3')));

  weakBtn.click();
  const weakVisibleAfter = items.filter(i => !i.classList.contains('qa-filtered'));
  check('AFTER reset: worst question not in weak-points filter anymore', !weakVisibleAfter.some(i => i.dataset.key === worstKey));
  check('AFTER reset: the other 2 still-incorrect questions remain', weakVisibleAfter.length === 2);
  resetFilterBtn.click();

  const exportBtn = [...d.querySelectorAll('.quiz-toolbar-btn')].find(b => b.textContent.includes('Export'));
  const origClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () {};
  exportBtn.click();
  window.HTMLAnchorElement.prototype.click = origClick;
  const blobText = await window.__lastBlob.text();
  check('AFTER reset: export .md does not mention the removed question at all', !blobText.includes(worstQuestionText));
  check('AFTER reset: export .md still mentions the other 2 remaining questions',
    targets.slice(1).every(t => blobText.includes(t.querySelector('h3').textContent.trim())));

  summary();
})();
