# Hone

Desktop app for Markdown notes and projects alongside AI agents. See README.md, CONTEXT.md (glossary) and docs/ (ADRs, stack, roadmap, workflow).

## Code

pnpm workspace: `packages/app` (Electron window), `packages/host` (runs in WSL) and `packages/protocol` (shared by both). `app` and `host` never import each other.

- Run `pnpm check` before committing; it must pass. It runs typecheck, format check, lint, Knip and tests.
- `pnpm format` fixes formatting.
- Follow `CODING_STANDARDS.md`.

## Agent skills

### Issue tracker

GitHub Issues on PatricioVera42/hone, through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles, each label named after its role: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
