# QA visual de motion graphics (OpenClaw)

Tras el render y antes de Telegram, OpenClaw evalúa calidad profesional cinematográfica.

## Capa 1 — determinística (script, 10 clips)

`node scripts/check-motion-frames.mjs [--match=<id>]` valida el sistema carbon-v1
y genera `public/data/motion-qa-manifest.json` con los frames a revisar por prompt
(settled = fin de build, mid = mitad de main). Falla si: más de 4 signature moves
en el banco, prompts sin `design_rationale`, o cualquier error del gate estricto.

## Capa 2 — visión (los 10 clips en 2 mosaicos, no muestra)

OpenClaw deriva los tiempos del plan que acaba de montar por clip
(`settled = at + duration * 0.7`, `mid = at + duration * 0.4` por motion graphic) y genera:

`node scripts/motion-contact-sheet.mjs --tag=<matchId> --out=<dir> --shots "clip1.mp4@s,m;..."`

Sale en segundos: `sheet-settled.jpg` + `sheet-mids.jpg` (hasta 12 clips por mosaico).
La visión evalúa los 10 de una vez: overflow 1080x1920, safe-area (top 220 /
bottom 420 libres), contraste lima-sobre-carbón, legibilidad de `emphasis_words`,
subtítulos sin solape, look premium cinematográfico.
Zoom puntual: si el mosaico marca un clip, `--zoom=<clip.mp4@t>` lo mira a tamaño
completo en 1 llamada extra. La muestra (hero + 1 azar) queda solo como respaldo
si el presupuesto de visión aprieta.
Lo sistemático (tokens, fondos, tamaños) se corrige una vez y vale para los 10;
lo del clip (nombres largos, 8 filas) solo en su clip (ver Capa 3).

## Capa 3 — auto-ajuste (máx 2 pasadas por clip)

Causa compartida → ajusta `motion-system`/tokens y re-renderiza afectados.
Causa del clip → `plan.tweaks` (`captionBottom`, `fontScale`, `compact`) y
re-renderiza ese clip. Si persiste tras 2 pasadas, publica con reporte, nunca
bloquea los 10 por 1.
