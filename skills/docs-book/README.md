# docs-book

I enjoy reading technical books to learn. Pen on paper. Annotation. Textbooks are an opportunity to unplug from the screen and reflect about a technical concept or architectural design.

But technology is ever-changing. Printed books quickly go out of date, and our source of truth is often on documentation sites.

This skill is built to extract a documentation site into an ebook (`.epub` format) so that you can read, annotate, and deeply learn offline.

It keeps the concepts in the docs' own words, and cuts the procedures that only make sense at a computer. Each chapter ends with review questions and an answer key. The bound date is on the cover. When the docs change, rebind: your earlier choices carry over, and you only review what changed.

## Install

Requires Node 22 or later, Chrome, and [`pandoc`](https://pandoc.org/installing.html). Rebinding also needs `git`.

Clone the repo, then symlink the skill into your skills directory:

```bash
git clone https://github.com/czenko/unplug-skills.git ~/Code/unplug-skills
```

```bash
ln -s ~/Code/unplug-skills/skills/docs-book ~/.claude/skills/docs-book
```

The scripts assume Chrome is at `/Applications/Google Chrome.app`. On other platforms, set `CHROME` to the path of the Chrome binary.

## Use

Start a new session, then:

```text
/docs-book https://docs.example.com/
```

To update a book you bound earlier, ask your agent to rebind it from the book's workspace.

See [SKILL.md](SKILL.md) for the full workflow.
