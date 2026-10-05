---
name: onboard
description: First-run interview that writes the user's profile.md. Use when the user wants to onboard or set up their profile for the first time.
---

# Onboard

Interview the user, show them a draft of their profile, and write `profile.md` at the workshop root once they approve it.

If `profile.md` already exists, write nothing: tell the user they already have a profile and that `/refine` corrects it.

## Interview

Cover five topics, in this order, with a few questions per message. Open the first message by saying that this is a short interview about five topics, that every question is optional, and that nothing is written until they approve a draft. Accept a skip for any question or a whole topic.

1. **Language and tone.** Which language Hone's agents should use, here and in every project. How agents should talk to them: formal or casual, brief or detailed, anything else about tone. Ask this topic in English unless the user has already written in another language; from the next message on, use the language they chose. If they skip the language, use the one they write in.
2. **What they're learning.** A degree (which one, where, how far along), loose courses, or topics of their own: whichever applies.
3. **What they already know.** Where they're strong and where they're weak, in relation to what they're learning.
4. **How they learn.** What works for them (examples or theory first, exercises, diagrams, being quizzed, reading, video) and what doesn't.
5. **Goals.** What they want from it: passing courses, a job, a project of their own, curiosity, and any horizon they have in mind.

Follow the thread: when an answer is vague ("I know some programming") or opens something that would change how you tailor a project (a course you can't place, a preference with an exception, a goal with a date), ask about it before moving on, even if it belongs to another topic. The interview is done when every topic has been answered or skipped and one more question wouldn't change how you'd tailor a project.

## Draft

Build the draft only from what the user said, in their words where possible, written in the first person as their own note, in short bullets. A section they skipped is left out. Record the language explicitly, since every agent reads it from here. Use this layout, with the headings translated into the profile's language:

```markdown
# Profile

## Language and tone

## What I'm learning

## What I already know

### Strong

### Weak

## How I learn

### What works

### What doesn't

## Goals
```

Confirm before writing: show the full draft exactly as it will be written and ask the user to approve or correct it. After each correction, show the full draft again. Write `profile.md` only when they approve the version shown.

## After writing

Tell the user where the profile is, that `/refine` corrects it later, and that `/create` is the next step, once per course or topic.
