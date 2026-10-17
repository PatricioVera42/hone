---
name: verify-hone
description: Drive the real Hone desktop app (Electron window, host and terminals) through a user journey and capture proof — ARIA snapshots, screenshots, files on disk. Use to prove a ticket or fix works in the running app, to reproduce a UI bug, or when asked to run, check or screenshot Hone.
---

# Verify Hone

Hone's primary surface is its Electron window: welcome screen, file tree, editor tabs and terminals over a host process. You verify it by writing a **journey** (a TypeScript module with the user's steps) and handing it to the runner, `packages/app/e2e/verify.ts`. The runner builds the app, launches the Linux Electron under xvfb with its own user data, drives the journey through Playwright, keeps the evidence and tears everything down. Each run is one-shot. Nothing stays running between runs, so there is no long-lived instance to share or corrupt.

The feature map in [`features/README.md`](features/README.md) is the recipe source: read it, then the feature file you're proving, before writing a journey.

## Scope: a Linux stand-in for the Windows target

Users run Hone as the Windows Electron binary over a host in WSL (`pnpm dev`). The runner uses the Linux path that ADR 0013 added for tests: same renderer, protocol and host, with the host as a local `node`. A proof here leaves these Windows-only steps unverified: the host started through `wsl.exe`, Node resolved in WSL, `\\wsl.localhost` and drive paths converted from the folder dialog, the `/mnt/` warning, and the `electron.exe` copy in `%LOCALAPPDATA%`. When a change touches one of them, say it needs a manual check with `pnpm dev`.

Never drive the user's own Hone window or their `~/hone-dev` workshop. The runner can't reach them, and they're out of bounds anyway.

## Doctor

```bash
pnpm verify doctor
```

Read-only. Prints `ok` or `FAIL` for Node 24+, `xvfb-run` on `PATH`, the Linux Electron binary in `packages/app/node_modules/electron` (a fresh checkout has none, and an interrupted `pnpm dev` leaves the Windows one; `pnpm verify run` and `pnpm test:e2e` install the Linux one themselves, `doctor` only reports it), and no live processes from earlier runs. An `info` line also flags runs whose scratch folder is still in `/tmp`. Exit code 0 means a run can start. `run` calls it first and stops on a `FAIL`. Run it yourself whenever a run fails strangely.

## Launch and drive

```bash
pnpm verify run .verify-runs/journeys/<feature>.ts
```

`run` re-executes itself under `xvfb-run -a` with `WAYLAND_DISPLAY` and `ELECTRON_RUN_AS_NODE` unset, so it can never open a window on the real display. It runs `pnpm build` (about 6 s), so a run never drives a stale build. It then creates a scratch folder in `/tmp/hone-verify-*` for workshops and user data, launches the app and calls the journey. It prints one `step` line per step and ends with `passed` or `failed` plus the evidence folder; the exit code is 0 or 1.

Write journeys in `.verify-runs/journeys/` (gitignored). A journey exports one function:

```ts
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JourneyContext } from "../../packages/app/e2e/verify.ts";

export async function journey({ page, expect, makeWorkshop, openWorkshop, step, snap, record }: JourneyContext) {
  const root = await makeWorkshop("studies");
  await writeFile(path.join(root, "algebra.md"), "Groups.\n");
  const tree = await openWorkshop(root);

  await step("Click algebra.md in the tree and type at its end");
  await tree.getByRole("button", { name: "algebra.md" }).click();
  const editor = page.getByRole("textbox", { name: "algebra.md" });
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("Rings.");
  await snap("typed");

  await step("The note is saved to disk");
  await expect.poll(() => readFile(path.join(root, "algebra.md"), "utf8")).toBe("Groups.\nRings.");
  await record("algebra.md", await readFile(path.join(root, "algebra.md"), "utf8"));
}
```

`JourneyContext` is defined at the top of `verify.ts`; read it for the exact signatures. Its parts:

- `app` and `page` are Playwright's `ElectronApplication` and the window's `Page`. `expect` is Playwright's.
- `helpers` is `packages/app/e2e/helpers.ts`, the specs' own helpers. Reach for `workshopMenuButton`, `terminals`, `runInTerminal`, `renameInTree`, `resizeWindow` and `boxOf` there before writing your own.
- `makeWorkshop(name)` creates `<scratch>/<name>/.hone/generator/`, the marker that makes a folder a workshop root. Write seed files into it before `openWorkshop`.
- `openWorkshop(root)` replaces the native folder dialog so it picks `root`, clicks `Open workshop` on the welcome screen, and returns the `Files` tree once `.hone` shows.
- `helpers.pickFolderInDialog(app, folder)` replaces the dialog without clicking. Use it before `Create workshop`'s `Choose folder…` or the workshop menu's `Open workshop…`.
- `scratch` is the run's folder in `/tmp`, for anything else you seed.
- `relaunch()` closes the app and launches it again on the same user data, and returns the new `{ app, page }`. Use them from then on.
- `step`, `snap` and `record` produce evidence; see below.

The app is ready once the welcome screen's `Open workshop` button is visible, which happens only after the host's socket opens. After `relaunch()` that has opened the last workshop, the ready signal is that workshop's sidebar button instead. Locate by ARIA role and accessible name, as the feature files do. Only the native folder dialog is replaced, since Playwright can't drive it (ADR 0013). Everything else goes through the window the way a user would: clicks, keys and context menus. Never call the renderer's internals or the host's JSON-RPC directly. Disk changes made by `fs` in the journey stand in for an agent or another editor writing files, which is a real user path for Hone.

Run long sequences as several small journeys, one feature per file. A failing assertion stops the journey; Playwright's message names the locator and what it saw.

## Evidence

Each run writes `.verify-runs/<journey>-<UTC timestamp>/evidence/`, which survives cleanup:

- `journey.ts` is a copy of the journey that ran.
- `steps.log` holds each `step(text)` with its time since launch. Call `step` before each user action or check, in the user's words.
- `NN-<name>.aria.yml` and `NN-<name>.png` come from `snap(name)`: the window's ARIA tree and a screenshot. Read the YAML to check state; the PNG is for the human.
- `NN-<name>.txt` comes from `record(name, text)`: side-effect proof such as a file's content or a folder listing.
- `NN-failure.aria.yml` and `NN-failure.png` are taken automatically when the journey throws.
- `app.log` holds main's stderr (including `[host]` lines) and the renderer's console.
- `result.json` holds `status`, `error` (with the stack), the journey's path, `commit` (from `git describe --dirty`) and `durationMs`.

A proof follows the user path end to end. Snap before and after the action, so the evidence shows what was done and what resulted, not just the final screen. Read every side effect back through `fs` and `record` it: files written, renamed or deleted, and what a terminal command left on disk. For persistence, the proof is a `relaunch()` that shows the state again. A journey that passes only because it asserted less than the feature file's end state is not a proof. When a precondition can't be met, report the journey as failed and why.

## Cleanup

`run` cleans up after itself: it closes the app, stops any process it started that's still alive, and deletes the scratch folder. Pass `--keep` after the journey path to keep the scratch folder (its path is in `<run>/run.json`) for inspection, then:

```bash
pnpm verify cleanup .verify-runs/<run folder>
```

`pnpm verify cleanup --all` does every run, and is the fix for doctor's "live processes" `FAIL` after a crash. Cleanup kills only the pids recorded in that run's `run.json`, and only when their `/proc` start time still matches, so it never touches a process it didn't start. It deletes only `/tmp/hone-verify-*` scratch folders and `run.json`, never `evidence/`. To discard old evidence, delete its run folder by hand.

## Gotchas

- Terminals run your real login shell with your real `HOME`, in the scratch workshop. Type only commands confined to the workshop (`echo`, `pwd`, `ls`, `cat`), and never `git` or package managers.
- A dialog's close animation leaves it in the ARIA tree for a moment. Before `snap`, assert the next state (`await expect(dialog).toBeHidden()`) so the snapshot isn't mid-transition.
- The editor saves shortly after typing and the tree follows the disk through a watcher. Wait with `expect.poll` or a locator assertion, never a fixed sleep.
- The Playwright suite runs with one worker because parallel runs time out (#106). Run journeys one at a time.
- The ARIA snapshot shows only the visible terminal tab's rows, so read a hidden terminal by switching to its tab first.
