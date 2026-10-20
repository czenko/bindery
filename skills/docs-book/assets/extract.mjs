// Fetches every page the approved outline keeps, extracts its main content in
// headless Chrome, applies the outline's cuts, and drafts one file per chapter.
//
// Reads outline.json (and inventory.json for titles) from the current directory.
// Writes:
//   pages/NNNN-slug.html   clean content of each page, ids prefixed "pNNNN-"
//   pages/index.json       url, title, ids, words, images, longest code line
//   images/                downloaded content images
//   chapters/NN-slug.html  a draft per chapter, only if it doesn't exist yet
//
// Usage: node assets/extract.mjs [--force] [--redraft]
//   --force    re-fetch pages already in pages/
//   --redraft  overwrite existing chapter drafts (this loses your edits)

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname } from 'node:path'
import { launch } from './cdp.mjs'

const force = process.argv.includes('--force')
const redraft = process.argv.includes('--redraft')
const outline = JSON.parse(readFileSync('outline.json', 'utf8'))
mkdirSync('pages', { recursive: true })
mkdirSync('images', { recursive: true })
mkdirSync('chapters', { recursive: true })

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'page'

// Runs inside the page. Mutates the live DOM, which is thrown away afterward.
async function extractInPage(opts) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const root =
    (opts.contentSelector && document.querySelector(opts.contentSelector)) ||
    document.querySelector('main article') ||
    document.querySelector('article') ||
    document.querySelector('[role="main"]') ||
    document.querySelector('main') ||
    document.body

  // Tabs: click the preferred language everywhere, then keep only what's visible.
  if (opts.preferredLanguage) {
    const want = opts.preferredLanguage.toLowerCase()
    for (const tab of root.querySelectorAll('[role="tab"], .tabs label, [class*="tab" i] > label, [class*="tab" i] > button')) {
      if (tab.textContent.trim().toLowerCase() === want) tab.click()
    }
    await sleep(300)
  }
  for (const d of root.querySelectorAll('details')) d.open = true
  await sleep(100)

  const tabLists = [...root.querySelectorAll('[role="tablist"], .vp-code-group > .tabs')]
  for (const list of tabLists) {
    const selected =
      list.querySelector('[aria-selected="true"]') ||
      list.querySelector('input:checked + label') ||
      list.querySelector('[class*="active" i], [class*="selected" i]')
    const label = selected?.textContent.trim()
    if (label && list.querySelectorAll('[role="tab"], label, button').length > 1) {
      const p = document.createElement('p')
      p.className = 'tab-label'
      p.textContent = label
      list.replaceWith(p)
    } else list.remove()
  }

  // Drop everything hidden: other tab panels, light/dark image twins, mobile-only bits.
  for (const el of [...root.querySelectorAll('*')]) {
    if (!el.isConnected || el.closest('details, summary')) continue
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') el.remove()
  }

  const strip = [
    'nav', 'aside', 'footer', 'script', 'style', 'noscript', 'iframe', 'form', 'button',
    'input', 'select', 'textarea', 'svg', 'video', 'audio', 'canvas', 'object', 'embed',
    '[aria-hidden="true"]', '.sr-only', '.visually-hidden', '.header-anchor', '.hash-link',
    '[class*="breadcrumb" i]', '[class*="toc" i]', '[class*="pagination" i]',
    '[class*="prev-next" i]', '[class*="edit-link" i]', '[class*="edit-this" i]',
    '[class*="feedback" i]', '[class*="copy" i]', '[class*="line-numbers" i]',
    '[class*="last-updated" i]', '[class*="contributors" i]', 'span.lang', '[class*="badge" i]', '[class*="code-title" i] > button',
    ...(opts.stripSelectors || []),
  ].join(',')
  for (const el of [...root.querySelectorAll(strip)]) el.remove()
  for (const el of [...root.querySelectorAll('header')]) el.replaceWith(...el.childNodes)
  for (const s of root.querySelectorAll('summary')) {
    const p = document.createElement('p')
    p.innerHTML = `<strong>${s.innerHTML}</strong>`
    s.replaceWith(p)
  }
  for (const d of [...root.querySelectorAll('details')]) d.replaceWith(...d.childNodes)

  // Callouts become blockquotes with a bold title line.
  for (const box of [
    ...root.querySelectorAll('.admonition, .custom-block, .callout, [class*="callout" i], [class*="admonition" i], .alert, [role="note"]'),
  ]) {
    if (!box.isConnected || box.parentElement?.closest('blockquote.note')) continue
    const titleEl = box.querySelector('.custom-block-title, .admonition-title, [class*="title" i], [class*="heading" i]')
    const raw = titleEl?.textContent.trim()
    const title = raw && raw[0].toUpperCase() + raw.slice(1)
    titleEl?.remove()
    const q = document.createElement('blockquote')
    q.className = 'note'
    q.innerHTML = (title ? `<p><strong>${title}</strong></p>` : '') + box.innerHTML
    box.replaceWith(q)
  }

  // Code: plain text only, which drops highlighting spans and line numbers.
  for (const pre of [...root.querySelectorAll('pre')]) {
    const code = pre.querySelector('code') || pre
    const lang =
      (`${code.className} ${pre.className} ${pre.parentElement?.className || ''}`.match(/language-([\w+-]+)/) || [])[1] || ''
    const fresh = document.createElement('pre')
    const c = document.createElement('code')
    if (lang) c.className = `language-${lang}`
    c.textContent = code.textContent.replace(/\n+$/, '')
    fresh.append(c)
    pre.replaceWith(fresh)
  }
  // Highlighters often wrap pre in a div with the language name; unwrap empty shells.
  for (const div of [...root.querySelectorAll('div')]) {
    if (div.children.length === 1 && div.firstElementChild.tagName === 'PRE' && div.textContent.trim() === div.firstElementChild.textContent.trim())
      div.replaceWith(div.firstElementChild)
  }

  // Images: absolute URLs; drop icons.
  for (const pic of [...root.querySelectorAll('picture')]) {
    const img = pic.querySelector('img')
    img ? pic.replaceWith(img) : pic.remove()
  }
  const images = []
  for (const img of [...root.querySelectorAll('img')]) {
    const w = img.naturalWidth || img.width
    if ((w && w < 48) || /badge|shields\.io|icon|logo|avatar|emoji/i.test(img.src)) {
      img.remove()
      continue
    }
    const src = img.currentSrc || img.src
    for (const a of [...img.attributes]) if (!['alt'].includes(a.name)) img.removeAttribute(a.name)
    img.setAttribute('src', src)
    images.push(src)
  }

  // Links: absolute.
  for (const a of root.querySelectorAll('a[href]')) a.setAttribute('href', a.href)
  for (const a of [...root.querySelectorAll('a:not([href])')]) a.replaceWith(...a.childNodes)

  // Title, then drop the page's own h1 (the chapter supplies headings).
  const h1 = root.querySelector('h1')
  const title = (h1?.textContent || document.title).replace(/[​#]/g, '').replace(/\s+/g, ' ').trim()
  h1?.remove()

  // Cuts from the outline: a heading id or exact heading text removes that
  // heading and everything under it, leaving a marker that becomes an endnote.
  const headingLevel = (el) => Number(el.tagName.slice(1))
  for (const cut of opts.cuts || []) {
    const heads = [...root.querySelectorAll('h2, h3, h4, h5, h6')]
    const h = heads.find((x) => (cut.startsWith('#') ? x.id === cut.slice(1) : x.textContent.replace(/[​#]/g, '').trim().toLowerCase() === cut.toLowerCase()))
    if (!h) continue
    const marker = document.createElement('p')
    marker.className = 'cut'
    marker.dataset.href = `${location.origin}${location.pathname}${h.id ? `#${h.id}` : ''}`
    marker.textContent = `Omitted: ${h.textContent.replace(/[​#]/g, '').trim()}.`
    const section = h.parentElement
    if (section && section.tagName === 'SECTION' && section.firstElementChild === h) {
      section.replaceWith(marker)
      continue
    }
    const level = headingLevel(h)
    let next = h.nextSibling
    while (next && !(next.nodeType === 1 && /^H[1-6]$/.test(next.tagName) && headingLevel(next) <= level)) {
      const after = next.nextSibling
      next.remove()
      next = after
    }
    h.replaceWith(marker)
  }

  // Shift headings so they nest under the chapter, and prefix every id.
  for (const h of [...root.querySelectorAll('h2, h3, h4, h5, h6')]) {
    const n = Math.min(6, headingLevel(h) + opts.shift)
    const fresh = document.createElement(`h${n}`)
    if (h.id) fresh.id = h.id
    fresh.textContent = h.textContent.replace(/[​]/g, '').replace(/^#\s*|\s*#$/g, '').trim()
    h.replaceWith(fresh)
  }
  const ids = {}
  for (const el of root.querySelectorAll('[id]')) {
    ids[el.id] = `${opts.idPrefix}-${el.id}`
    el.id = ids[el.id]
  }

  // Drop presentational attributes so the book's stylesheet is in charge.
  for (const el of root.querySelectorAll('*')) {
    for (const a of [...el.attributes]) {
      const keep =
        ['id', 'href', 'src', 'alt', 'colspan', 'rowspan'].includes(a.name) ||
        a.name.startsWith('data-href') ||
        (a.name === 'class' && (/^(note|cut|tab-label)$/.test(a.value) || (el.tagName === 'CODE' && /^language-[\w+-]+$/.test(a.value))))
      if (!keep) el.removeAttribute(a.name)
    }
  }
  // Unwrap meaningless divs and spans.
  for (const el of [...root.querySelectorAll('div, span')]) if (!el.attributes.length) el.replaceWith(...el.childNodes)

  const longestCodeLine = Math.max(0, ...[...root.querySelectorAll('pre')].flatMap((p) => p.textContent.split('\n').map((l) => l.length)))
  const words = root.textContent.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length
  return { title, html: root.innerHTML.replace(/<!--[\s\S]*?-->/g, '').replace(/\n{3,}/g, '\n\n').trim(), ids, images, words, longestCodeLine }
}

async function download(src) {
  const ext = (extname(new URL(src).pathname).toLowerCase().match(/^\.(png|jpe?g|gif|webp|svg)$/) || ['.png'])[0]
  const file = `images/${createHash('sha1').update(src).digest('hex').slice(0, 12)}${ext}`
  if (existsSync(file)) return file
  const res = await fetch(src)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  return file
}

const inventory = existsSync('inventory.json') ? JSON.parse(readFileSync('inventory.json', 'utf8')) : { pages: [] }
const invTitle = new Map(inventory.pages.map((p) => [p.url, p.title]))
const index = existsSync('pages/index.json') ? JSON.parse(readFileSync('pages/index.json', 'utf8')) : {}

// Number pages in book order so ids and file names are stable.
const chapters = []
let pageNo = 0
outline.parts.forEach((part) =>
  part.chapters.forEach((ch) => {
    chapters.push(ch)
    for (const p of ch.pages) if (p.action !== 'cut') p.n = ++pageNo
  })
)

const browser = await launch()
try {
  const page = await browser.newPage()
  for (const ch of chapters) {
    const kept = ch.pages.filter((p) => p.action !== 'cut')
    for (const p of kept) {
      const id = `p${String(p.n).padStart(4, '0')}`
      const file = `pages/${id}-${slugify(invTitle.get(p.url) || new URL(p.url).pathname)}.html`
      const cached = index[p.url]
      if (cached && existsSync(cached.file) && !force && JSON.stringify(cached.cuts) === JSON.stringify(p.cut || [])) continue
      process.stdout.write(`${id} ${p.url} … `)
      try {
        const status = await page.goto(p.url)
        if (status && status >= 400) throw new Error(`HTTP ${status}`)
        const shift = kept.length === 1 ? 1 : 2 // h2 → h3 under the chapter, or h4 under a page heading
        const r = await page.evaluate(extractInPage, {
          contentSelector: outline.contentSelector,
          stripSelectors: outline.stripSelectors,
          preferredLanguage: outline.preferredLanguage,
          cuts: p.cut || [],
          shift,
          idPrefix: id,
        })
        let html = r.html
        const failed = []
        for (const src of r.images) {
          try {
            const local = await download(src)
            html = html.split(`src="${src.replace(/&/g, '&amp;')}"`).join(`src="${local}"`).split(`src="${src}"`).join(`src="${local}"`)
          } catch (err) {
            failed.push(`${src} (${err.message})`)
          }
        }
        writeFileSync(file, html + '\n')
        index[p.url] = { n: p.n, id, file, title: r.title, ids: r.ids, words: r.words, longestCodeLine: r.longestCodeLine, cuts: p.cut || [], failedImages: failed }
        console.log(`${r.words} words${failed.length ? `, ${failed.length} images failed` : ''}`)
      } catch (err) {
        index[p.url] = { n: p.n, id, error: err.message }
        console.log(`FAILED: ${err.message}`)
      }
      writeFileSync('pages/index.json', JSON.stringify(index, null, 2))
    }
  }
} finally {
  await browser.close()
}

// Chapter drafts: the kept pages stitched together, with placeholders for the
// editor's note and the review questions. build-docs-epub.mjs refuses to build
// while any TODO placeholder is left.
chapters.forEach((ch, i) => {
  const file = `chapters/${String(i + 1).padStart(2, '0')}-${ch.slug || slugify(ch.title)}.html`
  ch.file = file
  if (existsSync(file) && !redraft) return
  const kept = ch.pages.filter((p) => p.action !== 'cut' && index[p.url]?.file)
  const body = kept
    .map((p) => {
      const meta = index[p.url]
      const html = readFileSync(meta.file, 'utf8')
      const heading = kept.length === 1 ? '' : `<h3 id="${meta.id}">${meta.title}</h3>\n`
      return `<section data-src="${p.url}"${kept.length === 1 ? ` id="${meta.id}"` : ''}>\n${heading}${html}</section>`
    })
    .join('\n\n')
  writeFileSync(
    file,
    `<h2>${ch.title}</h2>

<aside class="editor">
<p>TODO: two or three sentences on what this chapter covers and how it serves the reader's goal.</p>
</aside>

${body}

<section class="review">
<!-- TODO: 4–8 review questions. Multiple choice:
<div class="quiz-item" data-answer="Option B">
  <p class="quiz-q">Question?</p>
  <div class="quiz-options" data-options="Option A|Option B|Option C|Option D"></div>
  <div class="quiz-feedback">Why B is right, citing the section that says so.</div>
</div>
Free recall:
<div class="recall"><p>Prompt</p><div class="quiz-feedback">Model answer, citing the section.</div></div>
-->
</section>
`
  )
})

writeFileSync('outline.json', JSON.stringify(outline, null, 2))
const errors = Object.entries(index).filter(([, v]) => v.error)
const total = Object.values(index).reduce((sum, v) => sum + (v.words || 0), 0)
console.log(`Extracted ${Object.keys(index).length - errors.length} pages, ~${total} words (~${Math.round(total / 300)} book pages). Drafts in chapters/.`)
if (errors.length) console.log(`Failed: ${errors.map(([url, v]) => `${url} (${v.error})`).join(', ')}`)
