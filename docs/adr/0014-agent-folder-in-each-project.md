# What a project's agent writes for the user goes in `agent/`

A project's root shows what belongs to the user. Everything the project's agent writes for the user to read goes in one `agent/` folder: lessons, reference notes, practice, `ROADMAP.md`, `progress-inbox.md` and the approved sources in `sources.md`, which used to sit inside `material/`. Only `AGENTS.md` and `PROGRESS.md` stay at the root next to `material/` and the user's notes. `AGENTS.md` stays because Claude Code and OpenCode only read it from the project's folder. `PROGRESS.md` stays because it's the first thing to read when opening a project. ADR 0006 already gives each file a single writer; this layout makes the agent's files visible as such.

## Considered options

- **A name in the user's language** (such as `agente/`). Rejected: library skills are shared copies, so each would have to find out what the folder is called in its project. Folder names stay in English, like `lessons/` and `material/` before.
- **A study-specific name** (such as `estudio/`). Rejected: stage 3 plans other project types, which will use the same folder.
- **Hiding the agent's files in `.hone/`**. Rejected: lessons, reference notes and practice are for the user to read and annotate.

## Consequences

- `ROADMAP.md` and `progress-inbox.md` move too, although they're project-level files: the root holds only the instructions, the progress and what the user brings.
