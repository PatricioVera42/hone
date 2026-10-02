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
// How many times a failing `pnpm check` goes back to the agent before the harness gives up.
const maxFixAttempts = 2;
// The tail of the failing output the agent sees; the end holds the errors and the summary line.
const checkOutputChars = 20_000;

function lastSummary(stdout: string): string {
  return [...stdout.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].at(-1)?.[1]?.trim() ?? "";
}

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
    agent: claudeCode("claude-sonnet-5-5", { effort: "high" }),
    promptFile: ".sandcastle/implement.md",
    // Outside a terminal, `--comments` prints only the comments, so the body comes from a second call.
    promptArgs: {
      ISSUE_NUMBER: issue,
      ISSUE: `${gh("issue", "view", issue)}\n\n${gh("issue", "view", issue, "--comments")}`,
    },
    logging: { type: "stdout" },
  });
  const summary = lastSummary(result.stdout);
  process.stdout.write(`\nAgent summary:\n${summary || "(none)"}\n`);

  if (result.commits.length === 0) {
    process.stderr.write("The agent made no commits. Nothing to push.\n");
    process.exitCode = 1;
  } else {
    const fixes: string[] = [];
    // Runs the gate; a failure goes back to the agent, in the same container, until it passes or attempts run out.
    const gate = async (attempt: number): Promise<Awaited<ReturnType<typeof sandbox.exec>>> => {
      const check = await sandbox.exec("pnpm check");
      if (check.exitCode === 0 || attempt > maxFixAttempts) return check;
      process.stderr.write(
        `pnpm check failed; fix attempt ${String(attempt)} of ${String(maxFixAttempts)}.\n`,
      );
      const fix = await sandbox.run({
        agent: claudeCode("claude-sonnet-5-5", { effort: "high" }),
        promptFile: ".sandcastle/fix-check.md",
        promptArgs: {
          ISSUE_NUMBER: issue,
          CHECK_OUTPUT: `${check.stdout}\n${check.stderr}`.slice(-checkOutputChars),
        },
        logging: { type: "stdout" },
      });
      fixes.push(lastSummary(fix.stdout) || "(no summary)");
      return gate(attempt + 1);
    };
    const check = await gate(1);
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
        [
          `Closes #${issue}`,
          summary,
          ...fixes.map((fix, index) => `Gate fix ${String(index + 1)}: ${fix}`),
        ].join("\n\n"),
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
