'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const SECTIONS_JSON = path.join(ROOT, 'data', 'sections.json');
const SECTIONS_DIR = path.join(ROOT, 'sections');
const TEMPLATE_PATH = path.join(ROOT, 'template.html');
const ASSETS_DIR = path.join(ROOT, 'assets');
const DIST_DIR = path.join(ROOT, 'dist');

const DEO_BANNER_TEXT = { I: 'DEO I — MANUALNO TESTIRANJE', II: 'DEO II — AUTOMATSKO TESTIRANJE' };

function readSections() {
  return JSON.parse(fs.readFileSync(SECTIONS_JSON, 'utf8'));
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// The index must hold the text a reader actually sees: "List&lt;string&gt;" in the source is
// "List<string>" on the page. Without decoding, a search for "lt" matched every "&lt;" and a search
// for "list<string>" found nothing. (Decode AFTER stripping tags, and &amp; last.)
function decodeEntities(s) {
  return s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

function computeReadTime(bodyHtml) {
  const words = stripTags(bodyHtml).split(' ').filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function renderSidebarNav(sections, activeId) {
  function renderGroup(groupId, label, items) {
    const rows = items.map(s => {
      const active = s.id === activeId ? ' active' : '';
      return `      <a class="nav-item${active}" href="${s.id}.html"><span class="nav-icon">${s.icon}</span><span class="nav-item-text">${s.title}</span><span class="nav-check" onclick="toggleRead(event,'${s.id}')"></span></a>`;
    }).join('\n');
    const ids = items.map(s => s.id).join(',');
    return `    <div class="nav-deo-wrap">
      <span class="nav-deo">${label} <span class="nav-deo-progress" data-ids="${ids}"></span></span>
      <button class="nav-collapse" onclick="toggleGroup('${groupId}')">▾</button>
    </div>
    <div class="nav-group" id="${groupId}">
${rows}
    </div>`;
  }
  const deoI = sections.filter(s => s.deo === 'I');
  const deoII = sections.filter(s => s.deo === 'II');
  return renderGroup('g1', 'DEO I — Manualno', deoI) + '\n' + renderGroup('g2', 'DEO II — Automatizacija', deoII);
}

function renderNavButton(section, direction) {
  if (!section) return '';
  const cls = direction === 'next' ? 'snav-btn next' : 'snav-btn';
  const label = direction === 'next' ? 'Sledeca →' : '← Prethodna';
  return `<a class="${cls}" href="${section.id}.html"><span class="snav-label">${label}</span><span class="snav-title">${section.title}</span></a>`;
}

function fillTemplate(template, values) {
  let html = template;
  for (const [key, value] of Object.entries(values)) {
    html = html.split(`{{${key}}}`).join(value);
  }
  return html;
}

function buildTopicPage(sections, index, template) {
  const s = sections[index];
  const prev = sections[index - 1] || null;
  const next = sections[index + 1] || null;
  const body = fs.readFileSync(path.join(SECTIONS_DIR, `${s.id}.html`), 'utf8');
  const readTime = computeReadTime(body);
  const sectionMeta = `<div class="section-meta"><span class="read-time">⏱ ~${readTime} min citanja</span><button class="mark-read-btn" id="mrb-${s.id}" onclick="markRead('${s.id}')">Oznaci kao procitano</button></div>`;
  const qaPage = { id: s.id, title: s.title, prevUrl: prev ? `${prev.id}.html` : null, nextUrl: next ? `${next.id}.html` : null };

  const html = fillTemplate(template, {
    PAGE_TITLE: `${s.icon} ${s.title} — QA Referentni Dokument`,
    BREADCRUMB: `${s.icon} ${s.title}`,
    SIDEBAR_NAV: renderSidebarNav(sections, s.id),
    DEO_BANNER: `<div class="deo-banner">${DEO_BANNER_TEXT[s.deo]}</div>`,
    ACTIVE_ID: s.id,
    ICON: s.icon,
    TOPIC_TITLE: s.title,
    SECTION_META: sectionMeta,
    CONTENT: body,
    PREV_BTN: renderNavButton(prev, 'prev'),
    NEXT_BTN: renderNavButton(next, 'next'),
    QA_PAGE_SCRIPT: `<script>window.QA_PAGE = ${JSON.stringify(qaPage)};</script>`,
  });

  fs.writeFileSync(path.join(DIST_DIR, `${s.id}.html`), html, 'utf8');
}

function buildIndexPage(sections, template) {
  function renderList(items) {
    return items.map(s => `<li class="bullet-item"><a class="toc-link" href="${s.id}.html">${s.icon} ${s.title}</a></li>`).join('\n');
  }
  const deoI = sections.filter(s => s.deo === 'I');
  const deoII = sections.filter(s => s.deo === 'II');
  const content = `<p class="body-text">Licni referentni materijal za manuelno i automatizovano testiranje — izaberi temu iz liste levo, ili ispod.</p>
<h2 class="sub-title">Deo I — Manualno testiranje</h2>
<ul>
${renderList(deoI)}
</ul>
<h2 class="sub-title">Deo II — Automatizacija</h2>
<ul>
${renderList(deoII)}
</ul>`;

  const html = fillTemplate(template, {
    PAGE_TITLE: '📘 QA Referentni Dokument',
    BREADCRUMB: 'Pocetna',
    SIDEBAR_NAV: renderSidebarNav(sections, null),
    DEO_BANNER: '',
    ACTIVE_ID: 'index',
    ICON: '📘',
    TOPIC_TITLE: 'QA Referentni Dokument',
    SECTION_META: '',
    CONTENT: content,
    PREV_BTN: '<div></div>',
    NEXT_BTN: '<div></div>',
    QA_PAGE_SCRIPT: `<script>window.QA_PAGE = ${JSON.stringify({ id: 'index', title: 'QA Referentni Dokument', prevUrl: null, nextUrl: sections[0].id + '.html' })};</script>`,
  });

  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html, 'utf8');
}

// Tags are derived once at build time from each page's own title + text, not hand-curated per
// page — a keyword hits its tag if it appears anywhere (case-insensitive, diacritics-stripped
// since the corpus itself is ASCII-only). Order here is display order in the UI tag-chip row.
const TAG_RULES = [
  ['flaky', ['flaky']],
  ['selenium', ['selenium', 'webdriver']],
  ['pom', ['page object', 'page object model']],
  ['api', ['api testiranje', 'rest api', 'restsharp', 'postman', 'http metod']],
  ['sql', ['sql', 'mssql', 'postgresql', 'pgadmin']],
  ['cicd', ['ci/cd', 'azure pipelines', 'azure devops', 'github actions', 'gitlab', 'jenkins', 'pipeline']],
  ['git', ['git ', 'tfvc', 'changeset', 'shelveset']],
  ['docker', ['docker']],
  ['linux', ['linux', 'bash', 'grep -i', 'systemctl']],
  ['oop', ['oop', 'solid princip', 'inheritance', 'interface vs']],
  ['csharp', ['xunit', 'nunit', 'c#']],
  ['mobile', ['appium', 'mobilno testiranje', 'android']],
  ['ai', ['copilot', 'halucinacij', 'veroatno vestacka', 'ai-powered', 'ai u testiranju']],
  ['security', ['owasp', 'sql injection', 'auth i security', 'bezbednosn']],
  ['performance', ['performance testing', 'load testing', 'k6', 'jmeter', 'nbomber']],
  ['agile', ['agile', 'scrum', 'sprint', 'definition of done']],
  ['debugging', ['debugging', 'observability', 'elk', 'splunk', 'cloudwatch', 'distributed tracing']],
  ['metrike', ['defect density', 'escape rate', 'mttr', 'flakiness rate']],
  ['intervju', ['intervju', 'star format', 'behavioral']],
  ['testni-dizajn', ['equivalence partitioning', 'boundary value', 'decision table', 'pairwise', 'use case testing']],
];
// Default match is plain substring — Serbian declines nouns (intervju/intervjuu/intervjua,
// sprint/sprintu/sprinta...), so a word-boundary requirement would miss every inflected form
// of a keyword and silently drop tags (this broke #intervju and #agile the first time it was
// tried, here, across the whole ruleset). Word-boundary is used ONLY for keywords explicitly
// listed in WORD_BOUNDARY_KEYWORDS below — short tokens confirmed to collide with an unrelated
// substring (so far: "oop" inside "loop" — English tech loanwords don't decline, so the
// boundary is safe for them specifically without cutting off a Serbian case ending).
const WORD_BOUNDARY_KEYWORDS = new Set(['oop']);
function keywordMatches(lower, keyword) {
  if (WORD_BOUNDARY_KEYWORDS.has(keyword)) return new RegExp('\\b' + keyword + '\\b').test(lower);
  return lower.includes(keyword);
}
function deriveTags(text) {
  const lower = text.toLowerCase();
  return TAG_RULES.filter(([, keywords]) => keywords.some(k => keywordMatches(lower, k))).map(([tag]) => tag);
}

function buildSearchIndex(sections) {
  const index = sections.map(s => {
    const body = fs.readFileSync(path.join(SECTIONS_DIR, `${s.id}.html`), 'utf8');
    const text = decodeEntities(stripTags(body));
    return { id: s.id, title: s.title, deo: s.deo, url: `${s.id}.html`, text, tags: deriveTags(s.title + ' ' + text) };
  });
  fs.writeFileSync(path.join(DIST_DIR, 'search-index.json'), JSON.stringify(index), 'utf8');
}

function copyAssets() {
  fs.copyFileSync(path.join(ASSETS_DIR, 'style.css'), path.join(DIST_DIR, 'style.css'));
  fs.copyFileSync(path.join(ASSETS_DIR, 'script.js'), path.join(DIST_DIR, 'script.js'));
  // PWA: manifest + icons
  fs.copyFileSync(path.join(ASSETS_DIR, 'manifest.json'), path.join(DIST_DIR, 'manifest.json'));
  fs.mkdirSync(path.join(DIST_DIR, 'icons'), { recursive: true });
  fs.readdirSync(path.join(ASSETS_DIR, 'icons')).forEach(f =>
    fs.copyFileSync(path.join(ASSETS_DIR, 'icons', f), path.join(DIST_DIR, 'icons', f)));
}

// Service worker: precache list is derived from the SAME sources the build just produced
// (not from a directory listing, so stale leftovers in dist/ can never end up cached).
// The cache name carries a content hash -> any content change invalidates old caches.
function buildServiceWorker(sections) {
  const files = ['index.html', ...sections.map(s => `${s.id}.html`),
    'style.css', 'script.js', 'search-index.json', 'manifest.json',
    ...fs.readdirSync(path.join(ASSETS_DIR, 'icons')).map(f => `icons/${f}`)];
  const hash = crypto.createHash('sha1');
  files.forEach(f => { hash.update(f); hash.update(fs.readFileSync(path.join(DIST_DIR, f))); });
  const version = hash.digest('hex').slice(0, 10);
  const precache = ['./', ...files.map(f => `./${f}`)];
  const sw = fs.readFileSync(path.join(ASSETS_DIR, 'sw.js'), 'utf8')
    .split('__VERSION__').join(version)
    .split('__PRECACHE__').join(JSON.stringify(precache, null, 2));
  if (/__(VERSION|PRECACHE)__/.test(sw)) throw new Error('sw.js: unreplaced placeholder left in output');
  fs.writeFileSync(path.join(DIST_DIR, 'sw.js'), sw, 'utf8');
  return { version, count: precache.length };
}

function main() {
  fs.mkdirSync(DIST_DIR, { recursive: true });
  const sections = readSections();
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  sections.forEach((_, i) => buildTopicPage(sections, i, template));
  buildIndexPage(sections, template);
  buildSearchIndex(sections);
  copyAssets();
  const sw = buildServiceWorker(sections);
  console.log(`Built ${sections.length} topic pages + index.html + search-index.json into dist/`);
  console.log(`Service worker: cache qa-ref-${sw.version}, ${sw.count} precached URLs`);
}

if (require.main === module) main();

module.exports = { readSections, renderSidebarNav, computeReadTime, stripTags, fillTemplate };
