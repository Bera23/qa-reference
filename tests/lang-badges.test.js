'use strict';
const { JSDOM } = require('jsdom');
const { readDist, distFiles, check, summary } = require('./helpers');

const js = readDist('script.js');
const fn = js.match(/function initLangBadges\(\) \{[\s\S]*?\n\}\n/);
check('initLangBadges found in dist/script.js', !!fn);
const run = doc => new doc.defaultView.Function('document', fn[0] + '; initLangBadges();')(doc);

let total = 0, tagged = 0;
const counts = {};
for (const page of distFiles(/^s\d\d\.html$/)) {
  const dom = new JSDOM(readDist(page));
  const doc = dom.window.document;
  run(doc);
  doc.querySelectorAll('.code-block').forEach(block => {
    total++;
    const badge = block.querySelector('.lang-badge');
    if (badge) { tagged++; counts[badge.textContent] = (counts[badge.textContent] || 0) + 1; }
  });
}
check('every real code block was scanned', total > 90, `(${total})`);
check('a healthy majority got tagged (diagrams/prose intentionally stay untagged)', tagged >= total * 0.5, `(${tagged}/${total})`);
check('SQL and C# both detected somewhere in the corpus', counts['SQL'] > 0 && counts['C#'] > 0, JSON.stringify(counts));

// A block that's ambiguous between languages (mentions "[Test kod (C#/Java/Python)]" as a label
// inside a diagram) must NOT get a badge — asserting the tool's own "no badge beats a wrong
// badge" rule, not just checking totals.
const dom = new JSDOM('<div class="code-block"><pre id="p"></pre></div>');
run(dom.window.document);  // no-op here; real check is the ambiguous sample below
const doc2 = new JSDOM('<div class="code-block"><pre>[Test kod (C#/Java/Python)]\n  diagram box, not real code</pre></div>').window.document;
run(doc2);
check('ambiguous multi-language diagram label stays unbadged', !doc2.querySelector('.lang-badge'));

summary();
