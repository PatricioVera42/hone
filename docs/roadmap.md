# Roadmap

## Spike (throwaway, before v1)

1. An Electron window on Windows opens a `node-pty` terminal in a host inside WSL, over WebSocket.
2. Which skills and `AGENTS.md` files Claude Code and OpenCode load in nested projects, with and without git, and what happens when two skills share a name.
3. pnpm + Electron + `node-pty` package cleanly; choose the build tool (electron-vite or Electron Forge).
4. The host notices files written by an agent inside WSL fast enough for the editor to show them immediately.

Findings go to `research/`; anything that changes a decision becomes an ADR.

## v1

An Obsidian-like app with an integrated terminal and the agent workflow (generator, profile, projects, progress), for studying.

- Markdown: live preview, wikilinks with autocomplete, backlinks, full-text search, quick switcher, images and attachments. LaTeX if it's cheap.
- Code editor: syntax highlighting, tabs and find/replace (CodeMirror 6).
- Library skill updates: each copy records which library version it came from, and the generator offers to update it when refining the project.
- Built in stages, each one usable on its own:
  1. Skeleton: open a workshop, file tree, Markdown and code editor, terminal, dockview layout.
     Set up shadcn/ui with `@shadcn/lint` and install shadcn's agent skill (`pnpm dlx skills add shadcn/ui`) when `packages/app` is created (ADR 0008).
  2. Agents: `/onboard`, `/create`, `/refine`, `/cascade`, `/close`, `/quick-close` and `library-default/`. Plain text, so written and tested with Claude Code in parallel with stage 1.
  3. Projects in the app: icon and type in the tree, "open session" button, progress summary, `hone .` with focus.
  4. Obsidian features (list above).
  5. Distribution: automatic host install in WSL.
- Installed from source (`pnpm dev`).
- Targets Windows + WSL first. The app copies the host into WSL and runs it with the Node already installed there (Node 20+ required).

## Later

- Unsigned Windows installer on GitHub Releases, with a basic landing page.
- Graph view, then Mermaid diagrams.
- Code editing close to VS Code: LSP (autocomplete, errors, go to definition), debugger and visual git.
- The app notices when a library skill changed and shows the diff in every project that copied it.
- Test and support Linux, macOS and Windows without WSL.
- Full OpenCode support (see ADR 0002).
- Ship the host with its own Node, so WSL doesn't need Node installed.
- Terminals that survive closing the window (the host keeps running).
- Optional git versioning of the workshop, ignoring projects that have their own `.git`.

## How it's built

See [workflow.md](workflow.md): planning with `grilling`, `to-spec` and `to-tickets`; `triage` by hand; one to three Sandcastle loops, one branch and pull request per ticket; `pnpm check`, CI and CodeRabbit as the gates; `qa-checklist` and a human merge.
