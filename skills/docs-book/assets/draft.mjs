// Chapter drafts, shared by extract.mjs and rebind.mjs so both produce exactly
// the same draft from the same pages. rebind.mjs depends on that: it merges
// your edits by comparing the draft you edited with a draft of the new pages.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'page'

const PLACEHOLDERS = `<aside class="editor">
<p>TODO: two or three sentences on what this chapter covers and how it serves the reader's goal.</p>
</aside>`

const REVIEW = `<section class="review">
<!-- TODO: 4–8 review questions. End every explanation with (See “Exact heading”.) so a rebind can tell when its section changes. Multiple choice:
<div class="quiz-item" data-answer="Option B">
  <p class="quiz-q">Question?</p>
  <div class="quiz-options" data-options="Option A|Option B|Option C|Option D"></div>
  <div class="quiz-feedback">Why B is right. (See “Heading”.)</div>
</div>
Free recall:
<div class="recall"><p>Prompt</p><div class="quiz-feedback">Model answer. (See “Heading”.)</div></div>
-->
</section>`

// One block element per line, so merges and diffs work paragraph by paragraph
// rather than page by page. Code blocks are left exactly as they are.
export function blockLines(html) {
  const pres = []
  return html
    .replace(/<pre[\s\S]*?<\/pre>/g, (block) => `@@PRE${pres.push(block) - 1}@@`)
    .replace(/(<\/(?:p|h[1-6]|li|ul|ol|blockquote|table|section|aside|figure|div|dl|dd|dt)>|@@PRE\d+@@)[ \t]*(?=<|@@PRE)/g, '$1\n')
    .replace(/(<(?:ul|ol|section[^>]*|aside[^>]*|blockquote[^>]*|table|dl)>)(?=<)/g, '$1\n')
    .replace(/@@PRE(\d+)@@/g, (_, i) => pres[Number(i)])
}

// Builds a chapter's draft from the pages in index (pages/index.json).
// root is the directory the index's file paths are relative to.
export function draftChapter(ch, index, root = '.') {
  const kept = ch.pages.filter((p) => p.action !== 'cut' && index[p.url]?.file)
  const body = kept
    .map((p) => {
      const meta = index[p.url]
      const html = readFileSync(join(root, meta.file), 'utf8')
      const heading = kept.length === 1 ? '' : `<h3 id="${meta.id}">${meta.title}</h3>\n`
      return `<section data-src="${p.url}"${kept.length === 1 ? ` id="${meta.id}"` : ''}>\n${heading}${html}</section>`
    })
    .join('\n\n')
  return blockLines(`<h2>${ch.title}</h2>\n\n${PLACEHOLDERS}\n\n${body}\n\n${REVIEW}\n`)
}
