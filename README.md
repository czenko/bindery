# Skills

General-purpose agent skills I use day to day. Each skill is a folder under `skills/` with a `SKILL.md` and any assets it needs.

## Skills

| Skill                              | What it does                                                                                   | Requires                                                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [`teach-book`](skills/teach-book/) | Teaches a topic as a complete, self-paced course book in one Google Doc, one "Day" per lesson. | [`mattpocock-skills`](https://github.com/mattpocock/skills) plugin, a Google Drive connector, Chrome, and `pandoc` for EPUB |

## Install

Copy or symlink a skill folder into your skills directory:

```bash
git clone https://github.com/czenko/skills.git
ln -s "$PWD/skills/skills/teach-book" ~/.claude/skills/teach-book
```

## Contributing a skill

Read [AGENTS.md](AGENTS.md) first. Every skill here must be general purpose, with nothing tied to an employer, client, or private project.

## Credits

`teach-book` is built on the `teach` skill from [Matt Pocock's skills](https://github.com/mattpocock/skills), Copyright (c) 2026 Matt Pocock, used under the MIT License. It reads `teach` from the installed plugin at runtime rather than copying it. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

[MIT](LICENSE)
