# The generator lives in `.hone/generator/`, outside every project's ancestry

The generator has its own folder, `.hone/generator/` at the workshop root, with its own `AGENTS.md` and skills. The user runs `/create`, `/refine` and the other generator commands there, from the app or from a plain terminal. The workshop root has no `AGENTS.md`. We rejected putting the generator's instructions in the workshop's root `AGENTS.md`, because Claude Code and OpenCode load every ancestor's `AGENTS.md` in folders without git (Claude Code even across git), so every project agent would also receive "you create projects and refine agents". A visible `generator/` folder would work the same way, but the generator is an internal piece of Hone rather than something the user is expected to edit. Being open source, it stays readable and editable for anyone who looks.

## Consequences

- Whatever every project agent should know, such as the profile summary, reaches it through `.hone/inherited.md` and the cascade (ADR 0005), never through an `AGENTS.md` at the workshop root.
- Hone recognizes the workshop root by walking up until it finds `.hone/generator/`. A plain `.hone/` isn't enough, because every project has one. A `.hone/workshop.json` can be added when the workshop needs its own settings.
- The generator only reads inside the workshop, with two exceptions: it lists the names of the user's global skills (ADR 0012), and when a new project has no material it can search the web for trustworthy sources, which the user picks from.

Research: [research/spike-02-agent-context-loading.md](../../research/spike-02-agent-context-loading.md).
