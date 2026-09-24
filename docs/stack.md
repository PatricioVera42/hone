# Stack

- Monorepo with pnpm workspaces: `packages/app` (Electron + React), `packages/host` (files, terminals, search), `packages/protocol` (message types shared by both), and `library-default/` (skills copied into a new workshop).
- TypeScript in strict mode.
- Biome as linter and formatter.
- Vitest for unit and integration tests; a few Playwright end-to-end tests for critical flows.
- Editor: CodeMirror 6. Terminal: xterm + node-pty. Layout: dockview.
- CI on GitHub Actions with GitHub-hosted runners (free for public repos; Blacksmith requires a GitHub organization and isn't worth it yet). License: MIT.
- Unattended agent loops in the library use Sandcastle (Docker) rather than a hand-written script.
