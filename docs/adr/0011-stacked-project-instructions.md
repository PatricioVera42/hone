# Project instructions are written to be read stacked

A subproject's agent also receives its parent's `AGENTS.md`: always in folders without git, and in Claude Code even when the subproject has its own `.git`. We accept this instead of working around it. Every `AGENTS.md` the generator writes opens with a line naming the folder it applies to and saying that a closer `AGENTS.md` wins where they disagree, and every path in it is relative to the workshop root (`calculo-1/material/`, not `material/`). A test with contradicting parent and child instructions showed the closest file winning in 12 of 12 runs across both tools, even without the scope line. We keep the line anyway, because non-contradicting parent instructions still reach the child, and the line and the full paths keep them from being misread as the child's own. We rejected making each `AGENTS.md` only point to another file, since the child would inherit the parent's pointer too, and forbidding nested projects without git, since projects can be nested freely.

## Consequences

- A subproject's agent sees its parent's full instructions, not just the summary in `.hone/inherited.md` (ADR 0006). The summary is still needed for OpenCode in a subproject with its own `.git`, where the parent's `AGENTS.md` doesn't load.
- A parent's instructions should hold nothing that would be wrong for its subprojects to read.

Research: [research/spike-02-agent-context-loading.md](../../research/spike-02-agent-context-loading.md).
