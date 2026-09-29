'use strict';

// ═══════════════════════════════════════════════════════
// HELPERS: safe storage, stable keys, clipboard
// ═══════════════════════════════════════════════════════
// localStorage can throw (blocked storage) and can hold garbage; neither may break the page.
const store = {
  get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); return true; } catch (e) { return false; } },
  remove(key) { try { localStorage.removeItem(key); } catch (e) { /* storage unavailable */ } },
  getJSON(key, fallback) {
    try {
      const parsed = JSON.parse(this.get(key));
      return Array.isArray(fallback) ? (Array.isArray(parsed) ? parsed : fallback) : (parsed === null ? fallback : parsed);
    } catch (e) { return fallback; }
  },
};

// Section/heading numbers change whenever content is reordered, so identity is based on the TEXT.
function slugify(text) {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
}
function stripNumber(text) { return String(text).replace(/^\s*\d+(\.\d+)*\.?\s+/, '').trim(); }
function pageKey(title) { return slugify(stripNumber(title)) || 'stranica'; }
function currentPageKey() { return pageKey(window.QA_PAGE.title); }
function navItemForPage(key) {
  const items = document.querySelectorAll('#nav .nav-item');
  for (let i = 0; i < items.length; i++) {
    const label = items[i].querySelector('.nav-item-text');
    if (label && pageKey(label.textContent) === key) return items[i];
  }
  return null;
}
function hrefForPage(key) {
  const item = navItemForPage(key);
  if (item) return item.getAttribute('href');
  return key === pageKey('QA Referentni Dokument') ? 'index.html' : null;
}
function navTitleForPage(key) {
  const item = navItemForPage(key);
  return item ? item.querySelector('.nav-item-text').textContent : null;
}

// Clipboard: the async API only exists in secure contexts and can be denied; fall back to
// execCommand and always report the real outcome (true/false) instead of assuming success.
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
  }
  return Promise.resolve(legacyCopy(text));
}
function legacyCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return !!ok;
  } catch (e) { return false; }
}

// One-time upgrade of data saved by older versions (see comments for what can and cannot be kept).
const DATA_VERSION = '2';
function migrateStorage() {
  if (store.get('qa_data_v') === DATA_VERSION) return;
  // Old bookmarks were {slug:'h-3', url:'s12.html', title:'12.4 ...', section:'12. Selenium / WebDriver'}.
  // slug/url were positional and went stale when sections were reordered, but title and section
  // describe the target, so the stable identity is rebuilt from them.
  const seen = new Set(), migrated = [];
  store.getJSON('qa_bookmarks', []).forEach(b => {
    if (!b || typeof b !== 'object') return;
    const entry = b.page ? b : {
      page: pageKey(b.section || ''), slug: slugify(stripNumber(b.title || '')),
      title: stripNumber(b.title || ''), section: stripNumber(b.section || ''),
    };
    if (!entry.page || !entry.slug || seen.has(entry.page + '#' + entry.slug)) return;
    seen.add(entry.page + '#' + entry.slug);
    migrated.push(entry);
  });
  store.set('qa_bookmarks', JSON.stringify(migrated));
  // Old read marks were keyed by file id (s12...), and those ids changed meaning when sections were
  // reordered, so they cannot be mapped safely. A wrong "read" mark is worse than none: keep the old
  // data under another key instead of showing it.
  const legacyReads = store.get('qa_reads');
  if (legacyReads !== null) { store.set('qa_reads_legacy', legacyReads); store.remove('qa_reads'); }
  store.set('qa_data_v', DATA_VERSION);
}
// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════

// Every step runs in its own try/catch, so one failing step (for example a storage problem)
// can no longer abort the rest of the page initialisation.
document.addEventListener('DOMContentLoaded', () => {
  const steps = [migrateStorage, addAnchorLinks, addBookmarkButtons, restoreState, initSyntaxHighlight,
    initLangBadges, initQuizMode, updateBmCount, initNavHeights, () => filterGlosar(''), loadSearchIndex, scrollToHash];
  steps.forEach(step => {
    try { step(); } catch (err) { console.error('Init step failed:', step.name || '(anonymous)', err); }
  });
});
// ═══════════════════════════════════════════════════════
// ANCHOR LINKS on h2
// ═══════════════════════════════════════════════════════

// Anchor ids are derived from the heading TEXT (without its number), not from its position on the
// page. Positional ids (h-3) silently pointed to a different heading whenever a subsection was
// inserted or sections were renumbered, which broke bookmarks and shared links.
function addAnchorLinks() {
  const used = {};
  document.querySelectorAll('h2.sub-title').forEach((h2, i) => {
    const text = stripNumber(h2.textContent);
    let slug = slugify(text) || ('h-' + i);
    const existing = document.getElementById(slug);
    if (existing && existing !== h2) slug = 'sec-' + slug;          // never collide with #search, #nav, ...
    used[slug] = (used[slug] || 0) + 1;
    if (used[slug] > 1) slug += '-' + used[slug];                     // duplicate headings on one page
    h2.id = slug;
    h2.dataset.title = text;
    const a = document.createElement('a');
    a.className = 'anchor';
    a.href = '#' + slug;
    a.textContent = '#';
    a.title = 'Kopiraj link';
    a.onclick = (e) => {
      e.preventDefault();
      copyText(location.href.split('#')[0] + '#' + slug).then(ok => {
        a.textContent = ok ? '✓' : '!';
        setTimeout(() => a.textContent = '#', 1500);
      });
    };
    h2.appendChild(a);
  });
}

// Scroll to #hash once the ids exist (they are assigned by JS). Old positional links like #h-3
// are still honoured as a fallback.
function scrollToHash() {
  if (!location.hash) return;
  let id;
  try { id = decodeURIComponent(location.hash.slice(1)); } catch (e) { return; }
  let target = document.getElementById(id);
  if (!target) {
    const legacy = /^h-(\d+)$/.exec(id);
    if (legacy) target = document.querySelectorAll('h2.sub-title')[Number(legacy[1])];
  }
  if (target) target.scrollIntoView();
}
// ═══════════════════════════════════════════════════════
// BOOKMARK BUTTONS on h2
// ═══════════════════════════════════════════════════════

function addBookmarkButtons() {
  document.querySelectorAll('h2.sub-title').forEach(h2 => {
    const btn = document.createElement('button');
    btn.className = 'bm-btn';
    btn.textContent = '★';
    btn.title = 'Bookmark';
    btn.dataset.slug = h2.id;
    btn.dataset.title = h2.dataset.title || stripNumber(h2.textContent);
    btn.dataset.section = stripNumber(window.QA_PAGE.title);
    btn.dataset.page = currentPageKey();
    btn.onclick = () => toggleBookmark(btn);
    h2.insertBefore(btn, h2.querySelector('.anchor') || null);
  });
  refreshAllBmButtons();
}
// ═══════════════════════════════════════════════════════
// MARK READ
// ═══════════════════════════════════════════════════════

// Read marks are stored by PAGE KEY (the section title without its number), not by file id, so they
// survive sections being renumbered or reordered.
function idToKey(id) {
  const el = document.querySelector('#nav .nav-item[href="' + id + '.html"] .nav-item-text');
  return el ? pageKey(el.textContent) : null;
}
function getReadKeys() { return store.getJSON('qa_read_pages', []); }
function markRead(id) {
  const key = idToKey(id);
  if (!key) return;
  const keys = getReadKeys();
  const idx = keys.indexOf(key);
  if (idx === -1) keys.push(key); else keys.splice(idx, 1);
  store.set('qa_read_pages', JSON.stringify(keys));
  applyReadState(id, idx === -1);
  updateGroupProgress();
}
function toggleRead(e, id) { e.preventDefault(); e.stopPropagation(); markRead(id); }
function applyReadState(id, isRead) {
  const check = document.querySelector('#nav .nav-item[href="' + id + '.html"] .nav-check');
  if (check) { check.classList.toggle('done', isRead); check.textContent = isRead ? '✓' : ''; }
  const btn = document.getElementById('mrb-' + id);
  if (btn) { btn.classList.toggle('done', isRead); btn.textContent = isRead ? '✓ Procitano' : 'Oznaci kao procitano'; }
  const badge = document.querySelector('#t-' + id + ' .read-badge');
  if (badge) badge.classList.toggle('visible', isRead);
}
function restoreReadState() {
  const keys = new Set(getReadKeys());
  document.querySelectorAll('#nav .nav-item').forEach(a => {
    const id = (a.getAttribute('href') || '').replace('.html', '');
    if (keys.has(idToKey(id))) applyReadState(id, true);
  });
}
function updateGroupProgress() {
  const keys = new Set(getReadKeys());
  document.querySelectorAll('.nav-deo-progress').forEach(el => {
    const ids = (el.dataset.ids || '').split(',').filter(Boolean);
    const done = ids.filter(id => keys.has(idToKey(id))).length;
    el.textContent = '(' + done + '/' + ids.length + ')';
  });
}
// ═══════════════════════════════════════════════════════
// BOOKMARKS (stable identity: page key + heading slug)
// ═══════════════════════════════════════════════════════

// Bookmarks are {page, slug, title, section}: `page` is the page key (section title without number)
// and `slug` the heading slug. The file to open is looked up in the sidebar at click time, so a
// bookmark keeps working when sections are renumbered or their files renamed.
function getBookmarks() { return store.getJSON('qa_bookmarks', []); }
function saveBookmarks(bms) { store.set('qa_bookmarks', JSON.stringify(bms)); }
function refreshAllBmButtons() {
  const keySet = new Set(getBookmarks().map(b => b.page + '#' + b.slug));
  document.querySelectorAll('.bm-btn').forEach(btn => {
    btn.classList.toggle('active', keySet.has(btn.dataset.page + '#' + btn.dataset.slug));
  });
}
function toggleBookmark(btn) {
  const { slug, title, section, page } = btn.dataset;
  const bms = getBookmarks();
  const idx = bms.findIndex(b => b.slug === slug && b.page === page);
  if (idx === -1) bms.push({ page, slug, title, section }); else bms.splice(idx, 1);
  saveBookmarks(bms);
  refreshAllBmButtons();
  renderBookmarks();
  updateBmCount();
}
function updateBmCount() {
  const c = getBookmarks().length;
  const el = document.getElementById('bm-count');
  if (!el) return;
  el.textContent = c; el.style.display = c > 0 ? 'inline' : 'none';
}
function renderBookmarks() {
  const bms = getBookmarks();
  const list = document.getElementById('bm-list');
  list.textContent = '';
  if (bms.length === 0) {
    list.innerHTML = '<div id="bm-empty">Nema bookmarks-a.<br><small>Klikni ★ pored bilo kog podnaslova.</small></div>';
    return;
  }
  bms.forEach(b => {
    const entry = document.createElement('div');
    entry.className = 'bm-entry';
    entry.onclick = () => goToBookmark(b.page, b.slug);
    const del = document.createElement('button');
    del.className = 'bm-entry-del';
    del.textContent = '✕';
    del.onclick = (e) => removeBm(e, b.page, b.slug);
    const title = document.createElement('div');
    title.className = 'bm-entry-title';
    title.textContent = b.title;                    // textContent: titles are never parsed as HTML
    const section = document.createElement('div');
    section.className = 'bm-entry-section';
    section.textContent = navTitleForPage(b.page) || b.section;   // current numbering, from the sidebar
    entry.appendChild(del); entry.appendChild(title); entry.appendChild(section);
    list.appendChild(entry);
  });
}
function removeBm(e, page, slug) {
  e.stopPropagation();
  saveBookmarks(getBookmarks().filter(b => !(b.slug === slug && b.page === page)));
  refreshAllBmButtons();
  renderBookmarks();
  updateBmCount();
}
function goToBookmark(page, slug) {
  const url = hrefForPage(page);
  if (!url) return;                                 // that page no longer exists
  if (page === currentPageKey()) {
    const el = document.getElementById(slug);
    if (el) { el.scrollIntoView(); closeBmPanel(); }
    return;
  }
  window.location.href = url + '#' + encodeURIComponent(slug);
}
function openBmPanel() { renderBookmarks(); document.getElementById('bm-panel').classList.toggle('open'); }
function closeBmPanel() { document.getElementById('bm-panel').classList.remove('open'); }
// ═══════════════════════════════════════════════════════
// SEARCH (sitewide — fetches the generated search-index.json once,
// filters it client-side, shows a link dropdown instead of the
// original's inline text-highlight, since matches can now live on
// a different page than the one being viewed)
// ═══════════════════════════════════════════════════════

let searchIndex = null;
function loadSearchIndex() {
  fetch('search-index.json').then(r => r.json()).then(data => { searchIndex = data; }).catch(() => {});
}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
let searchTimeout;
function searchDoc(query) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const box = document.getElementById('search-results');
    const countEl = document.getElementById('search-count');
    const q = query.trim().toLowerCase();
    if (!q || !searchIndex) { box.innerHTML = ''; box.classList.remove('visible'); countEl.textContent = ''; return; }
    // Every word must appear (in any order); pages whose TITLE matches come first
    const tokens = q.split(/\s+/).filter(Boolean);
    const hits = [];
    searchIndex.forEach(s => {
      const title = s.title.toLowerCase(), text = s.text.toLowerCase();
      if (!tokens.every(t => title.indexOf(t) !== -1 || text.indexOf(t) !== -1)) return;
      hits.push({ s, titleHits: tokens.filter(t => title.indexOf(t) !== -1).length });
    });
    hits.sort((a, b) => b.titleHits - a.titleHits);
    countEl.textContent = hits.length > 0 ? hits.length + ' pogodak' + (hits.length === 1 ? '' : 'a') : 'Nema';
    box.innerHTML = hits.map(({ s }) => {
      const lower = s.text.toLowerCase();
      const first = tokens.find(t => lower.indexOf(t) !== -1);
      const idx = first ? lower.indexOf(first) : -1;
      const snippet = idx >= 0
        ? '…' + s.text.slice(Math.max(0, idx - 40), idx + 60) + '…'
        : s.text.slice(0, 80) + '…';
      // Index text is plain text (may contain < and >), so it must be escaped before innerHTML
      return '<a class="search-result" href="' + escapeHtml(s.url) + '"><span class="sr-title">' + escapeHtml(s.title) + '</span><span class="sr-snippet">' + escapeHtml(snippet) + '</span></a>';
    }).join('');
    box.classList.toggle('visible', hits.length > 0);
  }, 200);
}
// ═══════════════════════════════════════════════════════
// COLLAPSE GROUPS
// ═══════════════════════════════════════════════════════
function initNavHeights() {
  document.querySelectorAll('.nav-group').forEach(g => { g.style.maxHeight = g.scrollHeight + 'px'; });
}
function toggleGroup(id) {
  const g = document.getElementById(id);
  const collapsed = g.classList.toggle('collapsed');
  const btn = g.previousElementSibling.querySelector('.nav-collapse');
  btn.textContent = collapsed ? '▸' : '▾';
  g.style.maxHeight = collapsed ? '0' : g.scrollHeight + 'px';
}

// ═══════════════════════════════════════════════════════
// FONT SIZE
// ═══════════════════════════════════════════════════════

let fontSize = (function () {
  const n = parseInt(store.get('qa_fs'), 10);
  return n >= 12 && n <= 20 ? n : 15;               // ignore missing / corrupted stored values
})();
function applyFontSize() {
  document.documentElement.style.setProperty('--fs', fontSize + 'px');
  document.getElementById('fs-display').textContent = fontSize;
  store.set('qa_fs', fontSize);
}
function changeFont(delta) {
  fontSize = Math.min(20, Math.max(12, fontSize + delta));
  applyFontSize();
}
// ═══════════════════════════════════════════════════════
// READING MODE
// ═══════════════════════════════════════════════════════
function toggleReadingMode() {
  const isReading = document.body.classList.toggle('reading');
  const btn = document.getElementById('read-btn');
  const sidebar = document.getElementById('sidebar');
  if (isReading) {
    sidebar.style.transform = 'translateX(-100%)';
    if (btn) btn.textContent = '✕ Citanje';
  } else {
    sidebar.style.transform = window.innerWidth > 768 ? 'translateX(0)' : 'translateX(-100%)';
    if (btn) btn.textContent = '🔖 Citanje';
  }
}

// ═══════════════════════════════════════════════════════
// PRINT
// ═══════════════════════════════════════════════════════
function printDoc() { window.print(); }

// ═══════════════════════════════════════════════════════
// SHARE (now just copies the current page's own URL — the original
// scanned scroll position across 20 sections to guess "current"; a
// generated page IS exactly one topic, so there's nothing to guess)
// ═══════════════════════════════════════════════════════

function shareSection() {
  copyText(location.href.split('#')[0]).then(ok => {
    const toast = document.getElementById('share-toast');
    toast.textContent = ok ? '🔗 Link kopiran!' : 'Kopiranje nije uspelo';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  });
}
// ═══════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════

function toggleTheme() {
  document.body.classList.toggle('light');
  const isLight = document.body.classList.contains('light');
  document.getElementById('theme-btn').textContent = isLight ? '☾' : '☀';
  store.set('qa_theme', isLight ? 'light' : 'dark');
}
// ═══════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
document.addEventListener('click', e => {
  const sb = document.getElementById('sidebar');
  const btn = document.getElementById('menu-btn');
  if (sb.classList.contains('open') && !sb.contains(e.target) && e.target !== btn) sb.classList.remove('open');
  if (document.getElementById('bm-panel').classList.contains('open') &&
      !document.getElementById('bm-panel').contains(e.target) &&
      !e.target.closest('.tb-btn')) {
    closeBmPanel();
  }
});

// ═══════════════════════════════════════════════════════
// COPY CODE
// ═══════════════════════════════════════════════════════

function copyCode(btn) {
  const pre = btn.nextElementSibling;
  copyText(pre.innerText).then(ok => {
    btn.textContent = ok ? '✓ copied' : 'greska';
    btn.classList.toggle('copied', ok);
    setTimeout(() => { btn.textContent = 'copy'; btn.classList.remove('copied'); }, 2000);
  });
}
// ═══════════════════════════════════════════════════════
// SYNTAX HIGHLIGHT
// ═══════════════════════════════════════════════════════
function initSyntaxHighlight() {
  // C# keywords (used in the OOP/Framework/live-coding examples) plus distinctive SQL keywords.
  // Common short SQL words (IN, ON, AS, IS, AND, OR...) are deliberately excluded — they collide
  // too often with ordinary words inside comments.
  const KEYWORDS = 'public|private|protected|internal|static|void|class|struct|interface|new|return|var|string|bool|int|if|else|true|false|null|this|using|namespace|override|abstract|virtual|sealed|readonly|const|async|await|foreach|for|while|try|catch|finally|throw|get|set|SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|DELETE|JOIN|INNER|LEFT|RIGHT|OUTER|GROUP|HAVING|ORDER|DISTINCT|COUNT|SUM|LIMIT|CREATE|TABLE|ALTER|DROP|BEGIN|TRANSACTION|ROLLBACK|COMMIT|EXISTS|UNION|NULL|CASE|WHEN|THEN|ELSE';
  // ONE combined regex, ONE pass over the original text: string | trailing // comment | keyword.
  // The leftmost match wins, so a keyword inside a string or comment is never colored separately,
  // and the markup we inject is never scanned again. (An earlier two-pass version let the string
  // pattern match class="kw" and corrupted the visible text.)
  // The comment alternative needs whitespace or line start before // so URLs (https://...) survive.
  const TOKEN = new RegExp('(\'[^\'\\n]*\'|"[^"\\n]*")|(^|\\s)(//.*$)|\\b(' + KEYWORDS + ')\\b', 'g');
  document.querySelectorAll('.code-block pre').forEach(pre => {
    const lines = pre.innerHTML.split('\n').map(line => {
      const trimmed = line.trimStart();
      // Whole-line comments: //, # (bash/Docker/cron), -- (SQL)
      if (trimmed.startsWith('//') || trimmed.startsWith('#') || /^--(\s|$)/.test(trimmed)) {
        return '<span class="cm">' + line + '</span>';
      }
      return line.replace(TOKEN, (match, str, lead, comment, keyword) => {
        if (str) return '<span class="st">' + str + '</span>';
        if (comment) return lead + '<span class="cm">' + comment + '</span>';
        return '<span class="kw">' + keyword + '</span>';
      });
    });
    pre.innerHTML = lines.join('\n');
  });
}

// ═══════════════════════════════════════════════════════
// LANGUAGE BADGE — heuristic detection, first confident match wins.
// No badge is shown rather than a wrong one when nothing matches clearly.
// ═══════════════════════════════════════════════════════
function initLangBadges() {
  const RULES = [
    { lang: 'SQL', re: /\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM|CREATE TABLE|BEGIN TRANSACTION)\b/ },
    { lang: 'JSON', re: /^\s*[{[][\s\S]*[}\]]\s*$/, extra: /"[A-Za-z_]+"\s*:/ },
    { lang: 'YAML', re: /^\s*(trigger|pool|steps|variables|jobs|env|stages|resources)\s*:/m },
    { lang: 'Gherkin', re: /^\s*(Feature|Scenario|Given|When|Then)\s*:/m },
    { lang: 'JS', re: /\bpm\.(test|response|expect)\b/ },
    { lang: 'C#', re: /\b(public|private|protected|internal)\s+\w|using\s+System|\[Fact\]|\[Theory\]|namespace\s+\w|\bvar\s+\w+\s*=\s*new\s+\w|Assert\.(Equal|True|False|Contains)|TestLog\.|new Mock<|driver\.\w+\(|\bI[A-Z]\w{2,}\b/ },
    { lang: 'bash', re: /^\s*(git |docker |curl |ssh |scp |chmod |grep |tail -f|ps aux|systemctl |df -h|free -h|ping |ss -|export |crontab|npm |pip )/m },
  ];
  document.querySelectorAll('.code-block').forEach(block => {
    const pre = block.querySelector('pre');
    if (!pre) return;
    const text = pre.textContent;
    const hit = RULES.find(r => r.re.test(text) && (!r.extra || r.extra.test(text)));
    if (!hit) return;
    const badge = document.createElement('span');
    badge.className = 'lang-badge';
    badge.textContent = hit.lang;
    block.insertBefore(badge, block.firstChild);
  });
}

// ═══════════════════════════════════════════════════════
// Q&A QUIZ MODE — only on the "Pitanja i odgovori" page. Groups each
// h3.sub-sub-title question with its following answer paragraphs into
// a collapsible .qa-item, and adds a bulk toggle button (in the same
// bar as "Oznaci kao procitano") to hide all answers at once for
// active-recall self-testing instead of always-visible passive reading.
// ═══════════════════════════════════════════════════════
// Per-question self-assessment, keyed by a stable slug of the question TEXT (same
// principle as slugify() for anchors/bookmarks) so results survive question reordering.
function quizStatsKey(questionText) { return 'q-' + slugify(questionText); }
function getQuizStats() { return store.getJSON('qa_quiz_stats', {}); }
function saveQuizStats(stats) { store.set('qa_quiz_stats', JSON.stringify(stats)); }
function recordQuizAnswer(key, questionText, deo, wasCorrect) {
  const stats = getQuizStats();
  const entry = stats[key] || { correct: 0, incorrect: 0 };
  entry.correct = entry.correct || 0;
  entry.incorrect = entry.incorrect || 0;
  if (wasCorrect) entry.correct++; else entry.incorrect++;
  entry.lastResult = wasCorrect ? 'correct' : 'incorrect';
  entry.lastSeen = Date.now();
  entry.question = questionText;  // kept fresh so a later export/stats view doesn't need the DOM
  entry.deo = deo;
  stats[key] = entry;
  saveQuizStats(stats);
  return stats;
}
function downloadTextFile(filename, mime, text) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function initQuizMode() {
  if (!window.QA_PAGE || !/Pitanja i odgovori/.test(window.QA_PAGE.title || '')) return;
  const content = document.getElementById('content');
  if (!content) return;
  const headers = Array.from(content.querySelectorAll('h3.sub-sub-title'));
  if (headers.length === 0) return;

  let currentDeo = '';
  const items = headers.map(h3 => {
    // h2.sub-title (Deo I / II / III) headers are siblings of the h3s in document order —
    // walking previousElementSibling from each h3 as items are built keeps currentDeo correct.
    let scan = h3.previousElementSibling;
    while (scan) {
      // dataset.title (set by addAnchorLinks(), which always runs first) is the clean heading
      // text — plain textContent would also pick up the injected "#" anchor / "★" bookmark button.
      if (scan.matches && scan.matches('h2.sub-title')) { currentDeo = scan.dataset.title || scan.textContent.trim(); break; }
      scan = scan.previousElementSibling;
    }
    const questionText = h3.textContent.trim();
    const key = quizStatsKey(questionText);

    const wrap = document.createElement('div');
    wrap.className = 'qa-item';
    wrap.dataset.key = key;
    wrap.dataset.deo = currentDeo;
    h3.parentNode.insertBefore(wrap, h3);
    h3.classList.add('qa-question');
    wrap.appendChild(h3);

    const answer = document.createElement('div');
    answer.className = 'qa-answer';
    let next = wrap.nextSibling;
    while (next && !(next.nodeType === 1 && (next.matches('h3.sub-sub-title') || next.matches('h2.sub-title')))) {
      const toMove = next;
      next = next.nextSibling;
      answer.appendChild(toMove);
    }
    wrap.appendChild(answer);

    // Self-rating — only meaningfully visible in quiz mode (#content.quiz-active, see CSS).
    // Rating re-collapses the item so the flow is: open -> read -> rate -> next question.
    const rate = document.createElement('div');
    rate.className = 'qa-rate';
    const yes = document.createElement('button');
    yes.className = 'qa-rate-btn correct'; yes.type = 'button'; yes.textContent = '✓ Znao sam';
    const no = document.createElement('button');
    no.className = 'qa-rate-btn incorrect'; no.type = 'button'; no.textContent = '✗ Nisam znao';
    [[yes, true], [no, false]].forEach(([rateBtn, ok]) => {
      rateBtn.addEventListener('click', e => {
        e.stopPropagation();
        // Read from wrap.dataset.deo (set once, per-item, above), NOT the outer `currentDeo`
        // closure variable — by the time any click fires the .map() loop has long finished, so
        // `currentDeo` would hold whatever the LAST question's Deo was, not this item's.
        recordQuizAnswer(key, questionText, wrap.dataset.deo, ok);
        wrap.classList.add('qa-collapsed');
        refreshStatsPanelIfOpen();
      });
    });
    rate.appendChild(yes); rate.appendChild(no);
    answer.appendChild(rate);

    h3.addEventListener('click', () => wrap.classList.toggle('qa-collapsed'));
    return wrap;
  });

  const meta = document.querySelector('.section-meta');
  if (!meta) return;
  const quizBtn = document.createElement('button');
  quizBtn.className = 'quiz-toggle-btn';
  quizBtn.textContent = '🎯 Kviz mod';
  quizBtn.onclick = () => {
    const turningOn = !quizBtn.classList.contains('active');
    quizBtn.classList.toggle('active', turningOn);
    quizBtn.textContent = turningOn ? '👁 Prikazi odgovore' : '🎯 Kviz mod';
    content.classList.toggle('quiz-active', turningOn);
    items.forEach(w => w.classList.toggle('qa-collapsed', turningOn));
    if (!turningOn) applyQuizFilter(null);  // leaving quiz mode also clears any random/weak-points filter
  };
  meta.appendChild(quizBtn);

  function applyQuizFilter(keySet) {
    items.forEach(w => w.classList.toggle('qa-filtered', !!keySet && !keySet.has(w.dataset.key)));
  }
  function enterQuizMode() {
    if (!quizBtn.classList.contains('active')) quizBtn.click();
  }
  function pickRandom(n) {
    enterQuizMode();
    const pool = items.map(w => w.dataset.key);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    applyQuizFilter(new Set(pool.slice(0, Math.min(n, pool.length))));
    items.forEach(w => w.classList.add('qa-collapsed'));
  }
  function pickWeakPoints() {
    const stats = getQuizStats();
    const weak = new Set(Object.keys(stats).filter(k => stats[k].lastResult === 'incorrect'));
    if (weak.size === 0) { alert('Nema slabih tacaka jos — prvo odgovori na par pitanja u kviz modu.'); return; }
    enterQuizMode();
    applyQuizFilter(weak);
    items.forEach(w => w.classList.add('qa-collapsed'));
  }
  function resetFilter() { applyQuizFilter(null); }

  const toolbar = document.createElement('div');
  toolbar.className = 'quiz-toolbar';
  const toolbarBtns = [
    ['🎲 10 nasumicnih', () => pickRandom(10)],
    ['🎲 20 nasumicnih', () => pickRandom(20)],
    ['🎯 Slabe tacke', pickWeakPoints],
    ['📊 Statistika', toggleStatsPanel],
    ['⬇ Export (.md)', exportQuizStats],
    ['↺ Sve', resetFilter],
  ];
  toolbarBtns.forEach(([label, fn]) => {
    const b = document.createElement('button');
    b.className = 'quiz-toolbar-btn'; b.type = 'button'; b.textContent = label;
    b.onclick = fn;
    toolbar.appendChild(b);
  });
  meta.insertAdjacentElement('afterend', toolbar);

  buildStatsPanel();
}

// ═══════════════════════════════════════════════════════
// QUIZ STATS PANEL — slide-out panel (same pattern as #bm-panel), built once by
// initQuizMode(). Shows % correct per Deo and the 5 most-missed questions.
// ═══════════════════════════════════════════════════════
function buildStatsPanel() {
  if (document.getElementById('quiz-stats-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'quiz-stats-panel';
  panel.innerHTML = '<h3><span>📊 STATISTIKA</span><button type="button" onclick="toggleStatsPanel()" aria-label="Zatvori">✕</button></h3><div id="quiz-stats-body"></div>';
  document.body.appendChild(panel);
}
function renderStatsPanel() {
  const body = document.getElementById('quiz-stats-body');
  if (!body) return;
  const stats = getQuizStats();
  const answered = Object.values(stats);
  if (answered.length === 0) {
    body.innerHTML = '<p class="qs-empty">Jos nema rezultata — odgovori na par pitanja u kviz modu.</p>';
    return;
  }
  const byDeo = {};
  answered.forEach(e => {
    const d = e.deo || '(bez Deo oznake)';
    byDeo[d] = byDeo[d] || { correct: 0, total: 0 };
    byDeo[d].total++;
    if (e.lastResult === 'correct') byDeo[d].correct++;
  });
  const deoRows = Object.keys(byDeo).map(d => {
    const { correct, total } = byDeo[d];
    return `<div class="qs-row"><span>${d}</span><span>${correct}/${total} (${Math.round(100 * correct / total)}%)</span></div>`;
  }).join('');
  const totalCorrect = answered.filter(e => e.lastResult === 'correct').length;
  const overall = Math.round(100 * totalCorrect / answered.length);
  const missed = Object.values(stats).filter(e => e.incorrect > 0)
    .sort((a, b) => b.incorrect - a.incorrect).slice(0, 5)
    .map(e => `<li>${e.question} <span class="qs-count">(${e.incorrect}×)</span></li>`).join('');
  body.innerHTML =
    `<div class="qs-overall">${overall}% ukupno (${totalCorrect}/${answered.length})</div>` +
    `<div class="qs-section-title">Po Deo-u</div>${deoRows}` +
    (missed ? `<div class="qs-section-title">Top 5 najcesce promaseno</div><ul class="qs-missed">${missed}</ul>` : '');
}
function toggleStatsPanel() {
  const panel = document.getElementById('quiz-stats-panel');
  if (!panel) return;
  const opening = !panel.classList.contains('open');
  if (opening) renderStatsPanel();
  panel.classList.toggle('open', opening);
}
function refreshStatsPanelIfOpen() {
  const panel = document.getElementById('quiz-stats-panel');
  if (panel && panel.classList.contains('open')) renderStatsPanel();
}
function exportQuizStats() {
  const stats = getQuizStats();
  const entries = Object.values(stats);
  if (entries.length === 0) { alert('Jos nema rezultata za export.'); return; }
  const lines = ['# Kviz rezultati — ' + new Date().toLocaleDateString('sr-RS'), ''];
  const byDeo = {};
  entries.forEach(e => { (byDeo[e.deo || '(bez oznake)'] = byDeo[e.deo || '(bez oznake)'] || []).push(e); });
  Object.keys(byDeo).forEach(deo => {
    lines.push('## ' + deo, '');
    byDeo[deo].forEach(e => {
      lines.push(`- [${e.lastResult === 'correct' ? 'x' : ' '}] ${e.question} — ${e.correct}x tacno, ${e.incorrect}x netacno`);
    });
    lines.push('');
  });
  const missed = entries.filter(e => e.incorrect > 0).sort((a, b) => b.incorrect - a.incorrect);
  if (missed.length) {
    lines.push('## Najcesce promaseno', '');
    missed.forEach(e => lines.push(`- ${e.question} (${e.incorrect}x)`));
  }
  downloadTextFile('qa-kviz-rezultati.md', 'text/markdown', lines.join('\n'));
}

// ═══════════════════════════════════════════════════════
// KEYBOARD (j/k now navigate to a different page instead of
// scrolling within one — QA_PAGE.prevUrl/nextUrl come from the
// per-page inline script Task 6 embeds)
// ═══════════════════════════════════════════════════════

document.addEventListener('keydown', e => {
  const t = e.target, tag = t && t.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable);
  if (typing) {
    if (e.key === 'Escape' && tag === 'INPUT') { t.blur(); searchDoc(''); }
    return;
  }
  // Ctrl/Cmd/Alt combinations belong to the browser (Ctrl+K, Ctrl+R, Ctrl+P, Cmd+J...) — never hijack them
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); document.getElementById('search').focus(); return; }
  if (e.key === 'Escape') { closeAllPanels(); return; }
  if (e.repeat) return;                              // holding a key must not page through the document
  if (e.key === 'j' || e.key === 'J') { if (window.QA_PAGE.nextUrl) window.location.href = window.QA_PAGE.nextUrl; }
  if (e.key === 'k' || e.key === 'K') { if (window.QA_PAGE.prevUrl) window.location.href = window.QA_PAGE.prevUrl; }
  if (e.key === 'r' || e.key === 'R') toggleReadingMode();
  if (e.key === 'p' || e.key === 'P') printDoc();
});
function closeAllPanels() {
  closeBmPanel();
  ['quickref', 'overflow-menu', 'sidebar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('visible', 'open');
  });
  if (document.body.classList.contains('reading')) toggleReadingMode();
}
// ═══════════════════════════════════════════════════════
// RESTORE STATE
// ═══════════════════════════════════════════════════════

function restoreState() {
  if (store.get('qa_theme') === 'light') {
    document.body.classList.add('light');
    document.getElementById('theme-btn').textContent = '☾';
  }
  applyFontSize();
  restoreReadState();
  updateGroupProgress();
}
// ═══════════════════════════════════════════════════════
// SCROLL PROGRESS + BACK TO TOP
// ═══════════════════════════════════════════════════════
window.addEventListener('scroll', () => {
  const total = document.body.scrollHeight - window.innerHeight;
  document.getElementById('progress-bar').style.width = (total > 0 ? window.scrollY / total * 100 : 0) + '%';
  document.getElementById('back-top').classList.toggle('visible', window.scrollY > 400);
}, { passive: true });
document.getElementById('back-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

function toggleOverflow() {
  document.getElementById('overflow-menu').classList.toggle('open');
}
document.addEventListener('click', function (e) {
  var menu = document.getElementById('overflow-menu');
  var btn = document.getElementById('overflow-btn');
  if (menu && menu.classList.contains('open') &&
      !menu.contains(e.target) && e.target !== btn) {
    menu.classList.remove('open');
  }
}, true);

function toggleQuickRef() { document.getElementById('quickref').classList.toggle('visible'); }
// Tap/click a Quick Reference row to show its explanation (only takes visual effect on touch
// devices — see the (hover:none) rules in style.css; desktop keeps the hover tooltip).
document.addEventListener('click', e => {
  const item = e.target.closest('#quickref .qr-item');
  if (!item || !item.querySelector('.qr-tooltip')) return;
  const wasOpen = item.classList.contains('tip-open');
  document.querySelectorAll('#quickref .qr-item.tip-open').forEach(i => i.classList.remove('tip-open'));
  if (!wasOpen) item.classList.add('tip-open');
});

// ═══════════════════════════════════════════════════════
// GLOSAR FILTER (only s20.html has .glosar-item elements — a no-op
// on every other page)
// ═══════════════════════════════════════════════════════
function filterGlosar(q) {
  var items = document.querySelectorAll('.glosar-item');
  var groups = document.querySelectorAll('.glosar-letter-group');
  var query = q.trim().toLowerCase();
  var visible = 0;
  items.forEach(function (item) {
    var term = item.querySelector('.glosar-term').textContent.toLowerCase();
    var def = item.querySelector('.glosar-def').textContent.toLowerCase();
    var match = !query || term.indexOf(query) >= 0 || def.indexOf(query) >= 0;
    item.classList.toggle('hidden', !match);
    if (match) visible++;
  });
  groups.forEach(function (g) {
    var hasVisible = Array.from(g.querySelectorAll('.glosar-item'))
      .some(function (i) { return !i.classList.contains('hidden'); });
    g.style.display = hasVisible ? '' : 'none';
  });
  var el = document.getElementById('glosar-count');
  if (el) el.textContent = query ? (visible + ' od ' + items.length) : (items.length + ' termina');
}

// ═══════════════════════════════════════════════════════
// SWIPE NAVIGATION (mobile) — swipe left/right between prev/next section.
// Excluded over code blocks, tables, sidebar and panels so their own
// horizontal scroll / taps aren't hijacked into a page navigation.
// ═══════════════════════════════════════════════════════
(function initSwipeNav() {
  const EXCLUDE = '.code-block, .tbl-wrap, #sidebar, #bm-panel, #quickref, #overflow-menu';
  let startX = 0, startY = 0, tracking = false;

  document.addEventListener('touchstart', e => {
    const sidebar = document.getElementById('sidebar');
    if (e.touches.length !== 1 || e.target.closest(EXCLUDE) || (sidebar && sidebar.classList.contains('open'))) {
      tracking = false;
      return;
    }
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < 90 || Math.abs(dy) > 60) return;   // needs a clear horizontal swipe
    const page = window.QA_PAGE || {};
    if (dx < 0 && page.nextUrl) window.location.href = page.nextUrl;
    else if (dx > 0 && page.prevUrl) window.location.href = page.prevUrl;
  }, { passive: true });
})();

// ═══════════════════════════════════════════════════════
// OFFLINE / INSTALL (PWA) — registers the service worker built by build.js.
// Skipped on file:// (service workers need http(s) or localhost).
// ═══════════════════════════════════════════════════════
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed:', err));
  });
}
