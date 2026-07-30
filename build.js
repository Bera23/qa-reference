'use strict';
const fs = require('fs');
const path = require('path');

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
    return `    <div class="nav-deo-wrap">
      <span class="nav-deo">${label}</span>
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
  if (!section) return '<div></div>';
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

function copyAssets() {
  fs.copyFileSync(path.join(ASSETS_DIR, 'style.css'), path.join(DIST_DIR, 'style.css'));
  fs.copyFileSync(path.join(ASSETS_DIR, 'script.js'), path.join(DIST_DIR, 'script.js'));
}

function main() {
  fs.mkdirSync(DIST_DIR, { recursive: true });
  const sections = readSections();
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  sections.forEach((_, i) => buildTopicPage(sections, i, template));
  copyAssets();
  console.log(`Built ${sections.length} topic pages into dist/`);
}

if (require.main === module) main();

module.exports = { readSections, renderSidebarNav, computeReadTime, stripTags, fillTemplate };
