# Hone

Desktop app for Markdown notes and projects alongside AI agents. See README.md, GLOSSARY.md (glossary) and docs/ (ADRs, stack, roadmap).

## Code

pnpm workspace: `packages/app` (Electron window), `packages/host` (runs in WSL) and `packages/protocol` (shared by both). `app` and `host` never import each other.

- `pnpm check` runs typecheck, format check, lint, Knip and the unit tests; CI must be green to merge. `pnpm format` fixes formatting.
- Follow `CODING_STANDARDS.md`.

## Verifying

- Prove a change in the running app with the `verify-hone` skill. That's the verification while something is being built.
- Tests protect what's finished. Once a feature is done and stable, its main user flows become Playwright specs in `packages/app/e2e`, and logic that was hard to get right gets unit tests. The host tests (`host.test.ts`, `terminal.test.ts`) drive the host from outside, over its WebSocket, so they hold for any implementation of it.
- A flaky test is fixed or deleted in the same change.
- `pnpm test:e2e` runs under Xvfb on its own; pass Playwright's arguments through it (`pnpm test:e2e -g "…"`).

## Ways of working

How a change is planned and built is open: skills like `/triage`, `/to-spec`, `/to-tickets` and `/work-tickets` are tools to pick per task, and new ways of working with agents are welcome. Every change keeps these:

- Code reaches `main` through a pull request with green CI. Docs can go straight to `main`.
- Patricio merges pull requests that add features.
- Decisions that change the architecture get an ADR in `docs/adr/`.

## Agent skills

### Issue tracker

GitHub Issues on PatricioVera42/hone, through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles, each label named after its role: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
