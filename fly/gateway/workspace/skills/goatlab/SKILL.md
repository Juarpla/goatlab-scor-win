---
name: goatlab
description: GoatLab Shorts. Handles the /goatlab Telegram message: list current matches, send all 10 scripts at once, accept voice notes in order, and start each Short's render as soon as its voice note arrives.
---

# GoatLab Shorts (`/goatlab`)

Always reply to the user in Spanish. The user writes in Spanish. Script
narrations are already Spanish and must be copied verbatim. Do not answer in
English, even though these instructions are in English.

Everything happens in the same Telegram chat. Scripts live at
`/home/node/goatlab/public/data/youtube-scripts/<matchId>.json`
(`scripts[].n`, `scripts[].title`, `scripts[].hook`, `scripts[].narration`, `scripts[].words`).

There is no support button row. There are no text commands to view a script,
replace a take, ask for status, stop early, confirm, or request a render.
If the user types those words, they are ordinary text and trigger nothing.

## Flow

0. **`/start` (entry)**: on `/start`, drop all series state (`matchId`,
   `audios`) — a full wipe, even mid-series — and send a welcome with a
   single button: `⚽ Goatlab` (same as `/goatlab`, starts at step 1). That
   button is the only `presentation.blocks[type=buttons]` in the flow. Any
   other text after `/start` follows the normal free-form flow.
   (OpenClaw cannot map `/start` to `/new` in config, so the reset is
   logical: ignore everything before it; compaction purges it.)

1. **List current matches**: show a numbered list with `match`, `competition`,
   and `kickoff`. If there are no files, say so in Spanish and stop. No buttons.

2. **Pick a number**: the user replies with the number. Confirm the match
   (`matchId`). Before sending any script, choose the photos once. Say one
   short line in Spanish: *"Estoy eligiendo las fotos de este partido."*
   Then, with `exec`, once, from the repo root:
   `cd /home/node/goatlab && git pull --ff-only && node scripts/generate-media-pack.mjs --match=<matchId> --out=/data/media-pack`
   The process inherits `PEXELS_API_KEY`, `PIXABAY_API_KEY` and
   `OPENCODE_GO_API_KEY`. Do not put keys on the command line. Do not search
   the web yourself and do not pick photo URLs. If the command exits non-zero,
   say in Spanish that this match does not have enough photos and stop. Do
   not send the scripts and do not ask for voice notes.
   If it exits zero, send all **10 scripts at once** (`narration` verbatim, for
   reading aloud), numbered 1 to 10, split across 2-3 messages of ≤3500
   characters. Head the first message with this short instruction, in Spanish:
   *"Lee y graba en orden, uno tras otro, sin esperar. Manda los 10 audios."*
   No buttons.

3. **Receive voice notes in order**: the user sends them one after another
   without waiting for a reply. Do not transcribe the note. Reply with ONLY
   a minimal ack: `✅ 3`. The worker compares team names and numbers against
   the script that matches **by order** (audio k ↔ script k). If they do not
   match, the worker itself sends `❓ ¿este era el guion 3?` before it
   renders. The audio still advances: there is no take replacement. No
   buttons and no per-audio summary.

   Right after the ack for audio k, start that Short's render. Do not wait
   for the other audios and do not wait for the render. With `exec`, once:
   `curl -s -X POST "$WORKER_URL/render"`
   `-H "Authorization: Bearer $RENDER_SECRET"` with JSON
   `{chatId, matchId, variant, matchLabel, title, hook, narration, camera, audioFileId, photos, subjects}`
   (`variant` = k - 1, the index of script k; `chatId` = the current chat;
   `title` / `hook` / `narration` from that script (`scripts[].title` and
   `scripts[].hook`); `matchLabel` is `home` contra `away` from the same
   file; `photos`, `subjects` and `camera` from
   `/data/media-pack/<matchId>.json` → `sequences[variant]`;
   do not send `attribution`, hashtags or the YouTube description.
   `WORKER_URL=https://goatlab-render.fly.dev`; `RENDER_SECRET` from the
   environment). The worker renders the fixed HyperFrames template. Do not
   pick another engine. The `202 {jobId}` reply needs no follow-up: do not
   poll `/jobs`. The worker queues the renders, sends each MP4 to the chat
   via `sendVideo`, and sends `❌ Short k: …` itself if one fails. Repeating
   the same POST is harmless: the worker returns the same job.

4. **Close**: when audio 10 arrives (and its render has been posted), the
   series closes by itself. Say `Serie completa`. Nothing else: no confirm
   button, no status board, no polling.

## Resume after hours

If the user returns after a long pause (the machine may have stopped itself),
do nothing special: the gateway wakes on its own and the session restores
from the volume. Do not send a status board. The next voice note continues
the sequence where it left off. Audio `file_id`s stay valid (they live in
Telegram, not on disk).

## Rules

- Per-chat state: `{matchId, audios: {n: fileId}}`. Voice notes enter in
  order, 1 through 10. None are skipped or replaced.
- A voice note with no active series → ask for `/goatlab` first, in Spanish.
- A number mid-series does not switch matches; the next voice note is the
  one due by order.
- Words such as ver guion, repetir, estado, basta, listo, terminar, sí,
  video, or render do not close, confirm, correct, or start the worker.
  Treat them as ordinary text.
- No buttons during the list, the scripts, the acks, or the render.
- No automatic session reset (manual control via `/start`, which wipes the
  series; a half-finished series is kept until `/start`).
- No odds, no result guarantees. CTA is always `goatlab.win`.
