---
name: quick-close
description: Ends a study session without asking, saving its record as a draft in progress-inbox.md for review at the next session. Use when the user wants to close quickly.
---

# Quick close

Save this session's record as a draft, without asking the user anything, so they can leave right away. The next session offers to review it.

1. Build the draft from this session: the conversation and the files written in it. A current state (where things stand, next steps, open questions), starting from the one in `PROGRESS.md` if it exists and updated with what changed, and a session entry (what was learned, done, and hard). Record what happened, in short bullets; leave out a line with nothing to say.
2. Append it to `progress-inbox.md`, in the project's folder next to its `AGENTS.md`, under a heading with today's date and time (run `date` if you don't have them). Create the file if it doesn't exist. Leave `PROGRESS.md` as it is. Write in the language set in the project's `.hone/inherited.md`, headings included.

   ```markdown
   # Progress inbox

   ## Draft YYYY-MM-DD HH:MM

   ### Current state

   - **Where things stand:** ...
   - **Next steps:** ...
   - **Open questions:** ...

   ### Session

   - **Learned:** ...
   - **Done:** ...
   - **Hard:** ...
   ```

3. Reply in a line or two: the draft is in `progress-inbox.md` and will be offered for review next session. If during the session you noticed something about how the user learns or works that `.hone/inherited.md` doesn't say, add one line suggesting they tell the generator.
