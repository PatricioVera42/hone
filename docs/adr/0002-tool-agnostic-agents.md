# Agents only use what Claude Code and OpenCode share

The instructions and skills Hone generates only use what both tools read the same way: `AGENTS.md` (never `CLAUDE.md`) and skills in the Agent Skills format under `.claude/skills/`. We don't use `@` imports or hooks, because each tool implements them differently: Claude Code declares hooks in `settings.json`, OpenCode as JavaScript plugins. Progress is therefore updated by skills the user runs and confirms, not by scripts. Claude Code is the primary tool, but Hone must not depend on it.

## Consequences

- If a folder contains a `CLAUDE.md`, Claude Code stops reading `AGENTS.md` files. Hone must never create a `CLAUDE.md`.
- Anything that needs to happen automatically on a session event is done by the Hone app itself (it owns the terminal), not by the tool's hooks.
- Permission settings are the one tool-specific file Hone writes, because they grant access and change no behavior. The generator's folder carries a `.claude/settings.json` (`permissions.additionalDirectories`) and an `opencode.json` (`external_directory`) granting the workshop root, since both tools ask before touching files outside the folder they started in and all the generator's work is there. Project agents get none: they work only inside their project.
