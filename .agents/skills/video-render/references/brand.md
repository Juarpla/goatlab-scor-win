# GoatLab identity

Fixed identity for final videos. Creative decisions belong to
[creative.md](creative.md); implementation belongs to [remotion.md](remotion.md).

- Name: **GoatLab**. Written domain: `goatlab.win`.
- Primary accent: `#c5ed74`. Closing background: `#101412`.
- Captions: `#ffe14a` fill and a black outline, including the active word.
  Size, grouping, placement and animation follow the edit.
- Logo: `video-render/render/remotion/assets/brand.svg`, derived from the website
  favicon. Use this asset rather than generating a replacement.
- Closing: the engine adds the logo and domain for one second. The authored
  component covers only the content and does not draw a second endcard.
- Music: mandatory (`plan.music: true`), from `video-render/soundtracks/bed.mp3`.
  Credits are in `bed.txt`; the engine mixes the bed with the normalized voice.
- Font: the engine loads the local file as `GoatLabLocal`; see the technical
  authoring contract for its use.

Credits and illustration disclosures follow
[COMPLIANCE.md](../../../../COMPLIANCE.md).
