// Binds the edited chapters into an EPUB with a cover, a title page, and an
// "About this book" page, all showing the bound date.
//
// Links between pages in the book become internal links, with "(ch. N)" added
// when they cross chapters. Every other link, including links to pages or
// sections that were cut, keeps its text and gains a numbered endnote. Each
// chapter ends with its review questions, its links, and an answer key.
//
// Reads outline.json, pages/index.json, chapters/, and glossary.html if present.
// Usage: node assets/build-docs-epub.mjs [--bound YYYY-MM-DD] [--author "Docs owner"]

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch } from './cdp.mjs'

const here = new URL('.', import.meta.url).pathname
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? undefined : args[i + 1]
}

const today = new Date()
const pad = (n) => String(n).padStart(2, '0')
const bound = flag('bound') || `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
if (!/^\d{4}-\d{2}-\d{2}$/.test(bound)) throw new Error(`--bound must be YYYY-MM-DD, got ${bound}`)
const boundLong = new Date(`${bound}T00:00:00Z`).toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const outline = JSON.parse(readFileSync('outline.json', 'utf8'))
const index = JSON.parse(readFileSync('pages/index.json', 'utf8'))
const inventory = existsSync('inventory.json') ? JSON.parse(readFileSync('inventory.json', 'utf8')) : {}
const title = outline.title
const site = outline.site || new URL(inventory.root || Object.keys(index)[0]).host
const sourceUrl = inventory.root || `https://${site}/`
const author = flag('author') || outline.author || ''
const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const roman = (n) =>
  [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']].reduce((out, [v, r]) => {
    while (n >= v) {
      out += r
      n -= v
    }
    return out
  }, '')

// Same page, whatever the trailing slash, extension, or index file.
const pageKey = (href) => {
  const u = new URL(href)
  return `${u.origin}${u.pathname.replace(/\.(html?|md)$/, '').replace(/\/index$/, '/').replace(/\/$/, '')}`
}

// ---- Load chapters in book order -------------------------------------------

const chapters = []
outline.parts.forEach((part, p) =>
  part.chapters.forEach((ch) => {
    if (!ch.file || !existsSync(ch.file)) throw new Error(`No draft for chapter "${ch.title}". Run extract.mjs first.`)
    chapters.push({ ...ch, part: p, n: chapters.length + 1, html: readFileSync(ch.file, 'utf8').replace(/<!--[\s\S]*?-->/g, '') })
  })
)

const todos = chapters.filter((ch) => /TODO/.test(ch.html))
if (todos.length) {
  console.error(`Finish these chapters first; they still contain TODO: ${todos.map((c) => c.file).join(', ')}`)
  process.exit(1)
}

// ---- Link map ----------------------------------------------------------------

const presentIds = new Set(chapters.flatMap((ch) => [...ch.html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])))
const chapterOfId = new Map()
for (const ch of chapters) for (const m of ch.html.matchAll(/\sid="([^"]+)"/g)) chapterOfId.set(m[1], ch.n)

const target = new Map() // "page" or "page#frag" → in-book id
for (const [url, meta] of Object.entries(index)) {
  if (!meta.file) continue
  const key = pageKey(url)
  if (presentIds.has(meta.id)) target.set(key, meta.id)
  for (const [orig, id] of Object.entries(meta.ids || {})) if (presentIds.has(id)) target.set(`${key}#${orig}`, id)
}

const resolve = (href) => {
  let u
  try {
    u = new URL(href)
  } catch {
    return null
  }
  if (!/^https?:$/.test(u.protocol)) return null
  const key = pageKey(u.href)
  const frag = decodeURIComponent(u.hash.slice(1))
  return (frag && target.get(`${key}#${frag}`)) || (!frag && target.get(key)) || null
}

// ---- Tables become stacks, as in teach-book ---------------------------------

const cells = (row, tag) =>
  [...row.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1].trim())

const unTable = (table) => {
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1])
  if (!rows.length) return ''
  const head = cells(rows[0], 'th')
  const body = head.length ? rows.slice(1) : rows
  return (
    '<div class="stack">' +
    body
      .map((r) => {
        const [first, ...rest] = cells(r, 't[dh]')
        const lines = rest
          .map((c, i) => (head[i + 1] ? `<p><span class="k">${head[i + 1]}:</span> ${c}</p>` : `<p>${c}</p>`))
          .join('')
        return `<div class="item"><p class="t">${first ?? ''}</p>${lines}</div>`
      })
      .join('') +
    '</div>'
  )
}

// ---- Per chapter --------------------------------------------------------------

const QUIZ =
  /<div class="quiz-item" data-answer="([^"]*)">\s*<p class="quiz-q">([\s\S]*?)<\/p>\s*<div class="quiz-options" data-options="([^"]*)">\s*<\/div>\s*<div class="quiz-feedback">([\s\S]*?)<\/div>\s*<\/div>|<div class="recall">\s*<p>([\s\S]*?)<\/p>\s*<div class="quiz-feedback">([\s\S]*?)<\/div>\s*<\/div>/g

const problems = []

function renderChapter(ch) {
  const notes = [] // { url }
  const noteFor = (url) => {
    let i = notes.findIndex((n) => n.url === url)
    if (i === -1) i = notes.push({ url }) - 1
    const k = i + 1
    return `<sup><a href="#c${ch.n}-note-${k}">${k}</a></sup>`
  }

  // Set code aside so link and table rewriting never touch it.
  const pres = []
  let html = ch.html.replace(/<pre[\s\S]*?<\/pre>/g, (block) => `@@PRE${pres.push(block) - 1}@@`)

  // Split off the review questions before rewriting links in the body.
  let review = ''
  html = html.replace(/<section class="review">([\s\S]*?)<\/section>/, (_, inner) => {
    review = inner
    return '@@REVIEW@@'
  })

  html = html
    .replace(/<h2>([\s\S]*?)<\/h2>/, (_, t) => `<h2 id="ch${ch.n}">${ch.n}. ${t.trim()}</h2>`)
    .replace(
      /<aside class="editor">([\s\S]*?)<\/aside>/g,
      (_, inner) => `<div class="editor">${inner.replace(/<p>/, '<p><span class="label">Editor’s note.</span> ')}</div>`
    )
    .replace(/<p class="tab-label">([\s\S]*?)<\/p>/g, (_, t) => `<div class="tab-label"><p>${t}</p></div>`)
    .replace(/<table[\s\S]*?<\/table>/g, unTable)
    .replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, (whole, href, text) => {
      const plain = text.replace(/<[^>]+>/g, '').trim()
      if (!plain && !/<img/.test(text)) return text
      if (href.startsWith('#')) return presentIds.has(href.slice(1)) ? whole : text
      if (/^mailto:/.test(href)) return text
      const id = resolve(href.replace(/&amp;/g, '&'))
      if (id) {
        const other = chapterOfId.get(id)
        return `<a href="#${id}">${text}</a>${other && other !== ch.n ? ` (ch.&nbsp;${other})` : ''}`
      }
      return `${text}${noteFor(href)}`
    })
    // After links, so the endnote markers it adds aren't rewritten.
    .replace(/<p class="cut" data-href="([^"]*)">([\s\S]*?)<\/p>/g, (_, url, text) => `<div class="cut"><p>${text}${noteFor(url)}</p></div>`)

  // Review questions and answer key.
  let q = 0
  const answers = []
  const questions = review.replace(QUIZ, (_, answer, question, options, feedback, prompt, model) => {
    q++
    if (prompt !== undefined) {
      answers.push(`<p><strong>Q${q}.</strong> ${model.trim()}</p>`)
      return `<p><strong>Q${q}.</strong> ${prompt.trim()}</p>`
    }
    const opts = options.split('|')
    const letter = String.fromCharCode(65 + opts.indexOf(answer))
    if (!opts.includes(answer)) problems.push(`${ch.file} Q${q}: data-answer "${answer}" isn't one of its options`)
    answers.push(`<p><strong>Q${q}. ${letter}: ${esc(answer)}.</strong> ${feedback.trim()}</p>`)
    return `<p><strong>Q${q}.</strong> ${question.trim()}</p><ol class="options" type="A">${opts.map((o) => `<li>${esc(o)}</li>`).join('')}</ol>`
  })
  if (/quiz-item|class="recall"/.test(questions)) problems.push(`${ch.file}: a review question doesn't match the quiz markup`)
  if (q === 0) problems.push(`${ch.file}: no review questions`)

  const links = notes.length
    ? `<h3>Links</h3><div class="links"><ol>${notes.map((n, i) => `<li id="c${ch.n}-note-${i + 1}">${esc(n.url)}</li>`).join('')}</ol></div>`
    : ''
  const key = `<h3>Chapter ${ch.n} answer key</h3><div class="answers">${answers.join('')}</div>`

  html = html
    .replace('@@REVIEW@@', `<h3>Review questions</h3>${questions}${links}${key}`)
    .replace(/<section data-src="[^"]*"/g, '<section')
    .replace(/@@PRE(\d+)@@/g, (_, i) => pres[Number(i)])
  return html
}

// ---- Front matter ---------------------------------------------------------------

const leftOut = outline.leftOut || []
const about = `<h1 id="about">About this book</h1>
<div class="bound"><p>Bound ${boundLong}</p></div>
<p>This book was bound from the documentation at ${esc(sourceUrl)} on ${boundLong}. Documentation changes. Anything published after that date isn’t here, and some of what is here may have changed since.</p>
${outline.goal ? `<h3>Why this book</h3><p>${outline.goal}</p>` : ''}
<h3>How it was made</h3>
<p>The text is the documentation’s own, chosen for reading away from a screen. Concepts, design rationale, and explanations are kept in full. Step-by-step procedures that only make sense at a computer were cut, and each cut is marked where it happened.</p>
<p>Passages in italics labeled <em>Editor’s note</em>, the review questions, and the answer keys were written for this book. They are not part of the documentation.</p>
<h3>How to read it</h3>
<ul>
<li>Each chapter ends with review questions. Answer them before reading the answer key that follows.</li>
<li>A cross-reference to another chapter is a link marked with its chapter number, like “(ch. 3)”.</li>
<li>Links to anything not in this book have a small number. The full address is listed under Links at the end of the chapter.</li>
</ul>
${
  leftOut.length
    ? `<h3>Left out</h3><div class="links"><ul>${leftOut.map((l) => `<li>${esc(l.title || l.url)}: ${esc(l.reason || '')} (${esc(l.url)})</li>`).join('')}</ul></div>`
    : ''
}
${outline.license ? `<h3>License</h3><p>${outline.license}</p>` : ''}
`

const glossary = existsSync('glossary.html')
  ? `<h1 id="glossary">Glossary</h1>${readFileSync('glossary.html', 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<h1>[\s\S]*?<\/h1>/, '')
      .replace(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g, '<p><strong>$1.</strong> $2</p>')
      .replace(/<\/?dl>/g, '')}`
  : ''

const body = outline.parts
  .map((part, p) => {
    const intro = part.intro ? `<div class="editor"><p><span class="label">Editor’s note.</span> ${part.intro}</p></div>` : ''
    const chs = chapters.filter((c) => c.part === p).map(renderChapter).join('\n')
    return `<h1 id="part-${p + 1}">Part ${roman(p + 1)}: ${esc(part.title)}</h1>${intro}\n${chs}`
  })
  .join('\n')

if (problems.length) {
  console.error(`Fix these before binding:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}

const book = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title></head><body>
${about}
${body}
${glossary}
</body></html>`
writeFileSync('book.html', book)

// ---- Cover ------------------------------------------------------------------------

const coverHtml = readFileSync(join(here, 'cover.html'), 'utf8')
  .replace(/<!--[\s\S]*?-->/, '')
  .replaceAll('{{title}}', esc(title))
  .replaceAll('{{site}}', esc(site))
  .replaceAll('{{bound}}', esc(boundLong))
const browser = await launch()
try {
  const page = await browser.newPage({ width: 1600, height: 2400 })
  await page.setContent(coverHtml)
  writeFileSync('cover.png', await page.screenshot())
} finally {
  await browser.close()
}

// ---- Pandoc ---------------------------------------------------------------------------

const out = `${slug}-bound-${bound}.epub`
execFileSync('pandoc', [
  'book.html',
  '-f', 'html',
  '-t', 'epub3',
  '--split-level=2',
  '--toc',
  '--toc-depth=2',
  '--resource-path=.',
  '--css', join(here, 'epub.css'),
  '--epub-cover-image=cover.png',
  '--metadata', `title=${title}`,
  '--metadata', `subtitle=Bound from ${site} on ${boundLong}`,
  '--metadata', `date=${bound}`,
  ...(author ? ['--metadata', `author=${author}`] : []),
  '--metadata', 'lang=en',
  '-o', out,
])
console.log(`Wrote ${out}: ${chapters.length} chapters, bound ${boundLong}`)
