# Unplug Skills

Agent skills that help you slow down and work more mindfully.

Screens pull you toward the next tab, notification, or message. These skills push the other way. They move work off the screen and onto something calmer, like an e-reader that shows one page at a time and nothing else, so you can close the laptop, take your time, and come back when you're ready.

## Skills

| Skill                              | What it does                                                                                                                                                                       | Requires                                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [`teach-book`](skills/teach-book/) | Turns any topic into a self-paced course you read away from the screen, one chapter per day, with practice questions and an answer key. Delivered as an EPUB, with an optional Google Doc copy. | [`mattpocock-skills`](https://github.com/mattpocock/skills) plugin, Chrome, `pandoc`, and, for the optional Doc, a Google Drive connector |

## Install a skill

Clone the repo, then symlink a skill into your skills directory:

```bash
git clone https://github.com/czenko/unplug-skills.git ~/Code/unplug-skills
```

```bash
ln -s ~/Code/unplug-skills/skills/teach-book ~/.claude/skills/teach-book
```

## Read on your e-reader

Most e-readers, including Kobo, open EPUB files. Copy the `.epub` over USB, or upload it to a cloud library your e-reader syncs with.

## Add a skill

Read [AGENTS.md](AGENTS.md) first. A skill belongs here if it helps you slow down: it moves work off the screen, cuts interruptions, or gives you room to think. It must be general purpose, with nothing tied to an employer, client, or private project.

## Credits

`teach-book` is built on the `teach` skill from [Matt Pocock's skills](https://github.com/mattpocock/skills), Copyright (c) 2026 Matt Pocock, used under the MIT License. It reads `teach` from the installed plugin at runtime rather than copying it. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

[MIT](LICENSE)
