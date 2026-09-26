# No two skills visible from a project share a name

When two visible skills share a name, Claude Code picks the closest one, but OpenCode's choice varies between runs, even between a project skill and a user-level one. So the generator never leaves two skills with the same name visible from a project. Before copying a library skill into a project, it checks every name visible from there: skills in ancestor folders up to the git root, and the user's global skills in `~/.claude/skills` and `~/.agents/skills`. If an ancestor without git already has the same library skill, unchanged, the project inherits it instead of getting a copy. For now "unchanged" means its files are identical to the library's; once each copy records its origin and version (roadmap v1), that record decides. If the skill was customized, or its name matches a global skill, the generator asks the user for a new name and updates the skill's `name` field. The generator also lists the names of the global skills, and, if the user asks, imports one into the library under a new name, so the library never collides with them. It never writes outside the workshop.

## Consequences

- This relaxes ADR 0005 in one case: a subproject without git may rely on an ancestor's skill, since both tools do load skills from ancestors below the git root.
- An inherited skill is lost if the subproject later gets its own `.git`, or if the ancestor customizes or removes it. The generator checks the affected subtree again on every `/refine` and `/cascade`, and copies or renames what's needed.
- Projects can't override a library or global skill by giving their own skill the same name. Behavior changes go through a different name or through the prompt, as the workflow already does for Sandcastle's `implement`.

Research: [research/spike-02-agent-context-loading.md](../../research/spike-02-agent-context-loading.md).
