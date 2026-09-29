# Hone

Hone is a desktop app for taking Markdown notes and working on projects, for study or code, alongside AI agents tailored to you. It looks and feels like Obsidian, with an integrated terminal where you run Claude Code or OpenCode.

## How it works

You open a workshop: a folder that holds your notes, your projects and a profile describing what you know and how you like to learn. From the workshop's generator you run `/create` and describe a new project, and the generator writes an agent for it (instructions and skills picked from your library) tailored to your profile. Inside the project, you work with that agent, and at the end of each session `/close` records what you learned and did, after you confirm it. The next session, or a different model, picks up from there. When your profile changes or an agent doesn't fit anymore, you ask the generator to refine it.

## Status

In design. The monorepo foundation exists: `pnpm dev` opens an empty window, and there are no features yet.

## Development

Requires Windows with WSL2, and Node 24 and pnpm 12 inside WSL. The repo lives in WSL; `pnpm dev` launches the Windows Electron binary on it. `pnpm install` compiles `node-pty` from source, which needs `build-essential` and `python3`.

```bash
pnpm install
pnpm dev
pnpm check
```

## End-to-end tests

`pnpm test:e2e` builds the app (`pnpm build`) and runs Playwright against it, driving the real Electron window instead of Vitest mocks. The main process launches the host itself, the way the built app does, so the tests need the same environment `pnpm dev` does.

Playwright needs a display. Locally in WSL, run it under `xvfb-run`:

```bash
xvfb-run pnpm test:e2e
```

In the Sandcastle container it's the same command, since the image already has `xvfb` (`.sandcastle/Dockerfile`). Electron's own sandbox can't start there (no `root`-owned SUID helper, and Docker blocks the user namespaces it would otherwise use), so the tests launch Electron with `--no-sandbox`; the app itself never turns its sandbox off (`hone/electron-security` guards against that).

## Agent loop

Tickets labeled `ready-for-agent` are implemented by Claude Code inside a Docker container, through [Sandcastle](https://github.com/mattpocock/sandcastle) ([workflow](docs/workflow.md)). The harness in `.sandcastle/main.ts` runs the agent on branch `agent/issue-<n>`, then runs `pnpm check` itself. Only if it passes does it push the branch and open a pull request.

Setup, once:

1. Install Docker in WSL.
2. Run `claude setup-token` and put the token in `.sandcastle/.env` as `CLAUDE_CODE_OAUTH_TOKEN` (see `.sandcastle/.env.example`).
3. Build the image with `pnpm sandcastle:image`, and again after changing `.sandcastle/Dockerfile`.

Then, for each ticket:

```bash
pnpm sandcastle <issue number>
```

The agent gets no GitHub credentials; the harness reads the issue and opens the pull request with your `gh` login. Your skills in `~/.agents/skills` are mounted read-only into the container.

## Docs

- [Glossary](CONTEXT.md)
- [Architecture decisions](docs/adr/)
- [Stack](docs/stack.md)
- [Roadmap](docs/roadmap.md)

## License

[MIT](LICENSE), except the bundled CaskaydiaCove Nerd Font, which is under the SIL Open Font License 1.1 ([its license](packages/app/src/renderer/fonts/caskaydia-cove/LICENSE)).
