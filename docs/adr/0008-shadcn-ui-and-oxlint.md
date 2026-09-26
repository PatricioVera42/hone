# UI with shadcn/ui, lint and format with Oxlint and Oxfmt

The interface is built with shadcn/ui on Base UI primitives, in its compact Mira style, with Tailwind v4. The code is linted with Oxlint in type-aware mode and formatted with Oxfmt, replacing Biome. The two choices are made together because they depend on each other.

shadcn/ui copies each component's source into the repo, so Hone owns the code and can adapt it to a dense, Obsidian-like desktop UI. Its CSS variables can also theme dockview, CodeMirror and xterm, so the whole app shares one theme, and a user theme later is a CSS file that overrides those variables. Most of the code is written by agents. `@shadcn/lint` keeps them on the design system: it fails on ad-hoc colors, unknown classes or restyled components, and its errors say what to use instead. It runs only on ESLint or Oxlint.

Oxlint's type-aware mode runs on TypeScript 7 and covers almost all of typescript-eslint's type-aware rules. That includes floating promises and implicit `any`, which Biome only covers partly, with experimental rules, and which typescript-eslint can't check on TypeScript 7. Custom rules are written in TypeScript with tests. We accept tools that are newer than Biome: Oxlint's type-aware mode and its JS plugins are still maturing, and Oxfmt is younger than Biome's formatter. Whether to adopt Vite+, which bundles Oxlint, Oxfmt, Vite and Vitest in one CLI, is decided in the spike together with the Electron build tool.

## Consequences

- A file tree has to be built: shadcn/ui has no tree component.
- shadcn's Vite setup uses `baseUrl`, which TypeScript 7 rejects, so path aliases use `paths` alone.
- Upstream component updates are pulled by re-running the CLI and reviewing the diff, not by bumping a dependency.

Research: [research/shadcn-ui.md](../../research/shadcn-ui.md), [research/typescript-standards.md](../../research/typescript-standards.md), [research/t3code-tooling.md](../../research/t3code-tooling.md).
