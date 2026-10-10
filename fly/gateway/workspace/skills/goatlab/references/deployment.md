# Despliegue y contratos de Shorts

Gateway conserva OpenClaw, Telegram, SQLite y el banco Agnes en su volumen
existente. Render usa Node, React/Remotion y FFmpeg; Python valida el plan de
montaje. [Dirección artística](creative.md) es la referencia del planificador.

## Flujo y persistencia

OpenClaw lee el índice y cuatro JSON públicos de goatlab.win. Cada serie conserva
el contenido utilizado. Actions produce el banco de cuatro imágenes y dos clips
Agnes y mantiene sus cuotas y recursos remotos. Gateway consulta R2 mediante el
lector independiente, verifica metadatos, prompts, checksum y acceso público,
y publica su banco local listo en un máximo de 90 segundos. Un banco parcial o
vacío permite montar los audios con gráficos. Los Motion Prompts se aplican por audio.

Gateway utiliza `MEDIA_ROLE=consumer`; el generador y sus CLI Agnes exigen
`MEDIA_ROLE=producer` y `GITHUB_ACTIONS=true`. Reintentar media consulta R2,
sin POST Agnes, PUT/DELETE R2 ni cambios en el estado privado de cuotas. Gateway
limpia solo la caché local de lectura; los artefactos antiguos de generación se
conservan para recuperar resultados en Actions. Los detalles del productor están
en `AGNES-STATE.md` y el workflow `3-media-creation`.

Render replica sus registros en /render-ledger de Gateway y los restaura al
arrancar. Cada guardado incluye updatedAt; durante trabajos activos se confirma
cada 30 segundos. Telegram indica estado pendiente de actualización tras 90
segundos sin confirmación. Entregas delivering se recuperan como delivery-unknown:
verificar Telegram antes de reintentar. Los trabajos activos protegen sus medios.
Gateway se apaga tras diez minutos idle y Render tras quince; los trabajos activos
impiden el apagado. Una réplica por aplicación y una captura a la vez.

## API

POST /render, POST /render/cancel y GET /jobs/:id usan Bearer RENDER_SECRET.
Se conservan requestId, seriesId, chatId, matchId, matchLabel, variant 0–9,
audioFileId o audioUrl, expiresAt, assets, clips, facts y motionPrompts.
Solo se admiten medios Agnes. Los gráficos usan referencias del catálogo facts,
con value, unit, source y sampleSize cuando existe. Cada Motion Prompt conserva
n, kind, prompt y factIds. Respuesta de aceptación: {jobId,status,duplicate}.
GET /healthz expone workflowProtocol 2, editPlanVersion 4, renderEngine remotion,
maxSeconds 49.9 y revision. Versiones de planes 1–3 siguen siendo compatibles.
El registro del trabajo incluye updatedAt, voiceRate y originalVoiceSeconds para auditoría.

## Voz y salida

Grabar hasta 45 segundos. El presupuesto de voz es 45.9 s, con 0.5 s de entrada,
0.5 s de margen y cierre de tres segundos. Si hace falta, FFmpeg usa atempo hasta
1.10, conservando tono y palabras. Se transcribe la voz ajustada; composición y
mezcla usan ese mismo archivo. Un audio que no cabe solicita reemplazo, no otro
intento de renderizarlo. Los otros trabajos permanecen guardados.

React produce animaciones deterministas por frame. El bundle se prepara una vez
al construir Docker; los montajes pasan props inmutables. Los medios copiados de
cada trabajo se sirven a Chromium por un puerto loopback temporal. Clips mudos,
fuente y marca locales. H.264/AAC, 1080×1920, 30 fps, máximo 1497 fotogramas (49.9 s)
y menos de 45 MB. Música existente, subtítulos amarillos y cierre goatlab.win.

## Comprobación y publicación

Ejecutar npm ci --prefix fly/render, node fly/render/remotion-build.mjs,
python3 -m unittest discover -s tests/pipeline, pnpm test, sincronización del skill
y build de Astro. Renderizar y revisar ejemplos mixtos, sin clips, sin fotos y
solo con gráficos; probar aceleración y límite. La licencia de Remotion está en
https://github.com/remotion-dev/remotion/blob/main/LICENSE.md.

Antes de migrar el motor, comprobar el ledger y terminar los trabajos activos.
Publicar primero la web cuando haya cambios de contenido; desplegar Render y
después Gateway, con los Dockerfiles desde la raíz y estrategia rolling. Conservar
las aplicaciones, volúmenes, recursos y secretos existentes. Un despliegue debe
incluir GOATLAB_REVISION. Verificar health y un montaje antes de entrega real.

Para acceso web y transporte Telegram, leer
[base de OpenClaw](../../../references/openclaw-base.md).


## Activación del estado compartido

Actions mantiene `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` y `R2_ACCOUNT_ID`
para media y estado del mismo proyecto. Mantener `R2_STATE_BUCKET=app-states` y
`R2_STATE_KEY=goatlab/agnes-state.json`. Los overrides de credenciales `R2_STATE_*`
son opcionales y exigen una pareja completa cuando se usan. Bucket Standard privado, sin r2.dev ni dominio.
El cliente portable `agnes-state.mjs` usa Node nativo y el adaptador Python intercambia
JSON por stdin/stdout; importar el firmador no ejecuta CLI.

El procedimiento autoritativo del repositorio es `AGNES-STATE.md`: suspender productores
antiguos, importar SQLite/tareas conocidas y recursos existentes, bloquear legacy
incierto y cerrar cuota del día de corte; inicializar con If-None-Match, comprobar CAS
real y habilitar el productor de Actions después. Rollback conserva el JSON y detiene nuevas
creaciones. La protección frente a intentos perdidos comienza en ese corte.

Actions ejecuta mantenimiento y `media:check` con Node antes de instalar dependencias.
Los pendientes pasan preflight privado y recuperan la caché cifrada de resultados,
sin conservar SQLite. AES-256-GCM deriva su clave del secreto S3 usado por el cliente de estado; rotarlo requiere
conservar la clave anterior para recuperar archivos cifrados existentes. La caché de
GitHub puede expirar; el artifact cifrado dura 30 días. El helper limita recuperación
a 128 MB y 1.024 archivos. Sólo el archivo cifrado sale del runner. Nunca incluir gen,
respuestas crudas, temporales o binarios en Git ni artifacts públicos de reportes.

La telemetría pública `_agnes-hourly.json` contiene fallos saneados y resúmenes con IDs
de evento estables, deduplicación y ventana de 48 h. Los contadores R2 distinguen media
y control, agrupan por mes UTC y son estimaciones operativas. Los retries conservan la
cola `goatlab-media` con cancel-in-progress false y queue max. El commit selectivo publica
sólo IDs completos, progresos/reportes y borrados autorizados; un push agotado falla.
