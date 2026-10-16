---
name: teach-book
description: Teach the user a topic as a complete, self-paced course book in one Google Doc ("Day 1", "Day 2", …), built on the mattpocock-skills teach workspace. Use when the user invokes /teach-book, or asks to learn a topic "as a book," "all at once," "in a Google Doc," or "at my own pace" rather than one lesson per session.
argument-hint: 'What would you like to learn about?'
---

# Teach book

This skill wraps the `teach` skill. It keeps that skill's workspace, philosophy, and file formats, and changes one thing: delivery. Instead of one lesson per session, write the whole course up front as numbered days. Then deliver it as a single Google Doc the learner works through at their own pace, replying in chat as they finish each day.

## 1. Load the base skill

`teach` can't be invoked by the model, so read its files directly. Use the newest installed version:

```bash
ls -d ~/.claude/plugins/cache/*/mattpocock-skills/*/skills/productivity/teach | sort -V | tail -1
```

Read `SKILL.md` and every `*-FORMAT.md` in that folder. Follow them, except where this file overrides them. Its sections on the workspace, mission, zone of proximal development, knowledge vs skills, quizzes, assets, reference documents, and `NOTES.md` all still apply.

## 2. Overrides

| `teach` says                                                   | `teach-book` does                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| One lesson per session, chosen by zone of proximal development | Plan and write the whole arc now, usually 6–10 days. Each day builds on the one before.      |
| Lessons are files in `./lessons/`                              | Still true, and the files are the source. The deliverable is one Google Doc built from them. |
| Open the lesson with a CLI command                             | Upload the Doc to Google Drive and give the learner the link.                                |
| Learning records after each session                            | Write them when the learner replies with "Day N:" and shows real understanding.              |

Don't set up a scheduled routine. The learner sets the pace.

## 3. Set up

1. **Workspace.** Ask where it should live if that's unclear. Never put it inside a code repo's working tree; suggest `~/Code/learning/<topic>`.
2. **Mission.** Interview the user as `teach` describes: the trigger, what "good" means, prior knowledge, audience, and how they'll know they've learned it. Read any linked tickets or docs; the concrete work goes into every "Apply it" task. Record prior knowledge as learning record `0001`.
3. **Assets.** Copy this skill's `assets/` into the workspace's `assets/`: `course.css`, `quiz.css`, `quiz.js`, and `build-course-doc.mjs`.
4. **Resources.** Research before writing (see step 5). Write `RESOURCES.md`, including communities and a Gaps section.

## 4. Write each day

Save each day as `lessons/NNNN-slug.html`. Link the shared assets, and follow the markup documented at the top of `assets/quiz.js`. Every day has, in this order:

1. A kicker line, `<p class="kicker">Topic · Day N · ~15 minutes</p>`, then an `<h1>` title and a `<p class="subtitle">`.
2. A "Why this, why now" box that ties the day to the mission, ending with **Your win:** and one concrete skill.
3. A warm-up `.recall` on the previous day (Day 1 skips this). This is the spaced retrieval.
4. The knowledge section: short, bulleted, with a citation on every claim.
5. Practice: 4–6 `.quiz-item` questions built on realistic scenarios from the learner's own work.
6. An "Apply it" task that produces a real artifact for the mission. Later days consume earlier days' artifacts.
7. A "Primary source" box naming the single best source.
8. An "Ask your teacher" box pointing back to the chat.
9. A numbered Sources list, a `.lesson-nav` footer (previous day, glossary, next day), and an empty `<div class="answer-key"></div>` before `</main>`.

Keep `reference/glossary.html` current as you go. Use `<dl>` with `<dt>` and `<dd>`, and tag each term with `<span class="src">Day N</span>`. The build script turns this into the appendix.

### Quiz rules

- Within a question, every option has the same number of words and about the same length. For a fixed category set, reuse it unchanged across questions.
- Every explanation says _why_, in one or two sentences.

## 5. Evidence rules

These came from real mistakes. Don't skip them.

- **Verify every source before you cite it.** Fetch it, and cite only what the fetch confirmed. Never build a URL from memory: an invented book URL once got as far as a lesson draft.
- If a fetch fails (a PDF won't parse, a server returns an error), cite only what you could confirm, such as the abstract. List the gap in `RESOURCES.md`.
- **Label your inferences.** Write _"(Hypothesis.)"_ or _"(Inference, not a tested finding.)"_ inline. If you propose a method of your own, say it isn't an established standard.
- Mark single-vendor or single-study results as examples, not laws.

## 6. Build and deliver the Doc

1. **Build:**
   ```bash
   node assets/build-course-doc.mjs "<Course title>" "<one-line subtitle>"
   ```
   This writes `course-doc.html`. It runs each lesson through headless Chrome, so `quiz.js` numbers the questions and fills in the answer key. It strips all interactivity, makes each day an `<h1>Day N: …</h1>` with a page break, ends each day with its answer key, adds the glossary as an appendix, and minifies the result.
2. **Check:** confirm every day heading, one answer key per day, and no `<button>`, `<textarea>`, `<script>`, or `quiz-feedback` left over.
3. **Upload:** create a Drive folder for the course if there isn't one. Then call the Drive connector's `create_file` with `contentMimeType: "text/html"`, `parentId` set to the folder, and `textContent` set to the full built HTML. Google Docs turns it into real headings.
   - The connector can't reliably upload binary files, so don't make PDFs.
   - Uploading means pasting the whole file into `textContent`. The Read tool truncates very long single-line files, so read the rest with `cut -c <offset>-` and paste it all in.
4. **Verify:** read the Doc back with `read_file_content` and check that every "Day N" heading and answer key is present.
5. **Clean up:** move any Doc this one replaces to the trash (`trash_file`, never a permanent delete). Record the Doc link and folder ID in `NOTES.md`.

## 6b. E-reader copy (EPUB)

Don't send the learner to the Google Docs EPUB export. It keeps tables at a fixed width, and they overflow on e-readers. Build the EPUB from the same source instead (requires `pandoc`):

```bash
node assets/build-course-doc.mjs "<Course title>" "<subtitle>"
node assets/build-course-epub.mjs "<Course title>" "<Author>"
```

- Writes `course.epub`: a title page, a generated table of contents, and one chapter per day plus the glossary.
- Every table becomes a stack of blocks: the first cell is the heading, and each other cell becomes a "Column: value" line. Styles live in `assets/epub.css`.
- Write tables so they still read well this way: put the row's name in the first column, and keep the column headers short.
- To check it, unzip the EPUB and screenshot one chapter in headless Chrome inside a ~340px-wide body. Chrome won't render narrower than its minimum window width, so a 390px window crops instead of reflowing.
- Send the file with `SendUserFile`. The Drive connector can't reliably upload binary files, so the learner adds it to Drive or Books themselves.

## 7. When the learner replies with "Day N:"

1. Check their answers and their "Apply it" output against the lesson. Explain anything they got wrong, and connect it back to the mission.
2. Write a learning record if they showed real understanding, or if they had a misconception that is now corrected.
3. If they struggled, write a review day: interleaved retrieval practice plus one new application task, with no new concepts. Then rebuild, re-upload, and trash the old Doc.
4. If you edit any lesson, rebuild and re-upload the same way, and update the link in `NOTES.md`.

## Gotchas

- A formatter may reflow the workspace HTML after each write. Single-line `sed` replacements then silently miss text that now wraps across lines. Use `perl -0pi` with `\s+`, or a Node script, and grep afterward to confirm the change landed.
- Google Docs ignores CSS classes. The build script already converts callout boxes into `<h3>` headings and glossary lists into paragraphs. Keep any new reusable markup convertible the same way.
- The build script assumes macOS Chrome at `/Applications/Google Chrome.app`. Adjust the path on other platforms.
