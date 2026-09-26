# What T3 Code uses for code quality

[T3 Code](https://github.com/pingdotgg/t3code) (MIT, about 23.6k stars, last push 2026-09-26) is "a minimal GUI for coding agents": a Node WebSocket server that wraps agent CLIs, with web, Electron desktop and React Native clients ([AGENTS.md](https://github.com/pingdotgg/t3code/blob/main/AGENTS.md)). Most contributions "will come from T3 Code itself", meaning agents (same source). Its situation is close to Hone's: a pnpm monorepo, Electron, a WebSocket protocol package, and agent-written code. Everything below was read from the repository's `main` branch on 2026-09-26 unless another source is linked.

## Summary

- **Toolchain:** [Vite+](https://viteplus.dev/guide/) (`vp`), which bundles Vite, Vitest, Oxlint, Oxfmt, Rolldown, tsdown and a task runner in one package. `vp check` runs format, lint and typecheck.
- **Linter:** Oxlint, not Biome and not ESLint, with custom rules written as JavaScript plugins, plus `@shadcn/lint` for the UI.
- **Formatter:** Oxfmt.
- **Compiler:** TypeScript 7.0.2, with almost the same strict flags that `typescript-standards.md` proposes.
- **Dead code:** Knip, required in CI.
- **Schemas:** Effect Schema in `packages/contracts`, the equivalent of Hone's `protocol`.
- **CI:** knip, `vp check`, typecheck, desktop build and a preload bundle check, with tests in separate jobs.

## Toolchain: Vite+

The root `package.json` depends on `vite-plus`, `typescript`, `knip`, `@effect/tsgo` and `@shadcn/lint`, and every script calls `vp` ([package.json](https://github.com/pingdotgg/t3code/blob/main/package.json)). The catalog pins `vite-plus` 0.3.3 and replaces `vite` with `@voidzero-dev/vite-plus-core` ([pnpm-workspace.yaml](https://github.com/pingdotgg/t3code/blob/main/pnpm-workspace.yaml)). Lint, format, test and staged-files settings all live in one root [vite.config.ts](https://github.com/pingdotgg/t3code/blob/main/vite.config.ts).

Vite+ is made by VoidZero, the company behind Vite, Vitest and Oxc. It "brings together Vite, Vitest, Oxlint, Oxfmt, Rolldown, tsdown, and Vite Task in a single `vite-plus` package", and it includes git hook support ([Vite+ guide](https://viteplus.dev/guide/)). On npm, `latest` is `1.0.0-rc.1`, MIT (`npm view vite-plus`). It is a release candidate, not a stable 1.0.

## Linter: Oxlint

Configuration from [vite.config.ts](https://github.com/pingdotgg/t3code/blob/main/vite.config.ts):

- Built-in plugins `eslint`, `oxc`, `react`, `unicorn` and `typescript`, with the `correctness`, `suspicious` and `perf` categories at `warn`, and a list of rules turned off.
- `reportUnusedDisableDirectives: "error"`: a leftover `// oxlint-disable` comment fails the lint.
- **Type-aware linting is off:** `typeAware: false, typeCheck: false`, with the comment "Revisit once Oxlint's tsgolint path can integrate with @effect/tsgo diagnostics." The reason is their use of Effect, which patches the compiler. That doesn't apply to Hone.
- **Custom rules** in a local package, `oxlint-plugin-t3code`, written in TypeScript with a test per rule. Examples: `namespace-node-imports`, `no-global-process-runtime`, `no-native-title-tooltip`, `no-inline-schema-compile`.
- **Debt ceilings:** a legacy pattern is allowed in some files up to a maximum number of occurrences (`maxOccurrences`). "Lower a ceiling when you migrate a file, and delete its entry at zero." This lets a new rule land without fixing everything at once, and still blocks new occurrences.
- `no-restricted-imports` enforces architecture and UI conventions, and each message explains what to use instead (for example, "Import from an explicit @t3tools/client-runtime/* subpath. The package has no root export.").

### Oxlint type-aware linting

This matters for Hone even though T3 Code has it off. Oxlint runs type-aware rules through tsgolint, written in Go on top of `typescript-go` (TypeScript 7). It supports "59 out of 61" of typescript-eslint's type-aware rules, including `no-floating-promises` and `no-unsafe-assignment`. It requires "TypeScript 7.0+", and the docs warn that coverage is "incomplete (but very close)" and that "very large codebases may encounter high memory usage" ([Oxlint type-aware linting](https://oxc.rs/docs/guide/usage/linter/type-aware.html)). Versions: `oxlint` 1.85.0 and `oxlint-tsgolint` 7.0.2003, both MIT (`npm view`).

This closes the gap `typescript-standards.md` found in Biome: Biome's promise rules are nursery with about 75% coverage, and typescript-eslint doesn't support TypeScript 7.

### UI lint: `@shadcn/lint`

"A programmable agent-first linter for Tailwind design systems" (0.2.0 on npm; T3 Code pins 0.1.5). T3 Code loads it as an Oxlint JavaScript plugin and turns on:

- `no-unknown-classes`: every class must be one Tailwind generates, so a typo fails instead of shipping unstyled.
- `no-raw-colors`: colors come from theme tokens.
- `no-arbitrary-values`: appearance values come from the scale, with an allow list.
- `no-restyle`: app code picks a variant of a `components/ui` component instead of restyling it with `className`.

This is how they keep agents from writing ad-hoc UI. It's relevant if Hone adopts shadcn/ui (pending research).

## Formatter: Oxfmt

`vp fmt`, with ignore patterns and `sortPackageJson` ([vite.config.ts](https://github.com/pingdotgg/t3code/blob/main/vite.config.ts)). Oxfmt "matches Prettier's JavaScript formatting" and "passes 100% of Prettier's JavaScript and TypeScript conformance tests" ([Oxfmt docs](https://oxc.rs/docs/guide/usage/formatter.html)). The page doesn't state a stability level.

## Compiler

TypeScript 7.0.2 from the catalog ([pnpm-workspace.yaml](https://github.com/pingdotgg/t3code/blob/main/pnpm-workspace.yaml)). The [tsconfig.base.json](https://github.com/pingdotgg/t3code/blob/main/tsconfig.base.json) sets `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `forceConsistentCasingInFileNames` and `skipLibCheck`, plus `module`/`moduleResolution: NodeNext`, `noEmit` and `allowImportingTsExtensions`. Compared with Hone's draft, it doesn't set `noPropertyAccessFromIndexSignature`, `noImplicitReturns` or the unused-locals flags. Many extra checks come from the Effect language service plugin (for example `globalConsole`, `globalDate` and `nodeBuiltinImport` as errors), which only applies to Effect code.

## Dead code

Knip 6.34.0, with a `knip:check` script that checks unused files and dependencies everywhere and unused exports per workspace, plus a custom preprocessor for their schemas ([package.json](https://github.com/pingdotgg/t3code/blob/main/package.json)). CI runs it as its own step.

## Git hooks and CI

- **Pre-commit (staged files):** only the formatter. The config says "Formatter only for now — no lint or typecheck on commit." ([vite.config.ts](https://github.com/pingdotgg/t3code/blob/main/vite.config.ts)).
- **CI "Check" job:** `knip:check`, `vp check`, typecheck, desktop build, and a script that verifies the preload bundle output. Tests run in separate jobs, with the server's tests split across machines (shards). Another workflow runs tests on Windows ([ci.yml](https://github.com/pingdotgg/t3code/blob/main/.github/workflows/ci.yml)).
- **Agents don't run the full suite.** AGENTS.md: "Do not run repo-wide checks. No `vp check`, no `vp run -r test`... CI owns the full suite." Agents run targeted tests, lint and typecheck on what they changed.

## Agent instructions worth copying

From [AGENTS.md](https://github.com/pingdotgg/t3code/blob/main/AGENTS.md):

- "Inferred types over annotations. `any` is the enemy."
- "Test meaningful logic or observable behavior... Do not add tests that merely assert callback wiring or mirror the implementation."
- "A test that needs a timeout to pass is wrong."
- Lint rules are cited from the prose: "`shadcn/no-restyle` fails lint on violations." Each rule is written once, in the linter, and the text only points to it.
- "If a rule here fights the task in front of you, say so loudly and get a human sign-off before breaking it."
- "Hit every surface", a checklist of places a change is usually missing (entry points, clients, contracts, "reverse states").

## What this means for Hone

1. **Oxlint instead of Biome deserves a real comparison.** With TypeScript 7, Oxlint's type-aware mode covers almost all of typescript-eslint's type-aware rules in one tool. Custom rules are TypeScript with unit tests, instead of GritQL. `@shadcn/lint` only plugs into Oxlint or ESLint (assumption: it ships no Biome plugin; not checked). Against it: tsgolint's stated memory caveat, and Oxfmt, which is newer than Biome's formatter.
2. **Vite+ as a whole is a larger bet.** It replaces Vite and bundles the task runner. It's a release candidate, and it would have to work with the Electron build tool the spike picks. It's better decided in the spike (roadmap item 3) than now.
3. **The patterns carry over to any linter:** debt ceilings, messages that say what to use instead, failing on unused disable comments, pre-commit that only formats while CI owns the full suite, and agents running only targeted checks.
