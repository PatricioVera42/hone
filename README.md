# Hone

Hone is a note-taking desktop app for Markdown notes and projects, for study or code, with an integrated terminal where you work alongside AI agents tailored to you, in Claude Code or OpenCode.

> [!WARNING]
> Hone is in early development. There are no releases yet: you build it from source, and it only runs on Windows with WSL2 for now. Expect bugs and breaking changes.

## How it works

You open a workshop: a folder that holds your notes, your projects and a profile describing what you know and how you like to learn. From the workshop's generator you run `/create` and describe a new project, and the generator writes an agent for it (instructions and skills picked from your library) tailored to your profile. Inside the project, you work with that agent, and at the end of each session `/close` records what you learned and did, after you confirm it. The next session, or a different model, picks up from there. When your profile changes or an agent doesn't fit anymore, you ask the generator to refine it.

Your notes are plain Markdown files in your workshop, so they stay readable in any other editor.

## Status

Hone is built in stages, each one usable on its own ([roadmap](docs/roadmap.md)).

**Stage 1, the skeleton, is done.** You create or open a workshop, browse it in a file tree, and create, rename and delete notes, files and folders. Notes and code open in editor tabs with autosave, and shells run in terminal panels next to them. When an agent in a terminal writes a file, the tree and any open editor show the change right away. Editors and terminals live in a layout you can rearrange, and it comes back on the next launch.

**Stage 2, the agents, is in progress** ([spec](https://github.com/PatricioVera42/hone/issues/87)). A new workshop already comes with the generator and `/onboard`, which interviews you and writes your profile. Next are `/create`, the `study` skill, `/close` and `/refine`: the basic loop for one study project.

## Getting started

Requires Windows with WSL2, and Node 24 and pnpm 12 inside WSL. The repo lives in WSL; `pnpm dev` launches the Windows Electron binary on it. `pnpm install` compiles `node-pty` from source, which needs `build-essential` and `python3`.

```bash
git clone https://github.com/PatricioVera42/hone.git
cd hone
pnpm install
pnpm dev
```

Create a workshop from the welcome screen, open a terminal in its `.hone/generator/` folder, start Claude Code or OpenCode there and run `/onboard`.

## Development

`pnpm check` runs typecheck, format check, lint, Knip and the tests, and must pass before every commit. Code follows [CODING_STANDARDS.md](CODING_STANDARDS.md).

### End-to-end tests

`pnpm test:e2e` builds the app (`pnpm build`) and runs Playwright against it, driving the real Electron window instead of Vitest mocks. The main process launches the host itself, the way the built app does, so the tests need the same environment `pnpm dev` does.

Playwright needs a display. Locally in WSL, run it under `xvfb-run`:

```bash
xvfb-run pnpm test:e2e
```

In the Sandcastle container it's the same command, since the image already has `xvfb` (`.sandcastle/Dockerfile`). Electron's own sandbox can't start there (no `root`-owned SUID helper, and Docker blocks the user namespaces it would otherwise use), so the tests launch Electron with `--no-sandbox`; the app itself never turns its sandbox off (`hone/electron-security` guards against that).

### Agent loop

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

- [Glossary](GLOSSARY.md)
- [Architecture decisions](docs/adr/)
- [Stack](docs/stack.md)
- [Roadmap](docs/roadmap.md)
- [Workflow](docs/workflow.md)

## License

[MIT](LICENSE), except the bundled CaskaydiaCove Nerd Font, which is under the SIL Open Font License 1.1 ([its license](packages/app/src/renderer/fonts/caskaydia-cove/LICENSE)). The `study` skill in `library-default/study/` is adapted from Matt Pocock's [`teach`](https://github.com/mattpocock/skills) skill, also MIT, and carries its notice ([its license](library-default/study/LICENSE)).
