# Electron as the desktop framework

Hone is a desktop app built with Electron rather than Tauri. We chose TypeScript end to end and the same stack as VS Code and Obsidian: `node-pty` and xterm for the terminal, which already worked in the prototype, plus direct access to the Node ecosystem. We accept a heavier app with higher memory use than Tauri, and avoid adding Rust as a second language.
