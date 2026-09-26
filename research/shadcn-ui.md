# shadcn/ui for Hone's UI

Should Hone build its interface with [shadcn/ui](https://github.com/shadcn-ui/ui), and how? Sources are primary (ui.shadcn.com, the shadcn-ui GitHub org, dockview docs, npm registry), checked on 2026-09-26. [t3code-tooling.md](t3code-tooling.md) shows how T3 Code, a similar Electron app, uses it.

## Summary

- **Recommendation: yes.** Use shadcn/ui with Base UI primitives, the compact **Mira** style and Tailwind v4, inside `packages/app` (no separate `packages/ui` package yet).
- **Covered by shadcn:** the command palette and quick switcher (Command), context menus, menubar, dialogs, tabs, tooltips, toasts, sidebar, `Kbd`, scroll areas.
- **Not covered:** the file tree (no tree component exists), the dockable layout (dockview), the editor (CodeMirror) and the terminal (xterm). Those three get themed from the same CSS variables.
- **Enforcement:** `@shadcn/lint` makes agents use the components and theme tokens instead of ad-hoc styles. It runs on ESLint or Oxlint, **not Biome**, which is one more argument for switching to Oxlint (see [t3code-tooling.md](t3code-tooling.md)).
- **One known conflict:** the official Vite setup uses `baseUrl`, which TypeScript 7 turned into an error ([typescript-standards.md](typescript-standards.md), section 1). Use `paths` without `baseUrl`.

## 1. What it is

"This is not a component library. It is how you build your component library." A CLI copies each component's source into the repo, so the code is yours to change ([docs](https://ui.shadcn.com/docs)). Versions: `shadcn` CLI 4.21.0, `tailwindcss` 4.3.3, `@base-ui/react` 1.8.0, `radix-ui` 1.6.7 (`npm view`, 2026-09-26). The repository is MIT.

**Primitives.** The primitives are the unstyled, accessible components underneath: focus, keyboard handling, ARIA. Since July 2026, "Base UI is the default component library in shadcn/ui". The reasons given are stability ("Base UI is at 1.6.0 with 6M+ weekly downloads"), active development, and that "every new project we've started runs on Base UI". Radix "is not being deprecated", and `shadcn init -b radix` still selects it ([changelog, July 2026](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default)). Every component and block exists for both ([changelog, February 2026](https://ui.shadcn.com/docs/changelog/2026-02-blocks)). React Aria was added as a third option in July 2026 (same changelog index). T3 Code uses Base UI (`"style": "base-mira"` in its [components.json](https://github.com/pingdotgg/t3code/blob/main/apps/web/components.json)).

Recommendation: Base UI. It is the default, what shadcn itself uses for new projects, and what T3 Code runs in production.

**Styles.** shadcn/create offers eight visual styles. "Mira is a compact style made for dense interfaces", and Rhea is "a more compact Luma" ([shadcn/create changelog](https://ui.shadcn.com/docs/changelog/2025-12-shadcn-create); [Rhea](https://ui.shadcn.com/docs/changelog/2026-05-rhea)). An Obsidian-like desktop app needs density, so Mira is the natural start, as in T3 Code.

## 2. Setup in Hone

Vite setup: `pnpm dlx shadcn@latest init -t vite`, then `tailwindcss` and `@tailwindcss/vite`, then `@import "tailwindcss";` in the CSS entry. It adds an `@/*` path alias in tsconfig and Vite ([Vite installation](https://ui.shadcn.com/docs/installation/vite)). **Conflict:** the docs set `"baseUrl": "."` next to `paths`. TypeScript 7 makes `baseUrl` a hard error, so write `paths` with a relative target (`"@/*": ["./src/*"]`) and no `baseUrl` (assumption: `paths` without `baseUrl` works in TS 7 as it has since 4.1; confirm on first setup).

Monorepo: `init --monorepo` creates `packages/ui` for shared components, imported as `@workspace/ui/components/button`, and each workspace keeps its own `components.json` ([Monorepo](https://ui.shadcn.com/docs/monorepo)). Hone has only one package with UI (`packages/app`, the renderer), so under YAGNI the components live in `packages/app/src/renderer/components/ui`. Move them to `packages/ui` only if a second UI consumer appears.

Electron gotchas:
- **No network at runtime.** Tailwind v4 compiles at build time, and fonts must be bundled, not loaded from Google Fonts.
- **CSP.** Base UI positions popups with inline styles set from JavaScript. React sets them through the DOM, which a `style-src` without `'unsafe-inline'` doesn't block (assumption, based on how CSP treats DOM style changes versus `style` attributes in markup; verify with the Playwright CSP test from `typescript-standards.md` section 8).
- **The renderer is not a web page to other tools.** The shadcn CLI only needs to find `components.json` and the CSS file. The `-t vite` template should work inside electron-vite's renderer folder (assumption; confirm in the spike when choosing the build tool).

## 3. Mapping Hone's UI to components

The component index ([Components](https://ui.shadcn.com/docs/components)) lists:

| Hone need | shadcn component | Note |
|---|---|---|
| Quick switcher, command palette | Command | Built on cmdk (1.1.1) in the Radix version (assumption for the Base UI version; T3 Code ships its own `command.tsx`). |
| Right-click menus in tree and tabs | Context Menu | |
| App menu | Menubar | Or Electron's native menu; decide when designing. |
| Settings, confirmations | Dialog, form inputs, Switch, Select | |
| Notifications | Toast | |
| Shortcuts shown in menus | Kbd | |
| Side panel | Sidebar | Container only; the tree inside must be built. |
| File tree | none | No tree component exists. Build one on Collapsible plus keyboard handling, or use a headless tree library. This is the largest piece to build. |
| Panels, tabs, splits, drag to dock | Resizable exists, but dockview does this | Keep dockview (already in the stack). Resizable doesn't support docking. |
| Editor, terminal | none | CodeMirror 6 and xterm. |

## 4. One theme for everything

shadcn themes with CSS variables in OKLCH: `background`/`foreground`, `primary`, `muted`, `accent`, `destructive`, `border`, `ring`, `sidebar-*`, `chart-*` and `radius`. Dark mode redefines the same variables under `.dark`, and Tailwind v4's `@theme inline` maps them to utilities such as `bg-primary` ([Theming](https://ui.shadcn.com/docs/theming)).

The other three pieces can read the same variables:

- **dockview** themes are "largely controlled through CSS variables". A custom theme is a `name` plus a `className` whose CSS sets those variables ([dockview theming](https://dockview.dev/docs/core/theming/)). Its variables can point to shadcn's (`--dv-...: var(--background)`).
- **CodeMirror 6** themes are CSS, so they can use `var(--...)` directly (assumption from how `EditorView.theme` works; not re-checked on this pass).
- **xterm** takes a theme object of color strings, not CSS variables. The app must read the computed variables and pass them in, likely converted from OKLCH to hex (assumption: xterm doesn't parse OKLCH; verify).

This also prepares user themes. Obsidian lets users restyle with CSS snippets. With every surface on shadcn's variables, a user theme is a CSS file that overrides them. That belongs in "Later", but the design costs nothing now.

## 5. Strict TypeScript and linting

Copied components become Hone code, so they must pass `pnpm check`. Whether they pass `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and the Biome or Oxlint rules as they come is not documented. Check it on the first `shadcn add`. T3 Code's strict tsconfig (the same flags) and its lint config apply to `components/ui` with few exceptions, which suggests they're fixable ([t3code-tooling.md](t3code-tooling.md)).

Updates: since the code is copied, a new upstream version isn't installed by upgrading. You re-run `shadcn add` and review the diff. That's the price of owning the code.

## 6. Keeping agents on the design system

Three layers, from strongest to weakest:

1. **`@shadcn/lint`** (0.2.0): "an agent-first linter for Tailwind design systems". When an agent breaks a rule, "the error explains what's wrong and suggests a fix based on your components, variants, and theme". It works with Tailwind v4 ("shadcn/ui not required") and is "available for both ESLint and Oxlint" ([README](https://github.com/shadcn-ui/lint)). Its npm peer dependencies are ESLint 9.30+ and `@typescript-eslint/parser`. T3 Code loads it as an Oxlint JS plugin. Rules T3 Code uses: `no-restyle`, `no-raw-colors`, `no-unknown-classes`, `no-arbitrary-values`, `require-static-classes`. **There is no Biome version.**
2. **The shadcn skill**, installed with `pnpm dlx skills add shadcn/ui`, gives agents "project-aware context about shadcn/ui": the config, CLI commands and theming ([Skills](https://ui.shadcn.com/docs/skills)). The docs don't say which folder it installs to.
3. **The MCP server**, `shadcn mcp init --client claude`, lets an agent browse and install components from registries ([MCP](https://ui.shadcn.com/docs/mcp)). It's useful while building the UI, and optional.

For Hone's own development, layer 1 is what matters: it's deterministic. Layers 2 and 3 help the agent write the right thing the first time.

## 7. Alternatives

None has a clear advantage for this app. Mantine or Fluent would bring more ready-made components, perhaps a tree, but as a dependency whose code Hone can't change, and with no lint equivalent to `@shadcn/lint`. React Aria is now available as a primitive option inside shadcn itself ([changelog](https://ui.shadcn.com/docs/changelog)), so it isn't a reason to leave.

## Draft setup

Not run. Verify when creating `packages/app`.

```bash
cd packages/app
pnpm dlx shadcn@latest init -t vite   # choose Base UI and the Mira style when asked
pnpm dlx shadcn@latest add command context-menu dialog tabs tooltip toast kbd sidebar scroll-area collapsible
```

`components.json` outline (from T3 Code's, with Hone's paths):

```jsonc
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "base-mira",
  "rsc": false,
  "tsx": true,
  "tailwind": { "config": "", "css": "src/renderer/index.css", "baseColor": "zinc", "cssVariables": true, "prefix": "" },
  "iconLibrary": "lucide",
  "aliases": { "components": "@/components", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks", "utils": "@/lib/utils" }
}
```

## Does this need an ADR?

Yes, together with the linter decision. Choosing shadcn/ui with `@shadcn/lint` rules out Biome as the only linter, because the lint only runs on ESLint or Oxlint. The two choices depend on each other, so one ADR should cover both: "UI with shadcn/ui on Base UI; lint and format with Oxlint and Oxfmt."
