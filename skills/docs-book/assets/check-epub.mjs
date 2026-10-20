// Checks a built docs-book EPUB. Exits 1 if anything would break on an
// e-reader or the bound date is missing, and prints a size report either way.
//
// Usage: node assets/check-epub.mjs <file.epub>
// Reads outline.json from the current directory, if present, for the page budget.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { posix } from 'node:path'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node check-epub.mjs <file.epub>')
  process.exit(1)
}

const list = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' }).split('\n').filter(Boolean)
const read = (name) => execFileSync('unzip', ['-p', file, name], { encoding: 'utf8', maxBuffer: 1 << 28 })
const xhtml = list.filter((n) => n.endsWith('.xhtml') && !n.endsWith('nav.xhtml'))

const errors = []
const warnings = []

// Bound date: on the cover, the title page, and the About page.
const bound = (file.match(/bound-(\d{4}-\d{2}-\d{2})\.epub$/) || [])[1]
if (!bound) errors.push('File name has no bound date (expected …-bound-YYYY-MM-DD.epub)')
const titlePage = list.find((n) => /title_page\.xhtml$/.test(n))
if (!titlePage || !/Bound from .+ on \d{1,2} \w+ \d{4}/.test(read(titlePage))) errors.push('Title page is missing the "Bound from … on …" line')
const opf = read(list.find((n) => n.endsWith('.opf')))
if (!/properties="cover-image"/.test(opf)) errors.push('No cover image')
if (bound && !new RegExp(`<dc:date[^>]*>${bound}`).test(opf)) errors.push(`EPUB metadata has no dc:date of ${bound}`)

// Gather every id per file.
const docs = new Map()
for (const name of xhtml) docs.set(name, read(name))
const ids = new Map()
for (const [name, html] of docs) ids.set(name, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])))
if (![...docs.values()].some((h) => /class="bound"[^>]*>\s*<p>Bound \d/.test(h))) errors.push('About page is missing the bound date')

let words = 0
let questions = 0
const report = []
for (const [name, html] of docs) {
  const dir = posix.dirname(name)

  for (const tag of ['script', 'button', 'form', 'iframe', 'input', 'textarea'])
    if (new RegExp(`<${tag}[\\s>]`).test(html)) errors.push(`${name}: <${tag}> left in the book`)
  if (/TODO/.test(html)) errors.push(`${name}: contains TODO`)

  for (const [, href] of html.matchAll(/<a [^>]*href="([^"]+)"/g)) {
    if (/^https?:/.test(href)) {
      warnings.push(`${name}: live link left in text: ${href}`)
      continue
    }
    const [path, frag] = href.split('#')
    const targetFile = path ? posix.join(dir, path) : name
    if (!docs.has(targetFile) && !list.includes(targetFile)) errors.push(`${name}: link to missing file ${href}`)
    else if (frag && !ids.get(targetFile)?.has(decodeURIComponent(frag))) errors.push(`${name}: link to missing id ${href}`)
  }

  for (const [, src] of html.matchAll(/<img [^>]*src="([^"]+)"/g)) {
    if (/^https?:/.test(src)) errors.push(`${name}: remote image ${src}`)
    else if (!list.includes(posix.join(dir, src))) errors.push(`${name}: missing image ${src}`)
    if (/\.svg$/i.test(src)) warnings.push(`${name}: SVG image ${src} (some e-readers don't show SVG)`)
  }

  const [main, key = ''] = html.split(/answer key<\/h3>/)
  const qs = new Set([...main.matchAll(/<strong>Q(\d+)\.<\/strong>/g)].map((m) => m[1]))
  const as = new Set([...key.matchAll(/<strong>Q(\d+)\./g)].map((m) => m[1]))
  if (qs.size !== as.size) errors.push(`${name}: ${qs.size} questions but ${as.size} answers`)
  questions += qs.size

  const text = html.replace(/<[^>]+>/g, ' ')
  const w = text.split(/\s+/).filter((x) => /[A-Za-z0-9]/.test(x)).length
  words += w
  const longest = Math.max(0, ...[...html.matchAll(/<pre[\s\S]*?<\/pre>/g)].flatMap((m) => m[0].replace(/<[^>]+>/g, '').split('\n').map((l) => l.length)))
  const heading = (html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/) || [])[1]?.replace(/<[^>]+>/g, '').trim()
  if (heading) report.push(`  ${heading.slice(0, 60).padEnd(60)} ${String(w).padStart(6)} words${longest > 60 ? `, code line ${longest} chars` : ''}`)
}

const budget = existsSync('outline.json') ? JSON.parse(readFileSync('outline.json', 'utf8')).budgetPages : undefined
console.log(report.join('\n'))
console.log(
  `\n${words} words, about ${Math.round(words / 300)} pages${budget ? ` (budget ${budget})` : ''}. ${questions} review questions. ` +
    `Bound ${bound ?? '(unknown)'}.`
)
if (budget && words / 300 > budget * 1.15) warnings.push(`Over budget by ${Math.round(words / 300 - budget)} pages`)
if (warnings.length) console.log(`\nWarnings:\n  ${[...new Set(warnings)].join('\n  ')}`)
if (errors.length) {
  console.log(`\nErrors:\n  ${errors.join('\n  ')}`)
  process.exit(1)
}
console.log('\nOK')
