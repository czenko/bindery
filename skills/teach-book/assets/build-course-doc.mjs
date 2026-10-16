// Builds course-doc.html: every lesson as "Day N" plus the glossary, as plain HTML
// for upload to Google Docs. Runs each lesson through headless Chrome first so
// quiz.js fills in question numbers and the answer key.
//
// Usage: node assets/build-course-doc.mjs "<Course title>" "<one-line subtitle>"

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [courseTitle = 'Course', courseSubtitle = ''] = process.argv.slice(2)
const root = new URL('..', import.meta.url).pathname
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const dump = (file) =>
  execFileSync(
    chrome,
    ['--headless=new', '--disable-gpu', '--virtual-time-budget=3000', '--dump-dom', `file://${file}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  )

const mainOf = (html) => html.match(/<main>([\s\S]*)<\/main>/)[1]

const clean = (html) =>
  html
    .replace(/<p class="kicker">[\s\S]*?<\/p>/, '')
    .replace(/<p class="lesson-nav">[\s\S]*?<\/p>/, '')
    .replace(/<p class="subtitle">([\s\S]*?)<\/p>/, '<p><em>$1</em></p>')
    .replace(/<span class="box-label">([\s\S]*?)<\/span>/g, '<h3>$1</h3>')
    .replace(/<span class="quiz-score[^"]*">[\s\S]*?<\/span>/g, '')
    .replace(
      /<div class="quiz-options" data-options="([^"]*)">[\s\S]*?<\/div>/g,
      (_, opts) => `<p><em>Options: ${opts.split('|').join(' · ')}</em></p>`
    )
    .replace(/<div class="quiz-feedback">[\s\S]*?<\/div>/g, '')
    .replace(/<textarea[^>]*><\/textarea>/g, '')
    .replace(/<button[^>]*>[\s\S]*?<\/button>/g, '')
    .replace(/<span class="quiz-num">(Q\d+)<\/span>/g, '<strong>$1.</strong> ')
    .replace(/<hr\s*\/?>\s*$/, '')
    .replace(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g, '<p><strong>$1.</strong> $2</p>')
    .replace(/<\/?dl>/g, '')
    .replace(/<span class="src">([\s\S]*?)<\/span>/g, '<em>($1)</em>')

const lessons = readdirSync(join(root, 'lessons'))
  .filter((f) => /^\d{4}-.*\.html$/.test(f))
  .sort()

const days = lessons.map((f, i) => {
  const n = i + 1
  let body = clean(mainOf(dump(join(root, 'lessons', f))))
  const title = body.match(/<h1>([\s\S]*?)<\/h1>/)[1].replace(/\s+/g, ' ').trim()
  body = body
    .replace(/<h1>[\s\S]*?<\/h1>/, `<h1 style="page-break-before: always">Day ${n}: ${title}</h1>`)
    .replace(/<h2>Answer key<\/h2>/, `<h2>Day ${n} answer key</h2>`)
  return { n, title, body }
})

const glossary = clean(mainOf(readFileSync(join(root, 'reference', 'glossary.html'), 'utf8'))).replace(
  /<h1>[\s\S]*?<\/h1>/,
  '<h1 style="page-break-before: always">Appendix: Glossary</h1>'
)

const doc = `<html><body>
<h1>${courseTitle}</h1>
${courseSubtitle ? `<p><em>${courseSubtitle}</em></p>` : ''}
<h2>How to use this doc</h2>
<ul>
<li>Do one day at a time, at your own pace. Each day takes about 15 minutes.</li>
<li>Answer the warm-up and quiz before checking the answer key at the end of each day.</li>
<li>Each day ends with an "Apply it" task on your own work. Reply in the Claude chat with "Day N:" and your answers or task output, and we'll go from there.</li>
</ul>
<h2>Contents</h2>
<ol>${days.map((d) => `<li>${d.title}</li>`).join('')}</ol>
<p>Appendix: Glossary</p>
${days.map((d) => d.body).join('\n')}
${glossary}
</body></html>`

// Collapsing whitespace would flatten code blocks onto one line, so set them aside first.
const pres = []
const min = doc
  .replace(/<pre[\s\S]*?<\/pre>/g, (block) => {
    pres.push(block)
    return `@@PRE${pres.length - 1}@@`
  })
  .replace(/ (class|data-answer|data-options|lang)="[^"]*"/g, '')
  .replace(/<div>|<\/div>/g, '')
  .replace(/\s+/g, ' ')
  .replace(/\s*(<\/?(?:p|li|ul|ol|h\d|table|tbody|tr|td|th|hr|body|html)\b[^>]*>)\s*/g, '$1')
  .replace(/@@PRE(\d+)@@/g, (_, i) => pres[Number(i)])

writeFileSync(join(root, 'course-doc.html'), min)
console.log(`Wrote course-doc.html: ${days.length} days, ${min.length} chars`)
