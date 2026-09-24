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
   alta) con la botonera completa (ver tabla).
3. **Lee en cualquier orden**: el usuario lee el guion que quiera y manda su
   audio. No exijas orden ni lectura literal: dirá muletillas, repetirá
   frases y cambiará palabras.
4. **Match aproximado por contenido**: transcribe el audio, normalízalo
   (minúsculas, sin puntuación, fuera muletillas y repeticiones) y compáralo
   con las 10 `narration` por **anclas distintivas** (equipos + números, que
   casi seguro dirá igual). Elige el más parecido; si el parecido es bajo,
   **no adivines**: pregunta `¿qué número era?`. Confirma siempre:
   *"esto fue el guion N, ¿ok?"* con botones `✅ Sí` `❌ Es otro`
   (si es otro, pide el número).
5. **Avanza**: tras confirmar, envía el siguiente guion pendiente con sus
   botones. Si era el último: `Serie completa 🎉` + resumen.

## Botones y comandos (misma acción)

Cada mensaje del bot lleva la botonera completa: no hay nada que memorizar.

| Botón | Comando escrito | Qué hace |
|---|---|---|
| ⏭ Saltar | `saltar` | Pasa al siguiente sin audio (queda pendiente) |
| 👁 Ver guion | `ver guion` | Reenvía el guion en curso |
| 🔁 Otra toma | `otra toma` | Descarta el último audio, espera regrabación |
| 📦 Todos | `todos` | Vuelca los restantes de golpe |
| 📊 Estado | `estado` | Recibidos vs pendientes de la serie |
| 📄 Nueva sesión | `nueva sesión` | Cierra lo actual y empieza de cero (ver tabla) |
| ⏹ Basta | `basta` | Cierra la serie con resumen |
| ✅ Sí / ❌ Es otro | `sí` / `es otro` | Confirma o corrige el match del audio |

Los botones se mandan como `presentation.blocks[type=buttons]` del message
tool (callbacks). Los comandos escritos son el fallback.

## 📄 Nueva sesión (comportamiento)

| Situación | Respuesta |
|---|---|
| Sin serie activa | "Nada que resetear: no hay serie en curso." No cambia nada |
| Serie a medias | Cierra con resumen (recibidos vs pendientes, quedan guardados) y resetea |
| Serie terminada | Resetea directo, listo para la próxima tanda |

Nada se pierde en silencio. Equivale al comando nativo `/new`.

## Reglas

- Estado por chat: `{matchId, audios: {n: fileId}, pendientes: [n]}`.
- Audio sin serie activa → pide `/goatlab` primero.
- Número a mitad de serie → no cambia de partido; recuerda en qué guion estás.
- Sin reset automático de sesión (decisión del usuario: control manual con
  📄 Nueva sesión; las series a medias se conservan).
- Cero cuotas, cero garantías de resultado, CTA siempre a `goatlab.win`.
- El render del video llega en F6: no prometas MP4 todavía.
