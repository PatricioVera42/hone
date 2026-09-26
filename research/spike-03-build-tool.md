# Spike 3: pnpm, Electron and node-pty, and the build tool

Roadmap spike item 3: do pnpm, Electron and `node-pty` work cleanly together, and which build tool should Hone use (electron-vite, Electron Forge, or Vite+ per ADR 0008)? Run on 2026-09-26 on the same machine as [spike 1](spike-01-window-host-terminal.md). Throwaway code in `~/hone-spike/mono`.

## Answer

Plain Vite plus a small dev script of our own, with no Electron build framework. The deciding constraint is the WSL split: the code, the host and the agents live in WSL, and the window is a Windows Electron binary. electron-vite and Forge assume Electron runs on the same machine as the code, so Hone would need its own launcher anyway. That is also what T3 Code does (Vite+, a `start-electron` script and electron-builder, with no electron-vite or Forge; [apps/desktop/package.json](https://github.com/pingdotgg/t3code/blob/main/apps/desktop/package.json)).

The v1 roadmap installs from source (`pnpm dev`) and leaves the installer for later, so packaging was not part of this spike.

## What was built

A pnpm 12.6.0 workspace with the three packages from `docs/stack.md`:

- **`@hone/protocol`:** TypeScript source, exported directly (`"exports": "./src/index.ts"`), with no build step.
- **`@hone/host`:** runs as `node src/main.ts`. Node 24 strips types and resolves `@hone/protocol` through the workspace symlink, so the host has no build step either. It reads its token from stdin, the fix for spike 1's finding 7.
- **`@hone/app`:** Vite 8.3.1. One config builds the renderer. A second builds main and preload as CommonJS, since sandboxed preloads can't be ES modules. `scripts/dev.ts`, about 40 lines, does the rest:
  1. starts the Vite dev server in WSL;
  2. builds main and preload in watch mode;
  3. launches Windows `electron.exe` on the app's `\\wsl.localhost\...` path, passing the dev server URL and the repo path as arguments.

  Main resolves Node's absolute path inside WSL once, with `bash -ic 'command -v node'`, and starts the host with it (spike 1, finding 1).

Result: `pnpm install` took 5.6 s and compiled `node-pty`. `pnpm dev` opens the Windows window with a working terminal (host ready in 1037 ms). Editing a renderer file in WSL updates the open window live.

## Findings

1. **`electron.exe` must live on the Windows disk.** Run from `\\wsl.localhost\...`, Chromium's GPU process fails ("GPU process isn't usable. Goodbye."). The app code can stay in WSL: a Windows `electron.exe` loads it from `\\wsl.localhost` without problems, as long as the binary itself is on `C:`. The dev script copies `node_modules/electron/dist` to `%LOCALAPPDATA%\hone-dev\electron-<version>` the first time (about 250 MB) and launches it from there.
2. **The Windows Electron binary installs from WSL.** `ELECTRON_INSTALL_PLATFORM=win32 pnpm --filter @hone/app exec install-electron --no` puts `electron.exe` in the WSL `node_modules`. `install.js` reads `ELECTRON_INSTALL_PLATFORM`, then `npm_config_platform`, then `process.platform`.
3. **`allowBuilds` works as the research said.** `allowBuilds: { node-pty: true }` in `pnpm-workspace.yaml` let pnpm 12 compile `node-pty` on install. Electron needed no entry, since version 44 has no install script.
4. **electron-vite and Forge lag behind Vite.** electron-vite 5.0.0 (stable) accepts Vite `^5 || ^6 || ^7`, and only 6.0.0-beta.1 accepts Vite 8. Forge 7.11.2's Vite plugin builds against Vite 5, and Forge 8 is in alpha (`npm view`). Plain Vite 8 has no such gap.
5. **Several windows work at once.** With the spike 1 app, three windows each started their own host and PTY and didn't interfere.
6. **The CSP needs `connect-src` for the dev server.** In development the renderer loads from `http://127.0.0.1:5173`, so the CSP allows `'self'` and the WebSocket origins. Vite's hot reload uses a WebSocket on the same origin (assumption: covered by `'self'` plus `ws://127.0.0.1:*`; hot reload worked).

## Vite or Vite+

Vite+ (1.0.0-rc.1) wraps the same Vite, adds Oxlint, Oxfmt, Vitest, a task runner and git hooks behind one `vp` CLI, and is what T3 Code uses. Plain Vite 8 with Oxlint, Oxfmt and Vitest installed separately gives the same tools at stable versions, with one layer less. Recommendation: plain Vite now. Moving to Vite+ later doesn't change the structure, since its config is a superset of Vite's; revisit when it reaches 1.0.

## Not tested

- Packaging an installer (electron-builder with pnpm's symlinked `node_modules`). That belongs to "Later" in the roadmap.
- A production build loaded with `loadFile` instead of the dev server.
- Developing on Linux or macOS without WSL, where the dev script would launch the local `electron` binary instead.
