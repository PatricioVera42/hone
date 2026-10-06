---
name: close
description: Records a study session in the project's PROGRESS.md once the user confirms it. Use when the user ends a session, or to review the drafts in progress-inbox.md.
---

# Close

Record what happened in the project's progress, writing only what the user confirms. Two branches: closing the current session, and reviewing the drafts left in the inbox by a quick close.

`PROGRESS.md` and `progress-inbox.md` sit in the project's folder, next to its `AGENTS.md`. Write in the language set in the project's `.hone/inherited.md`, headings included; file names stay in English.

## PROGRESS.md

```markdown
# Progress

## Current state

- **Where things stand:** ...
- **Next steps:** ...
- **Open questions:** ...

## Sessions

### YYYY-MM-DD

- **Learned:** ...
- **Done:** ...
- **Hard:** ...
```

"Current state" is rewritten whole on each close, so it stays quick to read at the start of a session. "Sessions" only grows: one entry per session, in date order, earlier entries left as they are. If `PROGRESS.md` doesn't exist, the first close creates it with this layout.

## Closing a session

1. Build the proposal from this session: the conversation and the files written in it. A new "Current state", starting from the existing one and updated with what changed, and a session entry dated today (run `date` if you don't have it). Record what happened, in short bullets; leave out a line with nothing to say. Name a file by its path instead of copying its content: an exercise in `practice/` is its path and a few words on what it practices.
2. Confirm before writing: show both parts exactly as they'll be written and ask the user to approve or correct them. After each correction, show them again. Write only when the user approves the version shown.
3. If during the session you noticed something about how the user learns or works that `.hone/inherited.md` doesn't say, write it nowhere. After writing, suggest they tell the generator, and give them the sentence to bring.

## Reviewing the inbox

`progress-inbox.md` holds drafts, each under its own dated heading, with a current state and a session entry. Go through them oldest first, one at a time:

1. Show the draft and ask the user to confirm, correct or discard it.
2. For a confirmed or corrected draft, add its session entry to "Sessions" under the draft's date, and rewrite "Current state" from the draft's. If `PROGRESS.md` has moved on since the draft, keep what's newer, and ask when you can't tell. Show the result and write it once the user approves.
3. Remove the draft from the inbox as soon as it's decided. When the inbox has no drafts left, delete `progress-inbox.md`.
