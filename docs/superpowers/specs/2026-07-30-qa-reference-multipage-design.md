# QA Reference — Multi-Page Site + GitHub Pages — Design

Date: 2026-07-30
Status: Approved, ready for implementation plan

## Problem

`QA_Referentni_Dokument.html` is a single 2269-line, 164KB self-contained file (inline CSS/JS,
all 20 topics in one page) covering manual testing (Deo I) and automation (Deo II). It works well
as a document but is awkward to maintain (one giant file) and can only be opened locally — no way
to reach it from a phone/other machine without copying the file around.

## Goal

1. Split the source content into one file per topic, so editing a topic doesn't mean scrolling a
   2000+ line file.
2. Generate a real multi-page static site from those source files (shared sidebar/CSS/JS), so
   each topic has its own URL.
3. Publish it to GitHub Pages so it's reachable from any browser, any device, any time.

## Non-goals

- No visual redesign — the existing dark theme, sidebar, table/code-block styling carries over
  unchanged. This is a structural change (file organization + delivery), not a design refresh.
- No backend, no build framework (Webpack/Vite/etc.), no npm dependencies — the site is static
  and the build script only needs Node's built-in APIs.
- No user accounts / sync — bookmarks and read-progress stay `localStorage`-based, same as today
  (single-browser, single-device; already an accepted limitation of the original document).

## Source File Structure

```
QA Document/                   (repo root, already `git init`-ed)
├── CLAUDE.md
├── build.js                       Node script, zero dependencies
├── data/
│   └── sections.json              id, title, icon, deo (I/II), read-time — one entry per topic
├── sections/
│   ├── s01.html ... s20.html      raw content fragment per topic (h2/h3/table/code-block/etc.,
│   │                               no page chrome — same markup style as the original doc's
│   │                               per-section bodies)
├── template.html                  shared shell: sidebar, topbar, {{CONTENT}} placeholder,
│                                   {{PREV_URL}}/{{NEXT_URL}}/{{ACTIVE_ID}} placeholders
├── assets/
│   ├── style.css                  CSS extracted from the original file, unchanged rules
│   └── script.js                  shared JS (see "Behavioral Changes" below)
└── dist/                          build.js OUTPUT — this is what gets pushed to GitHub Pages
    ├── index.html                 landing/cover page: title + Deo I / Deo II topic list
    ├── s01.html ... s20.html      one generated page per topic
    ├── search-index.json          generated from sections/ content, used by the search box
    ├── style.css, script.js       copied from assets/
```

`sections/*.html` and `data/sections.json` are hand-edited. `dist/` is fully generated — never
hand-edited (noted in `CLAUDE.md`'s Workflow Preferences).

## Build Process

`node build.js`:
1. Reads `data/sections.json` for the ordered topic list + metadata.
2. For each topic, reads `sections/<id>.html`, injects it into `template.html` (replacing
   `{{CONTENT}}`), sets the sidebar's active item, wires `{{PREV_URL}}`/`{{NEXT_URL}}` to the
   adjacent topic's filename (or omits the button at the first/last topic).
3. Writes each generated page to `dist/<id>.html`.
4. Generates `dist/index.html` from a small dedicated landing template (title, short intro, Deo I
   / Deo II topic list linking into `dist/s01.html` etc.) — new, doesn't exist in the original
   single-file doc, which currently opens straight into topic 1.
5. Walks all `sections/*.html`, strips tags, and writes `dist/search-index.json`: an array of
   `{id, title, deo, url, text}` used by the search box (see below).
6. Copies `assets/style.css` and `assets/script.js` into `dist/` unchanged.

No incremental build / watch mode — regenerating the whole `dist/` folder from scratch every run
is fast enough at this size (20 short files) and avoids stale-output bugs.

## Behavioral Changes (vs. the original single-file document)

The original's JS (`SECTIONS` array, mark-as-read, bookmarks, search, reading mode, theme, font
size, keyboard shortcuts, syntax highlighting, print) is preserved feature-for-feature, adapted
for multi-page:

- **Sidebar / Prev-Next / J-K keyboard nav**: instead of `scrollIntoView` within one page, these
  now navigate to another generated HTML file (`window.location = url`). Same visual list, same
  keys, different mechanism underneath.
- **Search**: the original searches text already present on the (single) page and highlights
  inline matches. Since content now lives across 20 files, `script.js` fetches
  `search-index.json` once, and typing in the search box filters that index client-side, showing
  a dropdown of matching topics (title + a short snippet) with links — clicking a result
  navigates to that topic's page. This is a deliberate behavior change from inline-highlight to
  a "jump to topic" search, appropriate for a multi-page site.
- **Bookmarks**: stored the same way (`localStorage`, keyed by heading slug), but each entry now
  also stores the topic's page URL. Clicking a bookmark navigates to that page (if not already on
  it) and then scrolls to the heading.
- **Mark-as-read / progress checkmarks**: unchanged — still keyed by topic id in `localStorage`,
  sidebar checkmarks render correctly on every page since the sidebar (and its read-state script)
  is shared across all generated pages.
- **Progress bar, theme toggle, font size, reading mode, print, syntax highlighting, copy-code
  button**: unchanged, all operate within a single page already and need no cross-page logic.
- **Duplicate section-meta bug fix**: the original document injects a "read time + mark-as-read
  button" block twice per topic — once hardcoded in the source HTML, once again via JS
  (`addSectionMeta`). The rebuilt `sections/*.html` partials will carry the info only in
  `data/sections.json` (read-time is computed at build time from word count, same formula as the
  original's JS), and `template.html` renders it once. This removes the duplicate "Oznaci kao
  procitano" button without changing anything the user actually asked for.

## Deployment

- New public GitHub repo: `qa-reference`, created on the already-authenticated `Bera23` account
  via `gh repo create`.
- `dist/` contents pushed to the repo (root of `main`, or `gh-pages` branch — decided during
  implementation based on whichever `gh`/Pages defaults require the least manual clicking).
  Source files (`sections/`, `build.js`, `assets/`, `data/`, `template.html`, `CLAUDE.md`, this
  spec) live in the same repo, outside `dist/`, so editing and the live site stay in one place.
- GitHub Pages enabled via `gh api`/`gh repo edit` or a one-time manual Settings → Pages step if
  the CLI path turns out unreliable.
- Final URL: `https://bera23.github.io/qa-reference/`.

## Verification

After `node build.js`, before pushing:
- Open `dist/index.html` locally, confirm the Deo I / Deo II topic list renders and links work.
- Open at least one topic from each Deo, confirm: sidebar highlights the right active item,
  prev/next buttons go to the right neighbor, mark-as-read toggles and persists across a reload,
  bookmark a heading and confirm it appears in the bookmarks panel, search for a term that only
  exists in a different topic and confirm the result links there correctly, toggle theme and font
  size, toggle reading mode, confirm code-block copy buttons still work.
- After the first real push, open the live `https://bera23.github.io/qa-reference/` URL and
  repeat a quick pass of the same checks (Pages' asset paths must be relative, not
  `/absolute` — the original `dist/` structure won't have a sub-path, but this is only proven
  once pages actually serve from GitHub's URL space).

## Open Questions / Decisions Deferred to Implementation

- Exact Pages source (root of `main` vs. a `gh-pages` branch vs. `/docs` folder) — pick whichever
  `gh` supports with the fewest manual steps; functionally equivalent either way.
- Whether `dist/` itself is committed to git (simplest — no CI build step needed) vs. built by a
  GitHub Action on push (adds moving parts for no real benefit at this scale) — **decision: commit
  `dist/` directly**, rebuilding locally and re-pushing on every content change. Revisit only if
  this becomes actually annoying in practice.
