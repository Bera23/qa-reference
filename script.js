'use strict';

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  addAnchorLinks();
  addBookmarkButtons();
  restoreState();
  initSyntaxHighlight();
  updateBmCount();
  initNavHeights();
  filterGlosar('');
  loadSearchIndex();
});

// ═══════════════════════════════════════════════════════
// ANCHOR LINKS on h2
// ═══════════════════════════════════════════════════════
function addAnchorLinks() {
  document.querySelectorAll('h2.sub-title').forEach((h2, i) => {
    const slug = 'h-' + i;
    h2.id = slug;
    const a = document.createElement('a');
    a.className = 'anchor';
    a.href = '#' + slug;
    a.textContent = '#';
    a.title = 'Kopiraj link';
    a.onclick = (e) => {
      e.preventDefault();
      navigator.clipboard.writeText(location.href.split('#')[0] + '#' + slug);
      a.textContent = '✓'; setTimeout(() => a.textContent = '#', 1500);
    };
    h2.appendChild(a);
  });
}

// ═══════════════════════════════════════════════════════
// BOOKMARK BUTTONS on h2
// ═══════════════════════════════════════════════════════
function addBookmarkButtons() {
  document.querySelectorAll('h2.sub-title').forEach(h2 => {
    const slug = h2.id;
    const title = h2.innerText.replace('#', '').trim();
    const btn = document.createElement('button');
    btn.className = 'bm-btn';
    btn.textContent = '★';
    btn.title = 'Bookmark';
    btn.dataset.slug = slug;
    btn.dataset.title = title;
    btn.dataset.section = window.QA_PAGE.title;
    btn.dataset.url = window.QA_PAGE.id + '.html';
    btn.onclick = () => toggleBookmark(btn);
    h2.insertBefore(btn, h2.querySelector('.anchor') || null);
  });
  refreshAllBmButtons();
}

// ═══════════════════════════════════════════════════════
// MARK READ
// ═══════════════════════════════════════════════════════
function markRead(id) {
  const reads = JSON.parse(localStorage.getItem('qa_reads') || '[]');
  const idx = reads.indexOf(id);
  if (idx === -1) reads.push(id); else reads.splice(idx, 1);
  localStorage.setItem('qa_reads', JSON.stringify(reads));
  applyReadState(id, reads.includes(id));
}
function toggleRead(e, id) { e.preventDefault(); e.stopPropagation(); markRead(id); }
function applyReadState(id, isRead) {
  const check = document.querySelector(`.nav-check[onclick*="${id}"]`);
  if (check) { check.classList.toggle('done', isRead); check.textContent = isRead ? '✓' : ''; }
  const btn = document.getElementById('mrb-' + id);
  if (btn) { btn.classList.toggle('done', isRead); btn.textContent = isRead ? '✓ Procitano' : 'Oznaci kao procitano'; }
  const badge = document.querySelector(`#t-${id} .read-badge`);
  if (badge) badge.classList.toggle('visible', isRead);
}

// ═══════════════════════════════════════════════════════
// BOOKMARKS (now store a `url` alongside `slug`, since a slug like
// "h-0" is only unique WITHIN one page, not across the whole site)
// ═══════════════════════════════════════════════════════
function getBookmarks() { return JSON.parse(localStorage.getItem('qa_bookmarks') || '[]'); }
function saveBookmarks(bms) { localStorage.setItem('qa_bookmarks', JSON.stringify(bms)); }
function refreshAllBmButtons() {
  const keySet = new Set(getBookmarks().map(b => b.url + '#' + b.slug));
  document.querySelectorAll('.bm-btn').forEach(btn => {
    btn.classList.toggle('active', keySet.has(btn.dataset.url + '#' + btn.dataset.slug));
  });
}
function toggleBookmark(btn) {
  const { slug, title, section, url } = btn.dataset;
  let bms = getBookmarks();
  const idx = bms.findIndex(b => b.slug === slug && b.url === url);
  if (idx === -1) bms.push({ slug, title, section, url }); else bms.splice(idx, 1);
  saveBookmarks(bms);
  refreshAllBmButtons();
  renderBookmarks();
  updateBmCount();
}
function updateBmCount() {
  const c = getBookmarks().length;
  const el = document.getElementById('bm-count');
  el.textContent = c; el.style.display = c > 0 ? 'inline' : 'none';
}
function renderBookmarks() {
  const bms = getBookmarks();
  const list = document.getElementById('bm-list');
  if (bms.length === 0) {
    list.innerHTML = '<div id="bm-empty">Nema bookmarks-a.<br><small>Klikni ★ pored bilo kog podnaslova.</small></div>';
    return;
  }
  list.innerHTML = bms.map(b => `
    <div class="bm-entry" onclick="goToBookmark('${b.url}','${b.slug}')">
      <button class="bm-entry-del" onclick="removeBm(event,'${b.slug}','${b.url}')">✕</button>
      <div class="bm-entry-title">${b.title}</div>
      <div class="bm-entry-section">${b.section}</div>
    </div>`).join('');
}
function removeBm(e, slug, url) {
  e.stopPropagation();
  let bms = getBookmarks().filter(b => !(b.slug === slug && b.url === url));
  saveBookmarks(bms);
  refreshAllBmButtons();
  renderBookmarks();
  updateBmCount();
}
function goToBookmark(url, slug) {
  if (url !== window.QA_PAGE.id + '.html') {
    window.location.href = url + '#' + slug;
    return;
  }
  const el = document.getElementById(slug);
  if (el) { el.scrollIntoView({ behavior: 'smooth' }); closeBmPanel(); }
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
let searchTimeout;
function searchDoc(query) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const box = document.getElementById('search-results');
    const countEl = document.getElementById('search-count');
    const q = query.trim().toLowerCase();
    if (!q || !searchIndex) { box.innerHTML = ''; box.classList.remove('visible'); countEl.textContent = ''; return; }
    const hits = searchIndex.filter(s => s.title.toLowerCase().includes(q) || s.text.toLowerCase().includes(q));
    countEl.textContent = hits.length > 0 ? `${hits.length} pogodak${hits.length === 1 ? '' : 'a'}` : 'Nema';
    box.innerHTML = hits.map(h => {
      const idx = h.text.toLowerCase().indexOf(q);
      const snippet = idx >= 0
        ? '…' + h.text.slice(Math.max(0, idx - 40), idx + 60) + '…'
        : h.text.slice(0, 80) + '…';
      return `<a class="search-result" href="${h.url}"><span class="sr-title">${h.title}</span><span class="sr-snippet">${snippet}</span></a>`;
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
let fontSize = parseInt(localStorage.getItem('qa_fs') || '15');
function applyFontSize() {
  document.documentElement.style.setProperty('--fs', fontSize + 'px');
  document.getElementById('fs-display').textContent = fontSize;
  localStorage.setItem('qa_fs', fontSize);
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
  navigator.clipboard.writeText(location.href.split('#')[0]);
  const toast = document.getElementById('share-toast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ═══════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════
function toggleTheme() {
  document.body.classList.toggle('light');
  const isLight = document.body.classList.contains('light');
  document.getElementById('theme-btn').textContent = isLight ? '☾' : '☀';
  localStorage.setItem('qa_theme', isLight ? 'light' : 'dark');
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
  navigator.clipboard.writeText(pre.innerText).then(() => {
    btn.textContent = '✓ copied'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'copy'; btn.classList.remove('copied'); }, 2000);
  });
}

// ═══════════════════════════════════════════════════════
// SYNTAX HIGHLIGHT
// ═══════════════════════════════════════════════════════
function initSyntaxHighlight() {
  document.querySelectorAll('.code-block pre').forEach(pre => {
    let lines = pre.innerHTML.split('\n');
    lines = lines.map(line => {
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('#')) {
        return '<span class="cm">' + line + '</span>';
      }
      line = line.replace(/\b(public|private|static|void|class|new|return|var|string|bool|int|if|else|true|false|null|this|using|namespace|override|abstract|readonly|const|async|await|foreach)\b/g, '<span class="kw">$1</span>');
      line = line.replace(/('[^']*')/g, '<span class="st">$1</span>');
      return line;
    });
    pre.innerHTML = lines.join('\n');
  });
}

// ═══════════════════════════════════════════════════════
// KEYBOARD (j/k now navigate to a different page instead of
// scrolling within one — QA_PAGE.prevUrl/nextUrl come from the
// per-page inline script Task 6 embeds)
// ═══════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') {
    if (e.key === 'Escape') { e.target.blur(); searchDoc(''); }
    return;
  }
  if (e.key === '/') { e.preventDefault(); document.getElementById('search').focus(); return; }
  if (e.key === 'Escape') { closeBmPanel(); return; }
  if (e.key === 'j' || e.key === 'J') { if (window.QA_PAGE.nextUrl) window.location.href = window.QA_PAGE.nextUrl; }
  if (e.key === 'k' || e.key === 'K') { if (window.QA_PAGE.prevUrl) window.location.href = window.QA_PAGE.prevUrl; }
  if (e.key === 'r' || e.key === 'R') toggleReadingMode();
  if (e.key === 'p' || e.key === 'P') printDoc();
});

// ═══════════════════════════════════════════════════════
// RESTORE STATE
// ═══════════════════════════════════════════════════════
function restoreState() {
  if (localStorage.getItem('qa_theme') === 'light') {
    document.body.classList.add('light');
    document.getElementById('theme-btn').textContent = '☾';
  }
  applyFontSize();
  const reads = JSON.parse(localStorage.getItem('qa_reads') || '[]');
  reads.forEach(id => applyReadState(id, true));
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
