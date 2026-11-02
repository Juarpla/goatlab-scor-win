---
description: Render a GoatLab Short with the video-render skill
agent: build
---

Call skill({ name: "video-render" }) and follow its steps in order to handle $ARGUMENTS.

Start with Step 1 (choose the match) unless the request already includes the match and audio. Do not guess the match from a numbered audio: identify it from the voice before rendering.

When there are no arguments, Step 1 must be visible: run `node scripts/list-media-packs.mjs` and paste the full table in the chat (numbered, sorted by kickoff UTC, with match, date, images, clips, audio and id). The script reads the same `public/data/top.json` the website serves and drops matches that already started. Do not summarize it, do not rebuild it from memory and do not start rendering until the user picks a number or an id.

After the user picks a match, run `node video-render/cli/audio.mjs prepare <id>` immediately, show the folder path and stop. Do not continue until the user confirms the audio is in place. Then run `node video-render/cli/audio.mjs check <id>`; only if it prints `audio: listo:` continue with the rest of the skill (identify the audio, plan and render).
