# Despliegue y contratos de Shorts

Gateway conserva OpenClaw, Telegram, SQLite y el banco Agnes en su volumen
existente. Render usa Node, React/Remotion y FFmpeg; OpenClaw decide el montaje y revisa los fotogramas; Render comprueba que el
plan sea ejecutable y el MP4 no supere 55 s. [Dirección artística](creative.md) es la referencia del planificador.

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
limpia la caché local de lectura; Actions continúa desde R2 y el estado privado. Los detalles del productor están
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
GET /healthz expone workflowProtocol 3, editPlanVersion 5, renderEngine remotion,
maxSeconds 55 y revision. Versiones de planes 1–4 siguen siendo compatibles.
El registro del trabajo incluye updatedAt, voiceRate y originalVoiceSeconds para auditoría.

## Voz y salida

Grabar hasta 50 segundos. El presupuesto de voz es 53 s, con 0.5 s de entrada,
0.5 s de margen y cierre de un segundo. Si hace falta, FFmpeg usa atempo hasta
1.10, conservando tono y palabras. Se transcribe la voz ajustada; composición y
mezcla usan ese mismo archivo. Un audio que no cabe solicita reemplazo, no otro
intento de renderizarlo. Los otros trabajos permanecen guardados.

React produce animaciones deterministas por frame. El código JSX version:5 se compila por revisión en un proceso separado, con
180 s de límite y heap de 768 MB; los montajes pasan props inmutables. El bundle
legacy de planes 1–4 se prepara al construir Docker. Los medios copiados de
cada trabajo se sirven a Chromium por un puerto loopback temporal. Clips mudos,
fuente y marca locales. H.264/AAC, 1080×1920, 30 fps, máximo 1650 fotogramas (55 s)
y menos de 45 MB. Música opcional existente, subtítulos diseñados por OpenClaw y logo final de un segundo.

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
Los pendientes pasan preflight privado y verifican archivos y estados en R2.
Tras PUT y HEAD compatible se confirma la publicación y se eliminan los temporales.
Actions conserva logs y reportes JSON entre corridas. El contrato de recuperación
y disponibilidad está en `AGNES-STATE.md`. Nunca incluir gen, respuestas crudas,
temporales o binarios en Git ni artifacts públicos de reportes.

La telemetría pública `_agnes-hourly.json` contiene fallos saneados y resúmenes con IDs
de evento estables, deduplicación y ventana de 48 h. Los contadores R2 distinguen media
y control, agrupan por mes UTC y son estimaciones operativas. Los retries conservan la
cola `goatlab-media` con cancel-in-progress false y queue max. El commit selectivo publica
sólo IDs completos, progresos/reportes y borrados autorizados; un push agotado falla.


## Director creativo (protocolo 3)

Gateway usa DeepSeek principal y GLM de respaldo, ambos con entrada text/image en
OpenClaw. Render conserva Voxtral y Whisper para transcripción; no requiere la
clave de OpenCode Go. `creative-director.mjs` inicia turnos mediante agent/agent.wait
nativos, guarda decisiones por audio en /data/director y comparte el estado por
el supervisor y ledger existentes. Las revisiones inspeccionan fotogramas y texto,
sin afirmar una evaluación del sonido o movimiento continuo.

POST /render con workflowProtocol:3 solo prepara. GET /jobs/:id/context devuelve
source, fotos y generación. POST /render/plan usa jobId,generation,baseRevision,
plan y model; crea una revisión. POST /render/approve exige generation,revision,
planHash,videoHash,reviewedFrames,notes y model. La aprobación habilita la entrega
del mismo MP4; no se vuelve a renderizar después de aprobar. GET
/jobs/:id/artifacts/:generation/:revision/:name sirve JPEGs autenticados (revisión
0 para fotos fuente). POST /render/fail registra un fallo del director. Todas las
operaciones salvo health requieren Bearer RENDER_SECRET. Hay tres candidatos como
máximo por generación, ningún montaje local y ninguna entrega sin aprobación.

Antes de activar: comprobar ledger y terminar trabajos antiguos; desplegar Render
y después Gateway con CREATIVE_DIRECTOR_ENABLED=0. Ejecutar la prueba nativa de
visión de ambos modelos, revisar un candidato con Telegram simulado y comprobar
protocolo 3. Activar CREATIVE_DIRECTOR_ENABLED=1 después del éxito. Conservar la
configuración previa para rollback; desactivar el director detiene nuevas
admisiones y no autoriza entregas pendientes. Nunca convertir trabajos viejos
silenciosamente. Retirar OPENCODE_GO_API_KEY y cualquier override OPENCODE_GO_*
de los secretos de Render tras comprobar Gateway, conservando MISTRAL_API_KEY.

Los reenvíos técnicos conservan retryToken y son idempotentes, también tras un
fallo. Solo el comando de reintento explícito cambia retryToken e inicia una
nueva generación. La recuperación del supervisor conserva decisiones JSON ya
guardadas aunque el cierre del turno nativo demore o falle por transporte.

## Composiciones originales (plan 5)

Las skills remotion-create y remotion-markup se incluyen con referencias completas
y UPSTREAM.json, fijadas al commit documentado. OpenClaw lee creative.md para
aplicar esas guías al runtime headless 4.0.533. Plan contiene code JSX, scenes con
tiempos de revisión y music boolean opcional. El código exporta un componente
React default. Render valida sintaxis/imports, lo compila sin ejecutar ese código
en Node y lo dibuja en Chromium. El servidor local aplica CSP y los adaptadores
de medios usan solo archivos del trabajo. No es un contenedor OS nuevo por pieza.

La API conserva todos los assets y clips recibidos sin mínimos ni recortes de
cantidad. El productor de Actions sigue teniendo su presupuesto de cuatro fotos y
dos clips por partido: disponibilidad del banco no equivale a cuota de montaje.
El pipeline admite cero recursos y permite no usar parte del banco. El reporte
CREATIVE-FREEDOM-REPORT.md en la raíz documenta los límites restantes y pruebas.
