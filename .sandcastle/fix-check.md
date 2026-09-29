# Task

You implemented issue #{{ISSUE_NUMBER}} on branch `{{SOURCE_BRANCH}}`, but `pnpm check` fails on your last commit, so the harness won't push it. Its output:

```
{{CHECK_OUTPUT}}
```

Fix what makes it fail, without changing what the issue asked for. Don't weaken or skip a check or a test to make it pass. Run `pnpm check` until it passes, then commit with a message in the style of `git log`. Never add `Co-Authored-By` or "Generated with" lines. Don't push or write to GitHub.

# Done

End your last message with one or two sentences on what failed and how you fixed it, wrapped in `<summary>` and `</summary>`.
