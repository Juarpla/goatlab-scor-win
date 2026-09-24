---
name: goatlab
description: GoatLab Shorts. Responde al mensaje /goatlab en Telegram: lista los partidos vigentes, envía los guiones uno a la vez con botones (saltar, ver guion, otra toma, todos, estado, basta) y recibe las notas de voz.
---

# GoatLab Shorts (`/goatlab`)

Todo en el mismo chat de Telegram. Los guiones viven en
`/home/node/goatlab/public/data/youtube-scripts/<matchId>.json`
(`scripts[].n`, `scripts[].hook`, `scripts[].narration`, `scripts[].words`).

## Flujo

1. **Lista vigentes**: muestra la lista numerada con `match`, `competition` y
   `kickoff` (como hasta ahora). Si no hay archivos, dilo y termina.
2. **Elige número**: el usuario responde con el número. Confirma el partido
   (`matchId`) y envía el **guion 1** (`narration` tal cual, para leer en voz
   alta) con botones: `⏭ Saltar` `👁 Ver guion` `📦 Todos` `📊 Estado` `⏹ Basta`.
3. **Lee en cualquier orden**: el usuario lee el guion que quiera y manda su
   audio. No exijas orden.
4. **Match por contenido**: transcribe el audio y compáralo con las 10
   `narration` del partido. Confirma: *"esto fue el guion N, ¿ok?"* con
   botones `✅ Sí` `❌ Es otro` (si es otro, pide el número).
5. **Avanza**: tras confirmar, envía el siguiente guion pendiente con sus
   botones. Si era el último: `Serie completa 🎉` + resumen.

## Botones y comandos (misma acción)

| Botón | Comando escrito | Qué hace |
|---|---|---|
| ⏭ Saltar | `saltar` | Pasa al siguiente sin audio (queda pendiente) |
| 👁 Ver guion | `ver guion` | Reenvía el guion en curso |
| 🔁 Otra toma | `otra toma` | Descarta el último audio, espera regrabación |
| 📦 Todos | `todos` | Vuelca los restantes de golpe |
| 📊 Estado | `estado` | Recibidos vs pendientes de la serie |
| ⏹ Basta | `basta` | Cierra la serie con resumen |
| ✅ Sí / ❌ Es otro | `sí` / `es otro` | Confirma o corrige el match del audio |

Los botones se mandan como `presentation.blocks[type=buttons]` del message
tool (callbacks). Los comandos escritos son el fallback.

## Reglas

- Estado por chat: `{matchId, audios: {n: fileId}, pendientes: [n]}`.
- Audio sin serie activa → pide `/goatlab` primero.
- Número a mitad de serie → no cambia de partido; recuerda en qué guion estás.
- Cero cuotas, cero garantías de resultado, CTA siempre a `goatlab.win`.
- El render del video llega en F6: no prometas MP4 todavía.
