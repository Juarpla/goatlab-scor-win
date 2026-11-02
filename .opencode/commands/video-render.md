---
description: Render a GoatLab Short with the video-render skill
agent: build
---

Call skill({ name: "video-render" }) and follow its steps in order to handle $ARGUMENTS.

Start with Step 1 (choose the match) unless the request already includes the match and audio. Do not guess the match from a numbered audio: identify it from the voice before rendering.
