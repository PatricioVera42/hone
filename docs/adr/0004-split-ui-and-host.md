# The UI and the host run as separate processes

Hone is split like VS Code's WSL mode: the window (Electron, running on Windows) talks to a host process that owns the file system and the terminals and runs where the files live (inside WSL). We rejected running a Linux build through WSLg (less native on Windows) and a Windows app reading files over `\\wsl.localhost` (slow cross-system file access, and the editor must see files the agent writes immediately). The cost is a protocol between the two processes and installing the host inside WSL.

## Consequences

- The host can also run on the same machine as the window, so Hone is designed to run on Linux, macOS and Windows without WSL. Windows + WSL is the first target; the rest ships as "untested" until someone tests it.
