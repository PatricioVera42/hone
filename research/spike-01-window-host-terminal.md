# Spike 1: Electron window, WSL host and terminal over WebSocket

Roadmap spike item 1: can an Electron window on Windows open a `node-pty` terminal in a host inside WSL, over WebSocket? Run on 2026-09-26 on the maintainer's machine (Windows 11, WSL2 Ubuntu 24.04, `.wslconfig` with `networkingMode=mirrored`). The throwaway code lives outside the repo (`~/hone-spike/host` in WSL, `C:\Users\verap\hone-spike\app` on Windows).

## Answer

Yes. Typing in the window feels like a native terminal. Colors, the Oh My Posh prompt and resizing work. The architecture in ADRs 0004 and 0007 holds.

## Setup

- **Host (WSL):** Node 24.19, `node-pty` 1.1.0, `ws` 8.22.0. A WebSocket server on `127.0.0.1` with a random port and a token check. One `bash -l` PTY per connection. Minimal JSON-RPC 2.0: `terminal.write` and `terminal.resize` requests, `terminal.data` notifications. It prints `READY <port>` on stdout.
- **App (Windows):** Electron 44.4.5, `@xterm/xterm` 6.0.0 and `@xterm/addon-fit` 0.11.0. Main launches the host with `wsl.exe -e bash -ic "... node host.js"`, reads the port from stdout, and hands port and token to the renderer through a preload. Default `webPreferences`: context isolation and sandbox on, Node integration off.

## Measurements

| What | Result |
|---|---|
| Keystroke to echo, Windows → WSL → Windows | median 2.0 ms, max 46.1 ms (272 keystrokes, typed by hand) |
| Keystroke to echo, inside WSL only (Node client) | median 1.1 ms, max 1.4 ms (20 samples) |
| Host process start to `READY` | 63 ms |
| App launch to host ready, including `wsl.exe` and `bash -ic` | 1083–1297 ms |
| First command in a fresh shell | about 1 s, spent loading the user's `.bashrc` (nvm, Oh My Posh) |

The WebSocket hop across Windows and WSL adds about 1 ms. Startup time is dominated by the shells, not by Hone.

## Findings

1. **Node may not be on the PATH that `wsl.exe` sees.** With nvm, `wsl.exe -e bash -lc "command -v node"` finds nothing, and `bash -ic` finds it: nvm only loads in interactive shells. `bash -ic` works, but it's slow (it runs the whole `.bashrc`) and prints job-control warnings. Hone should resolve Node's path once, for example with `bash -ic 'command -v node'`, keep it, and launch the host with that absolute path. This affects roadmap stage 5 (host install), which assumes "the Node already installed there".
2. **A strict CSP breaks xterm.** With `style-src 'self'`, xterm fell back to a default font no matter what `fontFamily` it got, because it injects its own `<style>` element. With `style-src 'self' 'unsafe-inline'` it works. Scripts can stay strict. Allowing inline styles is the common trade-off: an inline style can't run code. Whether xterm supports a CSP nonce, a per-page token that would allow only its own `<style>`, is unverified. CodeMirror 6 also injects styles (assumption: it offers a nonce option; check in stage 1).
3. **Fonts must be bundled.** The user's Oh My Posh theme uses Nerd Font icons. A font installed from WSL lands in Linux (`~/.local/share/fonts`) and Windows apps can't see it. Bundling the font in the app and loading it with `@font-face` works. xterm measures glyphs when it opens, so the renderer must wait for `document.fonts.load(...)` first. Hone should ship a Nerd Font Mono (CaskaydiaCove, MIT per the Nerd Fonts project; assumption, check the license before bundling) as the default terminal font.
4. **Resizing needs its own message.** The fit addon sizes xterm to the window, and a `terminal.resize` request resizes the PTY. Without it, the shell wraps lines at the wrong width.
5. **Install scripts are blocked by default in npm 11.17 too**, not only in pnpm. `node-pty` needed `npm approve-scripts node-pty` before it compiled. On Linux it compiled from source with the preinstalled `build-essential`.
6. **Electron 44 doesn't download its binary on install.** `npx install-electron --no` fetched it, as [research/git-hooks-and-ci.md](git-hooks-and-ci.md) found.
7. **The token travels on the command line.** The spike passes it as an environment variable inside the `bash -ic` command, where other processes in WSL can see it in the process list. The real host should read it from stdin.

## Not tested

- WSL's default networking (NAT) instead of `mirrored`. The spike ran with `mirrored`, where `127.0.0.1` on Windows reaches the WSL host. Before release, test on a default `.wslconfig`.
- Several terminals at once, and a host that outlives a window reload. Each reload opened a new PTY, and the old one was killed when its socket closed.
- Full-screen programs such as `vim`, and high output volume (for example `cat` on a large file).
