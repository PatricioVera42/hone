# Spike 4: noticing files an agent writes

Roadmap spike item 4: does the host notice files written by an agent inside WSL fast enough for the editor to show them immediately? Run on 2026-09-26, WSL2 Ubuntu 24.04, ext4, Node 24.19. Throwaway code in `~/hone-spike/watch`.

## Answer

Yes. On the WSL disk, every watcher tested sees a write within milliseconds. Add spike 1's ~1 ms WebSocket hop and the editor can show an agent's change well under the ~100 ms that reads as instant. Recommendation: chokidar 5 with `node_modules`, `.git` and agents' temporary files ignored, and `atomic: false`.

## Latency by watcher

A tree of 5,000 notes in 50 folders. Median of 10 runs per case, measured from just before the write to the event.

| Case | `fs.watch` recursive (Node) | chokidar 5.0.0 | @parcel/watcher 2.6.0 |
|---|---|---|---|
| New file | 0.8 ms | 1.6 ms | 51.3 ms |
| Modify existing file | 1.2 ms | 7.5 ms | 51.6 ms |
| Atomic write (temp file, then rename) | 0.5 ms | 2.1 ms | 51.6 ms |
| New nested folder with a file | 2.9 ms | 7.6 ms | missed 1 of 10 |
| Delete | 0.5 ms | 101.4 ms (default `atomic`) | 51.7 ms |
| Write from another process (`bash`) | 6.3 ms | 11.2 ms | 58.4 ms |
| Burst of 500 files from `bash` | all seen, last at 64 ms | all seen, last at 211 ms | all seen, last at 131 ms |
| Ready on 5,000 files | 110 ms | 755 ms | 122 ms |

@parcel/watcher batches events every ~50 ms and once missed a file inside a new folder, so it's out. chokidar's 100 ms on deletes comes from its default `atomic` option, which delays deletes to recognize editors' atomic saves. With `atomic: false` a delete arrives in 2.8 ms.

## Findings

1. **Claude Code writes atomically.** Its Write and Edit tools create `name.tmp.<pid>.<hex>`, rename it onto the target, and the temporary name disappears. A watcher logging each event saw every step 3 to 18 ms after the file's modification time. Hone must ignore those temporary names and treat the rename as a change to the target. `atomic: false` is safe here because Hone ignores the temporaries itself.
2. **Events arrive in bursts.** One agent save produced 4 to 6 events. The host should collapse events per path over a short window (a few milliseconds up to one frame) before notifying the app, so the editor reloads once.
3. **Files on the Windows disk aren't watchable from WSL.** `fs.watch` on a folder under `/mnt/c` saw no events, whether the write came from Linux or from Windows (`cmd.exe`). A workshop must live on the WSL disk. Hone should say so when a user opens one under `/mnt/`.
4. **Code projects inside a workshop need ignores.** A workshop can hold a code project with a large `node_modules`. With 20,000 folders under it:
   - **`fs.watch` recursive** takes 656 ms to set up and blocks the host while it does, because it adds one inotify watch per folder. It has no ignore option.
   - **chokidar**, with `node_modules` and `.git` ignored, is ready in 29 ms.
   - **@parcel/watcher**, with the same ignores, is ready in 97 ms.

   `fs.watch` is the fastest per event, but it can't skip folders. That decides for chokidar.
5. **inotify limits are not a concern here:** `max_user_watches` is 1,048,576 and `max_user_instances` 8,192 on this machine. With ignores, a workshop uses one watch per folder of notes and projects.

## Recommended host setup

```ts
chokidar.watch(workshopRoot, {
  ignoreInitial: true,
  atomic: false,
  ignored: (p) => /(^|\/)(node_modules|\.git)(\/|$)/.test(p) || /\.tmp\.[^/]*$/.test(p),
});
```

Then collapse events per path over a short window and send one JSON-RPC notification per changed file.

## Not tested

- Other agents' write patterns (OpenCode, editors such as Vim or VS Code writing into the workshop).
- Workshops with hundreds of thousands of files.
- Renaming or moving a whole folder with open files in the editor.
