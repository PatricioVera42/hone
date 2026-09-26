# TypeScript code standards enforced by tools

Research for Hone's monorepo (`packages/app`, `packages/host`, `packages/protocol`). Goal: good TypeScript standards enforced mechanically (compiler, linter, CI, git hooks) because most code is written by AI agents in an unattended loop. Sources are primary (official docs, READMEs, package registry). Versions checked against the npm registry on 2026-09-26.

Status: complete (first pass). Drafts at the end are unverified by execution.

## Summary

- **Compiler:** TypeScript 7 for `tsc -b`, `strict` plus the extra flags of `@tsconfig/strictest` and `erasableSyntaxOnly`. Project references make `app` and `host` see only `protocol`.
- **Linter and formatter:** Oxlint with `--type-aware` and `--deny-warnings`, plus Oxfmt ([ADR 0008](../docs/adr/0008-shadcn-ui-and-oxlint.md)). Type-aware rules cover floating promises and implicit `any`, and `consistent-type-assertions` forbids `as` casts. One custom JS rule guards Electron's security flags.
- **Boundaries:** package manifests plus `noUndeclaredDependencies`, `noRestrictedImports` and `noNodejsModules`. No extra tool.
- **Hygiene:** Knip from day one.
- **Boundary validation:** Zod schemas in `protocol`, with types derived from them.
- **Tests:** Vitest with `requireAssertions`, coverage floors only on `protocol` and `host`.
- **One entry point,** `pnpm check`, for agents, hooks and CI.

## 1. tsconfig

### The TypeScript version question comes first

TypeScript 7.0 (`typescript@7.0.2` on npm, published 2026-07-08) is the native port of the compiler written in Go, "10x faster" per the [7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/). The same announcement says "TypeScript 7 does not yet expose a stable programmatic API", so tools that embed the compiler (typescript-eslint among them) cannot use it; a new, different API is promised for 7.1. typescript-eslint 8.70.1 declares a peer dependency on `typescript >=4.8.4 <6.1.0` (checked with `npm view typescript-eslint peerDependencies`, and stated on its [dependency versions page](https://typescript-eslint.io/users/dependency-versions/)).

The announcement documents a side-by-side setup: `"typescript": "npm:@typescript/typescript6@^6.0.2"` plus `"@typescript/native": "npm:typescript@^7.0.2"`. The `@typescript/typescript6` package ships a `tsc6` binary and re-exports the 6.0 API, "so that you can use `tsc` for TypeScript 7, while other tooling can continue to rely on 6.0" ([7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)). Code "compiling cleanly with TypeScript 6.0 ... should compile identically in TypeScript 7.0" (same source).

Recommendation: typecheck with TypeScript 7 (`tsc -b`, fast), and only if typescript-eslint is adopted (section 2), keep the 6.0 alias for it. If typescript-eslint is not adopted, a single `typescript@^7` is enough. Assumption: Vite/electron-vite and Vitest do not need the TypeScript API because they strip types with their own transpiler; verify during the spike (roadmap item 3).

### Defaults changed in 6.0 and 7.0

Since 6.0, `strict` is `true` by default, `module` defaults to `esnext`, `target` to the latest ES version, `types` to `[]` (no automatic `@types/*`), `rootDir` to the folder of the tsconfig, `noUncheckedSideEffectImports` to `true`, and `libReplacement` to `false` ([6.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)). 6.0 deprecated `baseUrl`, `moduleResolution: node`/`classic`, `esModuleInterop: false`, `outFile` and ES5; 7.0 turns them into hard errors ([7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)). Consequence for Hone: still write `"strict": true` explicitly (documentation value, and the base config must be readable without knowing the default), and list `types` explicitly per package (`["node"]` in `host`, none or `["vite/client"]` in the renderer), which also keeps Node globals out of the renderer's type space.

### Flags beyond `strict`

`strict` enables `alwaysStrict`, `strictNullChecks`, `strictBindCallApply`, `strictBuiltinIteratorReturn`, `strictFunctionTypes`, `strictPropertyInitialization`, `noImplicitAny`, `noImplicitThis` and `useUnknownInCatchVariables` ([TSConfig reference: strict](https://www.typescriptlang.org/tsconfig/#strict)). So `useUnknownInCatchVariables` is already on; no need to list it.

The community base [`@tsconfig/strictest`](https://github.com/tsconfig/bases/blob/main/bases/strictest.json) (v2.0.8) enables exactly the extra set below, which is a good sanity check that the list is complete.

| Flag | What it prevents | Cost | Verdict |
|---|---|---|---|
| [`noUncheckedIndexedAccess`](https://www.typescriptlang.org/tsconfig/#noUncheckedIndexedAccess) | Adds `undefined` to reads through index signatures and array indexes, so `arr[0].x` or `map[key].y` without a check is an error. | More `if`/`?.` at array accesses; tempts `!` (which the linter forbids, section 2). | Enable. Highest-value extra flag for agent-written code, which often assumes a key exists. |
| [`exactOptionalPropertyTypes`](https://www.typescriptlang.org/tsconfig/#exactOptionalPropertyTypes) | Distinguishes "property absent" from "property set to `undefined`" for `prop?:`. | Friction with some third-party types and with spreading objects that may contain `undefined`; requires writing `prop?: T \| undefined` where both are meant. | Enable. Matters for JSON-RPC payloads, where absent and `null`/`undefined` differ on the wire. Revisit if React/dockview types fight it. |
| [`noImplicitOverride`](https://www.typescriptlang.org/tsconfig/#noImplicitOverride) | Methods that override a base class method must say `override`, so renaming the base method breaks the build instead of silently orphaning the subclass. | None for code with few classes. | Enable. |
| [`noPropertyAccessFromIndexSignature`](https://www.typescriptlang.org/tsconfig/#noPropertyAccessFromIndexSignature) | Forces `obj["key"]` for index-signature fields, so dot access (`obj.key`) always means a declared property. | Slightly noisier code; may conflict with a lint rule that prefers dot access (`eslint/dot-notation`). | Enable, and keep `dot-notation` off. |
| [`noFallthroughCasesInSwitch`](https://www.typescriptlang.org/tsconfig/#noFallthroughCasesInSwitch) | Non-empty `case` that falls into the next one. | None. | Enable. |
| [`noImplicitReturns`](https://www.typescriptlang.org/tsconfig/#noImplicitReturns) | A code path in a function that returns a value but forgets to return. | None. | Enable. |
| [`noUnusedLocals`](https://www.typescriptlang.org/tsconfig/#noUnusedLocals) / [`noUnusedParameters`](https://www.typescriptlang.org/tsconfig/#noUnusedParameters) | Unused variables/parameters. | Duplicates the linter's `no-unused-vars`, but a tsc error blocks the build. | Enable in tsc, since it is free. |
| [`allowUnreachableCode: false`](https://www.typescriptlang.org/tsconfig/#allowUnreachableCode), [`allowUnusedLabels: false`](https://www.typescriptlang.org/tsconfig/#allowUnusedLabels) | Turns the default editor suggestion into an error. | None. | Enable. |
| [`verbatimModuleSyntax`](https://www.typescriptlang.org/tsconfig/#verbatimModuleSyntax) | "Enforces using the exact syntax specified in imports and exports without transformation": type-only imports must be written `import type`, so a transpiler that works file by file (Vite, esbuild) can drop them safely. | Needs `import type` discipline; `typescript/consistent-type-imports` fixes it automatically. | Enable. It implies the guarantees of `isolatedModules` for imports. |
| [`isolatedModules`](https://www.typescriptlang.org/tsconfig/#isolatedModules) | Code that a single-file transpiler cannot compile correctly (e.g. re-exporting a type without `export type`, `const enum` across files). | None with Vite. | Enable (explicit, belt and braces with `verbatimModuleSyntax`). |
| [`erasableSyntaxOnly`](https://www.typescriptlang.org/tsconfig/#erasableSyntaxOnly) | TypeScript syntax that emits runtime code: `enum`, `namespace` with values, parameter properties (`constructor(private x)`). What remains can run by just deleting the types, as in Node's type stripping. | No enums (use `as const` objects or string unions, which are easier to validate with a schema anyway). | Enable. Keeps the code runnable by any type-stripping tool and removes a whole class of style debates. |
| [`forceConsistentCasingInFileNames`](https://www.typescriptlang.org/tsconfig/#forceConsistentCasingInFileNames) | Imports whose casing differs from the file on disk, which works on Windows and breaks on Linux. Relevant because Hone builds on Windows and WSL. | None. | Enable explicitly (assumption: default is already `true` since 5.0; setting it costs nothing). |
| [`isolatedDeclarations`](https://www.typescriptlang.org/tsconfig/#isolatedDeclarations) | Requires explicit types on exported functions and values so `.d.ts` files can be produced per file. | Many annotations. Hone publishes no library. | Skip. Prefer inferred return types. |

`skipLibCheck: true` is standard (it is in `@tsconfig/strictest`) and saves time; it only skips checking `.d.ts` files of dependencies.

### Monorepo layout: shared base plus project references

A root `tsconfig.base.json` holds the compiler options; each package's `tsconfig.json` uses `extends` and adds its own `lib`, `types` and `references`. With [project references](https://www.typescriptlang.org/docs/handbook/project-references.html) and `composite: true`, `tsc -b` builds `protocol` first and then `app` and `host`, and a package can only see another package it lists in `references`. That is a first, compiler-level architecture boundary: `app` and `host` reference `protocol`, never each other. TypeScript 7 supports `--build` and adds `--builders` to run reference builds in parallel ([7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)). A root `tsconfig.json` with `"files": []` and references to all three packages lets `tsc -b` typecheck everything with one command.

Inside `packages/app` there are really three environments (Electron main, preload, renderer). Give each its own tsconfig with different `lib`/`types`: the renderer gets `"lib": ["ES2024", "DOM", "DOM.Iterable"]` and no `@types/node`, so `process`, `Buffer` or `require` are type errors there. electron-vite's templates already split `tsconfig.node.json` and `tsconfig.web.json` (assumption from memory of its templates; confirm in the spike when choosing the build tool).


## 2. Linter and formatter: Oxlint and Oxfmt

Decision: Oxlint with type-aware rules, plus Oxfmt ([ADR 0008](../docs/adr/0008-shadcn-ui-and-oxlint.md)). This section first recorded Biome as the choice. It changed after [t3code-tooling.md](t3code-tooling.md) and [shadcn-ui.md](shadcn-ui.md). The Biome findings are kept below as the alternative considered.

Versions: `oxlint` 1.85.0, `oxlint-tsgolint` 7.0.2003 (both MIT, `npm view`, 2026-09-26).

### Type-aware rules

Oxlint runs type-aware rules through tsgolint, written in Go on `typescript-go`. It supports "59 out of 61" of typescript-eslint's type-aware rules, and requires "TypeScript 7.0+" ([type-aware linting](https://oxc.rs/docs/guide/usage/linter/type-aware.html)). It matches the compiler chosen in section 1 without keeping TypeScript 6 around. Caveats from the same page: coverage is "incomplete (but very close)", and "very large codebases may encounter high memory usage".

Rules that matter for agent-written code, all present in Oxlint ([rules list](https://oxc.rs/docs/guide/usage/linter/rules.html); 💭 marks type-aware):

| Rule | Category | Why |
|---|---|---|
| `typescript/no-floating-promises` 💭 | correctness | An unawaited promise loses its errors. |
| `typescript/no-misused-promises` 💭 | pedantic | A promise passed where a sync callback is expected. |
| `typescript/no-unsafe-assignment`, `-member-access`, `-call`, `-return`, `-argument` 💭 | pedantic | `any` that sneaks in without being written, such as `JSON.parse` output or an untyped library. |
| `typescript/only-throw-error` 💭 | pedantic | Throw only `Error` objects. |
| `typescript/no-unnecessary-condition` 💭 | nursery | Checks that can never be true or false. Start as a warning. |
| `typescript/no-explicit-any`, `typescript/no-non-null-assertion` | restriction | `!` defeats `noUncheckedIndexedAccess`. |
| `typescript/consistent-type-assertions` | style | With `assertionStyle: "never"`, forbids `as` casts (assumption: Oxlint supports that option as typescript-eslint does; verify on setup). |
| `typescript/consistent-type-imports` | style | Pairs with `verbatimModuleSyntax`. |
| `import/no-nodejs-modules` | style | Renderer only, through `overrides` (section 3). |
| `import/no-cycle`, `import/no-default-export` | restriction | Cycles; named exports. Allow default exports in config files through `overrides`. |
| `eslint/no-restricted-imports` | restriction | Package boundaries (section 3). |
| `eslint/no-console`, `eslint/no-param-reassign`, `eslint/complexity` | restriction | A logger instead of `console` in `host`; data flow; a size limit per function. |
| `unicorn/filename-case` | style | One casing for file names, which also avoids the Windows/Linux casing problem. |

`typescript/switch-exhaustiveness-check` doesn't appear in the rules list, so it may be one of the two unsupported rules. Use the compiler-checked `const _exhaustive: never = value` pattern where exhaustiveness matters.

### Configuration and failing on warnings

The config lives in `.oxlintrc.json` or `oxlint.config.ts`. `plugins` "overwrites the default plugin set", `categories` sets whole groups (`correctness` is on by default), and `overrides` applies rules per glob ([configuration](https://oxc.rs/docs/guide/usage/linter/config.html)). CLI flags ([CLI](https://oxc.rs/docs/guide/usage/linter/cli.html)):

- `--type-aware`: "enable rules that require type information".
- `--deny-warnings`: "ensure warnings produce a non-zero exit code". Required, since a warning doesn't stop an agent loop.
- `--report-unused-disable-directives`: flags leftover `// oxlint-disable` comments. T3 Code makes this an error.

### Custom rules

JS plugins use the ESLint v9 plugin API, so "most existing ESLint plugins should work out of the box". They are **alpha**, and rules that need type information can't be written as JS plugins ([JS plugins](https://oxc.rs/docs/guide/usage/linter/js-plugins.html)). `@shadcn/lint` loads this way, and so do T3 Code's own rules, which are TypeScript files with a test each ([t3code-tooling.md](t3code-tooling.md)). Hone needs one custom rule to start: Electron security (section 8).

### Formatter

Oxfmt "matches Prettier's JavaScript formatting" and "passes 100% of Prettier's JavaScript and TypeScript conformance tests" ([Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html)). The page doesn't state a stability level.

### Alternative considered: Biome

Biome 2.5.14 is one tool for lint and format. It has its own type inference that doesn't use the compiler ([Linter](https://biomejs.dev/linter/)). But its promise rules (`noFloatingPromises`, `noMisusedPromises`, `useExhaustiveSwitchCases`) are nursery, "experimental and the behavior can change at any time" ([noFloatingPromises](https://biomejs.dev/linter/rules/no-floating-promises/)). `noFloatingPromises` catches "about 75% of the cases" typescript-eslint catches ([Biome v2](https://biomejs.dev/blog/biome-v2/)). It has no `no-unsafe-*` family ([Domains](https://biomejs.dev/linter/domains/)), and no rule against `as` casts, only GritQL plugins ([Plugins](https://biomejs.dev/linter/plugins/)). Closing those gaps with typescript-eslint would add ESLint and TypeScript 6. The deciding factor: `@shadcn/lint` is "available for both ESLint and Oxlint", not Biome ([shadcn-ui.md](shadcn-ui.md)).

## 3. Architecture boundaries

The rule to enforce is simple. `app` and `host` never import each other, and they only share code through `protocol`. The renderer never touches Node APIs. Four layers already cover this without adding a tool:

1. **Package manifests.** Each package lists what it depends on. If `packages/app/package.json` doesn't list `@hone/host`, pnpm doesn't hoist undeclared packages into a package's `node_modules`, so the import also fails to resolve (assumption based on pnpm's default isolated layout; confirm in the spike).
2. **Relative-path escapes.** `eslint/no-restricted-imports` with `patterns` blocks `../../host/**` style imports that skip the manifest. One `overrides` block per package in the root Oxlint config.
3. **Compiler references.** `tsc -b` with project references: `app` and `host` reference only `protocol` (section 1).
4. **Renderer without Node.** `import/no-nodejs-modules` in an `overrides` block for the renderer folder, plus a renderer tsconfig without `@types/node` (section 1).

Alternatives considered: [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) (18.4.0) and eslint-plugin-boundaries express richer rules, such as layers inside a package, forbidden cycles and orphan modules. Hone has three packages and no internal layering yet, so under YAGNI they are not needed. `import/no-cycle` covers cycles. Revisit dependency-cruiser only if layers inside `host` need rules.

## 4. Dead code and dependency hygiene

[Knip](https://knip.dev/overview/features) (6.38.0) reports unused files, exports and dependencies. It treats workspaces as "first-class citizens". It ships plugins for Vite, Vitest, Playwright, electron-vite, Oxlint, Oxfmt, vite-plus, Lefthook, Husky, GitHub Actions, Tailwind and TypeScript, but none for Electron itself or Electron Forge ([plugins list](https://knip.dev/reference/plugins)). It parses with `oxc-parser` and has no dependency or peer dependency on `typescript` (checked with `npm view knip dependencies peerDependencies`). The TypeScript 7 question from section 1 therefore doesn't affect it.

Why it matters for agents: agents leave behind helpers, exports and dependencies from abandoned attempts, and nothing else flags an export that is never imported. The linter's unused-variable rules only see inside one file.

Recommendation: run `knip` in CI and in `pnpm check` from the first commit, when there is almost nothing to clean. It is much harder to adopt later. Electron's main and preload entry points may need to be declared by hand in `knip.json` if the build tool is Electron Forge rather than electron-vite.

## 5. Runtime validation at the trust boundary

TypeScript types disappear at runtime. A JSON-RPC message that arrives over the WebSocket is just text, and `JSON.parse` returns `any`, so the compiler can't check it. The fix is to write each message once as a schema, derive the TypeScript type from it, and validate every incoming message against it.

Library: [Zod](https://zod.dev/) 4 (4.6.5). It "must" be used with `strict` mode, is tested against TypeScript 5.5 and later, has a 2 kB gzipped core, and offers a smaller Zod Mini variant ([Zod docs](https://zod.dev/)). Valibot (1.5.0) and ArkType are valid alternatives. They share the [Standard Schema](https://standardschema.dev/) interfaces, which make switching cheap if it ever matters (assumption: all three implement it; the Standard Schema site doesn't list implementers on its home page). Zod is the most widely used of the three, which makes it the one agents write most reliably (assumption, not measured).

Layout: `packages/protocol` exports the schemas and the types derived with `z.infer`, plus one function that parses and validates a raw message. `app` and `host` only receive already-validated values.

Enforcement comes from the linter (section 2). The `no-unsafe-*` rules flag any use of the `any` that `JSON.parse` returns, unless it goes through a schema first. `typescript/consistent-type-assertions` forbids casting a message to its type instead of validating it. No custom rule is needed.

## 6. Tests as enforcement

Vitest is at 5.0.2. Three settings turn tests into a gate rather than a suggestion:

- **`expect.requireAssertions: true`** works "like calling `expect.hasAssertions()`" in every test, so "no test will pass accidentally" ([expect config](https://vitest.dev/config/expect)). This is cheap protection against a known agent failure: tests that run code but assert nothing.
- **Coverage thresholds** (`coverage.thresholds` with `lines`, `functions`, `branches` and `statements`; a positive number is "the minimum percentage of coverage required"). They can apply `perFile`, and `autoUpdate` raises them as coverage grows. The default provider is `v8` ([coverage config](https://vitest.dev/config/coverage)). Assumption: a run with unmet thresholds exits with an error; the config page doesn't say so explicitly.
- **Type tests** with `expectTypeOf`, for the few places where the type is the contract, such as the schemas-to-types mapping in `protocol` (assumption: available in Vitest 5 as in earlier versions; not checked on this pass).

Recommendation: require every test to pass and use `requireAssertions` from day one. Coverage is easy to game (a test that calls everything asserts little), so use it as a floor with `autoUpdate` on `protocol` and `host`, and set no threshold for the UI, which Playwright and manual QA cover. Type tests only in `protocol`.

## 7. Where the checks run

The how (git hooks, CI, required checks) lives in [git-hooks-and-ci.md](git-hooks-and-ci.md), still to be written. This file only fixes what runs. There is a single entry point, `pnpm check`, used by the agent loop, the hooks and CI alike:

1. `tsc -b` (typecheck, section 1)
2. `oxfmt --check` and `oxlint --type-aware --deny-warnings --report-unused-disable-directives` (format and lint, sections 2, 3 and 5)
3. `knip` (dead code, section 4)
4. `vitest run` (tests, section 6)

The order goes cheapest and most informative first, so an agent gets the fastest useful error.

## 8. Electron security settings

Electron's checklist has 20 items ([Security](https://www.electronjs.org/docs/latest/tutorial/security)). The three most important are already the default: Node integration off "since 5.0.0", context isolation "since 12.0.0" and process sandboxing "since 20.0.0" (same source). The risk is not forgetting to turn them on, but someone turning them off, for example an agent that sets `nodeIntegration: true` to fix an error quickly.

No maintained tool audits this. Electronegativity, the known one, was last published in March 2023 (1.10.3, `npm view @doyensec/electronegativity`), and the Electron guide mentions no audit tool. Recommendation:

- A custom Oxlint JS rule (section 2) that fails on `nodeIntegration: true`, `contextIsolation: false`, `sandbox: false`, `webSecurity: false` and `allowRunningInsecureContent: true`, with a unit test.
- One Playwright test that opens the app and checks that the renderer has no `process` or `require`, and that the page has a Content Security Policy (checklist item 7).
- Keep Electron current (item 16). A Dependabot or Renovate rule can handle that; it's a CI topic.

The rest of the list, such as validating the IPC sender (item 17) and limiting navigation (item 13), is code to write once in the main process, not something to lint.

## 9. Conventions tools can't enforce

These need to be written down, because no rule checks them. They are kept short on purpose: a long document stops being read.

- **Names say what things are, in the domain's words.** Use the terms in `CONTEXT.md` (workshop, project, cascade...) and avoid the ones it lists as "avoid". Google's guide: "do not use abbreviations that are ambiguous or unfamiliar to readers outside your project" ([Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)).
- **Comments explain why, not what.** Use JSDoc for "comments a user of the code should read" and line comments for implementation notes (same source).
- **`unknown`, never `any`, for values of unknown shape**, then narrow them with a schema or a type guard. The linter catches `any` written by hand, but not the choice between narrowing and casting.
- **Throw only `Error` subclasses**, and catch only where the error can be handled or turned into a JSON-RPC error. Don't catch just to log and rethrow. `typescript/only-throw-error` covers the first half.
- **YAGNI.** No options, parameters or abstractions without a current use.
- **Tests check behavior through public interfaces**, not private details, so refactors don't break them.

## Proposed config (drafts)

These drafts come from the sections above. They have not been run: the exact field names must be verified against each tool's docs when the monorepo is created.

`tsconfig.base.json`:

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "allowUnreachableCode": false,
    "allowUnusedLabels": false,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "erasableSyntaxOnly": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "composite": true
  }
}
```

Each package adds `module`/`moduleResolution` (`bundler` for the renderer, `nodenext` for `host` and Electron main), `lib`, `types` and `references`.

`.oxlintrc.json` (outline):

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "import", "react", "unicorn", "oxc"],
  "jsPlugins": ["./lint-rules/index.ts", "@shadcn/lint"],
  "categories": { "correctness": "error", "suspicious": "error", "perf": "error" },
  "rules": {
    "typescript/no-floating-promises": "error",
    "typescript/no-misused-promises": "error",
    "typescript/no-unsafe-assignment": "error",
    "typescript/no-unsafe-member-access": "error",
    "typescript/no-unsafe-call": "error",
    "typescript/no-unsafe-return": "error",
    "typescript/no-unsafe-argument": "error",
    "typescript/only-throw-error": "error",
    "typescript/no-unnecessary-condition": "warn",
    "typescript/no-explicit-any": "error",
    "typescript/no-non-null-assertion": "error",
    "typescript/consistent-type-assertions": ["error", { "assertionStyle": "never" }],
    "typescript/consistent-type-imports": "error",
    "import/no-cycle": "error",
    "import/no-default-export": "error",
    "eslint/no-console": "error",
    "eslint/no-param-reassign": "error",
    "eslint/complexity": "error",
    "unicorn/filename-case": ["error", { "case": "kebabCase" }],
    "hone/electron-security": "error"
  },
  "overrides": [
    { "files": ["packages/app/src/renderer/**"], "rules": { "import/no-nodejs-modules": "error" } },
    { "files": ["packages/app/**"], "rules": { "eslint/no-restricted-imports": ["error", { "patterns": [{ "group": ["**/host/**"], "message": "app talks to host only through @hone/protocol." }] }] } },
    { "files": ["packages/host/**"], "rules": { "eslint/no-restricted-imports": ["error", { "patterns": [{ "group": ["**/app/**"], "message": "host talks to app only through @hone/protocol." }] }] } },
    { "files": ["**/*.config.ts"], "rules": { "import/no-default-export": "off" } }
  ]
}
```

With a `vp`-free setup, lint config lives in this file. If the spike adopts Vite+, the same content moves to the `lint` key of `vite.config.ts`, as in T3 Code. The `@shadcn/lint` rules are set up when the UI exists ([shadcn-ui.md](shadcn-ui.md)).

Root `package.json` scripts:

```json
{
  "scripts": {
    "typecheck": "tsc -b",
    "format": "oxfmt",
    "lint": "oxfmt --check && oxlint --type-aware --deny-warnings --report-unused-disable-directives",
    "knip": "knip",
    "test": "vitest run",
    "check": "pnpm typecheck && pnpm lint && pnpm knip && pnpm test"
  }
}
```

## Draft CODING_STANDARDS.md

For the repo root. The code-review skill reads it and skips whatever tooling already enforces, so it only holds section 9.

```md
# Coding standards

Everything a tool can check is enforced by `pnpm check` (tsconfig, the Oxlint and Oxfmt configs, knip, Vitest). Those configs are the source of truth for it. This file holds only what they can't check.

- Name things in the domain's words from CONTEXT.md, and avoid the terms it lists as "avoid". No ambiguous abbreviations.
- Comments explain why, not what. JSDoc for what callers need to know; line comments for implementation notes.
- Values of unknown shape are `unknown` and get narrowed with a schema or a type guard, never cast.
- Throw only `Error` subclasses. Catch only where you can handle the error or turn it into a JSON-RPC error; don't catch just to log and rethrow.
- YAGNI: no options, parameters or abstractions without a current use.
- Tests check behavior through public interfaces, not private details.
```
