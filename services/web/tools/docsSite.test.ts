import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { DOCS_JS } from './docsAssets'
import { buildSite, headingId, pageSlug, pageUrl, parseSummary, renderPage, type NavPage } from './docsSite'

const REPO = 'https://github.com/x/cota'
const page = (file: string, title = 'T', section = 'Guides'): NavPage => ({ file, title, slug: pageSlug(file), section })

describe('sitio de documentación', () => {
  it('arma la navegación desde SUMMARY.md, con secciones y carpetas por página', () => {
    const nav = parseSummary('# x\n\n## Get started\n- [Overview](index.md)\n- [Snaps](guides/snaps.md)\n\n## More\n* [Changelog](../CHANGELOG.md)\n')
    expect(nav.map((s) => s.title)).toEqual(['Get started', 'More'])
    expect(nav[0].pages.map((p) => [p.file, p.slug])).toEqual([['docs/index.md', ''], ['docs/guides/snaps.md', 'guides/snaps']])
    expect(nav[1].pages[0]).toMatchObject({ file: 'CHANGELOG.md', slug: 'changelog', section: 'More' })
  })

  it('las anclas son las de GitHub y no se repiten', () => {
    const used = new Map<string, number>()
    expect(headingId('The command line', used)).toBe('the-command-line')
    expect(headingId('Layouts, drawing views and plotting', used)).toBe('layouts-drawing-views-and-plotting')
    expect(headingId('`UCS` & <kbd>F6</kbd>', used)).toBe('ucs--f6')
    expect(headingId('The command line', used)).toBe('the-command-line-1')
  })

  it('las URLs son relativas, así el sitio funciona bajo cualquier base', () => {
    expect(pageUrl('', 'commands')).toBe('commands/')
    expect(pageUrl('guides/snaps', '')).toBe('../../')
    expect(pageUrl('commands', 'guides/snaps')).toBe('../guides/snaps/')
  })

  it('reescribe enlaces: páginas del sitio a su carpeta, imágenes de docs/ al sitio, el resto a GitHub', () => {
    const cur = page('docs/user-guide.md')
    const other = page('docs/commands.md')
    const byFile = new Map([cur, other].map((p) => [p.file, p]))
    const r = renderPage('# Guide\n\nSee [cmds](commands.md#file-menu), [lic](../LICENSE), [web](https://x.org) and ![shot](images/a.png).\n\n<a class="card" href="commands.md">c</a>\n', cur, byFile, REPO)
    expect(r.html).toContain('href="../commands/#file-menu"')
    expect(r.html).toContain(`href="${REPO}/blob/main/LICENSE"`)
    expect(r.html).toContain('href="https://x.org"')
    expect(r.html).toContain('src="../images/a.png"')
    expect(r.html).toContain('<a class="card" href="../commands/"')
    expect(r.assets).toEqual(['docs/images/a.png'])
  })

  it('títulos con ancla, índice, avisos, código con copiar y tablas desplazables', () => {
    const r = renderPage('# Snaps\n\nIntro text.\n\n## Object snaps\n\n### END\n\n> [!WARNING]\n> Careful.\n\n```bash\nnpm i <x>\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n', page('docs/snaps.md'), new Map(), REPO)
    expect(r.title).toBe('Snaps')
    expect(r.description).toBe('Intro text.')
    expect(r.toc).toEqual([{ depth: 2, id: 'object-snaps', text: 'Object snaps' }, { depth: 3, id: 'end', text: 'END' }])
    expect(r.html).toContain('<h2 id="object-snaps">Object snaps<a class="anchor" href="#object-snaps"')
    expect(r.html).toContain('<div class="callout warning"><p class="callout-title">Warning</p><p>Careful.</p>')
    expect(r.html).toContain('<span>Terminal</span><button class="copy"')
    expect(r.html).toContain('npm i &lt;x&gt;')
    expect(r.html).toContain('<div class="table-wrap"><table>')
  })

  it('cada fila de comando o variable tiene ancla y resultado propio en el buscador', () => {
    const md = '# Command reference\n\n## Draw menu\n\n| Command | Aliases | What it does |\n| --- | --- | --- |\n| [`LINE`](reference/draw.md#line) | `L` | Draw lines |\n| `-LAYER` | — | Layers |\n'
    const r = renderPage(md, page('docs/commands.md', 'Commands', 'Reference'), new Map(), REPO)
    expect(r.html).toContain('<tr id="line">')
    expect(r.html).toContain('<tr id="-layer">')
    const line = r.search.find((e) => e.h === 'LINE')
    expect(line).toEqual({ h: 'LINE', s: 'Command reference › Draw menu', u: 'commands#line', x: 'Draw lines', k: 'L' })
  })

  it('genera el sitio real de docs/: todas las páginas, buscador y los enlaces internos existen', () => {
    const site = buildSite({ root: fileURLToPath(new URL('../../..', import.meta.url)), repoUrl: REPO, version: '0' })!
    expect(site).not.toBeNull()
    const names = [...site.files.keys()]
    expect(names).toEqual(expect.arrayContaining(['index.html', 'getting-started/index.html', 'commands/index.html', 'changelog/index.html', 'docs.css', 'docs.js', 'search.json']))
    const search = JSON.parse(site.files.get('search.json') as string) as { h: string; u: string }[]
    // FILLET tiene sección en la referencia: el resultado es la sección, con los alias de la tabla.
    expect(search.filter((e) => e.h === 'FILLET').map((e) => [e.u, e.k])).toEqual([['reference/modify#fillet', 'F']])
    // Ningún enlace relativo apunta a una página o archivo que no existe en el sitio.
    const broken: string[] = []
    for (const [name, body] of site.files) {
      if (!name.endsWith('.html')) continue
      const dir = name.replace(/[^/]*$/, '')
      for (const m of (body as string).matchAll(/(?:href|src)="([^"#?]*)(?:#[^"]*)?"/g)) {
        const url = m[1]
        if (!url || /^[a-z]+:/i.test(url) || url.startsWith('//')) continue
        const path = new URL(url, `https://h/docs/${dir}`).pathname
        if (!path.startsWith('/docs/')) continue // la app (Open Cota) y su ícono
        const target = path.slice(6)
        const file = target.endsWith('/') || target === '' ? `${target}index.html` : target
        if (!site.files.has(file)) broken.push(`${name} → ${url}`)
      }
    }
    expect(broken).toEqual([])
  })

  it('el script del sitio es JavaScript válido', () => {
    expect(() => new Function(DOCS_JS)).not.toThrow()
  })
})
