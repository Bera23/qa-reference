'use strict';
// Regression test for the closure/markup-corruption bug found during development: a two-pass
// replace() let the string-matching pass re-match text the keyword pass had just injected
// (class="kw"), silently altering the VISIBLE text of code blocks. The fix must stay a single
// pass over the original text — this test re-derives that guarantee from the real script.js on
// every real code block in the built site, not just a couple of hand-picked examples.
const { JSDOM } = require('jsdom');
const { readDist, distFiles, check, summary } = require('./helpers');

const js = readDist('script.js');
const fn = js.match(/function initSyntaxHighlight\(\) \{[\s\S]*?\n\}\n/);
check('initSyntaxHighlight found in dist/script.js', !!fn);
const run = doc => new doc.defaultView.Function('document', fn[0] + '; initSyntaxHighlight();')(doc);

let total = 0, textChanged = 0, badSpan = 0, nested = 0;
for (const page of distFiles(/^s\d\d\.html$/)) {
  const dom = new JSDOM(readDist(page));
  const doc = dom.window.document;
  const pres = [...doc.querySelectorAll('.code-block pre')];
  const before = pres.map(p => p.textContent);
  run(doc);
  pres.forEach((p, i) => {
    total++;
    if (p.textContent !== before[i]) textChanged++;
    p.querySelectorAll('span').forEach(sp => {
      const ok = sp.attributes.length === 1 && ['kw', 'st', 'cm'].includes(sp.getAttribute('class'));
      if (!ok) badSpan++;
    });
    nested += p.querySelectorAll('span.st span, span.cm span, span.kw span').length;
  });
}
check(`visible text unchanged across all ${total} real code blocks`, textChanged === 0, `(${textChanged} changed)`);
check('no malformed spans injected', badSpan === 0, `(${badSpan})`);
check('no nested spans (would mean a second pass re-matched injected markup)', nested === 0, `(${nested})`);

// Targeted classification samples — cheap, and catch regressions a whole-corpus diff might miss
// if nobody's code sample happens to exercise a given edge case this run.
const dom = new JSDOM('<div class="code-block"><pre id="p"></pre></div>');
const doc = dom.window.document;
const samples = [
  ['var x = "hello world"; // greet the world', ['kw:var', 'st:"hello world"', 'cm:// greet the world']],
  ['curl -I https://qa.plm.com/api/health', []],
  ['string s = "http://x"; // real comment', ['kw:string', 'st:"http://x"', 'cm:// real comment']],
  ["if (a == 'x') return true;", ['kw:if', "st:'x'", 'kw:return', 'kw:true']],
  ['var t = "public class";', ['kw:var', 'st:"public class"']],
  ['SELECT * FROM Users WHERE Id = 1;', ['kw:SELECT', 'kw:FROM', 'kw:WHERE']],
  ['List&lt;string&gt; names = new List&lt;string&gt;();', ['kw:string', 'kw:new', 'kw:string']],
];
for (const [line, expected] of samples) {
  doc.getElementById('p').innerHTML = line;
  run(doc);
  const got = [...doc.getElementById('p').querySelectorAll('span')].map(s => s.className + ':' + s.textContent);
  check('classify: ' + line.slice(0, 50), JSON.stringify(got) === JSON.stringify(expected),
    JSON.stringify(got) === JSON.stringify(expected) ? '' : `got ${JSON.stringify(got)}`);
}

summary();
