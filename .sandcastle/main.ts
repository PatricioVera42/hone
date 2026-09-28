// Agent loop for one ready-for-agent issue (docs/workflow.md): implement in Docker,
// gate on `pnpm check`, and only then push the branch and open a pull request.
import { claudeCode, createSandbox } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execFileSync } from "node:child_process";

function gh(...args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf8" }).trim();
}

const issue = process.argv[2];
if (issue === undefined || !/^\d+$/.test(issue)) {
  throw new Error("usage: pnpm sandcastle <issue number>");
}
const state = gh(
  "issue",
  "view",
  issue,
  "--json",
  "state,labels",
  "--jq",
  '[.state, .labels[].name] | join(" ")',
);
if (!state.split(" ").includes("OPEN") || !state.split(" ").includes("ready-for-agent")) {
  throw new Error(`issue #${issue} must be open and labeled ready-for-agent (got: ${state})`);
}

const branch = `agent/issue-${issue}`;
const sandbox = await createSandbox({
  branch,
  sandbox: docker({
    // The agent's skills (/tdd and the rest) live outside the repo.
    mounts: [
      { hostPath: "~/.agents/skills", sandboxPath: "/home/agent/.claude/skills", readonly: true },
    ],
  }),
  hooks: {
    sandbox: {
      onSandboxReady: [
        {
          command:
            "pnpm install --frozen-lockfile && pnpm --filter @hone/app exec install-electron --no",
          timeoutMs: 600_000,
        },
      ],
    },
  },
});

try {
  const result = await sandbox.run({
    agent: claudeCode("claude-opus-5-5"),
    promptFile: ".sandcastle/implement.md",
    promptArgs: { ISSUE_NUMBER: issue, ISSUE: gh("issue", "view", issue, "--comments") },
    logging: { type: "stdout" },
  });
  const summary =
    [...result.stdout.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].at(-1)?.[1]?.trim() ?? "";
  process.stdout.write(`\nAgent summary:\n${summary || "(none)"}\n`);

  if (result.commits.length === 0) {
    process.stderr.write("The agent made no commits. Nothing to push.\n");
    process.exitCode = 1;
  } else {
    const check = await sandbox.exec("pnpm check");
    if (check.exitCode === 0) {
      execFileSync("git", ["push", "--set-upstream", "origin", branch], { stdio: "inherit" });
      const title = gh("issue", "view", issue, "--json", "title", "--jq", ".title");
      const url = gh(
        "pr",
        "create",
        "--head",
        branch,
        "--base",
        "main",
        "--title",
        title,
        "--body",
        `Closes #${issue}\n\n${summary}`,
      );
      process.stdout.write(`Pull request: ${url}\n`);
    } else {
      process.stderr.write(
        `pnpm check failed, nothing pushed. Branch ${branch} stays local.\n${check.stdout}\n${check.stderr}\n`,
      );
      process.exitCode = 1;
    }
  }
} finally {
  await sandbox.close();
}
