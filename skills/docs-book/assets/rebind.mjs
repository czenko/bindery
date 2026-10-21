// Rebinds a book against the live docs, keeping every decision from the last
// binding: the outline, the cuts, your trims, editor's notes, and questions.
//
//   node assets/rebind.mjs prepare
//     Snapshots the last binding into binds/<bound-date>/, reruns discovery
//     with the same arguments, and lists only what needs a decision: pages
//     that are new since last time, and pages that may be gone.
//
//   node assets/rebind.mjs merge
//     Re-extracts every page, then three-way merges each chapter: your edited
//     chapter, the draft you edited it from, and a draft of the live pages.
//     Unchanged chapters come through exactly as you left them. Writes
//     REBIND.md, the to-do list, and changes.json, which the build turns into
//     "What changed since …" in About this book.
//
// Run both from the workspace directory. Rerunning merge starts again from
// the snapshot, so it discards any conflicts you've already resolved.

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { blockLines, draftChapter } from './draft.mjs'

const here = new URL('.', import.meta.url).pathname
const command = process.argv[2]
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const keptPages = (ch) => ch.pages.filter((p) => p.action !== 'cut')
const chaptersOf = (outline) => outline.parts.flatMap((part) => part.chapters)

function previousBinding() {
  if (existsSync('bind.json')) return readJson('bind.json').bound
  const dates = readdirSync('.')
    .map((f) => f.match(/-bound-(\d{4}-\d{2}-\d{2})\.epub$/)?.[1])
    .filter(Boolean)
    .sort()
  return dates.at(-1)
}

// ---- prepare ------------------------------------------------------------------

function prepare() {
  const since = previousBinding()
  if (!since) throw new Error('No previous binding here: no bind.json and no *-bound-YYYY-MM-DD.epub.')
  const snapshot = `binds/${since}`
  if (existsSync(snapshot)) console.log(`Using the existing snapshot in ${snapshot}/.`)
  else {
    mkdirSync(snapshot, { recursive: true })
    for (const item of readdirSync('.')) {
      if (['outline.json', 'inventory.json', 'pages', 'chapters', 'glossary.html', 'bind.json', 'changes.json'].includes(item) || item.endsWith(`-bound-${since}.epub`))
        cpSync(item, join(snapshot, item), { recursive: true })
    }
    console.log(`Snapshot of the ${since} binding saved in ${snapshot}/.`)
  }
  writeFileSync('rebind.json', JSON.stringify({ since, snapshot }, null, 2))

  const oldInventory = readJson(join(snapshot, 'inventory.json'))
  const how = oldInventory.discover || { starts: [oldInventory.root], prefix: oldInventory.prefix, max: 500 }
  if (!oldInventory.discover) console.warn('The old inventory has no record of its start URLs; rediscovering from the root only.')
  execFileSync('node', [join(here, 'discover.mjs'), ...how.starts, '--prefix', how.prefix, '--max', String(how.max)], { stdio: 'inherit' })

  const inventory = readJson('inventory.json')
  const outline = readJson('outline.json')
  const live = new Map(inventory.pages.filter((p) => !p.skipped).map((p) => [p.url, p]))
  const old = new Map(oldInventory.pages.map((p) => [p.url, p]))
  const considered = new Set([
    ...old.keys(),
    ...chaptersOf(outline).flatMap((ch) => ch.pages.map((p) => p.url)),
    ...(outline.leftOut || []).map((l) => l.url),
    ...(outline.declined || []).map((d) => d.url),
  ])
  const fresh = [...live.values()].filter((p) => !considered.has(p.url))
  const gone = chaptersOf(outline).flatMap((ch) => keptPages(ch).filter((p) => !live.has(p.url)).map((p) => ({ ...p, chapter: ch.title })))
  const resized = chaptersOf(outline).flatMap((ch) =>
    keptPages(ch)
      .filter((p) => old.get(p.url)?.words && live.get(p.url)?.words)
      .map((p) => ({ url: p.url, chapter: ch.title, was: old.get(p.url).words, now: live.get(p.url).words }))
      .filter((r) => Math.abs(r.now - r.was) / r.was > 0.15)
  )

  const lines = [`# Rebind: triage`, '', `Rebinding the ${since} binding. Decide what to do with each page below, then run \`node <skill>/assets/rebind.mjs merge\`.`, '']
  lines.push(`## New pages (${fresh.length})`, '')
  if (fresh.length) {
    lines.push('Not on the site, or not in the inventory, last time. For each one, either add it to a chapter in `outline.json`, or add `{ "url", "title", "reason" }` to `outline.declined` so the next rebind doesn’t ask again.', '')
    for (const p of fresh) lines.push(`- ${p.title || '(untitled)'} — ${p.url} (${p.section || 'no section'}, ~${p.words ?? '?'} words)`)
  } else lines.push('None.')
  lines.push('', `## Pages in the book that may be gone (${gone.length})`, '')
  if (gone.length) {
    lines.push('Missing from the new inventory. The page may have moved, or left the sidebar but still exist; merge will confirm. If it moved, change its URL in `outline.json`. If it’s gone for good, remove it and add it to `outline.leftOut` with the reason.', '')
    for (const p of gone) lines.push(`- ${p.url} (chapter “${p.chapter}”)`)
  } else lines.push('None.')
  lines.push('', `## Pages that changed size by more than 15% (${resized.length})`, '')
  if (resized.length) {
    lines.push('No decision needed unless a page grew enough to unbalance its chapter.', '')
    for (const r of resized) lines.push(`- ${r.url}: ${r.was} → ${r.now} words (chapter “${r.chapter}”)`)
  } else lines.push('None.')
  writeFileSync('REBIND.md', lines.join('\n') + '\n')
  console.log(`\nWrote REBIND.md: ${fresh.length} new pages, ${gone.length} possibly gone, ${resized.length} resized.`)
}

// ---- merge ----------------------------------------------------------------------

const plain = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

// Heading text → the text under it, up to the next heading or the end of
// its page's section, so a page added after it doesn't count as a change.
function sections(html) {
  const out = new Map()
  let current = null
  for (const part of html.replace(/<section class="review">[\s\S]*$/, '').split(/(<h[3-6][^>]*>[\s\S]*?<\/h[3-6]>|<\/?section[^>]*>)/)) {
    if (/^<h[3-6]/.test(part)) out.set((current = plain(part).toLowerCase()), '')
    else if (/^<\/?section/.test(part)) current = null
    else if (current) out.set(current, `${out.get(current)} ${plain(part)}`.trim())
  }
  return out
}

// Every question in the review section, with the headings its explanation cites.
function questions(html) {
  const review = html.match(/<section class="review">([\s\S]*?)<\/section>/)?.[1] || ''
  const items = [
    ...review.matchAll(
      /<div class="quiz-item"[^>]*>\s*<p class="quiz-q">([\s\S]*?)<\/p>[\s\S]*?<div class="quiz-feedback">([\s\S]*?)<\/div>\s*<\/div>|<div class="recall">\s*<p>([\s\S]*?)<\/p>\s*<div class="quiz-feedback">([\s\S]*?)<\/div>\s*<\/div>/g
    ),
  ]
  return items.map((m, i) => {
    const prompt = plain(m[1] ?? m[3])
    const feedback = m[2] ?? m[4]
    // "(See “A” and “B”.)": quoted headings may contain parentheses themselves.
    const cites = [...feedback.matchAll(/\(See (“[^”]*”(?:[^“)]*“[^”]*”)*)/g)].flatMap((s) => [...s[1].matchAll(/“([^”]+)”/g)].map((c) => plain(c[1]).toLowerCase()))
    return { q: i + 1, prompt: prompt.length > 70 ? `${prompt.slice(0, 67)}…` : prompt, cites }
  })
}

function merge3(ours, base, theirs) {
  const dir = mkdtempSync(join(tmpdir(), 'docs-book-merge-'))
  const files = { ours: join(dir, 'ours'), base: join(dir, 'base'), theirs: join(dir, 'theirs') }
  writeFileSync(files.ours, ours)
  writeFileSync(files.base, base)
  writeFileSync(files.theirs, theirs)
  try {
    const out = execFileSync('git', ['merge-file', '-p', '--diff3', '-L', 'your edits', '-L', 'last binding', '-L', 'live docs', files.ours, files.base, files.theirs], { encoding: 'utf8' })
    return { text: out, conflicts: 0 }
  } catch (err) {
    if (typeof err.status === 'number' && err.status > 0 && err.status < 128) return { text: err.stdout, conflicts: err.status }
    throw err
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function mergeAll() {
  if (!existsSync('rebind.json')) throw new Error('Run `rebind.mjs prepare` first.')
  const { since, snapshot } = readJson('rebind.json')

  execFileSync('node', [join(here, 'extract.mjs'), '--force'], { stdio: 'inherit' })

  const outline = readJson('outline.json')
  const index = readJson('pages/index.json')
  const oldOutline = readJson(join(snapshot, 'outline.json'))
  const oldIndex = readJson(join(snapshot, 'pages/index.json'))
  const oldChapters = new Map(chaptersOf(oldOutline).map((ch) => [ch.file, ch]))
  const pageText = (meta, root) => (meta?.file && existsSync(join(root, meta.file)) ? plain(readFileSync(join(root, meta.file), 'utf8')) : null)

  const report = []
  const changes = { since, chapters: {}, removed: [] }
  const tally = { unchanged: 0, merged: 0, conflicted: 0, new: 0 }

  for (const ch of chaptersOf(outline)) {
    const old = oldChapters.get(ch.file)
    const todo = []
    if (!old) {
      tally.new++
      changes.chapters[ch.file] = { status: 'new', pages: [] }
      report.push({ ch, status: 'new chapter', todo: ['Write the editor’s note and 4–8 review questions (fresh draft with TODOs).'] })
      continue
    }

    const base = draftChapter(old, oldIndex, snapshot)
    const theirs = draftChapter(ch, index, '.')
    const ours = blockLines(readFileSync(join(snapshot, ch.file), 'utf8'))

    // Which pages changed, arrived, or left.
    const oldUrls = new Set(keptPages(old).map((p) => p.url))
    const newUrls = new Set(keptPages(ch).filter((p) => index[p.url]?.file).map((p) => p.url))
    const updated = keptPages(ch).filter((p) => oldUrls.has(p.url) && newUrls.has(p.url) && pageText(oldIndex[p.url], snapshot) !== pageText(index[p.url], '.'))
    const added = keptPages(ch).filter((p) => newUrls.has(p.url) && !oldUrls.has(p.url))
    const removed = keptPages(old).filter((p) => !newUrls.has(p.url))
    const titleOf = (p) => index[p.url]?.title || oldIndex[p.url]?.title || p.url

    // An unchanged chapter is copied back byte for byte; only a changed one is merged.
    let text = readFileSync(join(snapshot, ch.file), 'utf8')
    let conflicts = 0
    if (base !== theirs) ({ text, conflicts } = merge3(ours, base, theirs))
    writeFileSync(ch.file, text)

    if (base === theirs) tally.unchanged++
    else if (conflicts) tally.conflicted++
    else tally.merged++
    if (updated.length || added.length || removed.length) changes.chapters[ch.file] = { status: 'updated', pages: [...updated, ...added].map(titleOf) }
    for (const p of removed) changes.removed.push({ title: titleOf(p), url: p.url, reason: index[p.url]?.error ? `no longer available (${index[p.url].error})` : 'moved out of the book' })

    if (conflicts) todo.push(`Resolve ${conflicts} conflict${conflicts > 1 ? 's' : ''}: \`grep -n '^<<<<<<<' ${ch.file}\`. Each shows your edits, the last binding, and the live docs.`)
    for (const p of keptPages(ch)) {
      const missing = index[p.url]?.missingCuts || []
      if (missing.length) todo.push(`Cut no longer matches a heading on ${p.url}: ${missing.map((c) => `“${c}”`).join(', ')}. The heading was probably renamed: update \`cut\` in outline.json and rerun merge before resolving anything, or check the procedure isn’t back in the chapter.`)
      if (index[p.url]?.error) todo.push(`${p.url} failed to extract (${index[p.url].error}); its section is gone from the chapter.`)
    }
    if (added.length) todo.push(`New in this chapter: ${added.map(titleOf).join(', ')}. Add review questions that cover it.`)

    // Questions whose cited section changed, vanished, or isn't cited at all.
    const before = sections(base)
    const after = sections(theirs)
    const present = sections(text)
    for (const q of questions(text)) {
      const reasons = []
      if (!q.cites.length) reasons.push('cites no section')
      for (const c of q.cites) {
        if (!present.has(c)) reasons.push(`cites “${c}”, which isn’t in the chapter now`)
        else if (before.has(c) && after.has(c) && before.get(c) !== after.get(c)) reasons.push(`“${c}” changed`)
      }
      if (reasons.length) todo.push(`Check Q${q.q} (${q.prompt}): ${reasons.join('; ')}.`)
    }
    if (added.length || removed.length || (oldUrls.size && updated.length / oldUrls.size > 0.5)) todo.push('Reread the editor’s note: the chapter changed substantially.')

    report.push({ ch, status: base === theirs ? 'unchanged' : conflicts ? `${conflicts} conflicts` : 'merged cleanly', todo })
  }

  writeFileSync('changes.json', JSON.stringify(changes, null, 2))
  const open = report.filter((r) => r.todo.length)
  const lines = [
    `# Rebind: merge`,
    '',
    `Since the ${since} binding: ${tally.unchanged} chapters unchanged, ${tally.merged} merged cleanly, ${tally.conflicted} with conflicts, ${tally.new} new.`,
    '',
    open.length ? '## To do' : '## Nothing to do',
    '',
  ]
  for (const r of open) {
    lines.push(`### ${r.ch.title} (${r.ch.file}, ${r.status})`, '')
    for (const t of r.todo) lines.push(`- [ ] ${t}`)
    lines.push('')
  }
  const quiet = report.filter((r) => !r.todo.length)
  if (quiet.length) lines.push('## No action needed', '', ...quiet.map((r) => `- ${r.ch.title}: ${r.status}`), '')
  lines.push('## Then bind', '', '```bash', 'node <skill>/assets/build-docs-epub.mjs', 'node <skill>/assets/check-epub.mjs <file>.epub', '```')
  writeFileSync('REBIND.md', lines.join('\n') + '\n')
  console.log(`\n${lines[2]}\nWrote REBIND.md (${open.reduce((n, r) => n + r.todo.length, 0)} to-dos) and changes.json.`)
}

if (command === 'prepare') prepare()
else if (command === 'merge') mergeAll()
else {
  console.error('Usage: node rebind.mjs prepare | merge')
  process.exit(1)
}
