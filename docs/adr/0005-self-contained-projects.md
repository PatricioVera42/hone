# Projects are self-contained

Everything a project's agent needs lives inside the project: a summary of the profile, a summary of the parent project when nested, and its own copies of skills from the library. We rejected relying on agent tools reading instruction files and skills from parent folders, because that lookup stops at the git repository root (always in OpenCode, for skills in Claude Code), so a code project with its own `.git` inside a course project would silently lose its context.

## Consequences

- Copies go stale. Changes to the profile, a parent project or a library skill must be pushed down explicitly by the generator (or a parent project's agent); nothing updates on its own.
- Folders can be nested freely for organization without any agent depending on what is above it.
