# Shorts de GoatLab

El Gateway mantiene OpenClaw y Telegram en Node. Python conserva las series y
supervisa tareas. Render sigue usando Node, HyperFrames/GSAP y FFmpeg; Python
valida el plan creativo. Rust se evaluará con medidas del proceso completo.

## Operación y estado

El skill está en `fly/gateway/workspace/skills/goatlab/`. Su entrada breve enlaza
las referencias de recepción y medios, scripts Python/JavaScript, bibliotecas y
logo. Todo el pipeline vive dentro del skill, en `scripts/`; la dirección artística
está en `references/creative.md`. Se puede copiar la carpeta completa a otro agente
con Python, Node, FFmpeg, datos de encuentros y un endpoint Render configurado.
`node scripts/sync-goatlab-skill.mjs --check` verifica las bibliotecas empaquetadas.

`/new` sigue siendo nativo. `/start` cancela la serie y da la bienvenida sin
otro reinicio de sesión. `/goatlab` lista partidos; elegir uno activa la generación Agnes.

El supervisor arranca con el Gateway, usa un bloqueo de proceso y persiste en
`/data/goatlab.sqlite` (SQLite con journal DELETE y caché de conexión de 1 MB). Cada chat tiene una serie activa, diez slots,
un contador calculado desde filas y eventos Telegram únicos por serie.
`receive --event=<message_id>` es idempotente. El décimo audio cierra recepción;
`drop-last` cancela su solicitud y reabre ese slot con un nuevo identificador.
`reset` cancela los pendientes del chat. Una cancelación que llega antes de
`POST /render` deja un registro en Render para rechazar la solicitud tardía.
Un video ya enviado no puede retirarse con este mecanismo.

Las generaciones suceden fuera de la conversación. Los audios se
reciben aunque no haya fotos. La marca `.ready` libera los renders, que se envían
en orden por chat, con una solicitud HTTP activa y reintentos de red con el mismo
`requestId`. Una tarea de envío fallida bloquea las posteriores de ese chat hasta
reintentar o cancelar. Render procesa una captura a la vez y adelanta descargas
(concurrencia global de dos) de los siguientes trabajos.

Render guarda cada registro de trabajo mediante escritura atómica y fsync en
`/data/render-jobs` como caché local y replica sus registros en el volumen
existente de Gateway mediante `/render-ledger` autenticado. No se añade un volumen
a Render. Antes de aceptar un trabajo o intentar entregarlo, espera la escritura
durable en Gateway; al arrancar restaura los registros. Los MP4 y transcripciones
son temporales locales y se reconstruyen si se pierde ese disco. Recupera `working` como `queued`; devuelve el mismo trabajo
ante duplicados. `delivering` se recupera como `delivery-unknown`: comprobar el
chat antes de actuar, porque Telegram puede haber recibido el video. Un fallo
normal admite reintento antes de caducar. Tras la entrega confirmada se eliminan
voz, transcripción, composición y MP4, conservando un marcador mínimo hasta 24 h.
Fallos y entregas inciertas caducan también a las 24 h. `expiresAt` limita cada
solicitud; POST caducados responden 410 y no resucitan un trabajo eliminado.

Las dos bases SQLite tienen un máximo de 4.5 MB cada una; sus journals caben en
el presupuesto total de 20 MB. No contienen multimedia. La caché de fotos de
Render tiene un límite de 128 MB y descarga por streaming con dos operaciones
simultáneas. La limpieza se ejecuta al arrancar, cancelar, terminar y cada cinco
minutos. Los archivos en uso quedan protegidos. El Gateway elimina medios cuando
no quedan trabajos dependientes y purga series, listas y eventos a las 24 h.
El registro remoto JSON tiene un límite adicional de 4 MB, sin multimedia.
El estado propio de OpenClaw queda fuera de esta limpieza.

El despliegue inicial debe realizarse con la cola antigua vacía. Se importan los
JSON pendientes antiguos, pero los contadores que vivían en el contexto del agente
no se pueden recuperar de manera fiable: comenzar una nueva serie con `/start`.
No ejecutar dos réplicas de Gateway ni Render sobre volúmenes distintos para esta
cola; los locks y límites son locales al volumen compartido por este proceso.

## Medios y Agnes

Las imágenes se generan exclusivamente con Agnes. Los bancos antiguos se filtran
para excluir fotos externas, sin descargarlas. Se conservan gráficos y recursos de marca.
La investigación web de información sigue habilitada.

Las fotos completas se solicitan con `agnes-image-2.5-flash`, `size: "2K"`,
`ratio: "9:16"` (1472×2624 esperados). Recursos pequeños pueden usar `1K` y otros
ratios mediante `agnes.py --size=1K --ratio=1:1`. El render comprueba dimensiones
reales, normaliza sin ampliar y limita el zoom por el tamaño nativo. Cuando no
alcanza para cubrir la caja, conserva la imagen y usa un fondo derivado; no fuerza
una ampliación. SVG para logo y gráficos. Salida H.264/AAC, 1080×1920, 30 fps,
menos de 45 MB (45 000 000 bytes); música existente y cierre de tres segundos `goatlab.win`.

`/data/agnes.sqlite` y su lock centralizan una generación simultánea y cuatro
inicios por ventana de 60 segundos, incluidos reintentos. Quince slots por partido
comparten los diez videos. Las imágenes completadas se reutilizan y el presupuesto
se conserva incluso tras reiniciar hasta kickoff + 24 h; pasado ese plazo,
se rechazan nuevas generaciones y se borran los controles caducados. 429 respeta `Retry-After` (segundos o fecha),
o espera 60 segundos; una repetición detiene la generación e impone pausa global.
`AGNES_TIMEOUT_SECONDS=300`, válido de 60 a 360. Un timeout o interrupción deja un
resultado incierto que no vuelve a solicitarse automáticamente. Si se obtuvo una
respuesta pero falló la descarga/decodificación, el archivo `.response.json` queda
para recuperación local. Restaurar esa imagen y actualizar su slot conservando el
presupuesto; no borrar el registro para obtener una generación adicional fuera del presupuesto.

Se guardan imagen, hash, dimensiones reales, prompt, modelo y fecha inmediatamente.
Nginx publica únicamente los archivos de imagen, no prompts, respuestas ni SQLite.
Las imágenes generadas son ilustraciones, no retratos documentales ni evidencia.

Según la documentación consultada, el modelo es gratuito y el límite efectivo
2K es 5 RPM; no se verificó la cuota de una cuenta concreta. El límite local deja
margen, pero otras aplicaciones con claves del mismo tipo consumen esa misma cuota.
Fuentes: [modelo y resoluciones](https://wiki.agnes-ai.com/en/docs/agnes-image-25-flash),
[límites](https://wiki.agnes-ai.com/en/docs/tokenplan).

## Contratos JSON

Se mantienen `POST /render`, `POST /render/cancel`, `GET /jobs/:id` y `/healthz`.
Las tres rutas de trabajos requieren `Authorization: Bearer <RENDER_SECRET>`.
El Gateway envía:

```json
{
  "expiresAt": 1791064800000,
  "requestId": "uuid-estable-del-audio", "seriesId": "uuid-de-la-serie",
  "chatId": "123", "matchId": "equipo-a-equipo-b", "variant": 0,
  "audioFileId": "telegram-file-id", "title": "Título", "hook": "Gancho",
  "home": "Equipo A", "away": "Equipo B", "matchLabel": "Equipo A vs Equipo B",
  "assets": [{
    "id": "proveedor:123", "source": "commons", "url": "https://example.org/photo.jpg",
    "page": "https://example.org/photo", "photographer": "Autor", "license": "CC BY 4.0",
    "width": 1472, "height": 2624, "title": "Equipo A entrenando",
    "description": "Contexto documentado", "subject": null, "motive": "training",
    "selection": { "method": "metadata", "team": "equipo a", "contextOnly": false }
  }],
  "attribution": "Autor — CC BY 4.0; ilustraciones generadas identificadas"
}
```

`variant` es 0–9, asignado por código. También se admite `audioUrl` para render
local/integraciones existentes. `requestId` se asocia a chat+audio+partido: un uso
conflictivo se rechaza. La cancelación usa la misma identidad. Respuesta inicial:
`{jobId, status, duplicate}`; consultar el trabajo para resultado y métricas.

La transcripción guardada tiene esta estructura, con segundos relativos a la voz:

```json
{"provider":"mistral", "words":[{"word":"Tres","start":0.1,"end":0.4}], "heard":[], "errors":[]}
```

No se renderiza una transcripción vacía o fuera de duración. El planificador recibe
los tiempos desplazados 0.5 s, dimensiones normalizadas y descripciones de medios,
sin el guion escrito como sustituto de la voz. Contrato de plan:

```json
{
  "version":1,
  "scenes":[{
    "start":0, "end":6, "accent":"#c5ed74", "transition":"wipe",
    "layers":[{"asset":0,"move":"push","box":{"x":0,"y":0,"w":1,"h":1},"focus":{"x":0.5,"y":0.5}}],
    "graphics":[{"kind":"label","at":0.5,"duration":2,"x":0.07,"y":0.13,"wordStart":0,"wordEnd":2}]
  }]
}
```

Escenas contiguas cubren el tiempo anterior al cierre. Hasta cuatro capas por
escena, cajas y focos normalizados, movimientos/transiciones permitidos. Gráficos
`label`, `stat`, `bars` toman exclusivamente fragmentos de palabras transcritas;
`ring` y `line` son decorativos. No se permiten cifras/textos inventados. La
validación limita posiciones, duración, índices y transformaciones; el motor
ajusta recortes y zooms. Actualmente las rotaciones de fotos se neutralizan para
impedir esquinas vacías. Primario y respaldo usan los modelos configurados; cada
proveedor admite una corrección de un plan inválido. Si ambos fallan, se usa el montaje local; se conserva
el trabajo para reintentar y no se entrega un montaje sin subtítulos.

## Instalación, comprobación y despliegue

Desde la raíz del repo:

```sh
npm ci --prefix fly/render
python3 -m unittest discover -s tests/pipeline -v
pnpm test
pnpm run build
node scripts/benchmark-shorts.mjs --runs=3
```

El benchmark usa exactamente los mismos recursos 2K, duración, palabras, FPS y
un worker para ambos motores. Alterna el orden en tres repeticiones y escribe
`.cache/shorts-review/benchmark.json` y dos MP4 revisables. Es una muestra técnica
con imágenes SVG rasterizadas, audio de prueba y tiempos sintéticos. No mide APIs,
transcripción, generación de imágenes, tráfico ni la CPU de Fly. En producción, los registros
`stages` separan descarga, transcripción, normalización, planificación, captura,
mezcla y entrega; repetir en la misma VM con audios reales antes de decidir Rust.

Medición local del 3 de octubre de 2026, macOS arm64, Node 24.21.0, tres repeticiones
alternando el orden, nueve segundos por video: mediana de captura 12.041 s en el
montaje anterior y 12.217 s en el nuevo; mediana completa de render+mezcla 12.402 s
y 12.598 s. El nuevo no demostró una mejora de velocidad de captura (aprox. 1.5%
más lento en esta muestra pequeña). Ambos conservan salida 1080×1920/30 fps; el
MP4 nuevo pesa 1.68 MiB frente a 1.43 MiB. La ganancia actual es edición por audio,
composición en capas, límites de resolución verificables y recuperación del
flujo. El ahorro esperado de caché y quitar visión requiere medir series reales.

Los Dockerfiles ahora usan el contexto de la raíz; desplegar con
`fly deploy . --config fly/render/fly.toml --local-only --ha=false --strategy rolling` y
`fly deploy . --config fly/gateway/fly.toml --local-only --ha=false --strategy rolling`. En una instalación inicial, habilitar primero el registro temporal de Gateway.
Para esta actualización compatible, desplegar Render y después Gateway. Se conserva su volumen existente; no crear
aplicaciones ni volúmenes y no ampliar CPU/RAM.
Render necesita `OPENCODE_GO_API_KEY`, `TELEGRAM_BOT_TOKEN`, `RENDER_SECRET`, y las
claves de transcripción existentes. Gateway mantiene sus secretos y recibe `AGNES_API_KEY`. Configurar ambas aplicaciones
con los mismos modelos principal/respaldo, y la misma clave de Render.
No enviar pruebas al chat real durante las comprobaciones técnicas de despliegue.

La validación incluye recepción de diez audios, sustituciones, cancelaciones,
caducidad, limpieza, portabilidad del skill y restauración del registro temporal.
Comprobar las dos imágenes para linux/amd64 y sus endpoints después de desplegar.
El Dockerfile de Render omite las bibliotecas CUDA opcionales de ONNX porque las
máquinas existentes usan CPU; conserva el runtime CPU y whisper.cpp. La descarga
del modelo tiene timeout y reintento limitado, y queda en una capa separada para
reutilizarla cuando falle una etapa posterior.

Apagado automático existente: Gateway conserva 10 minutos de inactividad y
Render 15 minutos. La limpieza de Gateway consulta el registro local, sin
despertar Render por consultas periódicas de estado. Los trabajos en curso
impiden apagar las máquinas hasta que terminan.


## Corrección de transporte y progreso

El planificador identifica GoatLab y envía `x-opencode-session`, estable por
requestId. Su presupuesto es 240 s, hasta 90 s por llamada y 60 s reservados
al respaldo. Una validación fallida permite una reparación por modelo. Si ambos
fallan, se usa un montaje local validado con títulos de la voz, gráficos y 3D ligero.
Una transcripción fallida conserva el audio y avisa; no se entrega sin subtítulos.

Nginx envía `/telegram-webhook` al servicio Python existente, en localhost:3002.
Este verifica el secreto y TELEGRAM_ALLOWED_USERS, registra audios de series
activas. `/start` cancela GoatLab antes de reenviar la bienvenida al webhook
nativo de OpenClaw en :8787; `/new` se reenvía sin interceptarlo. El usuario
no necesita entregar tokens Fly al bot. Las credenciales de apagado conservan
el alcance de Gateway; los despliegues se hacen desde el entorno del operador.

El banco persiste incrementalmente y habilita los videos al terminar su intento
limitado de reunir quince imágenes, incluso si obtiene cero. Un mensaje
editable muestra count/15 y etapas reales; las actualizaciones usan el ledger
local, nunca sondeos periódicos HTTP a Render. Cada POST fija una copia del pack.
Los campos opcionales nuevos son `facts` y `mediaMinimum` (0 en GoatLab, admite 0/1/2/8 por compatibilidad); los planes aceptan
versiones 1 y 2. `/healthz` de Render añade revision y editPlanVersion.

El progreso y sus message_id caducan con la serie. Los límites de SQLite y caché,
las dos aplicaciones y el apagado a 10/15 minutos se mantienen. Renderizar ejemplos
con motion graphics y revisar subtítulos antes del despliegue; registrar la revisión
en GOATLAB_REVISION al construir ambas imágenes.

Para browser, acceso web y transporte de Telegram, lee [base de OpenClaw](../../../references/openclaw-base.md).


## Contenido público y clips Agnes

La web publica `/content-index.json` y las páginas por partido `/scripts`,
`/image-prompts`, `/video-prompts` y `/motion-prompts`, cada una con `.json` para
consumo automático. `/youtube` redirige permanentemente a `/scripts`. Los archivos
históricos `public/data/youtube-scripts` siguen siendo compatibles.

Publicar primero la web y sus datos; después Render y Gateway, en ese orden por
compatibilidad del protocolo. El contenido se guarda con cada serie; el banco de
10 imágenes y hasta 3 clips se comparte por partido y se prepara hasta 15 minutos.
Las versiones antiguas del contrato de montaje siguen aceptadas. El índice y las
categorías web tienen caché validada local (24 horas, máximo 3 MB); las descargas
Agnes de clips y su caché en Render están limitadas a 128 MB cada una, fuera de SQLite.
Nginx publica únicamente imágenes y MP4, nunca instrucciones, respuestas o bases.
La voz y música originales son las fuentes de audio; los clips se silencian.
