# Agents only use what Claude Code and OpenCode share

The instructions and skills Hone generates only use what both tools read the same way: `AGENTS.md` (never `CLAUDE.md`) and skills in the Agent Skills format under `.claude/skills/`. We don't use `@` imports or hooks, because each tool implements them differently: Claude Code declares hooks in `settings.json`, OpenCode as JavaScript plugins. Progress is therefore updated by skills the user runs and confirms, not by scripts. Claude Code is the primary tool, but Hone must not depend on it.

## Consequences

- If a folder contains a `CLAUDE.md`, Claude Code stops reading `AGENTS.md` files. Hone must never create a `CLAUDE.md`.
- Anything that needs to happen automatically on a session event is done by the Hone app itself (it owns the terminal), not by the tool's hooks.
