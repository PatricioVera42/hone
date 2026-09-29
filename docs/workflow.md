# Workflow

How Hone is built: planning with a human, implementation by an agent loop, checks that cost no model tokens. Model tokens come from one Claude Pro plan, so the model is only used where thinking is needed.

## Steps

1. **Plan.** `/grilling` until the idea holds up, then `/to-spec` (a spec issue) and `/to-tickets` (small vertical tickets, each listing the tickets that block it).
2. **Triage.** `/triage`, run by hand, classifies open issues and moves each one to a state. A ticket reaches `ready-for-agent` only with an agent brief that holds everything needed to implement it. Triage doesn't start the loop.
3. **Implement.** Each Sandcastle loop takes one `ready-for-agent` ticket, on its own branch (`branchStrategy: { type: "branch", branch: "agent/issue-<n>" }`). Its prompt stays generic:
   - Read the issue and its brief.
   - Implement with `/implement`, test first where there's logic that can be wrong. The acceptance criteria's Playwright tests cover UI wiring, which gets no unit tests.
   - Run `pnpm check` before committing.
   - Don't run `/code-review`: CI and CodeRabbit cover it.
4. **Gate.** The Sandcastle script runs `pnpm check` itself after the agent. If it passes, it pushes the branch and opens a pull request. If it fails, the agent gets the output and fixes it in the same container, up to two times, and the pull request description lists each fix. If it still fails, nothing leaves the machine.
5. **CI.** GitHub Actions runs `pnpm check`, the build and Playwright. Once the repo is public, a ruleset on `main` requires it to pass.
6. **Review.** CodeRabbit reviews the pull request (free on public repos). A finding that isn't fixed in the pull request becomes an issue: comment `@coderabbitai` and ask it to create one. The new issue goes back to step 2.
7. **Human check and merge.** Read the pull request, test by hand, report problems with `/report-bug`, and merge. A new feature with several behaviors to try gets a `/qa-checklist` issue. A bug fix or small change gets one or two manual steps in the chat instead.
8. **Architecture.** `/improve-codebase-architecture`, by hand, every two or three days.

Docs and small human changes can go straight to `main`, with the maintainer in the ruleset's bypass list. Code goes through a pull request so CI and CodeRabbit see it.

## Keeping pull requests manageable

- **Small tickets.** `/to-tickets` sizes each ticket to one agent session, so each pull request is quick to review and rarely collides with another.
- **Parallel only in separate areas.** Parallel loops take tickets that don't block each other and touch different parts of the code (for example one in `host`, one in `app`). Otherwise, run one loop.
- **Review in batches.** Pull requests wait. Once a day, read CodeRabbit's summary of each, test, and merge. `pnpm check` and CI have already filtered out broken code.
- **Merges are manual.** The human merge is the only point where a person looks at agent code before it reaches `main`.
- **Stale pull requests after a merge.** Merging one pull request can leave the others behind `main`. Without a conflict, GitHub's "Update branch" button brings `main` into the branch and CI runs again, at no token cost. With a real conflict, resolve it by hand or ask an agent to resolve that conflict only, not to redo the ticket. If this gets tedious with parallel loops, a GitHub Actions workflow can update open agent pull requests on each merge to `main`.
- **Later: auto-merge for low-risk work.** GitHub's auto-merge, which needs the ruleset on `main`, can merge refactors, docs and dependency updates once checks pass, marked by a label on the ticket. New features keep a human merge.

## Token budget

| Costs model tokens | Costs none |
|---|---|
| Grilling, spec, tickets, triage | `pnpm check`, git hooks, CI |
| Sandcastle implementation (the largest cost) | CodeRabbit (runs on its servers) |
| Architecture review | The Sandcastle script's gate |

Rules:
- Usually one Sandcastle loop, two or three in parallel when the plan's usage allows it. Each loop burns tokens on its own, so parallel loops reach the limits faster.
- Parallel loops only take tickets that don't block each other, so their pull requests don't collide.
- `/code-review` only when a second opinion on something delicate is worth it.

Details: [research/git-hooks-and-ci.md](../research/git-hooks-and-ci.md) (hooks, CI, the Sandcastle gate) and [research/typescript-standards.md](../research/typescript-standards.md) (what `pnpm check` runs).
