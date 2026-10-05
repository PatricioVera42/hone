# Roadmap

## Spike (throwaway, before v1)

1. An Electron window on Windows opens a `node-pty` terminal in a host inside WSL, over WebSocket. Done: works, about 2 ms per keystroke ([research](../research/spike-01-window-host-terminal.md)).
2. Which skills and `AGENTS.md` files Claude Code and OpenCode load in nested projects, with and without git, and what happens when two skills share a name. Done: skills stop at the git root in both tools; ancestors' `AGENTS.md` load (Claude Code even across git); same-name skills are unreliable in OpenCode ([research](../research/spike-02-agent-context-loading.md)). Decisions: the generator lives in `.hone/generator/` (ADR 0010), project instructions are written to be read stacked (ADR 0011), no two visible skills share a name (ADR 0012).
3. pnpm + Electron + `node-pty` package cleanly; choose the build tool (electron-vite or Electron Forge). Done: plain Vite and our own dev launcher (ADR 0009).
4. The host notices files written by an agent inside WSL fast enough for the editor to show them immediately. Done: yes, within milliseconds; chokidar with ignores ([research](../research/spike-04-file-watching.md)).

Findings go to `research/`; anything that changes a decision becomes an ADR.

## Next

1. Monorepo foundation, by hand in an interactive session, not through Sandcastle: `packages/app`, `packages/host` and `packages/protocol`, TypeScript strict, Oxlint, Oxfmt, Knip, Vitest, `pnpm check`, lefthook and `CODING_STANDARDS.md`, following [research/typescript-standards.md](../research/typescript-standards.md) and [research/git-hooks-and-ci.md](../research/git-hooks-and-ci.md). It comes first because Sandcastle's gate runs `pnpm check`. No planning skills needed: the decisions are in ADRs 0008 and 0009 and the drafts in those research files. Done: `pnpm dev` opens an empty window and starts the host; `pnpm check` runs in about 3 s.
2. Plan stage 1 with `grilling`, `to-spec` and `to-tickets`, then `triage` the issues. Done: spec #1, tickets #2 to #12, all `ready-for-agent`.
3. The steps in "Before the first agent loop", then the first loop on a small ticket. The loop starts with #2. Done: stage 1 was implemented through the loop.
4. Plan stage 2 with `grilling` and `domain-modeling`. Done on 2026-10-02: stage 2 is split into 2a and 2b (below), spec #87, and its prompts are written by hand instead of through Sandcastle ([workflow.md](workflow.md#agent-prompts)).

## Before the first agent loop

The repo goes public when the first Sandcastle loop runs, since that's when implementation starts (see [workflow.md](workflow.md)). On the same day:

1. Make `PatricioVera42/hone` public. On GitHub Free, rulesets and unlimited Actions minutes need a public repo.
2. Add the CI workflow that runs `pnpm check` ([research/git-hooks-and-ci.md](../research/git-hooks-and-ci.md)).
3. Turn on a ruleset on `main`: pull request required, the `check` job required, the maintainer in the bypass list for docs.
4. Install CodeRabbit on the repo, with a short `.coderabbit.yaml`.
5. Set up the issue tracker and triage labels for `to-spec`, `to-tickets` and `triage`, and configure Sandcastle.

Done on 2026-09-26 (#13): the repo is public, CI runs `pnpm check`, the ruleset protects `main`, and `pnpm sandcastle <issue>` runs the loop (see the README). A throwaway issue went through the whole loop to a green pull request, and a failing `pnpm check` pushes nothing.

## v1

A note-taking app with an integrated terminal and the agent workflow (generator, profile, projects, progress), for studying.

- Markdown: live preview, wikilinks with autocomplete, backlinks, full-text search, quick switcher, images and attachments. LaTeX if it's cheap.
- Code editor: syntax highlighting, tabs and find/replace (CodeMirror 6).
- Library skill updates: each copy records which library version it came from, and the generator offers to update it when refining the project.
- Built in stages, each one usable on its own:
  1. Skeleton: open a workshop, file tree, Markdown and code editor, terminal, dockview layout. Done on 2026-10-02 (spec #1).
     Set up shadcn/ui with `@shadcn/lint` and install shadcn's agent skill (`pnpm dlx skills add shadcn/ui`) when `packages/app` is created (ADR 0008).
     A Playwright test that opens the app and checks that the renderer has no `process` or `require` and that the page has a Content Security Policy. It backs up the `hone/electron-security` lint rule, which only catches literal values (`sandbox: false`, not `sandbox: isDev`).
  2. Agents: plain text, written and tested by hand in parallel with the other stages ([workflow.md](workflow.md#agent-prompts)). In two parts:
     - 2a. The basic loop for one study project, without nesting: `/onboard`, `/create`, `/refine`, and in `library-default/` the skills `study`, `close` and `quick-close`. Only study projects.
        - `study` is adapted from Matt Pocock's `teach` (MIT). It keeps how `teach` teaches (the zone of proximal development, retrieval practice) but writes lessons and references as Markdown notes, builds quizzes and visuals as HTML files it opens in the browser, and leaves the record of what was learned to `PROGRESS.md` through `/close`. It looks for answers in the project's material first. If nothing is there, it asks the user instead of searching the web, and searches only with the user's consent. It never answers from the model's memory.
        - When a new project has no material, `/create` offers to search the web for trustworthy sources, and the ones the user picks become material.
        - `/refine` works on one project or on the profile. After a profile change it offers to refresh every project's inherited context, a one-level cascade.
     - 2b. `/cascade` and nested projects, importing a global skill into the library, and two more items for `library-default/`:
        - A `find-in-workshop` skill: it walks up to the workshop root (the folder with `.hone/generator/`) and searches by name and content from there, skipping `node_modules`, `.git` and `.hone`. With several matches it asks which one; with none it says so and asks, never guessing the content. Every generated `AGENTS.md` carries a line telling the agent to use it when it can't find a file or folder the user mentions. Both tools ask before reading outside the folder they started in (Claude Code in its manual mode), and ADR 0002 gives project agents no permission settings, so 2b has to decide how this skill gets that access.
        - A PDF script plus the skill that invokes it, run by the user. `name.pdf` becomes `name.md` next to it, with page markers. Pages with little text or with drawings are exported whole as `name.assets/pNN.png` and embedded with `![[name.assets/pNN.png]]`. The user can replace an image with a tighter crop. The agent reads the Markdown and opens an image or a PDF page only when it needs it.
  3. Projects in the app: icon and type in the tree, "open session" button, progress summary, `hone .` with focus.
  4. Note-taking features (list above).
  5. Distribution: automatic host install in WSL.
- Installed from source (`pnpm dev`).
- Targets Windows + WSL first. The app copies the host into WSL and runs it with the Node already installed there (Node 20+ required).

## Later

- The app converts a PDF automatically when one is added to a project.
- Unsigned Windows installer on GitHub Releases, with a basic landing page.
- Graph view, then Mermaid diagrams.
- Themes: a section in the app settings to pick one of 7 or 8 built-in themes or a custom one, with instructions for writing your own. Each theme is a CSS file that sets shadcn's variables, which color the whole app (ADR 0008). The editor's look (syntax colors, note width, active line) can be set separately for notes and code. Stage 1 ships dark only. The first two built-in themes are Tokyo Night, which becomes Hone's dark theme (#81), and Catppuccin Mocha, picked after comparing palettes on a prototype.
- Optional manual save (Ctrl+S) instead of autosave.
- Tell notes apart visually from agent files (`AGENTS.md`, `PROGRESS.md`, skills) in the tree.
- Code editing close to VS Code: LSP (autocomplete, errors, go to definition), debugger and visual git.
- The app notices when a library skill changed and shows the diff in every project that copied it.
- The app notices when a subproject gets its own `.git` and warns that it lost the skills it inherited (ADR 0012).
- A `.hone/workshop.json` for workshop settings, when there are any (ADR 0010).
- Test and support Linux, macOS and Windows without WSL.
- Full OpenCode support (see ADR 0002).
- Ship the host with its own Node, so WSL doesn't need Node installed.
- Terminals that survive closing the window (the host keeps running).
- Optional git versioning of the workshop, ignoring projects that have their own `.git`.

## How it's built

See [workflow.md](workflow.md): planning with `grilling`, `to-spec` and `to-tickets`; `triage` by hand; one to three Sandcastle loops, one branch and pull request per ticket; `pnpm check`, CI and CodeRabbit as the gates; `qa-checklist` and a human merge.
