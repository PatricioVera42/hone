# Spike 2: what Claude Code and OpenCode load in nested projects

Roadmap spike item 2: which skills and `AGENTS.md` files do Claude Code and OpenCode load in nested projects, with and without git, and what happens when two skills share a name? Run on 2026-09-26 with Claude Code (Haiku for the model calls) and OpenCode 1.18.32 (a free OpenCode model), in WSL2. Throwaway tree in `~/hone-spike/agents`.

## Method

A test tree shaped like a workshop:

```
workshop/            AGENTS.md (W-AGENTS), skill wskill
  course/            AGENTS.md (C-AGENTS), skills cskill, dup, implement, wskill (a second one)
    code/  (.git)    AGENTS.md (K-AGENTS), skills kskill, dup
```

Each `AGENTS.md` holds a marker. Each skill's body says "Reply with <marker>". `implement` shares its name with a real user-level skill in `~/.agents/skills`.

How each question was checked:

- **Which skills are available:** OpenCode's `opencode debug skill`, with no model involved. For Claude Code, the `skills` field of the `init` event in `claude -p --output-format stream-json`.
- **Which duplicate wins:** the model invoked the skill and reported the marker of the file it loaded. Haiku's reading of the skill list was unreliable (it twice said a listed skill had no description), so only invocations count.
- **Which `AGENTS.md` load:** the model listed the markers it saw.

## Results

| From | Tool | `AGENTS.md` loaded | Skills from the tree |
|---|---|---|---|
| `course/` (no git above) | Claude Code | workshop, course | course + workshop |
| | OpenCode | workshop, course | course + workshop |
| `course/code/` (own `.git`) | Claude Code | workshop, course, code | code only |
| | OpenCode | code only | code only |

Making the workshop itself a git repo didn't change the table: every folder above `code/` is then inside the workshop's repo, and `code/` is a nested repo.

Same name at two levels:

| Case | Claude Code | OpenCode |
|---|---|---|
| `wskill` in workshop and course, run from `course/` | course's (closest), 3 of 3 runs | workshop's in 6 of 8 runs, course's in 2 |
| `implement` in course and in `~/.agents/skills`, run from `course/` | course's | course's in 5 of 6 runs, the global one in 1 |
| `dup` in course and code, run from `code/` | code's (course's is out of scope) | code's, 5 of 5 |

## Findings

1. **Skills stop at the git root in both tools.** This confirms ADR 0005: a code project with its own `.git` loses every skill above it.
2. **`AGENTS.md` doesn't stop at the git root in Claude Code, but does in OpenCode.** From a nested repo, Claude Code loads every `AGENTS.md` up to the workshop, while OpenCode loads only the repo's own. The two tools give the same project different instructions. ADR 0005's self-contained projects are needed for OpenCode, and in Claude Code the ancestors' instructions arrive on top of them.
3. **Every ancestor's `AGENTS.md` loads in folders without git, in both tools.** A project inside the workshop receives the workshop's `AGENTS.md`, and a subproject receives its parent project's. The glossary puts the generator "at the top of the workshop". If the generator's instructions live in the workshop's root `AGENTS.md`, every project agent also receives them, including "you create projects and refine agents". Likewise, a subproject's agent receives its parent agent's full instructions, not just the summary in `.hone/inherited.md` (ADR 0006).
4. **Same-name skills are unreliable.** Claude Code consistently picks the closest one. OpenCode's choice varies between runs, even between a project skill and a user-level one. Hone can't rely on a project skill overriding a library or global skill by name. The generator must give copied skills names that don't collide with anything visible from the project, including the user's own skills in `~/.claude/skills` and `~/.agents/skills`.
5. **OpenCode's `debug skill` output is cut at 64 KB when piped.** Redirecting to a file works. It matters only for scripts that parse it.

## Implications for the design

- **Where the generator lives (finding 3).** Its instructions shouldn't be an ancestor of any project. One option is a `generator/` folder beside the projects, with its own `AGENTS.md`, where the user runs `/create` and `/refine`. The workshop's root `AGENTS.md` would then hold nothing, or only what every agent in the workshop should know. This changes the glossary entry and needs an ADR.
- **Parent instructions in subprojects (findings 2 and 3).** Either accept that a subproject also sees its parent's `AGENTS.md`, and write project instructions so they read correctly when stacked, or keep projects' own instructions out of the `AGENTS.md` that children inherit. Needs a decision.
- **Skill names (finding 4).** The generator checks for name collisions before copying, for example with a prefix or by refusing a duplicate. It relates to roadmap v1 "Library skill updates".
- **Sandcastle's `implement` override.** Confirms the workflow decision to change behavior through the prompt, not a same-name project skill.
