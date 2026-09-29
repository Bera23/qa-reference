'use strict';
const { loadPage, ready, check, summary } = require('./helpers');

(async () => {
  const dom = loadPage('s01.html');
  await ready(dom);
  const d = dom.window.document;
  const tap = el => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

  const items = [...d.querySelectorAll('#quickref .qr-item')];
  const open = () => d.querySelectorAll('#quickref .qr-item.tip-open').length;
  check('Quick Reference has rows', items.length > 25, `(${items.length})`);

  const withTip = items.filter(i => i.querySelector('.qr-tooltip'));
  const noTip = items.filter(i => !i.querySelector('.qr-tooltip'));
  check('has-tip class exactly matches rows that actually carry a tooltip',
    withTip.every(i => i.classList.contains('has-tip')) && noTip.every(i => !i.classList.contains('has-tip')));

  tap(withTip[0].querySelector('.qr-key'));
  check('tap opens the first tooltip row', open() === 1 && withTip[0].classList.contains('tip-open'));

  tap(withTip[3]);
  check('tap on another row switches — only one open at a time',
    open() === 1 && withTip[3].classList.contains('tip-open') && !withTip[0].classList.contains('tip-open'));

  tap(withTip[3]);
  check('tapping the same open row again closes it', open() === 0);

  if (noTip.length) {
    tap(noTip[0]);
    check('tapping a checklist row (no tooltip) does nothing', open() === 0);
  }

  tap(d.querySelector('#content h1'));
  check('tap outside the panel changes nothing', open() === 0);

  summary();
})();
