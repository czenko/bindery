# Bindery

Agent skills that bind what you're learning into a book you can carry to your e-reader.

Screens pull you toward the next tab, notification, or message. An e-reader like a Kobo doesn't: it shows one page at a time, and nothing else. These skills take a topic you want to learn and bind it into an EPUB, so you can close the laptop and read somewhere quieter.

## The shelf

| Skill                              | What it binds                                                                                                                            | Requires                                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [`teach-book`](skills/teach-book/) | A self-paced course on any topic, one chapter per day, with practice questions and an answer key. Delivered as an EPUB and a Google Doc. | [`mattpocock-skills`](https://github.com/mattpocock/skills) plugin, Chrome, `pandoc`, and a Google Drive connector for the Doc |

## Install a skill

Clone the repo, then symlink a skill into your skills directory:

```bash
git clone https://github.com/czenko/bindery.git ~/Code/bindery
```

```bash
ln -s ~/Code/bindery/skills/teach-book ~/.claude/skills/teach-book
```

## Read it on your e-reader

Most e-readers, including Kobo, open EPUB files. Copy the `.epub` over USB, or upload it to a cloud library your e-reader syncs with.

## Add a skill

Read [AGENTS.md](AGENTS.md) first. A skill belongs here if it turns content into something worth reading away from a screen, and it must be general purpose, with nothing tied to an employer, client, or private project.

## Credits

`teach-book` is built on the `teach` skill from [Matt Pocock's skills](https://github.com/mattpocock/skills), Copyright (c) 2026 Matt Pocock, used under the MIT License. It reads `teach` from the installed plugin at runtime rather than copying it. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

[MIT](LICENSE)
