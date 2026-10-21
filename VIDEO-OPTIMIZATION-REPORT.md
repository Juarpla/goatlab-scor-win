# Optimización del flujo de video y evaluación de revisión manual

Fecha: 21 de octubre de 2026.

## Punto de partida

En la prueba del 21 de octubre, un solo audio midió:

| Etapa | Tiempo |
|---|---:|
| Transcripción con Mistral | 3 s |
| Compilación, captura y codificación | 15 min 38 s |
| Extracción de 52 fotogramas (52 procesos FFmpeg) | 6 min 51 s |
| Revisión visual | 9 llamadas al modelo y un dictamen final |
| Autoría | varios minutos por timeouts, reintentos y una corrección |

## Contrato vigente

**Duración.** El único máximo editorial es 55 s, con el logo final incluido.
Render rechaza cualquier MP4 que lo supere. También exige voz AAC,
H.264 a 30 fps, 1080×1920 y menos de 45 MB.

**Revisión orientativa.** Una sola pasada de FFmpeg extrae 8 JPEG de 540×960
con una muestra fija, que incluye el cierre. Gateway hace **una** llamada visual
con razonamiento `low` y un presupuesto de 60 s por modelo. `approve` y `revise`
entregan ambos el mismo MP4. Si la revisión falla, la entrega se registra como
`reviewStatus: unavailable`, sin afirmar que hubo inspección. Ya no existe el
dictamen final ni las correcciones visuales automáticas.

**Autoría.** Usa razonamiento `high`, con 240 s por turno y 15 s de margen.
Hay un candidato inicial y una única corrección técnica (`MAX_CANDIDATES = 2`).
Un plan inválido admite dos intentos, y el segundo usa directamente GLM. El turno
recibe GoatLab y `goatlab.win` como datos oficiales (también en los props
`brandName`/`brandUrl`).

**Reintentos.** La admisión del turno admite un solo reintento si OpenClaw aún
no está listo. Antes de pasar al modelo de respaldo, se cancela el turno anterior
con `chat.abort`. Si no se confirma esa cancelación, no se abre otro turno.
Un fallo queda registrado en el archivo `.run` y no se repite dentro de la
misma instancia de Gateway.

**Render.** Usa Remotion 4.0.537 con codificación paralela, `x264Preset: veryfast`
y CRF 20. Comparte un solo navegador para la selección, el preflight y la captura.
Antes de la captura completa, comprueba tres fotogramas a escala 0.25 (inicio,
mitad y final del contenido). Así, un error de JSX, hooks o medios falla en
segundos y no después de capturar todo. FFmpeg queda limitado a dos hilos.

**Razonamiento.** `openclaw.json` declara `reasoning: true` y
`supportsReasoningEffort` con `low`/`high`/`max` para ambos modelos de OpenCode Go.
Cada turno envía `thinking` explícito. Conviene confirmar en el primer registro
real que OpenCode Go recibe `reasoning_effort` con el valor esperado.

**Verificación sin pruebas largas:**

- Las 584 pruebas unitarias pasan. Cubren muestreo, presupuestos de espera,
  cancelación antes del respaldo, revisión no disponible y ausencia de
  re-render ante sugerencias.
- Un render sintético local de 2 s con JSX produjo H.264 1080×1920.
- No se usaron audios reales ni llamadas a modelos.

**Pendiente de medir:** el tiempo real de captura con `veryfast` en la máquina
de Fly. Lo mostrará el campo `stages` del primer trabajo real (`capture`,
`mux`, `reviewFrames`).

## Evaluación: eliminar la revisión y/o la autoría

### Opción A — Quitar la revisión y conservar la autoría (recomendada)

Render valida duración, formato, audio y tamaño, y entrega directamente.
Tú revisas el video en Telegram.

- **Ahorro:** una llamada visual (hasta 60–75 s) y la extracción de fotogramas
  (ahora ~segundos). El mayor coste restante es la captura.
- **Cambio necesario (pequeño):** `directVideo` llama a `/render/approve` con
  `reviewPolicy: 'advisory'`, `reviewStatus: 'skipped'` y sin `reviewedFrames`.
  `approveCandidate` debe aceptar `skipped`, y Render puede omitir
  `extractReviewFrames`. Conviene una variable `VIDEO_REVIEW=off|advisory` para
  volver atrás sin desplegar código.
- **Se conserva:** la autorización por hash. No es un veto artístico, sino lo
  que impide entregar un MP4 distinto o de una versión reemplazada/cancelada.
- **Riesgo:** nadie detecta texto cortado antes de que llegue a Telegram. Hoy la
  revisión ya no bloquea, así que el riesgo real casi no cambia: solo se pierde
  la nota informativa.

### Opción B — Quitar también la autoría

Sin autoría, alguien tiene que decidir el montaje. Las alternativas son:

1. **Plantillas deterministas (planes 1–4 heredados).** Render ya las sabe
   ejecutar. Se generaría el plan por código a partir de las palabras, las fotos
   y los facts. Sería el modo más rápido y sin coste de modelo, pero todos los
   videos se parecerían. Además, contradice la decisión de diseño actual («no
   existe un montaje automático de respaldo»), recogida en
   `CREATIVE-FREEDOM-REPORT.md`.
2. **Autoría solo bajo demanda.** Por defecto se entrega una plantilla, y un
   botón de Telegram pide una versión original con OpenClaw (`high`).

**Recomendación:** empezar con A y medir. Si la captura sigue dominando o la
autoría falla a menudo, implementar B.2 como «modo rápido» mediante una opción
por serie, sin eliminar la autoría.

## Diseño propuesto: rehacer un video desde Telegram

### Experiencia

1. Render envía el MP4 con dos botones inline: **🔁 Rehacer** y
   **✏️ Rehacer con nota**.
2. **Rehacer** pide una composición nueva para el mismo audio.
3. **Rehacer con nota** responde «Escribe qué cambiar» (`force_reply`). El texto
   de tu respuesta se pasa a OpenClaw como indicación del usuario.
4. El video nuevo llega como respuesta al mensaje original
   (`reply_parameters.message_id`). El anterior se conserva.
5. Alternativa por texto: `/rehacer 3 subtítulos más grandes` (número de guion
   de la serie activa).

### Datos y estado

- `callback_data` tiene un máximo de 64 bytes. Usa `redo:<12 hex del requestId>`
  y resuelve el audio en SQLite (`audios.id`).
- **Idempotencia:** guarda `callback_query.id` y responde siempre con
  `answerCallbackQuery`. Un segundo toque mientras se rehace contesta
  «ya en curso».
- **Límites:** máximo 2 rehacer por audio y solo mientras la serie no caduque
  (`expiresAt`, 24 h). Solo el chat propietario puede pedirlo.
- La nota del usuario se guarda como dato, no como instrucción del sistema. Se
  inyecta en el prompt de autoría como «Petición del usuario (contenido)».

### Cambios por componente

| Componente | Cambio |
|---|---|
| Render `sendVideo` | Añadir `reply_markup` con los botones y aceptar `replyTo`. |
| Render tras entregar | Hoy borra la carpeta del trabajo. Conservar `prepared.json` y la voz ajustada hasta `expiresAt` (o re-preparar con `audioFileId`, que sigue siendo válido en Telegram). |
| Render API | `POST /render/redo {jobId, note}`: nueva generación (`attempts++`), `revision = 0`, estado `awaiting-plan`, sin volver a transcribir. |
| Gateway webhook | Procesar `callback_query` con prefijo `redo:` fuera del agente, igual que `/start`. Encolar una tarea `redo` en el outbox de `workflow.py`. |
| `workflow.py` | Nueva `kind: 'redo'` que llama a `/render/redo` y lanza `creative-director.mjs` con `{..., redoNote}`. |
| `creative-director.mjs` | Incluir `redoNote` y un resumen del plan anterior en el prompt, pidiendo una composición distinta. |
| Pruebas | Doble toque, nota con instrucciones incrustadas, rehacer tras caducidad y rehacer de un audio cancelado o reemplazado. |

### Coste por rehacer

Una llamada de autoría `high` y una captura completa, sin transcripción ni
descarga de medios. La revisión depende de si se adopta la opción A.

### Orden sugerido

1. Opción A con `VIDEO_REVIEW=off` y medición de `stages` en un audio real corto.
2. Botón **Rehacer** sin nota (Render + webhook + outbox).
3. **Rehacer con nota**.
4. Evaluar el «modo rápido» con plantillas (B.2) según los tiempos medidos.
