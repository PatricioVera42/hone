# Where the checks run: git hooks, CI and required checks

Research for Hone's monorepo (`packages/app`, `packages/host`, `packages/protocol`). Goal: code written by AI agents in an unattended Sandcastle loop (Docker) cannot land on `main` without passing `pnpm check`, and enforcing that costs no model tokens. The checks themselves are fixed in [typescript-standards.md](typescript-standards.md) section 7; this file covers where and how they run. Sources are primary (official docs, READMEs, npm registry). Versions checked on 2026-09-26.

Status: complete (first pass). Drafts at the end are unverified by execution.

## Summary

- **The guarantee is CI plus a ruleset, not hooks.** Hooks can be skipped with `--no-verify`. A ruleset on `main` that requires a pull request and a green `check` job can't. Rulesets and branch protection only exist for public repos on GitHub Free, or private repos on Pro and above, so the ruleset starts when the repo goes public, ideally before the first Sandcastle run.
- **The zero-token gate for the agent loop is the Sandcastle harness.** After the agent run, the harness runs `sandbox.exec("pnpm check")` and only pushes and opens a pull request if it passes. The agent is also told to run `pnpm check` before committing, so it fixes errors while it still has context.
- **Hooks are for fast feedback:** `pre-commit` formats staged files (as T3 Code does), `commit-msg` rejects attribution lines, `pre-push` runs `pnpm check`.
- **Hook manager:** lefthook (one Go binary, staged files and parallel jobs built in). If the spike adopts Vite+, use its built-in hooks (`vp config`, `vp staged`) instead. pnpm 12 needs `allowBuilds` for lefthook and node-pty.
- **CI:** one workflow on `ubuntu-24.04` with `pnpm/setup@v3` (pnpm, Node, cached install), `pnpm check` over everything (no affected-only filtering at this size), and Playwright's Electron tests under `xvfb-run`. node-pty compiles from source on Linux (no Linux prebuild). Windows runners wait for the installer.
- **Commit messages:** no commitlint yet. Turn off Claude Code's attribution with `"attribution": false`, plus a one-line `commit-msg` hook and a CI grep as backstops.
- **Optional:** a Claude Code `PostToolUse` hook that formats and lints each edited file; it costs tokens only when it reports an error.
- **CD later:** a tag-triggered workflow that builds the unsigned Windows installer on `windows-latest` and publishes a draft GitHub Release.

## 1. Three layers: git hooks, CI, CD

- **Git hook:** a script git runs on the developer's machine at a fixed moment, such as `pre-commit` (before a commit is created), `commit-msg` (with the message, before the commit is saved) or `pre-push` (before commits leave the machine) ([githooks](https://git-scm.com/docs/githooks)). It gives the fastest feedback, but it is local and optional: `git commit --no-verify` skips `pre-commit` and `commit-msg`, and `git push --no-verify` bypasses `pre-push` "completely" ([git-push](https://git-scm.com/docs/git-push)). A hook is a convenience, not a guarantee.
- **CI (continuous integration):** the same checks run on GitHub's servers for every push and pull request, in GitHub Actions. CI can't be skipped from the developer's machine, but by itself it only *reports* a red result; it doesn't stop the merge.
- **Required checks (rulesets or branch protection):** GitHub rules on a branch, such as `main`. With "Require status checks to pass before merging", "all required status checks must pass before collaborators can merge changes into the branch" ([available rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-status-checks-to-pass-before-merging)). Together with "Require a pull request before merging" ("all changes to the target branch be associated with a pull request") and "Block force pushes", nothing reaches `main` without a green CI run. This is what closes the `--no-verify` gap: a skipped hook only moves the failure from the laptop to the pull request.
- **CD (continuous delivery):** a workflow that builds and publishes a release (here, a Windows installer on GitHub Releases) when a tag is pushed. Covered briefly in section 7.

A ruleset is the newer form of branch protection: several rulesets can apply to one branch, they can be paused without deleting them, and anyone with read access can see them ([about rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)). Either works for Hone; rulesets are the recommended one.

### What the plan allows

Both features share the same limit: rulesets are "available in public repositories with GitHub Free and GitHub Free for organizations, and in public and private repositories with GitHub Pro, GitHub Team, and GitHub Enterprise Cloud" ([about rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)), and protected branches have the same availability note ([about protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)).

So, for Hone:

| Repo state | Hooks | CI | Required checks on `main` |
| --- | --- | --- | --- |
| Private, GitHub Free (now) | yes | yes, 2,000 min/month | **no** |
| Private, GitHub Pro | yes | yes, 3,000 min/month | yes |
| Public, GitHub Free (once implementation starts) | yes | yes, unlimited on standard runners | yes |

Minute figures are from [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions#free-use-of-github-actions): usage "is free ... for public repositories that use standard GitHub-hosted runners", and private repos get the quota above; without a payment method, "usage is blocked once you use up your quota" (same source).

While the repo is private on Free, nothing on GitHub can block a merge. The gap is closed by process instead: the Sandcastle loop never pushes to `main`; it pushes a branch and opens a pull request, and the human merges only green pull requests. Since the plan is to go public when implementation starts, and implementation is when the agent loop begins, the simplest path is to make the repo public before the first Sandcastle run and turn on the ruleset the same day. GitHub Pro is the fallback if the repo must stay private longer.

Commit-message rules on the server side (regex on messages or author emails) exist, but only for "organizations on a GitHub Enterprise plan" ([available rules, Enterprise Cloud](https://docs.github.com/en/enterprise-cloud@latest/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#metadata-restrictions)). On Free, a message rule is enforced by a CI job (section 5).

## 2. Hook managers

A hook manager writes the scripts into git's hooks directory (or points git's `core.hooksPath` setting at a folder in the repo) so every clone gets the same hooks after `pnpm install`. Four candidates, versions from `npm view` on 2026-09-26:

| | lefthook | husky + lint-staged | simple-git-hooks (+ lint-staged) | Vite+ (`vp config`, `vp staged`) |
| --- | --- | --- | --- | --- |
| Version | 2.1.14 (2026-09-14) | 9.1.7 (2024-11-18) + 17.6.0 (2026-09-26) | 2.14.0 (2026-08-28) | `vite-plus` 1.0.0-rc.1 |
| What it is | One Go binary, config in `lefthook.yml` | Shell scripts in `.husky/`, via `core.hooksPath`; lint-staged (Node) filters staged files | One command per hook, config in `package.json` | Husky-style dispatcher in `.vite-hooks/`, lint-staged 17 underneath |
| Staged-only runs | built in: `{staged_files}`, `glob`, `stage_fixed` | via lint-staged | via lint-staged | built in (`staged` key) |
| Parallel jobs | yes (`parallel: true`) | lint-staged runs tasks concurrently | via lint-staged | via lint-staged |
| Install with pnpm | needs `allowBuilds` or a `prepare` script | `prepare` script | `prepare` script | `prepare` script |

Sources for each column follow.

**lefthook.** "It is written in Go. Can run commands in parallel" and it is a "single dependency-free binary which can work in any environment" ([README](https://github.com/evilmartians/lefthook)). Jobs take `{staged_files}`, `{push_files}` or `{all_files}`, filtered by `glob` and `exclude` (same source). `stage_fixed: true` re-adds files a formatter changed, "only for the `pre-commit` hook", and "if the `git add` call fails, the hook fails too" ([stage_fixed](https://github.com/evilmartians/lefthook/blob/master/docs/configuration/stage_fixed.md)). `root` runs a job inside a package folder and filters paths to it, which covers the monorepo case ([root](https://github.com/evilmartians/lefthook/blob/master/docs/configuration/root.md)). The npm package ships one binary per platform as optional dependencies (`lefthook-linux-x64`, `lefthook-windows-x64`, ...; `npm view lefthook optionalDependencies`), and a `postinstall` script runs `lefthook install`, skipped when `CI` is set unless `LEFTHOOK=1` ([postinstall.js](https://github.com/evilmartians/lefthook/blob/master/packaging/registries/npm/lefthook/postinstall.js), [CI env](https://github.com/evilmartians/lefthook/blob/master/docs/usage/envs/CI.md)). Its docs still tell pnpm users to list it in `onlyBuiltDependencies` ([node install](https://github.com/evilmartians/lefthook/blob/master/docs/installation/node.md)), but that setting "has been removed in v11 and replaced by `allowBuilds`" ([pnpm build settings](https://pnpm.io/settings/build)). With pnpm 12 (current: 12.6.0), packages not listed in `allowBuilds` "are disallowed by default", and `strictDepBuilds` (default `true`) makes the install fail when a dependency has an unreviewed build script (same source). So Hone either adds `lefthook: true` to `allowBuilds` (it needs that list anyway for `electron` and `node-pty`) or runs `lefthook install` from the root `prepare` script. The changelog mentions fixes to "always restore unstaged changes", so it hides partially staged edits while hooks run ([CHANGELOG](https://github.com/evilmartians/lefthook/blob/master/CHANGELOG.md)); the exact behavior is an assumption, not read in the docs.

**husky + lint-staged.** Husky is "just `2 kB`" with "no dependencies", "runs in `~1ms`", uses `core.hooksPath`, and supports "nested projects, monorepos" ([husky docs](https://typicode.github.io/husky/)). Setup is `pnpm exec husky init`, which writes `.husky/pre-commit` and a `prepare` script ([get started](https://typicode.github.io/husky/get-started.html)). Husky runs nothing by itself on staged files; lint-staged does that. lint-staged "only runs tasks on files that include staged changes", backs up the state in a git stash, hides unstaged parts of partially staged files, and restores everything on error; configs can live per package, "the closest configuration file will always be used" ([lint-staged README](https://github.com/lint-staged/lint-staged)). Its last husky release is from November 2024 (`npm view husky time`), which is stable rather than abandoned, but it means two tools instead of one.

**simple-git-hooks.** "Zero dependency", config in one object in `package.json`, and "this package allows you to set only one command per git hook"; it "works well for small-sized projects" ([README](https://github.com/toplenboren/simple-git-hooks)). Its README says pnpm blocks dependency install scripts and recommends the `prepare` script, which "works with all package managers (npm, pnpm, Yarn, Bun) and requires no allowlist" (same source). It needs lint-staged for staged-only runs, like husky.

**Vite+.** `vp config` "installs the generated Git hook dispatcher" and sets `core.hooksPath` to `.vite-hooks/_` (git-ignored, regenerated); `.vite-hooks/pre-commit` is a project-owned script that calls `vp staged`, which "runs checks on staged files using lint-staged 17" and is configured by the `staged` key of `vite.config.ts` ([Vite+ commit hooks](https://viteplus.dev/guide/commit-hooks)). `VP_GIT_HOOKS=0` (and `HUSKY=0`) disables it, and it sources `~/.config/husky/init.sh` like husky does (same source). `vp staged` requires Node "22.22.1 or later in the 22.x line, or 24.11.0 or later" (same source). The page only documents `pre-commit`; whether `commit-msg` and `pre-push` scripts in `.vite-hooks/` are dispatched too is an assumption (the dispatcher is husky-style, so likely yes).

### WSL and Docker

All four are plain git hooks, so they run wherever `git commit` runs. On WSL they behave as on Linux, as long as commits are made with the WSL `git`, not Windows `git.exe` on a `\\wsl$` path (assumption: not tested; Windows git would look for a Windows binary and Windows Node). Husky and Vite+ document a fix for GUIs that don't load the shell's Node version manager: an `init.sh` sourced before each hook ([husky how-to](https://typicode.github.io/husky/how-to.html#node-version-managers-and-guis)).

Inside Sandcastle's Docker container, commits run on a git worktree that is bind-mounted from the host, and the parent repo's `.git` directory is mounted at the same path so the worktree's `gitdir:` pointer resolves ([Sandcastle README](https://github.com/mattpocock/sandcastle#how-it-works), [mountUtils.ts](https://github.com/mattpocock/sandcastle/blob/main/src/mountUtils.ts)). Hooks installed in `.git/hooks` (lefthook) or pointed to by `core.hooksPath` (husky, Vite+) are therefore visible in the container. They only work if the container has `node_modules` installed for Linux, which Sandcastle's own examples do with an `onSandboxReady` install hook (same README). WSL and the container are both Linux x64, so lefthook's binary matches in both (assumption: not tested). Husky's docs suggest `HUSKY=0` "to avoid installing Git Hooks on CI servers or in Docker" ([husky how-to](https://typicode.github.io/husky/how-to.html#ci-server-and-docker)); for Hone the container is where the agent commits, so hooks should stay on there.

### Recommendation

**lefthook** if Hone doesn't adopt Vite+: one binary, staged-file filtering and parallel jobs built in, `pre-commit`, `commit-msg` and `pre-push` in one YAML file, no lint-staged. **Vite+'s hooks** if the spike adopts Vite+, since they come with it and T3 Code already uses them. Husky + lint-staged is a fine fallback; simple-git-hooks is too limited (one command per hook).

## 3. What runs where

The principle: each layer runs what is cheap enough for its moment, and only the last one is trusted.

| Layer | Runs | Why |
| --- | --- | --- |
| `pre-commit` hook | `oxfmt` on staged files, fixed and re-staged | Instant, never blocks for a style reason, keeps diffs clean |
| Agent, before it commits | `pnpm check` | The agent sees its own errors while it still has the context to fix them |
| Sandcastle harness, after the agent run | `pnpm check` via `sandbox.exec()`, then push | Deterministic gate, zero tokens when green |
| `pre-push` hook | `pnpm check` | Backstop for humans and for any push from the host |
| CI | `pnpm check`, build, Playwright | The only layer that can't be skipped; required by the ruleset |

### T3 Code's split and why Hone differs

T3 Code runs only the formatter on commit ("Formatter only for now — no lint or typecheck on commit") and tells its agents: "Do not run repo-wide checks ... CI owns the full suite" ([t3code-tooling.md](t3code-tooling.md#git-hooks-and-ci)). That fits a project where a human watches each pull request and the repo is large enough that a full run is slow.

Hone's loop is unattended. If only CI ran the full suite, the loop would have to push, wait for CI, read the failure and restart the agent: minutes of latency per round and a failure that arrives after the agent's context is gone. At Hone's size `pnpm check` should take seconds to tens of seconds (assumption: no code yet to measure), so the agent can run it locally. The formatter-only `pre-commit` part of T3 Code's split does fit: a full `pnpm check` in `pre-commit` would run again on every small commit the agent makes, and duplicates what the agent and the harness already do.

### The zero-token gate is the harness, not the hook

An instruction in the agent's prompt ("run `pnpm check` before committing") costs tokens and can be ignored. A hook can be skipped: the agent has a shell and can type `git commit --no-verify`. The step that costs no tokens and can't be talked out of is the harness, the TypeScript script that drives Sandcastle. Sandcastle documents exactly this: "`sandbox.exec()` lets the harness run shell commands directly in the same warm sandbox — handy for gating an implement step on a quick verification", with a non-zero exit code "returned, not thrown" ([Sandcastle README](https://github.com/mattpocock/sandcastle#multi-run-implement-then-review)). So the harness:

1. runs the agent (`sandbox.run()`);
2. runs `sandbox.exec("pnpm check")`;
3. if it fails, either starts one more agent iteration with the output in the prompt, or stops and leaves the branch for a human;
4. if it passes, pushes the branch and opens a pull request (Sandcastle itself is "100% local" and doesn't push, same source, so this step is the harness's own `git push` and `gh pr create`).

CI then re-runs everything on GitHub and the ruleset blocks the merge if it's red. Tokens are only spent when a check fails and the harness decides to hand the error back to the agent.

Blocking `--no-verify` in the agent's own tool (for example, a Claude Code permission rule denying `git commit --no-verify`) is possible but not needed: the harness and CI catch the result anyway. That is an assumption about Claude Code's permission syntax, not checked here.

## 4. GitHub Actions workflow

### Setting up pnpm and Node

pnpm now has its own setup action that installs both pnpm and Node. [`pnpm/setup`](https://github.com/pnpm/setup) (v3) "installs pnpm v11 and newer only", installs the runtime with `pnpm runtime set`, and replaces `actions/setup-node`; "`pnpm install` runs automatically when a `package.json` is present" ([README](https://github.com/pnpm/setup)). Its inputs include `cache` ("Cache the pnpm store directory"), `require-lockfile` (fails unless the lockfile describes the install and "runs `pnpm install --frozen-lockfile`"), and it reads the pnpm version from `packageManager` and the Node version from `devEngines.runtime` or `.nvmrc` (same source). The older `pnpm/action-setup` README itself now points to it ("Using pnpm/setup instead", [action-setup README](https://github.com/pnpm/action-setup)). Current tags: `actions/checkout` v7.0.1, `pnpm/setup` v3.0.0 (`git ls-remote --tags` on 2026-09-26). pnpm also defaults to `--frozen-lockfile` "in CI environments" ([pnpm install](https://pnpm.io/cli/install)), and GitHub always sets `CI=true` ([variables reference](https://docs.github.com/en/actions/reference/workflows-and-actions/variables)).

`CI=true` also stops lefthook's `postinstall` from installing hooks on the runner ([lefthook CI env](https://github.com/evilmartians/lefthook/blob/master/docs/usage/envs/CI.md)).

### Native and downloaded dependencies

Two packages run install scripts, and pnpm 12 blocks each until it's listed in `allowBuilds` ([build settings](https://pnpm.io/settings/build)): `node-pty`, and `lefthook` if its `postinstall` is used. `electron` 44 no longer has one: its binary "is downloaded by default the first time you run Electron in development mode", or ahead of time with the package's `install-electron` script ([Electron installation](https://www.electronjs.org/docs/latest/tutorial/installation)); the published `package.json` has no `scripts` (unpkg, `electron@44.4.5`). CI jobs that launch Electron (end-to-end tests, packaging) should run `pnpm exec install-electron --no` as an explicit step (assumption: flag copied from the docs' `npx` example).

`node-pty` 1.1.0's install script is `node scripts/prebuild.js || node-gyp rebuild` (`npm view node-pty scripts.install`). Its npm tarball has prebuilt binaries for `darwin` and `win32` only, none for Linux (`npm pack node-pty@1.1.0 --dry-run`), so on WSL, in Sandcastle's container and on the Linux runner it compiles from source. Linux needs `make python build-essential` ([node-pty README](https://github.com/microsoft/node-pty#dependencies)). The `ubuntu-24.04` runner image already ships GNU C++ 12 to 14 and Python 3.12 ([runner image README](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)), so no extra step is needed there; Sandcastle's Dockerfile must install them. `node-pty` uses `node-addon-api` (`npm view node-pty dependencies`), the stable Node-API binding, so a build for Node works across Node versions. Since node-pty lives only in `packages/host`, which runs in plain Node in WSL (ADR 0004), it is never rebuilt for Electron.

### Affected-only or everything

pnpm can run a script only in packages changed since a branch and their dependents: `pnpm --filter "...[origin/master]" test` ([pnpm filtering](https://pnpm.io/filtering)). Hone doesn't need it. `pnpm check` runs root-level tools (`tsc -b`, `oxlint`, `knip`, `vitest run`) over three packages, and `tsc -b` already skips up-to-date projects. Filtering would add a way to miss a breakage (for example, a change in `protocol` that only fails in `app`) to save seconds. Revisit when a full run gets slow.

### Keeping required checks reliable

- Required checks "must pass on the latest commit SHA", and a workflow skipped by path or branch filters or a skip-CI commit message leaves its checks "in a 'Pending' state" that blocks merging ([troubleshooting required checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)). So the required workflow has no `paths:` filter, and an agent writing `[skip ci]` in a message just blocks its own pull request.
- A job that `needs` a failed job is skipped "and may not block merging" (same source). Keeping `check` as one job avoids that; if it's split later, add a final job with `if: always()` and make that the required one.
- `concurrency` with `cancel-in-progress: true` cancels the previous run of the same branch when a new commit arrives ([concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)), which saves minutes while the repo is private.

### Playwright end-to-end tests

Playwright's Electron support is "**experimental**" ([Electron class](https://playwright.dev/docs/api/class-electron)). Electron "requires a display driver", and without one it "will fail to launch" ([Electron headless CI](https://www.electronjs.org/docs/latest/tutorial/testing-on-headless-ci)); on Linux the answer is Xvfb, a virtual display, run as `xvfb-run <test command>`, and Playwright says GitHub Actions environments come with Xvfb installed ([Playwright CI](https://playwright.dev/docs/ci)). Browsers don't need `playwright install` when only Electron is tested, because Electron brings its own Chromium (assumption: not stated in the docs). The end-to-end job runs on Linux: the Electron app and the host both run on the runner, over WebSocket on localhost. That tests Hone's own code but not the Windows-to-WSL bridge, which stays a manual QA item (the `qa-checklist` skill). Assumption: GitHub's Windows runners can't run WSL2, which needs nested virtualization; not checked.

Since only "a few Playwright end-to-end tests" are planned ([stack.md](../docs/stack.md)), they can run in the same workflow as a second job, and join the required checks once they're stable.

### Linux now, Windows later

v1 targets Windows + WSL, but everything CI checks (types, lint, unit tests, host code) is platform-neutral or runs in Linux. A Windows job only earns its cost when there is Windows-specific code to test or an installer to build (section 7). Windows minutes cost more: $0.010 per minute against $0.006 for Linux 2-core ([runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing)). Whether Windows minutes also count double against the free private quota is not stated on the billing page read (assumption: it no longer matters once the repo is public).

### Minutes

Private on GitHub Free: 2,000 minutes a month on standard runners, then blocked without a payment method. Public: free on standard runners ([Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)). GitHub rounds each job up to the whole minute ([runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing)). As a rough guide, a 3-minute check plus a 4-minute end-to-end job would allow about 280 pull request updates a month while private (assumption: durations guessed, not measured). Plenty for the design phase, tight for a busy agent loop, which is one more reason to go public before the loop starts.

## 5. Commit messages

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) 1.0.0 is a format for commit messages, `type(scope): description` (for example `fix(host): ...`), meant to make history readable by tools. The repo's two existing commits already use it (`docs: add ...`). commitlint checks a message against a rule set, usually `@commitlint/config-conventional`; it runs as a `commit-msg` hook with `commitlint --edit $1`, and its docs note that local linting can be bypassed, so CI should check too ([commitlint local setup](https://commitlint.js.org/guides/local-setup.html)). Current version: `@commitlint/cli` 21.2.3.

**Worth it? Not yet.** What Conventional Commits pays for is automation that reads messages: generated changelogs and automatic version bumps. Hone has no releases yet, and each agent pull request is reviewed and merged as a unit. The agent can be told the format in `AGENTS.md`, which it follows well without a checker. Adding commitlint means a dependency, a config file and another hook for a benefit that arrives only with section 7. Revisit it when the release workflow exists, and only if a changelog is generated from commits.

### Blocking the attribution lines

The rule "never add `Co-Authored-By` or 'Generated with Claude Code'" is best enforced at the source. Claude Code adds a `Co-Authored-By` trailer to commits and text to pull requests by default, and the `attribution` setting turns it off: "To hide all attribution, set `attribution` to `false`" (Claude Code v2.1.281 or later; older versions use empty `commit` and `pr` strings and `sessionUrl: false`) ([Claude Code settings reference](https://code.claude.com/docs/en/settings-reference.md#attribution)). Setting it in the Sandcastle image's Claude Code settings and in the user's `~/.claude/settings.json` removes the lines before they're written, with no tokens spent.

A `commit-msg` hook can enforce it too: it receives the path of the file that holds the proposed message and "exiting with a non-zero status causes the command to abort" ([githooks](https://git-scm.com/docs/githooks#_commit_msg)). A `grep -qiE '^co-authored-by:|generated with claude code'` that fails is enough, and needs no commitlint. If commitlint is adopted later, the same check is its `trailer-exists` rule inverted: rules take `always|never`, and "`never` inverts the rule" ([rules](https://commitlint.js.org/reference/rules.html#trailer-exists), [rules configuration](https://commitlint.js.org/reference/rules-configuration.html)). Like every hook, it can be skipped with `--no-verify`, and server-side message rules are Enterprise-only (section 1), so a CI step that greps `git log origin/main..HEAD` is the backstop. Recommended: the setting, plus the one-line `commit-msg` hook and CI step, because they are cheap and this is a rule the user has already stated.

## 6. Optional: Claude Code hooks while developing Hone

ADR 0002 forbids hooks in the agents Hone *generates* for users, because Claude Code and OpenCode implement them differently. It says nothing about the repo Hone is developed in, which uses Claude Code (and the Sandcastle loop runs Claude Code too, reading the same project `.claude/settings.json`; assumption, not checked in Sandcastle's docs).

A Claude Code hook is a command Claude Code runs on an event of the session, such as after each tool call. The documented example is a `PostToolUse` hook with an `Edit|Write` matcher that pipes the edited file's path to a formatter ([hooks guide](https://code.claude.com/docs/en/hooks-guide.md)). For Hone: after each edit, run `oxfmt` on the file, then `oxlint` on it.

**What it adds over git hooks:** timing. A git hook reports at commit time, after the agent has made many edits; a `PostToolUse` hook reports right after the edit that caused the problem. It also covers the human's interactive Claude Code sessions, not only the loop.

**Token cost:** zero when the file is clean. For `PostToolUse`, stdout on exit 0 isn't added to the context (only for events such as `UserPromptSubmit` and `SessionStart`), and stderr on exit 0 "goes to the debug log only ... and Claude never sees it"; to warn Claude, the hook exits 2 and "Claude sees the stderr" ([hooks reference](https://code.claude.com/docs/en/hooks.md#exit-code-2)). So the formatter runs silently, and the lint only costs the tokens of its error message when it finds something, which the agent would otherwise discover later, in a larger `pnpm check` output.

**Limits:** Claude can also change files through shell commands, which an `Edit|Write` matcher doesn't see (same guide). Type-aware Oxlint on a single file still builds type information for the project, which may be slow per edit (assumption; measure once there's code); if it is, the hook runs Oxlint without `--type-aware` and leaves type-aware rules to `pnpm check`. A `Stop` hook that runs `pnpm check` and refuses to let Claude stop until it passes is also possible ([hooks guide](https://code.claude.com/docs/en/hooks-guide.md)), but in the loop the harness already does that deterministically (section 3).

Worth adding when `packages/` exists; cheap, and optional.

## 7. CD later: unsigned Windows installer on GitHub Releases

The roadmap puts this under "Later". Shape of the workflow once it's needed:

- **Trigger:** a pushed tag such as `v0.1.0` (`on: push: tags: ['v*']`), so a release is a deliberate human act, never a side effect of the agent loop.
- **Runner:** `windows-latest` for the installer. The host part, including `node-pty` compiled for Linux, is built in a separate `ubuntu-latest` job and handed over as an artifact, because the host runs in WSL (ADR 0004) and node-pty has no Linux prebuild (section 4). How the installer carries the host into WSL is roadmap stage 5 and still open.
- **Publishing:** depends on the build tool the spike picks. Electron Forge has `@electron-forge/publisher-github`, which authenticates with `GITHUB_TOKEN` and needs `permissions: contents: write` in the workflow ([Forge GitHub publisher](https://www.electronforge.io/config/publishers/github)). electron-builder publishes to GitHub when `GH_TOKEN` or `GITHUB_TOKEN` is set, with `--publish onTag` meaning "on tag push only" ([electron-builder publish](https://github.com/electron-userland/electron-builder/blob/master/website/docs/publish.md)); on its development branch, implicit publishing is removed in v27 and must be requested explicitly (same source), while npm `latest` is still 26.15.3. Either way, publishing as a draft release and promoting it by hand is the safe default.
- **Unsigned:** distribution without signing is possible, "but in order to run them, users need to go through multiple advanced and manual steps", and Windows shows its unsigned-app warning dialogs ([Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)). Acceptable for early users; the release notes should say how to get past the warning.
- **Checks:** the release job runs `pnpm check` again (or requires the tagged commit to be on `main`, which the ruleset already guarantees was green).

## Draft configs

These are drafts. None has been run: field names and flags must be checked against each tool's docs when the monorepo is created.

`pnpm-workspace.yaml` (fragment):

```yaml
packages:
  - "packages/*"
allowBuilds:
  node-pty: true # compiles from source on Linux (no prebuild)
  lefthook: true # its postinstall runs `lefthook install`
```

Root `package.json` (fragment; `check` comes from typescript-standards.md):

```json
{
  "packageManager": "pnpm@12.6.0",
  "devEngines": { "runtime": { "name": "node", "version": "^24.11.0" } }
}
```

`lefthook.yml`:

```yaml
pre-commit:
  jobs:
    - name: format
      glob: "*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,json,jsonc}"
      run: pnpm exec oxfmt --no-error-on-unmatched-pattern {staged_files}
      stage_fixed: true

commit-msg:
  jobs:
    - name: no attribution lines
      run: '! grep -qiE "^co-authored-by:|generated with claude code" {1}'

pre-push:
  jobs:
    - name: check
      run: pnpm check
```

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  check: # the required status check
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0 # the attribution step reads the PR's commits
      - uses: pnpm/setup@v3 # installs pnpm, Node and runs pnpm install
        with:
          cache: true
          require-lockfile: true
      - name: No attribution lines in commit messages
        if: github.event_name == 'pull_request'
        run: |
          if git log --format=%B "origin/${{ github.base_ref }}..HEAD" | grep -qiE '^co-authored-by:|generated with claude code'; then
            echo "Remove Co-Authored-By / 'Generated with Claude Code' lines from the commit messages."
            exit 1
          fi
      - run: pnpm check

  e2e: # add to required checks once stable
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/setup@v3
        with:
          cache: true
          require-lockfile: true
      - run: pnpm --filter @hone/app exec install-electron --no
      - run: xvfb-run pnpm test:e2e
```

Ruleset for `main` (Settings → Rules → Rulesets, once the repo is public or on Pro):

- Target: default branch. Enforcement: active. Bypass list: empty (an admin can pause the ruleset in an emergency instead).
- Restrict deletions; block force pushes.
- Require a pull request before merging, 0 approvals (a solo maintainer can't approve their own pull request; assumption based on GitHub's review rules, not checked here).
- Require status checks to pass: `check` (later also `e2e`).

Sandcastle harness gate (sketch, TypeScript):

```ts
await using sandbox = await createSandbox({
  branch,
  sandbox: docker(),
  hooks: { sandbox: { onSandboxReady: [{ command: "pnpm install --frozen-lockfile" }] } },
});
await sandbox.run({ agent, promptFile: ".sandcastle/implement.md", maxIterations: 5 });

const check = await sandbox.exec("pnpm check");
if (check.exitCode !== 0) {
  // One more round with the failure in the prompt, or stop and leave the branch for a human.
  throw new Error(`pnpm check failed:\n${check.stdout}\n${check.stderr}`);
}
// git push origin <branch> && gh pr create --fill
```

Claude Code settings, in `~/.claude/settings.json` and the Sandcastle image:

```json
{ "attribution": false }
```

Optional project `.claude/settings.json` for developing Hone (section 6):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "f=$(jq -r '.tool_input.file_path'); pnpm exec oxfmt --no-error-on-unmatched-pattern \"$f\" >/dev/null 2>&1; pnpm exec oxlint --deny-warnings \"$f\" >&2 || exit 2" }
        ]
      }
    ]
  }
}
```

If the spike adopts Vite+, `lefthook.yml` is replaced by the `staged` key in `vite.config.ts`, `.vite-hooks/pre-commit` containing `vp staged`, and `"prepare": "vp config"` in the root `package.json`, as in T3 Code ([vite.config.ts](https://github.com/pingdotgg/t3code/blob/main/vite.config.ts), [package.json](https://github.com/pingdotgg/t3code/blob/main/package.json)):

```ts
staged: {
  "*": "vp fmt --no-error-on-unmatched-pattern",
},
```

The `commit-msg` and `pre-push` scripts would go in `.vite-hooks/` next to `pre-commit` (assumption: the docs only show `pre-commit`).
