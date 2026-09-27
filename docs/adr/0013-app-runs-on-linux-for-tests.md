# The app also runs on Linux, so end-to-end tests run without Windows

The app's main process launches the host with `wsl.exe` on Windows and as a plain local `node` process on Linux. Everything else (WebSocket, protocol, host, renderer) is the same on both. We did it so Sandcastle, which runs in a Linux Docker container, and CI can open the real app with Playwright under xvfb and test the UI end to end. We rejected testing only the host and isolated components with Vitest, because then no automatic check would show that the UI works, and agents would build it blind.

## Consequences

- End-to-end tests run the built app (`pnpm build`), not `pnpm dev`, and replace `dialog.showOpenDialog` from the main process, since Playwright can't drive native dialogs.
- The Windows-only code isn't covered by automatic tests: launching the host through `wsl.exe`, resolving Node's path in WSL, converting `\\wsl.localhost` paths and the `/mnt/` warning. It stays small and is checked by hand in QA.
- Playwright's Electron support is experimental and unverified on Electron 44. On Ubuntu 24 runners it needs `kernel.apparmor_restrict_unprivileged_userns=0`, and `ELECTRON_RUN_AS_NODE` must be unset.
- This is not Linux support for users (roadmap "Later"), but it moves Hone toward it (ADR 0004).
