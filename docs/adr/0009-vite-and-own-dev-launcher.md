# Plain Vite and our own dev launcher, developing from WSL

The app is built with plain Vite: one config for the renderer, one for main and preload. A small script of our own runs development. It starts the Vite dev server and a watch build in WSL, then launches the Windows Electron binary on the app's `\\wsl.localhost` path. `protocol` and `host` have no build step, since Node runs their TypeScript directly. We rejected electron-vite and Electron Forge. Both assume Electron runs on the same machine as the code, so Hone would need its own launcher anyway, and both lag behind the current Vite. We also chose plain Vite over Vite+, which ADR 0008 left open: Vite+ is still a release candidate and would add a layer over the same Vite. Oxlint, Oxfmt and Vitest are installed on their own.

## Consequences

- The repo, the host and the agents live in WSL, and only the window runs on Windows, matching ADR 0004 in development too.
- `electron.exe` must run from the Windows disk, because Chromium's GPU process fails when the binary is on `\\wsl.localhost`. The dev script copies it to `%LOCALAPPDATA%` on first run.
- Packaging an installer (likely electron-builder) is decided when the installer leaves "Later".
- Moving to Vite+ later doesn't change the structure, since its config is a superset of Vite's.

Research: [research/spike-03-build-tool.md](../../research/spike-03-build-tool.md).
