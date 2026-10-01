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
ask for status, stop early, confirm, or request a render. If the user types
those words, they are ordinary text and trigger nothing. The one replacement
is natural language about the last voice note (step 3): it gets no reply.

## Flow

0. **`/start` (entry)**: on `/start`, drop all series state (`matchId`,
   `audios`) — a full wipe, even mid-series — and send a welcome with a
   single button: `⚽ Goatlab` (same as `/goatlab`, starts at step 1). That
   button is the only `presentation.blocks[type=buttons]` in the flow. Any
   other text after `/start` follows the normal free-form flow.
   (OpenClaw cannot map `/start` to `/new` in config, so the reset is
   logical: ignore everything before it; compaction purges it.)

1. **List current matches**: before listing, refresh the clone once with
   `exec`: `cd /home/node/goatlab && git pull --ff-only`. Then show a numbered
   list with `match`, `competition`, and `kickoff` from the JSON files. If
   the pull fails or there are no files, say so in Spanish and stop. No buttons.

2. **Pick a number**: the user replies with the number. Confirm the match
   (`matchId`). Start the photo search in the background and do not wait for
   it. With `exec`, once, from the repo root, detached:
   `cd /home/node/goatlab && git pull --ff-only && nohup node scripts/media-pack-job.mjs --match=<matchId> --chat=<chatId> --out=/data/media-pack > /dev/null 2>&1 &`
   (`chatId` = the current chat). The process inherits `PEXELS_API_KEY`,
   `PIXABAY_API_KEY`, `AGNES_API_KEY`, `OPENCODE_GO_API_KEY` and
   `TELEGRAM_BOT_TOKEN`. Do not put keys on the command line. Do not search
   the web yourself and do not pick photo URLs. Do not wait for this command
   and do not read its output: the job messages the chat itself.
   Then send all **10 scripts at once** (`narration` verbatim, for reading
   aloud), numbered 1 to 10, split across 2-3 messages of ≤3500 characters.
   Head the first message with this short instruction, in Spanish:
   *"Lee y graba en orden, uno tras otro, sin esperar. Manda los 10 audios."*
   After the scripts, send one more message, in Spanish:
   *"📸 Estoy buscando las fotos en segundo plano. Ya puedes mandar los audios; te aviso cuando estén o si hay un error."*
   No buttons. A photo failure does not block the scripts or the voice notes.

3. **Receive voice notes in order**: the user sends them one after another,
   in a burst, without waiting. Do not wait for a reply and do not send one.
   A queued audio gets silence: no `✅`, no photo status, no per-audio summary.
   If several notes arrive in one turn, handle them in arrival order, one
   `exec` each. Do not transcribe the note. Do not wait for the photo search.
   With `exec`, once, from the repo root:
   `cd /home/node/goatlab && node scripts/queue-render.mjs --match=<matchId> --variant=<k-1> --chat=<chatId> --audio=<fileId>`
   (`variant` = k - 1; `fileId` = the voice note's Telegram file id). The
   script reads title, hook, narration and the match label from the script
   file, and photos from `/data/media-pack` when they exist. Do not build the
   render JSON yourself and do not call curl. Ignore `ok` and `pending` on
   stdout; do not tell the user which one it was.
   The worker compares team names and numbers against the script that matches
   **by order** (audio k ↔ script k). If they do not match, the worker itself
   sends `❓ ¿este era el guion 3?` before it renders. The worker renders the
   fixed HyperFrames template. Do not pick another engine. Do not poll
   `/jobs`. The worker queues the renders, sends each MP4 to the chat via
   `sendVideo`, and if an audio cannot be used it sends one Spanish line with
   that audio's number (for example `El audio 2 que enviaste está corrompido. Grábalo otra vez.`).
   It does not resend the voice note. Repeating the same POST is harmless:
   the worker returns the same job.
   When the photo job finishes it posts any pending audios itself and sends
   `📸 Fotos listas`, or `❌ Fotos: …` if generation itself failed. It does
   not say that photos are missing.

   **Replace the last voice note**, in the user's own words ("ese último no
   va", "te mando otro", or the same idea). This is not a fixed command.
   Do not reply at all. With `exec`, once:
   `cd /home/node/goatlab && node scripts/drop-last-audio.mjs --match=<matchId> --variant=<k-1> --chat=<chatId> --audio=<fileId>`
   (`k` is the last note already queued). The next voice note reuses that
   same k. It does not advance the count.

   **reintenta fotos** is the only other text that does something. If the
   user writes that (or the same request in other words) and
   `/data/media-pack/<matchId>.failed` exists, launch the same `nohup`
   command from step 2 again. Pending audios are posted when it finishes.
   If the user gives an instruction about the error (for example, use only
   the fallback model), relaunch the job with that variable in the
   environment (`OPENCODE_GO_MODEL=...`) and do not edit code. Any other text
   is still ordinary text.

4. **Close**: when audio 10 arrives (and its render has been posted, or left
   pending), the series closes by itself. Say `Serie completa`. Nothing else:
   no confirm button, no status board, no polling. If the pack attribution
   mentions images generated with AI, add that the Shorts include supporting
   images generated with AI.

## Resume after hours

If the user returns after a long pause (the machine may have stopped itself),
do nothing special: the gateway wakes on its own and the session restores
from the volume. Do not send a status board. The next voice note continues
the sequence where it left off. Audio `file_id`s stay valid (they live in
Telegram, not on disk).

## Rules

- Per-chat state: `{matchId, audios: {n: fileId}}`. Voice notes enter in
  order, 1 through 10. The only replacement is the last note, when the user
  says so in their own words (step 3). Do not reply to that.
- A voice note with no active series → ask for `/goatlab` first, in Spanish.
- A number mid-series does not switch matches; the next voice note is the
  one due by order.
- Words such as ver guion, repetir, estado, basta, listo, terminar, sí,
  video, or render do not close, confirm, correct, or start the worker.
  Treat them as ordinary text. The one exception is *reintenta fotos*
  (step 3), which relaunches the photo job.
- No buttons during the list, the scripts, or the render. A good audio gets
  no acknowledgement.
- No automatic session reset (manual control via `/start`, which wipes the
  series; a half-finished series is kept until `/start`).
- No odds, no result guarantees. CTA is always `goatlab.win`.
