---
name: goatlab
description: GoatLab Shorts. Responde al mensaje /goatlab en Telegram: lista los partidos vigentes, envía los 10 guiones de una vez, recibe los audios en lote con acuses mínimos, pide confirmación única y renderiza.
---

# GoatLab Shorts (`/goatlab`)

Todo en el mismo chat de Telegram. Los guiones viven en
`/home/node/goatlab/public/data/youtube-scripts/<matchId>.json`
(`scripts[].n`, `scripts[].hook`, `scripts[].narration`, `scripts[].words`).

## Flujo

0. **`/start` (puerta de entrada)**: al recibir `/start`, descarta todo estado
   de serie (`matchId`, `audios`, `pendientes`) — borrado total, incluso a
   mitad de serie y sin confirmar — y responde la bienvenida con la botonera
   de flujos: `⚽ Goatlab` (equivale a `/goatlab`, arranca en el paso 1).
   Cualquier otro texto tras `/start` sigue el flujo libre normal.
   (Nota: OpenClaw no permite mapear `/start` a `/new` por config, así que el
   reseteo es lógico: se ignora todo lo anterior; la compactación lo purga.)

1. **Lista vigentes**: muestra la lista numerada con `match`, `competition` y
   `kickoff` (como hasta ahora). Si no hay archivos, dilo y termina.
2. **Elige número**: el usuario responde con el número. Confirma el partido
   (`matchId`) y envía los **10 guiones de una vez** (`narration` tal cual,
   para leer en voz alta), numerados del 1 al 10, repartidos en 2-3 mensajes
   de ≤3500 caracteres. Encabeza el primero con instrucciones cortas, p. ej.:
   *"Lee y graba en orden, uno tras otro, sin esperar. Si una toma sale mal,
   escribe `repetir` y manda la nueva. Cuando termines escribe `listo`."*
   Adjunta la botonera de apoyo (ver tabla).
3. **Recibe audios en lote**: el usuario manda sus audios en orden, sin
   esperar respuesta. Por cada audio: transcribe, normaliza (minúsculas, sin
   puntuación, fuera muletillas y repeticiones) y verifica anclas distintivas
   (equipos + números) contra el guion que le toca **por orden**
   (audio k ↔ guion k). Responde SOLO un acuse mínimo: `✅ 3`. Si las anclas
   no cuadran, `✅ 3 ❓ ¿este era el guion 3?` y sigue. Nada de botoneras ni
   resúmenes por audio: lo importante es no frenar al usuario.
   (Si antes del audio llegó `repetir` o `repetir N`, el audio reemplaza al
   indicado en vez de avanzar — ver paso 4.)
4. **`repetir` (cambiar una toma)**: bare (`repetir`) = reemplaza el último
   audio recibido; con número (`repetir 5`) = reemplaza el 5. Responde
   *"Dale, manda la nueva toma del N"* y el siguiente audio lo reemplaza
   (no suma). El botón 🔁 equivale a `repetir` (el último).
5. **Cierre y resumen único**: al recibir `listo` (= `basta` = `terminar`) o
   al llegar los 10 audios: `Serie completa 🎉` + tabla de estado
   (`1 ✅ 2 ✅ … 5 🔁 …`) + botones `✅ Todo bien` `🔁 Repetir uno`.
   `✅ Todo bien` (o `sí`) → paso 6. `🔁 Repetir uno` → pide el número
   (o asume el último si no lo da) → vuelve a este resumen al recibir la
   nueva toma. Con `basta` a mitad se cierra con lo recibido hasta ahí.
6. **🎬 Render**: al confirmar el resumen ofrece
   *"¿renderizo los N videos con tus audios? 🎬"*. Si acepta, o si pide
   `video`/`render` en cualquier momento, por cada guion con audio:
   1. Crea el heartbeat: `touch /data/.busy` (vía `exec`). Esto impide que el
      supervisor apague la máquina durante el render.
   2. Haz con `exec`: `curl -s -X POST "$WORKER_URL/render"`
      `-H "Authorization: Bearer $RENDER_SECRET"` con JSON
      `{chatId, matchId, variant, matchLabel, hook, audioFileId, photos}`
      (`chatId` = el chat actual; `matchLabel/hook/photos` del JSON del partido;
      `WORKER_URL=https://goatlab-render.fly.dev`, `RENDER_SECRET` del entorno).
   3. Responde `202 {jobId}`: sondea `GET $WORKER_URL/jobs/<id>` cada ~60s hasta
      `done` (el MP4 llega solo al chat por `sendVideo`) o `error` (muestra el
      mensaje). Un render a la vez: encola de uno en uno.
   4. Al terminar **todos** los renders: `rm /data/.busy` (vía `exec`).

## Retomada tras horas

Si el usuario vuelve después de un rato largo (la máquina puede haberse
apagado sola), no hace nada especial: el gateway despierta solo y la sesión
se restaura del volumen. Simplemente responde con el `📊 Estado` de la serie
en curso y continúa desde donde quedaron. Los `file_id` de los audios siguen
válidos (viven en Telegram, no en disco).

## Botones y comandos (misma acción)

Cada mensaje del bot lleva la botonera de apoyo: no hay nada que memorizar.
Durante la grabación los acuses son solo texto (`✅ N`) para no frenar.

| Botón | Comando escrito | Qué hace |
|---|---|---|
| 👁 Ver guion | `ver guion [N]` | Reenvía el guion en curso (o el N) |
| 🔁 Repetir | `repetir [N]` | La siguiente toma reemplaza la última (o la N) |
| 📊 Estado | `estado` | Recibidos vs pendientes de la serie |
| ⏹ Basta | `basta` / `listo` / `terminar` | Cierra la serie con resumen único |
| ✅ Todo bien / 🔁 Repetir uno | `sí` / `repetir [N]` | Confirma el resumen o corrige una toma |

Los botones se mandan como `presentation.blocks[type=buttons]` del message
tool (callbacks). Los comandos escritos son el fallback.

## Reglas

- Estado por chat: `{matchId, audios: {n: fileId}, pendientes: [n],
  reemplazoPendiente: n|null}`. Un guion sin audio queda pendiente (no hace
  falta saltarlo: simplemente no se manda).
- Audio sin serie activa → pide `/goatlab` primero.
- Número a mitad de serie → no cambia de partido; recuerda en qué van.
- Todo mensaje con botones incluye el bloque
  `presentation.blocks[type=buttons]`; tras mandar una confirmación o el
  resumen, cierra el turno sin más razonamiento para que los toques lleguen
  a un turno vivo. Si el usuario dice que un botón murió o manda texto tras
  una confirmación, reenvía el mensaje con botones frescos.
- Sin reset automático de sesión (decisión del usuario: control manual con
  `/start`, que hace borrado total; las series a medias se conservan mientras
  no se pida `/start`).
- Cero cuotas, cero garantías de resultado, CTA siempre a `goatlab.win`.
