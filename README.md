# Hone

Hone is a desktop app for taking Markdown notes and working on projects, for study or code, alongside AI agents tailored to you. It looks and feels like Obsidian, with an integrated terminal where you run Claude Code or OpenCode.

## How it works

You open a workshop: a folder that holds your notes, your projects and a profile describing what you know and how you like to learn. From the workshop's generator you run `/create` and describe a new project, and the generator writes an agent for it (instructions and skills picked from your library) tailored to your profile. Inside the project, you work with that agent, and at the end of each session `/close` records what you learned and did, after you confirm it. The next session, or a different model, picks up from there. When your profile changes or an agent doesn't fit anymore, you ask the generator to refine it.

## Status

In design. The monorepo foundation exists: `pnpm dev` opens an empty window, and there are no features yet.

## Development

Requires Windows with WSL2, and Node 24 and pnpm 12 inside WSL. The repo lives in WSL; `pnpm dev` launches the Windows Electron binary on it.

```bash
pnpm install
pnpm dev
pnpm check
```

## Docs

- [Glossary](CONTEXT.md)
- [Architecture decisions](docs/adr/)
- [Stack](docs/stack.md)
- [Roadmap](docs/roadmap.md)

## License

[MIT](LICENSE)
