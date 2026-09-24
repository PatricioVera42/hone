# Each project file has a single writer

Several agents touch a project (the generator, the parent project's agent, the project's own agent), so each file has exactly one writer to keep them from overwriting each other:

| File | Written by |
|---|---|
| `AGENTS.md` | The generator only (on create and `/refine`) |
| `PROGRESS.md` | The project's agent, after the user confirms (`/close`) |
| `progress-inbox.md` | The project's agent (`/quick-close`) |
| `.hone/inherited.md` | The generator or the parent project (cascade) |
| `.claude/skills/`, `scripts/` | Copied by the generator from the library; the user may edit them |

Consequently, a project's agent that wants to change its own instructions must ask the user to go through the generator.
