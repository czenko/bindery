---
name: docs-book
description: Bind a documentation website into a full-length EPUB for deep reading on an e-reader. Chooses the conceptual material worth reading away from a screen, cuts procedures that only make sense at a computer, keeps cross-references working, adds review questions with answer keys, and puts the bound date on the cover. Use when the user invokes /docs-book, or asks to turn docs or a documentation site into a book, or to read documentation "on my e-reader," "on my Kobo," or "offline."
argument-hint: 'Which documentation site, and what do you want to understand from it?'
---

# Docs book

Documentation is written for someone at a keyboard, halfway through a task. This skill binds it for someone who wants to understand a system, reading in a chair. It is a full-size book with parts and chapters, not a day-by-day course. That's [`teach-book`](../teach-book/).

The book keeps the docs' own words. You pick and order pages, cut what only works at a computer, and add three things of your own: short editor's notes, review questions, and a glossary. Each is clearly marked as yours.

Requires Node 22 or later, Chrome, and `pandoc`. The scripts are in this skill's `assets/`, and they all run from the workspace directory.

## 1. Set up

1. **Workspace.** Create `~/Code/books/<site-slug>/`, or wherever the user prefers. Never put it inside a code repo.
2. **Interview.** Ask about anything the request doesn't make clear:
   - What does the reader want to understand, and why? "Reason about caching without the docs open" is a goal. "Read the docs" isn't.
   - What do they already know? Skip or shorten what they know.
   - How long should the book be? Default to about 200 pages, at about 300 words a page.
   - For tabbed code samples, which language or package manager should the book keep?
3. **License.** Find the docs' license, usually in the site footer or the docs repo. Record it.
4. Write all of this to `BRIEF.md`.

## 2. Discover

```bash
node <skill>/assets/discover.mjs https://docs.example.com/ [--prefix /docs/] [--max 500]
```

This writes `inventory.json`: every candidate page, in sidebar order, with its nav section and an approximate word count.

- Pages in `/llms.txt` or `/sitemap.xml` but missing from the sidebar are listed under "Not in nav".
- Translations, versioned copies, blogs, and changelogs are dropped and listed under `dropped`.
- `wordsUncertain` means the site renders with JavaScript and the static count is too low. Trust the counts from step 4 instead.

If the prefix is wrong, everything is either missing or swamped by marketing pages. Check the per-section summary it prints before you go on.

## 3. Outline, then stop for approval

Read the inventory. Skim the pages whose content you can't judge from the title. Then write `outline.json`:

```json
{
  "title": "Widgets, Explained",
  "site": "docs.example.com",
  "goal": "One sentence from BRIEF.md: what the reader wants to understand.",
  "license": "The Example docs are published under CC BY 4.0 by Example Inc.",
  "budgetPages": 200,
  "preferredLanguage": "TypeScript",
  "contentSelector": null,
  "stripSelectors": [],
  "parts": [
    {
      "title": "How widgets think",
      "intro": "Editor's intro: one paragraph on what this part is for.",
      "chapters": [
        {
          "slug": "architecture",
          "title": "Architecture",
          "pages": [
            { "url": "https://docs.example.com/concepts/architecture", "action": "keep", "reason": "Core mental model" },
            { "url": "https://docs.example.com/guides/quickstart", "action": "partial", "cut": ["Install the CLI", "#create-a-project"], "reason": "Keep the overview, cut setup" },
            { "url": "https://docs.example.com/reference/cli", "action": "cut", "reason": "Command reference" }
          ]
        }
      ]
    }
  ],
  "leftOut": [{ "title": "CLI reference", "url": "https://docs.example.com/reference/cli", "reason": "Only useful at a terminal" }]
}
```

- `cut` names headings to remove, by exact text or by `#id`. Each one removes the heading and everything under it, down to the next heading at the same level, and leaves an "Omitted: …" marker with an endnote to the live page.
- `contentSelector` and `stripSelectors` are CSS selectors. Leave them unset unless step 4's output shows site chrome getting in, or real content missing.

### What to keep, and what to cut

The book is for understanding, read away from the computer.

- **Keep in full:** concepts and mental models, architecture and "how it works", design rationale and tradeoffs, limits and why they exist, the security model, troubleshooting that explains causes, and short code that shows an idea.
- **Cut:** installation and setup, click paths through a UI, screenshots of dashboards, CLI walkthroughs, long copy-paste config, exhaustive API and parameter tables, migration guides for old versions, changelogs, and "Next steps" link lists.
- **Never summarize or rewrite the docs' prose.** Cutting is the only way to reduce bulk. When a page is half concept and half procedure, mark it `partial` and cut the procedure.

Order the pages for learning, not in sidebar order. Put concepts before the features built on them, and leave troubleshooting and limits until late. Keep chapters to one sitting, about 2,000–6,000 words, splitting or merging pages to get there.

Show the user the outline as parts, chapters, and estimated pages, plus the "left out" list with reasons. **Wait for their approval** before step 4.

## 4. Extract

```bash
node <skill>/assets/extract.mjs
```

For every kept or partial page, this renders the page in headless Chrome and takes its main content.

- **Strips the site:** nav, sidebars, footers, copy buttons, "Edit this page" links, feedback widgets, badges, and anything hidden.
- **Collapses tabs:** keeps the preferred language, with a small label saying which.
- **Converts:** turns callouts into block quotes, and code into plain `<pre>` with no highlighting.
- **Downloads** content images, and drops icons.
- **Applies the cuts.**
- **Prefixes every id with the page number,** for example `p0007-`.
- **Writes the output:**
  - `pages/NNNN-slug.html` and `pages/index.json`, the cache
  - a draft for each chapter, in `chapters/NN-slug.html`

Open two or three pages and check them. If there's site chrome left, or content missing, set `stripSelectors` or `contentSelector` in `outline.json` and rerun with `--force`.

Rerunning skips cached pages and leaves existing chapter drafts alone. `--redraft` overwrites the drafts, and your edits with them.

## 5. Edit each chapter

Each draft has the chapter's pages stitched together, with two `TODO` placeholders. The build refuses to run while any `TODO` is left.

1. **Editor's note.** Replace the `<aside class="editor">` placeholder with two or three sentences of your own. Say what the chapter covers, and how it serves the reader's goal from `BRIEF.md`. Don't summarize the chapter.
2. **Trim.** Remove what the extraction kept but the book doesn't need: promotional links ("try it in your browser", course ads), "Next steps" lists, and leftover setup lines. To mark a removal the reader should know about, use `<p class="cut" data-href="<live URL>">Omitted: <what>.</p>`. Never change the docs' sentences.
3. **Review questions.** Replace the review placeholder with 4–8 questions, in the markup shown in the draft:
   - `.quiz-item` for multiple choice, and `.recall` for free recall.
   - Test understanding, not syntax. Ask why something is designed that way, what happens if a setting changes, and which tradeoff applies when.
   - Every explanation cites the section heading that supports it. No answer may depend on anything that isn't in the book.
   - Within a question, keep the options about the same length.
4. **Glossary** (optional). Write `glossary.html` as a `<dl>`, and use the docs' own definitions where they exist.

Keep each chapter's `<h2>` and the `<section data-src>` wrappers: the build uses them for chapter numbers and cross-references.

## 6. Bind

```bash
node <skill>/assets/build-docs-epub.mjs [--bound YYYY-MM-DD] [--author "Docs owner"]
```

The bound date defaults to today. It appears in five places, so two bindings of the same docs never get confused:

- on the cover
- as the line under the title on the title page
- at the top of "About this book"
- in the EPUB's `dc:date`
- in the file name: `<title-slug>-bound-YYYY-MM-DD.epub`

The build also:

- Renders `assets/cover.html` to `cover.png` in Chrome.
- Writes "About this book": the bound date, a warning that the docs may have changed since, the goal, how the book was made, how to read it, what was left out, and the license.
- Makes each part an `<h1>` with its editor's intro, and each chapter a numbered `<h2>`.
- Rewrites links:
  - A link to a page or section that's in the book becomes an internal link, with "(ch. N)" added if it crosses chapters.
  - Every other link, including links to cut material, keeps its text and gets a numbered endnote.
- Ends each chapter with its review questions, then "Links" (the endnotes, with full URLs), then the answer key.
- Turns tables into stacked blocks, as `teach-book` does.

## 7. Check and deliver

1. **Check:**
   ```bash
   node <skill>/assets/check-epub.mjs <file>.epub
   ```
   - **It fails on:** a broken internal link, a remote or missing image, leftover `<script>`, `<button>`, `<form>`, or `<iframe>`, a question count that doesn't match its answer key, a missing cover, or a bound date missing from the title page, About page, metadata, or file name.
   - **It reports:** words and pages per chapter against `budgetPages`, long code lines, and SVG images. Some e-readers don't show SVG.
2. **Preview:** unzip the EPUB and screenshot one chapter in Chrome at 340px wide, using `assets/cdp.mjs` (`newPage({ width: 340 })`, then `goto` and `screenshot`). Look for code that runs off the edge, and endnote clutter.
3. **Deliver:** send the EPUB with `SendUserFile`. Most e-readers, including Kobo, open EPUB. Copy it over USB, or upload it to a cloud library the e-reader syncs with.
4. Record the file name, the bound date, and the outline's page count in `NOTES.md`.

To re-bind later, rerun from step 2 or step 4. Re-binding gives a new bound date and a new file name, and the reader can tell which is newer from the cover.

## Gotchas

- Some sites block headless Chrome, or put content behind a sign-in. Their pages come back as `HTTP 403` or with almost no words. Tell the user. Don't try to get around it.
- Huge sites: `--max` caps the inventory at 500 pages. If a site has more, ask the user which sections matter before raising it.
- Many links to pages left out mean many endnotes. If a chapter's Links list runs past about 30, consider bringing the most-cited page into the book, or trimming link-heavy passages.
- A formatter may reflow the workspace HTML after each write, so a single-line `sed` misses text that now wraps. Use `perl -0pi` with `\s+`, or a Node script, and grep afterward to confirm the change landed.
- `pandoc` drops classes on `<p>`, so the build wraps marked paragraphs in `<div>`s. Keep any new markup convertible the same way.
- The scripts assume macOS Chrome at `/Applications/Google Chrome.app`. Set `CHROME` to the binary's path on other platforms.
