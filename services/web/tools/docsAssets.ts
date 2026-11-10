import type { NavPage, NavSection, RenderedPage } from './docsSite'

/** Plantilla, estilos y script del sitio de documentación (sin dependencias: HTML estático + un script chico). */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const LOGO = `<svg viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="112" fill="#2f5bff"/><path d="M321.1 170.4A128 128 0 1 0 321.1 341.6" fill="none" stroke="#fff" stroke-width="64"/><path d="M361.1 170.4H438M361.1 341.6H438M414 204.4V307.6" stroke="#fff" stroke-width="18" stroke-linecap="round"/><path d="M414 170.4 398 210.4H430ZM414 341.6 398 301.6H430Z" fill="#fff"/></svg>`
const ICON = {
  search: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m13 13 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  menu: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  github: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>',
  theme: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 3.5a6.5 6.5 0 0 1 0 13Z" fill="currentColor"/></svg>',
}

export interface PageArgs {
  page: NavPage
  rendered: RenderedPage
  nav: NavSection[]
  prev?: NavPage
  next?: NavPage
  repoUrl: string
  version: string
  hash: string
}

const rel = (from: string, to: string) => {
  const p = from ? '../'.repeat(from.split('/').length) : './'
  return to ? `${p === './' ? '' : p}${to}/` : p
}

export function pageHtml(a: PageArgs): string {
  const { page, rendered: r } = a
  const root = a.page.slug ? '../'.repeat(a.page.slug.split('/').length) : './'
  const nav = a.nav
    .map(
      (s) =>
        `<div class="nav-section">${s.title ? `<h2>${esc(s.title)}</h2>` : ''}<ul>${s.pages
          .map((p) => `<li><a href="${rel(page.slug, p.slug)}"${p.slug === page.slug ? ' aria-current="page"' : ''}>${esc(p.title)}</a></li>`)
          .join('')}</ul></div>`,
    )
    .join('')
  const toc = r.toc.length
    ? `<aside class="toc" aria-label="On this page"><p class="toc-title">On this page</p><ul>${r.toc
        .map((t) => `<li><a class="lvl${t.depth}" href="#${t.id}">${esc(t.text)}</a></li>`)
        .join('')}</ul></aside>`
    : '<aside class="toc"></aside>'
  const pager = [
    a.prev ? `<a class="prev" href="${rel(page.slug, a.prev.slug)}"><span>Previous</span>${esc(a.prev.title)}</a>` : '<span></span>',
    a.next ? `<a class="next" href="${rel(page.slug, a.next.slug)}"><span>Next</span>${esc(a.next.title)}</a>` : '<span></span>',
  ].join('')
  const title = page.slug ? `${r.title} · Cota docs` : 'Cota documentation'
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(r.description)}">
<meta name="theme-color" content="#2f5bff">
<link rel="icon" href="${root}../favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${root}docs.css?v=${a.hash}">
<script>try{var t=localStorage.getItem('cota-docs-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>
</head>
<body data-root="${root}">
<a class="skip" href="#content">Skip to content</a>
<header class="top">
<button class="icon-btn menu-btn" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="sidebar">${ICON.menu}</button>
<a class="brand" href="${root}">${LOGO}<span class="brand-name">Cota</span><span class="brand-docs">Docs</span></a>
<button class="search-btn" type="button" aria-label="Search the docs">${ICON.search}<span class="search-label">Search the docs</span><kbd>/</kbd></button>
<nav class="top-links" aria-label="Site">
<a class="open-app" href="${root}../">Open Cota</a>
<a class="icon-btn" href="${a.repoUrl}" aria-label="Cota on GitHub">${ICON.github}</a>
<button class="icon-btn theme-btn" type="button" aria-label="Switch light or dark theme">${ICON.theme}</button>
</nav>
</header>
<div class="layout">
<aside class="sidebar" id="sidebar" aria-label="Documentation">${nav}</aside>
<main class="content" id="content">
<article class="prose">
${page.section ? `<p class="eyebrow">${esc(page.section)}</p>` : ''}
${r.html}
</article>
<nav class="pager" aria-label="Pages">${pager}</nav>
<footer class="page-foot"><span>Cota ${esc(a.version)} · Apache License 2.0</span><a href="${a.repoUrl}/edit/main/${page.file}">Edit this page on GitHub</a></footer>
</main>
${toc}
</div>
<div class="search-overlay" hidden>
<div class="search-panel" role="dialog" aria-modal="true" aria-label="Search the docs">
<div class="search-field">${ICON.search}<input type="search" placeholder="Search commands, guides and settings" aria-label="Search" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div>
<ul class="results" role="listbox"></ul>
</div>
</div>
<script src="${root}docs.js?v=${a.hash}" defer></script>
</body>
</html>
`
}

const LIGHT = `
  --bg: #ffffff;
  --bg-soft: #f6f8fb;
  --bg-code: #f4f6fa;
  --border: #e3e8ef;
  --text: #1a2233;
  --text-soft: #4f5a6e;
  --text-faint: #8590a3;
  --accent: #2f5bff;
  --accent-soft: #eef2ff;
  --accent-text: #2848d8;
  --note: #2f5bff;
  --tip: #11845b;
  --important: #7c3aed;
  --warning: #b86e00;
  --caution: #c8322a;
  --shadow: 0 24px 64px rgba(15, 23, 42, 0.22);`

const DARK = `
  --bg: #0d1220;
  --bg-soft: #141b2c;
  --bg-code: #111829;
  --border: #252f46;
  --text: #e6e9f1;
  --text-soft: #a7b0c3;
  --text-faint: #6f7a92;
  --accent: #6d88ff;
  --accent-soft: #1a2448;
  --accent-text: #9db0ff;
  --note: #6d88ff;
  --tip: #3cc28d;
  --important: #a78bfa;
  --warning: #e3a33b;
  --caution: #f0716a;
  --shadow: 0 24px 64px rgba(0, 0, 0, 0.55);`

export const DOCS_CSS = `:root {${LIGHT}
  --header-h: 60px;
  --sidebar-w: 268px;
  --toc-w: 230px;
  --measure: 780px;
  --font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {${DARK}
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {${DARK}
  color-scheme: dark;
}
*, *::before, *::after { box-sizing: border-box; }
html { scroll-padding-top: calc(var(--header-h) + 20px); -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.65 var(--font); -webkit-font-smoothing: antialiased; }
[hidden] { display: none !important; }
svg { display: block; }
.skip { position: absolute; left: -9999px; }
.skip:focus { left: 12px; top: 12px; z-index: 100; background: var(--bg); padding: 8px 12px; border-radius: 8px; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.top { position: sticky; top: 0; z-index: 40; height: var(--header-h); display: flex; align-items: center; gap: 14px; padding: 0 20px; background: color-mix(in srgb, var(--bg) 90%, transparent); backdrop-filter: saturate(1.4) blur(10px); border-bottom: 1px solid var(--border); }
.brand { display: flex; align-items: center; gap: 10px; color: var(--text); text-decoration: none; white-space: nowrap; }
.brand svg { width: 28px; height: 28px; }
.brand-name { font-weight: 700; font-size: 18px; letter-spacing: -0.01em; }
.brand-docs { color: var(--text-soft); font-weight: 500; font-size: 16px; padding-left: 10px; border-left: 1px solid var(--border); }
.search-btn { flex: 0 1 380px; margin-left: 28px; display: flex; align-items: center; gap: 9px; height: 38px; padding: 0 8px 0 12px; border: 1px solid var(--border); border-radius: 9px; background: var(--bg-soft); color: var(--text-faint); font: inherit; font-size: 14.5px; cursor: pointer; min-width: 0; }
.search-btn:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
.search-btn svg, .search-field svg { width: 17px; height: 17px; flex: none; }
.search-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.search-btn kbd, .search-field kbd { margin-left: auto; font: 12px var(--mono); color: var(--text-faint); border: 1px solid var(--border); border-radius: 5px; padding: 1px 6px; background: var(--bg); }
.top-links { margin-left: auto; display: flex; align-items: center; gap: 4px; }
.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border: 0; border-radius: 8px; background: none; color: var(--text-soft); cursor: pointer; }
.icon-btn:hover { background: var(--bg-soft); color: var(--text); }
.icon-btn svg { width: 19px; height: 19px; }
.open-app { margin-right: 6px; padding: 8px 16px; border-radius: 999px; background: var(--accent); color: #fff; font-weight: 600; font-size: 14px; text-decoration: none; white-space: nowrap; }
.open-app:hover { background: color-mix(in srgb, var(--accent) 86%, #000); }
.menu-btn { display: none; margin-left: -8px; }

.layout { display: grid; grid-template-columns: var(--sidebar-w) minmax(0, 1fr) var(--toc-w); max-width: 1480px; margin: 0 auto; }
.sidebar { position: sticky; top: var(--header-h); height: calc(100vh - var(--header-h)); overflow-y: auto; padding: 26px 14px 56px 20px; border-right: 1px solid var(--border); overscroll-behavior: contain; }
.nav-section { margin-bottom: 24px; }
.nav-section h2 { margin: 0 0 6px 10px; font-size: 12px; font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-faint); }
.nav-section ul, .toc ul { list-style: none; margin: 0; padding: 0; }
.nav-section a { display: block; padding: 5px 10px; border-radius: 7px; color: var(--text-soft); text-decoration: none; font-size: 14.5px; line-height: 1.4; }
.nav-section a:hover { color: var(--text); background: var(--bg-soft); }
.nav-section a[aria-current] { color: var(--accent-text); background: var(--accent-soft); font-weight: 600; }

.content { min-width: 0; padding: 44px 56px 88px; }
.prose { max-width: var(--measure); }
.eyebrow { margin: 0 0 8px; color: var(--accent-text); font-weight: 600; font-size: 14px; }
.prose h1 { margin: 0 0 22px; font-size: 36px; line-height: 1.18; letter-spacing: -0.025em; font-weight: 700; }
.prose h2 { margin: 52px 0 14px; font-size: 25px; line-height: 1.3; letter-spacing: -0.015em; font-weight: 650; }
.prose h3 { margin: 34px 0 10px; font-size: 19px; line-height: 1.35; font-weight: 650; }
.prose h4 { margin: 26px 0 8px; font-size: 16px; font-weight: 650; }
.prose h1 + p { font-size: 18px; color: var(--text-soft); }
.anchor { margin-left: 8px; color: var(--text-faint); text-decoration: none; opacity: 0; font-weight: 400; }
h2:hover .anchor, h3:hover .anchor, h4:hover .anchor, .anchor:focus { opacity: 1; }
.prose p, .prose ul, .prose ol { margin: 0 0 16px; }
.prose ul, .prose ol { padding-left: 24px; }
.prose li { margin: 4px 0; }
.prose li > ul, .prose li > ol { margin: 4px 0; }
.prose a { color: var(--accent-text); text-decoration: none; font-weight: 500; }
.prose a:hover { text-decoration: underline; text-underline-offset: 3px; }
.prose strong { font-weight: 650; }
.prose hr { border: 0; border-top: 1px solid var(--border); margin: 40px 0; }
.prose img { max-width: 100%; height: auto; border-radius: 10px; border: 1px solid var(--border); }
.prose blockquote { margin: 20px 0; padding: 2px 0 2px 18px; border-left: 3px solid var(--border); color: var(--text-soft); }
.prose code { font-family: var(--mono); font-size: 0.86em; background: var(--bg-code); border: 1px solid var(--border); border-radius: 5px; padding: 0.12em 0.38em; overflow-wrap: anywhere; }
.prose kbd { font-family: var(--mono); font-size: 0.8em; border: 1px solid var(--border); border-bottom-width: 2px; border-radius: 5px; padding: 0.1em 0.45em; background: var(--bg); white-space: nowrap; }
.code { margin: 20px 0; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--bg-code); }
.code-head { display: flex; align-items: center; justify-content: space-between; padding: 5px 6px 5px 14px; border-bottom: 1px solid var(--border); font-size: 12.5px; color: var(--text-faint); }
.copy { border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-soft); font: 12.5px var(--font); padding: 3px 10px; cursor: pointer; }
.copy:hover { color: var(--text); }
.code pre { margin: 0; padding: 14px 16px; overflow-x: auto; font: 13.5px/1.6 var(--mono); }
.code pre code { background: none; border: 0; padding: 0; font-size: inherit; overflow-wrap: normal; }
.table-wrap { margin: 20px 0; overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; }
table { width: 100%; border-collapse: collapse; font-size: 14.5px; line-height: 1.5; }
th { background: var(--bg-soft); text-align: left; font-weight: 600; white-space: nowrap; }
th, td { padding: 9px 14px; border-bottom: 1px solid var(--border); vertical-align: top; }
tbody tr:last-child td { border-bottom: 0; }
tr:target td { background: var(--accent-soft); }
td:first-child code { white-space: nowrap; }
.callout { margin: 22px 0; padding: 12px 16px; border: 1px solid color-mix(in srgb, var(--c) 30%, var(--border)); border-left: 4px solid var(--c); border-radius: 9px; background: color-mix(in srgb, var(--c) 7%, var(--bg)); }
.callout p:last-child { margin-bottom: 0; }
.callout-title { margin: 0 0 4px !important; font-weight: 650; color: var(--c); }
.callout.note { --c: var(--note); }
.callout.tip { --c: var(--tip); }
.callout.important { --c: var(--important); }
.callout.warning { --c: var(--warning); }
.callout.caution { --c: var(--caution); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; margin: 24px 0 32px; }
.prose a.card { display: block; padding: 16px 18px; border: 1px solid var(--border); border-radius: 12px; color: var(--text); background: var(--bg); transition: border-color 0.15s, box-shadow 0.15s; }
.prose a.card:hover { text-decoration: none; border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); box-shadow: 0 6px 20px rgba(15, 23, 42, 0.08); }
.card strong { display: block; margin-bottom: 4px; color: var(--accent-text); }
.card span { display: block; color: var(--text-soft); font-size: 14.5px; font-weight: 400; line-height: 1.5; }

.pager { display: flex; gap: 16px; max-width: var(--measure); margin-top: 60px; }
.pager > * { flex: 1; }
.pager a { padding: 14px 18px; border: 1px solid var(--border); border-radius: 11px; color: var(--accent-text); font-weight: 600; text-decoration: none; }
.pager a:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); }
.pager a span { display: block; color: var(--text-faint); font-size: 13px; font-weight: 500; }
.pager .next { text-align: right; }
.page-foot { display: flex; flex-wrap: wrap; gap: 8px 20px; justify-content: space-between; max-width: var(--measure); margin-top: 36px; padding-top: 20px; border-top: 1px solid var(--border); color: var(--text-faint); font-size: 13.5px; }
.page-foot a { color: var(--text-soft); }

.toc { position: sticky; top: var(--header-h); height: calc(100vh - var(--header-h)); overflow-y: auto; padding: 46px 20px 40px 6px; font-size: 13.5px; }
.toc-title { margin: 0 0 10px; font-size: 12px; font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-faint); }
.toc a { display: block; padding: 4px 0 4px 12px; border-left: 2px solid var(--border); color: var(--text-soft); text-decoration: none; line-height: 1.4; }
.toc a.lvl3 { padding-left: 24px; font-size: 13px; }
.toc a:hover { color: var(--text); }
.toc a.active { color: var(--accent-text); border-left-color: var(--accent); font-weight: 600; }

.search-overlay { position: fixed; inset: 0; z-index: 60; display: flex; justify-content: center; align-items: flex-start; padding: 11vh 16px 16px; background: rgba(8, 12, 24, 0.46); }
.search-panel { width: min(660px, 100%); max-height: 76vh; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border); border-radius: 14px; background: var(--bg); box-shadow: var(--shadow); }
.search-field { display: flex; align-items: center; gap: 10px; padding: 0 14px 0 18px; border-bottom: 1px solid var(--border); color: var(--text-faint); }
.search-field input { flex: 1; min-width: 0; height: 56px; border: 0; outline: 0; background: none; color: var(--text); font: inherit; font-size: 17px; }
.search-field input::-webkit-search-cancel-button { display: none; }
.results { list-style: none; margin: 0; padding: 8px; overflow-y: auto; }
.results a { display: block; padding: 9px 12px; border-radius: 9px; color: var(--text); text-decoration: none; }
.results a.sel { background: var(--accent-soft); }
.r-h { font-weight: 600; }
.r-h mark, .r-x mark { background: none; color: var(--accent-text); }
.r-s { display: block; color: var(--text-faint); font-size: 12.5px; }
.r-x { display: block; color: var(--text-soft); font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.search-empty { padding: 18px 14px; color: var(--text-faint); }

@media (max-width: 1200px) {
  .layout { grid-template-columns: var(--sidebar-w) minmax(0, 1fr); }
  .toc { display: none; }
}
@media (max-width: 880px) {
  .layout { display: block; }
  .menu-btn { display: inline-flex; }
  .sidebar { position: fixed; z-index: 35; top: var(--header-h); left: 0; bottom: 0; width: min(310px, 86vw); height: auto; background: var(--bg); transform: translateX(-102%); transition: transform 0.2s ease; }
  body.nav-open .sidebar { transform: none; box-shadow: var(--shadow); }
  body.nav-open::after { content: ""; position: fixed; inset: var(--header-h) 0 0 0; z-index: 30; background: rgba(8, 12, 24, 0.35); }
  .content { padding: 28px 16px 64px; }
  .top { gap: 8px; padding: 0 12px; }
  .search-btn { margin-left: 6px; flex: 1; }
  .search-btn kbd, .brand-docs, .open-app { display: none; }
  .prose h1 { font-size: 29px; }
  .prose h2 { font-size: 22px; margin-top: 42px; }
  .pager { flex-direction: column; }
}
@media (max-width: 420px) {
  .brand-name { display: none; }
}
`

/** Script del sitio: tema, menú del teléfono, copiar código, índice activo y buscador. */
export const DOCS_JS = `(function () {
  var doc = document.documentElement
  var body = document.body
  var root = body.getAttribute('data-root') || './'

  // Una fila de la tabla de comandos con su sección en la referencia (F1 desde la app abre commands/#nombre): se va
  // directo a la sección.
  if (location.hash) {
    var row = document.getElementById(decodeURIComponent(location.hash.slice(1)))
    var link = row && row.tagName === 'TR' && row.querySelector('td:first-child a[href]')
    if (link) location.replace(link.href)
  }

  var themeBtn = document.querySelector('.theme-btn')
  if (themeBtn) themeBtn.addEventListener('click', function () {
    var cur = doc.getAttribute('data-theme')
    var dark = cur ? cur === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
    var next = dark ? 'light' : 'dark'
    doc.setAttribute('data-theme', next)
    try { localStorage.setItem('cota-docs-theme', next) } catch (e) { /* sin almacenamiento */ }
  })

  var menuBtn = document.querySelector('.menu-btn')
  function setNav(open) {
    body.classList.toggle('nav-open', open)
    if (menuBtn) menuBtn.setAttribute('aria-expanded', String(open))
  }
  if (menuBtn) menuBtn.addEventListener('click', function () { setNav(!body.classList.contains('nav-open')) })
  document.addEventListener('click', function (e) {
    if (body.classList.contains('nav-open') && !e.target.closest('.sidebar') && !e.target.closest('.menu-btn')) setNav(false)
  })
  var current = document.querySelector('.sidebar a[aria-current]')
  if (current && current.scrollIntoView) current.scrollIntoView({ block: 'center' })

  document.querySelectorAll('.code .copy').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = b.closest('.code').querySelector('code').textContent
      var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy' }, 1600) }
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {})
    })
  })

  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc a'))
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var heads = tocLinks.map(function (a) { return document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))) })
    var visible = new Set()
    var mark = function () {
      var first = -1
      for (var i = 0; i < heads.length; i++) if (heads[i] && visible.has(heads[i])) { first = i; break }
      if (first < 0) {
        for (var j = heads.length - 1; j >= 0; j--) if (heads[j] && heads[j].getBoundingClientRect().top < 120) { first = j; break }
      }
      tocLinks.forEach(function (a, k) { a.classList.toggle('active', k === first) })
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) visible.add(en.target); else visible.delete(en.target) })
      mark()
    }, { rootMargin: '-70px 0px -55% 0px' })
    heads.forEach(function (h) { if (h) io.observe(h) })
  }

  var overlay = document.querySelector('.search-overlay')
  var input = overlay && overlay.querySelector('input')
  var list = overlay && overlay.querySelector('.results')
  var index = null
  var sel = 0
  var lastFocus = null
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  function hi(s, words) {
    var out = esc(s)
    words.forEach(function (w) {
      if (w.length < 2) return
      out = out.replace(new RegExp('(' + esc(w).replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + ')', 'ig'), '<mark>$1</mark>')
    })
    return out
  }
  function score(e, q, words) {
    var h = e.h.toLowerCase()
    var k = (e.k || '').toLowerCase()
    var all = h + ' ' + k + ' ' + e.s.toLowerCase() + ' ' + e.x.toLowerCase()
    for (var i = 0; i < words.length; i++) if (all.indexOf(words[i]) < 0) return 0
    var s = 1
    if (h === q) s += 100
    else if (h.indexOf(q) === 0) s += 40
    else if (h.indexOf(q) >= 0) s += 20
    if ((', ' + k + ',').indexOf(', ' + q + ',') >= 0) s += 60
    words.forEach(function (w) { if (h.indexOf(w) >= 0) s += 6; if (k.indexOf(w) >= 0) s += 4 })
    if (e.u.indexOf('#') < 0) s += 3
    return s
  }
  function render() {
    var q = input.value.trim().toLowerCase()
    if (!index) { list.innerHTML = '<li class="search-empty">Loading…</li>'; return }
    if (!q) { list.innerHTML = '<li class="search-empty">Type a command (FILLET), a topic (object snaps) or a setting (OSMODE).</li>'; return }
    var words = q.split(/\\s+/)
    var hits = []
    for (var i = 0; i < index.length; i++) {
      var s = score(index[i], q, words)
      if (s) hits.push({ e: index[i], s: s })
    }
    hits.sort(function (a, b) { return b.s - a.s })
    hits = hits.slice(0, 30)
    sel = 0
    if (!hits.length) { list.innerHTML = '<li class="search-empty">No results for “' + esc(input.value.trim()) + '”.</li>'; return }
    list.innerHTML = hits.map(function (h, i) {
      var e = h.e
      return '<li><a role="option" href="' + root + e.u.replace(/^([^#]+)/, '$1/').replace(/^#/, '') + '"' + (i === 0 ? ' class="sel"' : '') + '>' +
        '<span class="r-s">' + esc(e.s || 'Cota docs') + '</span><span class="r-h">' + hi(e.h, words) + (e.k ? ' <span class="r-s" style="display:inline">· ' + esc(e.k) + '</span>' : '') + '</span>' +
        (e.x ? '<span class="r-x">' + hi(e.x, words) + '</span>' : '') + '</a></li>'
    }).join('')
  }
  function move(d) {
    var items = list.querySelectorAll('a')
    if (!items.length) return
    items[sel].classList.remove('sel')
    sel = (sel + d + items.length) % items.length
    items[sel].classList.add('sel')
    items[sel].scrollIntoView({ block: 'nearest' })
  }
  function open() {
    if (!overlay) return
    lastFocus = document.activeElement
    overlay.hidden = false
    input.focus()
    input.select()
    render()
    if (!index) fetch(root + 'search.json').then(function (r) { return r.json() }).then(function (j) { index = j; render() }, function () { list.innerHTML = '<li class="search-empty">Search is not available offline.</li>' })
  }
  function close() {
    overlay.hidden = true
    if (lastFocus && lastFocus.focus) lastFocus.focus()
  }
  var sb = document.querySelector('.search-btn')
  if (sb) sb.addEventListener('click', open)
  if (overlay) {
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close() })
    input.addEventListener('input', render)
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
      else if (e.key === 'Enter') { var a = list.querySelectorAll('a')[sel]; if (a) { e.preventDefault(); close(); location.href = a.href } }
      else if (e.key === 'Escape') { e.preventDefault(); close() }
    })
    list.addEventListener('click', function () { close() })
  }
  document.addEventListener('keydown', function (e) {
    var t = e.target
    var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
    if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
      if (overlay && overlay.hidden) { e.preventDefault(); open() }
    } else if (e.key === 'Escape' && body.classList.contains('nav-open')) setNav(false)
  })
})()
`
