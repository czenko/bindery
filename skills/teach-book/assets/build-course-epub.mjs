// Builds course.epub. Runs build-course-doc.mjs first, then converts its output.
// E-readers reflow text but not tables, so every table becomes a stack of
// blocks: the first cell is the heading, and each other cell becomes a
// "Column: value" line. Each Day is its own chapter.
//
// Usage: node assets/build-course-epub.mjs "<Course title>" "<one-line subtitle>" "<Author>"

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [title = 'Course', subtitle = '', author = ''] = process.argv.slice(2)
const root = new URL('..', import.meta.url).pathname
const here = new URL('.', import.meta.url).pathname

execFileSync('node', [join(here, 'build-course-doc.mjs'), title, subtitle], { stdio: 'inherit' })

const cells = (row, tag) =>
  [...row.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1].trim())

const unTable = (table) => {
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1])
  const head = cells(rows[0], 'th')
  const body = head.length ? rows.slice(1) : rows
  return (
    '<div class="stack">' +
    body
      .map((r) => {
        const [first, ...rest] = cells(r, 'td')
        const lines = rest
          .map((c, i) => (head[i + 1] ? `<p><span class="k">${head[i + 1]}:</span> ${c}</p>` : `<p>${c}</p>`))
          .join('')
        return `<div class="item"><p class="t">${first}</p>${lines}</div>`
      })
      .join('') +
    '</div>'
  )
}

let html = readFileSync(join(root, 'course-doc.html'), 'utf8')
  .replace(/<table>[\s\S]*?<\/table>/g, unTable)
  // The EPUB has its own title page and table of contents.
  .replace(/<h1>[^<]*<\/h1>(<p><em>[\s\S]*?<\/em><\/p>)?<h2>How to use this doc<\/h2>/, '<h1>How to use this book</h1>')
  .replace(/<h2>Contents<\/h2><ol>[\s\S]*?<\/ol><p>Appendix: Glossary<\/p>/, '')
  // Answer keys already say "Q1:", so drop the list numbering.
  .replace(/<ol style="list-style:none;padding:0">([\s\S]*?)<\/ol>/g, (_, items) => items.replace(/<li>/g, '<p>').replace(/<\/li>/g, '</p>'))
  .replace(/ style="[^"]*"/g, '')
  .replace(/Answer the warm-up and quiz before checking the answer key at the end of each day\./, 'Answer the warm-up and quiz before reading the answer key at the end of each chapter.')

const src = join(root, 'course-epub.html')
writeFileSync(src, html)

const out = join(root, 'course.epub')
execFileSync('pandoc', [
  src,
  '-f', 'html',
  '-t', 'epub3',
  '--split-level=1',
  '--toc',
  '--toc-depth=1',
  '--css', join(here, 'epub.css'),
  '--metadata', `title=${title}`,
  ...(subtitle ? ['--metadata', `subtitle=${subtitle}`] : []),
  ...(author ? ['--metadata', `author=${author}`] : []),
  '--metadata', 'lang=en-US',
  '-o', out,
])
console.log(`Wrote ${out}`)
