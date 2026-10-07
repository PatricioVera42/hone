---
name: refine
description: Adjusts what no longer fits the user, one target at a time: a project's agent, the profile, or a skill in the library or in a project. Use when the user wants to change a project's instructions, skills or inherited context, correct their profile, or change a skill.
---

# Refine

Change one target so it fits the user again: propose the change, show it, and write it once the user approves, as the "Writing" section of your instructions says. Show changes to an existing file as each changed section, before and after.

## The target

Find the target in what the user asked:

- **A project**: its `AGENTS.md`, its skills and its `.hone/inherited.md`.
- **A skill copy in a project**: one skill in `<folder>/.claude/skills/`.
- **The profile**: `profile.md`.
- **A library skill**: one skill in `library/`.

If it's unclear, list the workshop's projects (by folder), the profile and the library's skills, and ask which one. A wish about how the user learns or what they know belongs in the profile, even when it comes up about one project: propose changing the profile, and then refreshing the projects.

If what they want would change several targets, such as a skill copy and the project's `AGENTS.md` that describes how to work, propose them together and write them on one approval.

## A project

Read `<folder>/AGENTS.md`, `<folder>/.hone/inherited.md`, the skills in `<folder>/.claude/skills/`, and `<folder>/PROGRESS.md` if it exists. List the project's files (names, not contents) to see where its material is now. If the user didn't say what doesn't fit, ask, a few questions at a time, until one more question wouldn't change the project. Then build the proposal from `.hone/generator/templates/study-project.md`:

1. **`AGENTS.md`.** Rebuild it from the template with what the current one says plus what the user asked to change, so the rules sections follow the current template. A section the user didn't touch keeps its content. Update "Material" if files were added or moved.
2. **Skills.** Offer every skill in `library/` the project lacks that fits it, each with its description, and offer to remove any the project has except `close` and `quick-close`, which every project keeps. Check every added name as the "Skill names" section of your instructions says. A copy the project already has stays as it is.
3. **`.hone/inherited.md`.** Regenerate it from the current `profile.md`, always, with today's date (run `date` if you don't have it). If the current one says something the profile doesn't, it disappears in the new one: name each such line and offer to add it to the profile instead, through "The profile" below.

Show the three parts in one message, each as its changes, or "no changes". After each correction, show the proposal again. Once approved, write the files, copy each added skill's folder from `library/` under its final name, and delete each removed skill's folder.

## A skill copy in a project

The user wants one project's skill to work differently, for example a `study` that skips lessons and only answers questions and makes exercises. Edit only the copy in `<folder>/.claude/skills/<name>/`; the library and other projects keep theirs. The skill keeps its name.

Keep the copy coherent: before proposing, search all its files for the words that name what changed (for skipping lessons, "lesson") and account for every match, its `description` included. Leave the rest of it as it is. If the project's `AGENTS.md` describes how to work in a way the change contradicts, propose fixing it too.

## The profile

Read `profile.md`. Ask what to change if the user didn't say, then propose the edit: in the first person, in the user's words where possible, keeping the profile's layout. A new section goes where the layout in `.hone/generator/.claude/skills/onboard/SKILL.md` places it.

### Refreshing the projects

After writing the profile, offer to regenerate the `.hone/inherited.md` of every project in the workshop. If the user agrees, regenerate each from the new profile as "A project" says, and show, per project, its changes or "no changes", including the lines that would disappear. Write the ones the user approves. This refreshes only `.hone/inherited.md`; projects' `AGENTS.md` and skills stay as they are.

## A library skill

Read the skill's folder in `library/`, ask what to change if the user didn't say, and propose the edit to its files. After writing, tell the user which projects have a copy of the skill (by folder) and that those copies stay as they are; a project gets the change only when its copy is changed through "A skill copy in a project".

## After writing

Tell the user briefly what changed, by file. If a project's agent is running, the change applies from its next session.
