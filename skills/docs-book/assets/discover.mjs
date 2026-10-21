// Builds inventory.json: every candidate page on a docs site, in reading order,
// with its nav section and an approximate word count.
//
// Order and sections come from the site's own sidebar, rendered in headless
// Chrome. Pages listed in /llms.txt or /sitemap.xml but missing from the
// sidebar are appended under "Not in nav".
//
// Usage: node assets/discover.mjs <root-url> [<more-urls>…] [--prefix /docs/] [--max 500]
// Pass one URL per section when a site's sidebar changes from section to
// section; their sidebars are read in the order given.
// Writes inventory.json in the current directory.

import { writeFileSync } from 'node:fs'
import { launch } from './cdp.mjs'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const startArgs = args.filter((a) => /^https?:\/\//.test(a))
const rootArg = startArgs[0]
if (!rootArg) {
  console.error('Usage: node discover.mjs <root-url> [--prefix /docs/] [--max 500]')
  process.exit(1)
}
const root = new URL(rootArg)
const prefix = flag('prefix', root.pathname.replace(/[^/]*$/, ''))
const max = Number(flag('max', 500))

const LOCALES = new Set(['ja', 'zh', 'zh-cn', 'zh-tw', 'zh-hans', 'zh-hant', 'ko', 'fr', 'de', 'es', 'pt', 'pt-br', 'ru', 'it', 'id', 'tr', 'uk', 'vi', 'pl'])
const SKIP = /\/(blog|changelog|changelogs|release-notes|releases|news|tags?|authors?|search|404)(\/|$)/i
const ASSET = /\.(png|jpe?g|gif|svg|webp|pdf|zip|json|xml|txt|css|js)$/i

const dropped = []

// Returns a normalized page URL, or null with the reason recorded.
function normalize(href, base = root) {
  let u
  try {
    u = new URL(href, base)
  } catch {
    return null
  }
  if (u.origin !== root.origin) return null
  u.hash = ''
  u.search = ''
  u.pathname = u.pathname.replace(/\.md$/, '').replace(/\/index(\.html)?$/, '/')
  const path = u.pathname
  if (!path.startsWith(prefix)) return null
  if (ASSET.test(path)) return null
  const rest = path.slice(prefix.length).split('/').filter(Boolean)
  const reason = SKIP.test(path)
    ? 'blog, changelog, or listing page'
    : rest[0] && LOCALES.has(rest[0].toLowerCase())
      ? 'translated copy'
      : rest.some((seg) => /^v\d+(\.\d+)*$/.test(seg))
        ? 'versioned copy'
        : null
  if (reason) {
    dropped.push({ url: u.href, reason })
    return null
  }
  return u.href
}

// Runs inside the page: sidebar links in document order, each with the
// label of the group it sits under.
function harvestNav() {
  const containers = [
    ...document.querySelectorAll('aside, nav, [class*="sidebar" i], [class*="sidenav" i], [class*="toc" i]'),
  ].filter((el) => !el.closest('header') || el.matches('aside, [class*="sidebar" i]'))
  // Use the container with the most links; that's almost always the docs sidebar.
  const best = containers.sort((a, b) => b.querySelectorAll('a[href]').length - a.querySelectorAll('a[href]').length)[0]
  if (!best) return []
  const out = []
  let section = ''
  const walker = document.createTreeWalker(best, NodeFilter.SHOW_ELEMENT)
  for (let el = walker.currentNode; el; el = walker.nextNode()) {
    const isLink = el.tagName === 'A' && el.getAttribute('href')
    const looksLikeLabel =
      !isLink &&
      !el.querySelector('a') &&
      (/^H[2-6]$/.test(el.tagName) || /(title|header|label|caption|heading)/i.test(el.className?.toString() || '')) &&
      el.textContent.trim().length > 0 &&
      el.textContent.trim().length < 80
    if (looksLikeLabel) section = el.textContent.trim().replace(/\s+/g, ' ')
    if (isLink) out.push({ href: el.href, title: el.textContent.trim().replace(/\s+/g, ' '), section })
  }
  return out
}

async function fromLlmsTxt() {
  try {
    const res = await fetch(new URL('/llms.txt', root))
    if (!res.ok) return []
    const text = await res.text()
    const out = []
    let section = ''
    for (const line of text.split('\n')) {
      const h = line.match(/^#{2,3}\s+(.+)/)
      if (h) section = h[1].trim()
      for (const m of line.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) out.push({ href: m[2], title: m[1], section })
    }
    return out
  } catch {
    return []
  }
}

async function fromSitemap(url = new URL('/sitemap.xml', root), depth = 0) {
  if (depth > 2) return []
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const xml = await res.text()
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1])
    if (/<sitemapindex/i.test(xml)) {
      const nested = await Promise.all(locs.map((loc) => fromSitemap(new URL(loc), depth + 1)))
      return nested.flat()
    }
    return locs.map((href) => ({ href, title: '', section: '' }))
  } catch {
    return []
  }
}

// A rough word count from static HTML. Sites rendered entirely by JavaScript
// come back near zero; those are flagged rather than trusted.
function countWords(html) {
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html
  const text = main
    .replace(/<(script|style|nav|aside|footer|header|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
  return text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length
}

const titleOf = (html) =>
  html
    .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?.replace(/\s+/g, ' ')
    .replace(/\s*[|·–—-]\s*[^|·–—-]+$/, '')
    .trim() ?? ''

async function pool(items, size, fn) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i], i)
      }
    })
  )
  return results
}

// 1. Sidebar order from each rendered start page.
const browser = await launch()
const nav = []
try {
  const page = await browser.newPage()
  for (const start of startArgs) {
    await page.goto(start)
    nav.push({ href: start, title: '', section: '' }, ...(await page.evaluate(harvestNav)))
  }
} finally {
  await browser.close()
}

// 2. Everything else the site lists.
const llms = await fromLlmsTxt()
const sitemap = llms.length ? [] : await fromSitemap()
const sources = ['sidebar', ...(llms.length ? ['llms.txt'] : []), ...(sitemap.length ? ['sitemap.xml'] : [])]

const seen = new Map()
const add = (entry, inNav) => {
  const url = normalize(entry.href)
  if (!url || seen.has(url)) return
  seen.set(url, { url, title: entry.title, section: inNav ? entry.section : 'Not in nav', inNav })
}
add({ href: root.href, title: '', section: '' }, true)
nav.forEach((e) => add(e, true))
;[...llms, ...sitemap].forEach((e) => add(e, false))

let pages = [...seen.values()]
if (pages.length > max) {
  console.warn(`Found ${pages.length} pages; keeping the first ${max}. Pass --max to raise the cap.`)
  pages = pages.slice(0, max)
}

// 3. Fetch each page politely for its title and size.
await pool(pages, 4, async (p) => {
  try {
    const res = await fetch(p.url, { redirect: 'follow', headers: { 'user-agent': 'docs-book (offline reading)' } })
    p.status = res.status
    if (!res.ok) {
      p.skipped = `HTTP ${res.status}`
      return
    }
    const html = await res.text()
    p.title = p.title || titleOf(html)
    p.words = countWords(html)
    if (p.words < 50) p.wordsUncertain = true
  } catch (err) {
    p.skipped = err.message
  }
})

pages.forEach((p, i) => (p.n = i + 1))
const live = pages.filter((p) => !p.skipped)
const inventory = {
  root: root.href,
  prefix,
  // How this inventory was made, so rebind.mjs can repeat it exactly.
  discover: { starts: startArgs, prefix, max },
  discoveredAt: new Date().toISOString(),
  sources,
  totals: { pages: live.length, words: live.reduce((sum, p) => sum + (p.words || 0), 0) },
  pages,
  dropped: [...new Map(dropped.map((d) => [d.url, d])).values()],
}
writeFileSync('inventory.json', JSON.stringify(inventory, null, 2))

const bySection = new Map()
for (const p of live) {
  const s = bySection.get(p.section || '(top)') ?? { pages: 0, words: 0 }
  s.pages++
  s.words += p.words || 0
  bySection.set(p.section || '(top)', s)
}
console.log(`Sources: ${sources.join(', ')}`)
for (const [section, s] of bySection) console.log(`  ${section}: ${s.pages} pages, ~${s.words} words`)
console.log(
  `Wrote inventory.json: ${live.length} pages, ~${inventory.totals.words} words (~${Math.round(inventory.totals.words / 300)} book pages). ` +
    `${pages.length - live.length} skipped, ${inventory.dropped.length} dropped.`
)
