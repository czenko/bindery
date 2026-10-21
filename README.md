# Unplug Skills

Agent skills that help you slow down and work more mindfully.

Screens pull you toward the next tab, notification, or message. These skills push the other way. They move work off the screen and onto something calmer, like an e-reader that shows one page at a time and nothing else, so you can close the laptop, take your time, and come back when you're ready.

## Skills

| Skill                              | What it does                                                                                                                                                                       | Requires                                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [`docs-book`](skills/docs-book/) | Binds a documentation site into a full-length book for deep reading away from the screen. Keeps the concepts, cuts screen-only procedures, preserves cross-references, and adds review questions with answer keys. The bound date is on the cover, and a rebind updates the book from the live docs while keeping your edits. | Node 22 or later, Chrome, `pandoc`, and `git` for rebinding |
| [`teach-book`](skills/teach-book/) | Turns any topic into a self-paced course you read away from the screen, one chapter per day, with practice questions and an answer key. Delivered as an EPUB, with an optional Google Doc copy. | [`mattpocock-skills`](https://github.com/mattpocock/skills) plugin, Chrome, `pandoc`, and, for the optional Doc, a Google Drive connector |

## Install a skill

Each skill installs on its own. Clone the repo once:

```bash
git clone https://github.com/czenko/unplug-skills.git ~/Code/unplug-skills
```

Then follow the skill's own README for what it requires and how to link it: [`docs-book`](skills/docs-book/README.md) or [`teach-book`](skills/teach-book/README.md).

## Read on your e-reader

Most e-readers, including Kobo, open EPUB files. Copy the `.epub` over USB, or upload it to a cloud library your e-reader syncs with.

## Keep a book current

Documentation changes, so every `docs-book` binding has its date on the cover. To update a book, ask your agent to rebind it. The rebind keeps everything decided last time: the outline, the cuts, the trims, the editor's notes, and the review questions. You're asked only about pages that are new or gone. Chapters whose pages didn't change come through as you left them, and only questions about sections that changed get flagged. The new book opens with what changed since the last binding.

## Add a skill

Read [AGENTS.md](AGENTS.md) first. A skill belongs here if it helps you slow down: it moves work off the screen, cuts interruptions, or gives you room to think. It must be general purpose, with nothing tied to an employer, client, or private project.

## Credits

`teach-book` is built on the `teach` skill from [Matt Pocock's skills](https://github.com/mattpocock/skills), Copyright (c) 2026 Matt Pocock, used under the MIT License. It reads `teach` from the installed plugin at runtime rather than copying it. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

[MIT](LICENSE)
