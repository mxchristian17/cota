import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Marked, type Token, type Tokens } from 'marked'
import type { Plugin } from 'vite'
import { DOCS_CSS, DOCS_JS, pageHtml } from './docsAssets'

/**
 * Sitio de documentación (`/docs/`): páginas estáticas generadas del Markdown de `docs/`, aparte de la app (sin React
 * ni motor). `docs/SUMMARY.md` define la navegación: cada `## Sección` agrupa los enlaces `- [Título](archivo.md)`
 * que le siguen. Cada página sale en `docs/<ruta>/index.html` con URLs relativas, así funciona bajo cualquier base
 * (`/`, `/cota/`). En `npm run dev` las mismas páginas se generan al vuelo. Sin `SUMMARY.md` no se genera nada.
 */

export interface NavPage {
  title: string
  /** Ruta del Markdown desde la raíz del repositorio (`docs/guides/snaps.md`, `CHANGELOG.md`). */
  file: string
  /** Carpeta de la página dentro de `docs/` (`guides/snaps`); la portada es ''. */
  slug: string
  section: string
}

export interface NavSection {
  title: string
  pages: NavPage[]
}

export interface TocItem {
  depth: number
  id: string
  text: string
}

/** Entrada del buscador: título, dónde está (`s`), URL relativa a `docs/`, texto y alias (`k`). */
export interface SearchEntry {
  h: string
  s: string
  u: string
  x: string
  k?: string
}

export interface SiteOptions {
  /** Raíz del repositorio (donde están `docs/` y `CHANGELOG.md`). */
  root: string
  repoUrl: string
  version: string
}

const SUMMARY = 'docs/SUMMARY.md'

/** Carpeta de la página: `docs/index.md` → '', `docs/guides/x.md` → 'guides/x', `CHANGELOG.md` → 'changelog'. */
export function pageSlug(file: string): string {
  const f = file.replace(/\.md$/i, '')
  const inDocs = f.startsWith('docs/') ? f.slice(5) : posix.basename(f)
  const s = inDocs.toLowerCase() === 'index' ? '' : inDocs.replace(/\/index$/i, '')
  return f.startsWith('docs/') ? s : s.toLowerCase()
}

/** Navegación desde `docs/SUMMARY.md`. Los enlaces son relativos a `docs/`. */
export function parseSummary(md: string): NavSection[] {
  const sections: NavSection[] = []
  for (const line of md.split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line)
    if (h) {
      sections.push({ title: h[1], pages: [] })
      continue
    }
    const l = /^\s*[-*]\s+\[([^\]]+)\]\(([^)#\s]+\.md)\)/.exec(line)
    if (!l) continue
    if (!sections.length) sections.push({ title: '', pages: [] })
    const sec = sections[sections.length - 1]
    const file = posix.normalize(posix.join('docs', l[2]))
    sec.pages.push({ title: l[1], file, slug: pageSlug(file), section: sec.title })
  }
  return sections.filter((s) => s.pages.length)
}

/** Texto plano de un fragmento de Markdown o HTML (títulos, buscador). */
export function plainText(md: string): string {
  return md
    .replace(/<[^>]+>/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Ancla de un título como las de GitHub (los enlaces `user-guide.md#the-command-line` siguen valiendo). */
export function headingId(text: string, used: Map<string, number>): string {
  const base = plainText(text).toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '').replace(/\s/g, '-') || 'section'
  const n = used.get(base)
  used.set(base, (n ?? -1) + 1)
  return n === undefined ? base : `${base}-${n + 1}`
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Prefijo relativo desde la página hasta `docs/`: '' → './', 'a/b' → '../../'. */
export function rootPrefix(slug: string): string {
  return slug ? '../'.repeat(slug.split('/').length) : './'
}

/** URL relativa de una página a otra (siempre con barra final: las páginas son carpetas). */
export function pageUrl(from: string, to: string): string {
  const p = rootPrefix(from)
  return to ? `${p === './' ? '' : p}${to}/` : p
}

const ALERTS: Record<string, string> = { NOTE: 'Note', TIP: 'Tip', IMPORTANT: 'Important', WARNING: 'Warning', CAUTION: 'Caution' }

/** Las tablas cuya primera columna es un nombre en código (comandos, variables) dan una fila con ancla. */
function codeRows(t: Tokens.Table): string[] | null {
  const names = t.rows.map((r) => /^`([^`\s]+)`$/.exec(r[0]?.text.trim() ?? '')?.[1] ?? '')
  return names.length && names.every(Boolean) ? names : null
}

export interface RenderedPage {
  title: string
  description: string
  html: string
  toc: TocItem[]
  search: SearchEntry[]
  /** Archivos del repositorio que la página muestra (imágenes de `docs/`). */
  assets: string[]
}

/**
 * Markdown → HTML de una página. Los enlaces a otras páginas del sitio pasan a sus carpetas; las imágenes de
 * `docs/` se copian al sitio; el resto de los archivos del repositorio se abre en GitHub.
 */
export function renderPage(src: string, page: NavPage, byFile: Map<string, NavPage>, repoUrl: string): RenderedPage {
  const md = new Marked({ gfm: true })
  const used = new Map<string, number>()
  const toc: TocItem[] = []
  const search: SearchEntry[] = []
  const assets: string[] = []
  const tokens = md.lexer(src)
  let title = ''
  let description = ''
  let h2 = ''
  let entry: SearchEntry | null = null
  const add = (e: SearchEntry) => {
    search.push(e)
    return e
  }
  // Anclas, índice y buscador en orden de documento, antes de generar el HTML.
  md.walkTokens(tokens, (t: Token) => {
    if (t.type === 'heading') {
      const h = t as Tokens.Heading & { id?: string }
      h.id = headingId(h.text, used)
      const text = plainText(h.text)
      if (h.depth === 1 && !title) title = text
      if (h.depth === 2 || h.depth === 3) toc.push({ depth: h.depth, id: h.id, text })
      if (h.depth === 2) h2 = text
    }
    if (t.type === 'table') {
      const tb = t as Tokens.Table & { ids?: string[] }
      const names = codeRows(tb)
      if (names) tb.ids = names.map((n) => headingId(n, used))
    }
  })
  if (!title) title = page.title
  // Buscador: un resultado por título (con el texto que le sigue) y uno por fila de comando o variable.
  h2 = ''
  for (const t of tokens) {
    if (t.type === 'heading') {
      const h = t as Tokens.Heading & { id: string }
      const text = plainText(h.text)
      if (h.depth === 2) h2 = text
      entry = add({ h: text, s: h.depth === 1 ? page.section : h.depth === 2 ? title : `${title} › ${h2}`, u: h.depth === 1 ? page.slug : `${page.slug}#${h.id}`, x: '' })
    } else if (t.type === 'paragraph' || t.type === 'list' || t.type === 'blockquote') {
      const text = plainText(t.raw.replace(/^\s*[-*>]\s+/gm, ''))
      if (!description && t.type === 'paragraph') description = text.slice(0, 180)
      if (!entry) entry = add({ h: title, s: page.section, u: page.slug, x: '' })
      if (entry.x.length < 240) entry.x = (entry.x + ' ' + text).trim().slice(0, 240)
    } else if (t.type === 'table') {
      const tb = t as Tokens.Table & { ids?: string[] }
      if (!tb.ids) continue
      const aliasCol = tb.header.findIndex((c) => /^alias/i.test(c.text.trim()))
      tb.rows.forEach((r, i) => {
        const text = r.flatMap((c, j) => (j === 0 || j === aliasCol ? [] : [plainText(c.text)])).join(' — ')
        const aliases = aliasCol > 0 ? plainText(r[aliasCol]?.text ?? '').replace(/^—$/, '') : ''
        add({ h: plainText(r[0].text), s: h2 ? `${title} › ${h2}` : title, u: `${page.slug}#${tb.ids![i]}`, x: text.slice(0, 200), ...(aliases ? { k: aliases } : {}) })
      })
    }
  }

  const dir = posix.dirname(page.file)
  const rewrite = (url: string, isImage: boolean): string => {
    if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(url)) return url
    const [path, frag = ''] = url.split('#')
    const hash = frag ? `#${frag}` : ''
    if (!path) return url
    const target = posix.normalize(posix.join(dir, decodeURI(path)))
    if (target.startsWith('..')) return url
    const linked = byFile.get(target)
    if (linked) return pageUrl(page.slug, linked.slug) + hash
    if (isImage && target.startsWith('docs/')) {
      assets.push(target)
      return rootPrefix(page.slug).replace(/^\.\/$/, '') + target.slice(5)
    }
    return `${repoUrl}/blob/main/${target}${hash}`
  }

  md.use({
    renderer: {
      heading(t) {
        const id = (t as Tokens.Heading & { id: string }).id
        const inner = this.parser.parseInline(t.tokens)
        if (t.depth === 1) return `<h1 id="${id}">${inner}</h1>\n`
        return `<h${t.depth} id="${id}">${inner}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${t.depth}>\n`
      },
      code(t) {
        const lang = (t.lang || '').split(/\s/)[0]
        const label = lang === 'bash' || lang === 'sh' ? 'Terminal' : lang === 'text' || !lang ? 'Command line' : lang.toUpperCase()
        return `<div class="code"><div class="code-head"><span>${escapeHtml(label)}</span><button class="copy" type="button">Copy</button></div><pre><code>${escapeHtml(t.text)}</code></pre></div>\n`
      },
      blockquote(t) {
        const inner = this.parser.parse(t.tokens)
        const m = /^<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/.exec(inner)
        if (!m) return `<blockquote>${inner}</blockquote>\n`
        return `<div class="callout ${m[1].toLowerCase()}"><p class="callout-title">${ALERTS[m[1]]}</p><p>${inner.slice(m[0].length)}</div>\n`
      },
      table(t) {
        const ids = (t as Tokens.Table & { ids?: string[] }).ids
        const cell = (c: Tokens.TableCell, tag: 'th' | 'td', i: number) => {
          const align = t.align[i] ? ` style="text-align:${t.align[i]}"` : ''
          return `<${tag}${align}>${this.parser.parseInline(c.tokens)}</${tag}>`
        }
        const head = `<tr>${t.header.map((c, i) => cell(c, 'th', i)).join('')}</tr>`
        const body = t.rows.map((r, j) => `<tr${ids ? ` id="${ids[j]}"` : ''}>${r.map((c, i) => cell(c, 'td', i)).join('')}</tr>`).join('\n')
        return `<div class="table-wrap"><table><thead>${head}</thead><tbody>\n${body}\n</tbody></table></div>\n`
      },
    },
  })
  const raw = md.parser(tokens)
  // Enlaces e imágenes, también los del HTML escrito a mano (tarjetas de la portada).
  const html = raw.replace(/<(a|img|source)\b([^>]*?)\s(href|src|srcset)="([^"]*)"/g, (_m, tag: string, pre: string, attr: string, url: string) => `<${tag}${pre} ${attr}="${escapeHtml(rewrite(url.replace(/&amp;/g, '&'), tag !== 'a'))}"`)
  return { title, description, html, toc, search, assets }
}

export interface Site {
  nav: NavSection[]
  /** Archivos del sitio, relativos a `docs/` (`index.html`, `guides/snaps/index.html`, `docs.css`…). */
  files: Map<string, string | Uint8Array>
}

/** Genera el sitio completo. Las páginas de la navegación cuyo archivo no existe se omiten. */
export function buildSite(opts: SiteOptions): Site | null {
  const summary = join(opts.root, SUMMARY)
  if (!existsSync(summary)) return null
  const nav = parseSummary(readFileSync(summary, 'utf8'))
    .map((s) => ({ ...s, pages: s.pages.filter((p) => existsSync(join(opts.root, p.file))) }))
    .filter((s) => s.pages.length)
  const pages = nav.flatMap((s) => s.pages)
  const byFile = new Map(pages.map((p) => [p.file, p]))
  const files = new Map<string, string | Uint8Array>()
  const hash = createHash('sha256').update(DOCS_CSS + DOCS_JS).digest('hex').slice(0, 10)
  const search: SearchEntry[] = []
  const assets = new Set<string>()
  pages.forEach((page, i) => {
    const r = renderPage(readFileSync(join(opts.root, page.file), 'utf8'), page, byFile, opts.repoUrl)
    r.assets.forEach((a) => assets.add(a))
    search.push(...r.search)
    files.set(page.slug ? `${page.slug}/index.html` : 'index.html', pageHtml({ page, rendered: r, nav, prev: pages[i - 1], next: pages[i + 1], repoUrl: opts.repoUrl, version: opts.version, hash }))
  })
  for (const a of assets) if (existsSync(join(opts.root, a))) files.set(a.slice(5), readFileSync(join(opts.root, a)))
  files.set('docs.css', DOCS_CSS)
  files.set('docs.js', DOCS_JS)
  files.set('search.json', JSON.stringify(search))
  return { nav, files }
}

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

function siteOptions(): SiteOptions {
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as { version: string }
  return { root: process.env.COTA_DOCS_ROOT || REPO_ROOT, repoUrl: 'https://github.com/mxchristian17/cota', version: pkg.version }
}

const TYPES: Record<string, string> = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', json: 'application/json', png: 'image/png', gif: 'image/gif', svg: 'image/svg+xml', jpg: 'image/jpeg', webp: 'image/webp' }

/** Plugin de Vite: emite el sitio en el build y lo sirve en `npm run dev`. */
export function docsSite(): Plugin {
  let base = '/'
  return {
    name: 'cota-docs-site',
    config() {
      // La app abre las docs del mismo sitio si se generaron; si no (privado, imagen Docker), las publicadas.
      return { define: { 'import.meta.env.VITE_DOCS_BUILT': JSON.stringify(existsSync(join(siteOptions().root, SUMMARY)) ? '1' : '') } }
    },
    configResolved(c) {
      base = c.base
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0]
        const prefix = `${base}docs`
        if (path !== prefix && !path.startsWith(prefix + '/')) return next()
        const rest = decodeURIComponent(path.slice(prefix.length + 1))
        const site = buildSite(siteOptions())
        if (!site) return next()
        const name = !rest || rest.endsWith('/') ? `${rest}index.html` : rest
        if (path === prefix || (!site.files.has(name) && site.files.has(`${rest}/index.html`))) {
          res.statusCode = 301
          res.setHeader('Location', `${path}/`)
          return res.end()
        }
        const body = site.files.get(name)
        if (body === undefined) {
          res.statusCode = 404
          return res.end('Not found')
        }
        res.setHeader('Content-Type', TYPES[name.split('.').pop() || ''] || 'application/octet-stream')
        res.end(body)
      })
    },
    generateBundle() {
      const site = buildSite(siteOptions())
      if (!site) return
      for (const [name, source] of site.files) this.emitFile({ type: 'asset', fileName: `docs/${name}`, source })
    },
  }
}
