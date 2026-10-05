---
name: create
description: Creates a study project with its own agent, tailored to the user's profile. Use when the user wants a new project for a course or topic, or wants to turn an existing folder into one.
---

# Create

Interview the user about one course or topic, show them the plan for its project, and write the project once they approve it. The files to write are in `.hone/generator/templates/study-project.md`.

## Before the interview

Read `profile.md`. If it doesn't exist, write nothing: tell the user that `/create` tailors the project to their profile and that `/onboard` writes it.

## Interview

Ask a few questions per message, and skip what `profile.md` already answers: confirm it in a few words instead (if the profile lists the course, name it back rather than asking what it is). Cover:

1. **What it is.** The course or topic, and where it's taught if it's a course. Only study projects are supported for now: a course, a subject or a topic the user wants to learn, practical work included. If the project's goal is to build or deliver something rather than learn (an app, a repository, a job), say that only study projects are supported for now, and stop.
2. **Why.** What the user wants from it: pass it, a grade, something they'll use at work, curiosity.
3. **Material.** What they have: files already in a folder of the workshop, files they'll add, or nothing yet.
4. **Deadlines.** Exams, assignments or other dates, if any. Say it's optional; courses without dates are fine.
5. **How to work.** How they want to study it: what to prioritize, how sessions should go, anything they want or don't.
6. **Where.** A new folder (propose a short lowercase name in the profile's language, such as `calculo-1`, at the workshop root unless they name a parent folder) or the existing folder that holds their material.

The course is the one required answer; any other topic can be skipped, and its section of `AGENTS.md` is left out. Follow the thread: when an answer is vague or would change how the agent works (a deadline without a date, a preference with an exception), ask about it before moving on. The interview is done when every topic has been answered or skipped and one more question wouldn't change the project's `AGENTS.md`.

### Checking the folder

A folder is a project if it has an `AGENTS.md` or a `.hone/inherited.md`. Before the plan, check the chosen folder:

- If it is already a project, write nothing: `/refine` adjusts its agent.
- If any folder between it and the workshop root is a project, or any folder inside it is, write nothing: nested projects aren't supported yet. Offer another place.
- If it has a `CLAUDE.md`, tell the user that Claude Code would read it instead of the project's `AGENTS.md`, and that you won't touch it. Go on only once they've decided what to do with it.
- If it already exists, list what's in it (names, not contents) to tell where the material is. Every file in it stays where it is, unchanged.

## Sources

Only when the project has no material: offer to search the web for trustworthy sources, saying that it spends tokens. Search only if the user agrees; if they decline, go on without sources. If you can't search the web, say so and go on without sources.

If you can hand work to a sub-agent, run the search in one and keep its pages out of this conversation. Look for:

- university course pages and open courseware;
- textbooks by recognized authors, with free editions;
- official documentation;
- surveys and review articles.

Leave out SEO blogs, content farms and videos with no author or institution behind them. When two sources are equally good, prefer the one in the profile's language.

Show between 3 and 7, each with its title and link, its author or institution, what it covers, and why it's trustworthy. The user picks any number, or none. The chosen ones go into `<folder>/material/sources.md`, one bullet per source carrying those same four things, under a heading in the profile's language. Download nothing unless the user asks.

## Skills

Every project gets the library's `close` and `quick-close`. Offer every other skill in `library/` that fits a study project, each with its description, and add the ones the user picks. Check every name as the "Skill names" section of your instructions says. If the user asks to change a copy, change the copy; the library stays as it is.

## Plan

Show the plan in one message:

- The folder, saying whether it's new or existing, and every file and folder you'll create in it: `AGENTS.md`, `.hone/inherited.md`, `.claude/skills/` with the skills, `material/` for a new project, and `material/sources.md` if they picked sources.
- A summary of `AGENTS.md`: the goal, deadlines, how to work, and where the material is.
- A summary of `.hone/inherited.md`: what it carries from the profile.
- The skills, each under its final name.

This plan stands in for the full text that the "Writing" section of your instructions asks for; show the full text of any file the user asks to see. After each correction, show the plan again. Write only when the user approves the version shown.

## Writing

Write `<folder>/AGENTS.md` and `<folder>/.hone/inherited.md` from the template, copy each chosen skill's folder from `library/` into `<folder>/.claude/skills/` under its final name, create `<folder>/material/` for a new project, and write `<folder>/material/sources.md` if there are sources. Add nothing else: the project's agent and its skills create the rest of the project's files as they need them.

## After writing

Tell the user, briefly:

- To start, open a terminal in `<folder>/` and run Claude Code or OpenCode there. Claude Code first asks whether to trust the folder.
- Where to put material, if it still has none.
- That each session ends with `close` (records it after they confirm) or `quick-close` (saves a draft without asking), under their final names.
