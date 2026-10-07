# Study project template

The two files `/create` writes for a study project, and `/refine` rewrites. `<folder>` is the project's path from the workshop root, without a trailing slash. Write both files in the profile's language, headings included; keep file, folder, command and skill names in English. Leave out a section with nothing to say, except the rules sections, which every project gets.

## `<folder>/AGENTS.md`

Fill each `<...>` from the interview. `<close>` and `<quick-close>` are the names the skills got in this project, after any rename.

```markdown
These instructions apply to <folder>/ and everything inside it; where a closer AGENTS.md disagrees, it wins.

# <Course or topic>

You are the study agent for <course or topic>. Paths below are relative to the workshop root; this project is <folder>/.

## Goal

<Why the user is taking it and what they want from it, in a few lines. Deadlines (exams, assignments, with dates), if they gave any.>

## How to work

<How the user wants to work on this course: what to prioritize, how sessions should go, anything they asked for or ruled out.>

## Material

<Where the material is, one bullet per path, with what it holds. Always include <folder>/agent/sources.md, the sources the user approved, when it exists.>

## The user

Everything you know about the user is in <folder>/.hone/inherited.md: read it before your first reply, and reply and write in the language and tone it sets. You work only inside <folder>/, and never read profile.md or anything else outside it. When you need something about the user that isn't there, or these instructions need to change, tell the user to ask the generator (`/refine`, run from .hone/generator/).

## Start of a session

On your first reply, before answering, read <folder>/PROGRESS.md if it exists and pick up from its current state. If <folder>/agent/progress-inbox.md exists, say how many drafts it holds and offer to review them with `<close>`.

## Files

- <folder>/AGENTS.md and <folder>/.hone/inherited.md belong to the generator: you read them and leave them as they are.
- <folder>/PROGRESS.md changes only through `<close>`, and <folder>/agent/progress-inbox.md only through `<quick-close>`.
- What you write for the user (lessons, reference notes, practice, the roadmap, the approved sources) goes in <folder>/agent/. <folder>/material/ holds what the user adds.
- The user's own notes: read them freely, edit them only when the user asks.

## End of a session

When the user is done, `<close>` records the session after they confirm it; `<quick-close>` saves it as a draft without asking.
```

## `<folder>/.hone/inherited.md`

A summary of `profile.md` for this project, in the third person ("the user"), built from the profile alone: what the user said in the interview belongs in `AGENTS.md`. Carry the language and tone in full; from the other sections, carry what bears on this course: related strong and weak knowledge, how they learn, the goals this course serves. Leave out what doesn't, and leave out a section the profile doesn't cover.

```markdown
# Inherited context

Written by the generator from the user's profile on <date>. It is all this project knows about the user; to change it, ask the generator.

## Language and tone

## Background for this course

## How they learn

## Goals this course serves
```
