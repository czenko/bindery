# Agent instructions

This repo is public. Everything committed here is world-readable, including history.

## What belongs here

Skills that bind content into something worth reading away from a screen, usually an EPUB for an e-reader. Each one must be general purpose: anyone could use it, at any job, on any project.

Write for e-readers first:

- Output reflows on a small screen. No fixed-width tables, wide code blocks, or layouts that rely on color.
- Every book has a title page, a table of contents, and one chapter per sitting.
- Nothing in the book needs a browser, a click, or a network connection to make sense.

## Never commit

- Employer, client, or private-project names, products, codebases, URLs, or ticket IDs
- Internal process, decisions, metrics, people, or team names
- Work email addresses, absolute home-directory paths, tokens, or keys
- Examples drawn from real work. Replace them with neutral, invented ones.

When adapting a skill from a work repo, rewrite it for a general audience instead of copying it and deleting the obvious bits.

## Adding a skill

1. Create `skills/<name>/SKILL.md` with `name` and `description` frontmatter, plus any `assets/`.
2. Add a row to the Skills table in `README.md`, including anything it requires.
3. If it builds on someone else's work, credit them in the README's Credits section on the terms their license sets, and add their license to `THIRD_PARTY_NOTICES.md`.

## Leak check

`scripts/check-leaks.sh` runs as a pre-commit hook and in CI. After cloning, enable the hook:

```bash
git config core.hooksPath .githooks
```

Private patterns, such as employer names, go in `.leak-patterns`, one extended regex per line. That file is gitignored so the list itself never gets published. Never bypass the hook with `--no-verify`.

Commit with your GitHub noreply address, not a work address:

```bash
git config user.email "<id>+<username>@users.noreply.github.com"
```
