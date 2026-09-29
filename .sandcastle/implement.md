# Issue #{{ISSUE_NUMBER}}

{{ISSUE}}

# Task

Implement issue #{{ISSUE_NUMBER}}, shown above with its comments. The agent brief in the comments is the contract. The issue body is context. You are on branch `{{SOURCE_BRANCH}}`.

- Before starting, read `AGENTS.md`, `CODING_STANDARDS.md`, `CONTEXT.md` and the ADRs the issue mentions.
- Work test first with /tdd where there's logic that can be wrong: pure functions, host operations, and the edge cases the issue or its brief names. Write one test per acceptance criterion, plus one for each edge case that could really break, and nothing beyond that.
- Don't unit-test UI wiring (a component passing props or calling a callback). The Playwright tests in the acceptance criteria cover it.
- Run the typecheck and single test files as you go. `pnpm check` must pass before each commit.
- Commit to the current branch with messages in the style of `git log`. Never add `Co-Authored-By` or "Generated with" lines.
- Don't push, open pull requests or write to GitHub. The harness does that after checking your work.
- Don't run /code-review. CI and CodeRabbit review the pull request.
- If the issue tells you to stop and report, or you can't finish, commit what's useful and explain it in the summary.

# Done

End your last message with a summary for the pull request description: what you built, how you tested it, and anything left undone or worth a human's attention. Wrap it in `<summary>` and `</summary>`.
