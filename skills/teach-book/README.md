# teach-book

Learn a topic at your own pace, away from the screen. `teach-book` interviews you about what you want to learn and why. It researches the topic, then writes a complete course as a book, with one chapter per day and each chapter about 15 minutes of reading.

Each day has:
- a warm-up on the day before
- a short lesson, with a source cited for every claim
- practice questions built on your own work
- a task that applies the lesson to your goal
- an answer key at the end of the chapter

The course is bound as an EPUB for your e-reader, so you can close the laptop and read somewhere quieter. When you finish a day, come back to chat with your answers. Your agent checks them, and adds a review day if you need one. A Google Doc copy is optional.

`teach-book` builds on the `teach` skill from [Matt Pocock's skills](https://github.com/mattpocock/skills). It reads `teach` from the installed plugin at runtime.

## Install

Requires Chrome, [`pandoc`](https://pandoc.org/installing.html), and the [`mattpocock-skills`](https://github.com/mattpocock/skills) plugin. The optional Google Doc copy needs a Google Drive connector.

Clone the repo, then symlink the skill into your skills directory:

```bash
git clone https://github.com/czenko/unplug-skills.git ~/Code/unplug-skills
```

```bash
ln -s ~/Code/unplug-skills/skills/teach-book ~/.claude/skills/teach-book
```

The build script assumes Chrome is at `/Applications/Google Chrome.app`. Adjust the path on other platforms.

## Use

Start a new session, then:

```text
/teach-book
```

Your agent asks what you'd like to learn. See [SKILL.md](SKILL.md) for the full workflow.
