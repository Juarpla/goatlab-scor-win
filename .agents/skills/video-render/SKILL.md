---
name: video-render
description: >-
  Render a GoatLab Short locally from a voice track and a match media pack.
  Pick the match, identify and align the voice, author an original Remotion
  composition, render, review the result and deliver the MP4. Use when the user
  asks for a local GoatLab video, a Short, or to render an audio track.
---

# GoatLab video-render

Render local de Shorts de GoatLab. Remotion es el único motor: transcripción,
alineación con guion, preparación de medios, composición JSX, render y mezcla
corren en esta máquina, sin worker remoto. HyperFrames se descartó tras el A/B
del 2026-11-01 (misma calidad, más peso y un toolchain adicional).

## Contrato de entrega

- 1080×1920, 30 fps, H.264 con AAC.
- 55 s máximo: 0.5 s de entrada + voz + 0.5 s de salida + 1 s de cierre con logo.
- Subtítulos en español, legibles y sincronizados con `words`.
- Música de fondo obligatoria: `plan.music: true`.
- Un video por audio.
- Audios de entrada: `~/Desktop/goatlab-audios/`.
- Entregas: `video-render/videos/`.
- El único elemento editorial fijo es el logo GoatLab del último segundo.
- Preferencia visual permanente: color vivo, imagen nítida y bien iluminada, sin
  pasajes oscuros o turbios. `references/creative.md` la convierte en reglas.

## Rutas

| Qué | Dónde |
| --- | --- |
| CLI de render | `scripts/render-short.mjs` |
| Motor | `video-render/engine/` |
| Proyecto Remotion, kit y assets | `video-render/render/remotion/` |
| Planes, QA y referencias | `video-render/trabajo/<id>/<slug>/` |
| MP4 entregados | `video-render/videos/` |

`<slug>` es una etiqueta corta en kebab-case para el audio, por ejemplo `script-3`
o el nombre del archivo. Nunca reutilices un slug para otro audio.

## Cómo funcionan los tiempos

El guion de YouTube es el texto maestro; Mistral pone el reloj.

1. `video-render/engine/transcribe.mjs` envía un FLAC mono de 16 kHz a Mistral
   (Voxtral) con `timestamp_granularities=word`. Si Mistral falla, tarda más de
   45 s o no oye nada, corre whisper.cpp local.
2. `video-render/engine/reference-timing.mjs` alinea los tokens del guion con los
   escuchados mediante Levenshtein sobre palabras normalizadas (sin acentos,
   números canónicos). Las palabras del guion heredan los tiempos escuchados; un
   nombre que Mistral parte conserva el tramo completo; las palabras sin match se
   interpolan entre vecinas.
3. `scripts/render-short.mjs` registra `guion: NN% de coincidencia` y usa el texto
   alineado solo si `NN >= 50`. Por debajo vuelve a las palabras crudas de Mistral:
   una referencia equivocada es peor que una transcripción aproximada.
4. `words` llega a la composición ya desplazado por los 0.5 s de entrada. El código
   del plan no debe sumar otro offset.

Nunca edites tiempos a mano. Corrige el texto de referencia.

### Corrección razonada de la referencia

Pasa `--script` siempre que el audio tenga guion. Si conoces el número, añade
`--script-n`; si no, omítelo y el CLI alinea la transcripción contra todos los
guiones y elige el de mayor coincidencia. Lee siempre la línea `guion:`, que
indica el número elegido y el porcentaje.

- **Score ≥ 50%**: la alineación es fiable. No reescribas la narración para
  "mejorarla"; corrige solo un error factual concreto que se vería en pantalla
  (un jugador que no jugó, un marcador falso) y vuelve a renderizar.
- **Score < 50%**: la grabación no sigue el guion maestro (toma improvisada,
  número equivocado, narración editada) y el render usa el texto crudo. Lee la
  transcripción completa, compárala con el guion y escribe una referencia
  corregida que diga lo que el audio dice de verdad, con nombres y cifras
  arreglados. Vuelve a renderizar.
- **Caso ambiguo** (score justo debajo de 50%, o un nombre mal dentro de una
  alineación buena): corrige solo las palabras afectadas y re-renderiza.

El archivo corregido tiene la forma que espera `--script`:

```json
{ "scripts": [{ "n": 1, "narration": "…" }] }
```

Guárdalo en `video-render/trabajo/<id>/<slug>/reference.json` y pasa
`--script="video-render/trabajo/<id>/<slug>/reference.json" --script-n=1`.

## Paso 1 — Elegir el partido

```sh
node scripts/list-media-packs.mjs
```

Muestra la tabla y pide un `id`. Usa el `id` exacto: es la clave del media pack y
del comando de render. Prefiere partidos con 4 imágenes y 4 clips; si el elegido
tiene menos, úsalo y aprovecha lo disponible. Nunca uses un pack con 0 imágenes y
0 clips.

Si los audios están numerados, la columna `audio` estará vacía; es normal. Se
identifican en el paso 2.

Criterio de cierre: el usuario eligió un `id` y existe un audio para ese partido.

## Paso 2 — Preparar el audio

Busca en `~/Desktop/goatlab-audios/` un archivo cuyo nombre empiece por el `id`.
Cuando llegue un lote, inventaría la carpeta y asigna cada archivo a un `id` antes
de renderizar nada.

Si los archivos están numerados (por ejemplo `Track-78.m4a`), no confíes en el
nombre: identifica el partido por los primeros segundos de voz. Este helper imprime
la transcripción de Mistral; usa `-t 20` para identificar y quítalo para la
transcripción completa de una corrección.

```sh
TMP="video-render/trabajo/<id>/<slug>"
mkdir -p "$TMP"
ffmpeg -y -loglevel error -t 20 -i "$AUDIO" -ac 1 -ar 16000 "$TMP/identify.flac"
VOICE_FLAC="$TMP/identify.flac" node --env-file=.env --input-type=module -e "
const { mistral } = await import('./video-render/engine/transcribe.mjs');
const words = await mistral({ flac: process.env.VOICE_FLAC, env: process.env, fetchImpl: fetch });
console.log(words.map(w => w.word).join(' '));
"
```

Si varios candidatos encajan, pregunta. Si no hay audio, pide que lo deje en la
carpeta.

Mide la duración:

```sh
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$AUDIO"
```

Política de voz:

- hasta 53 s: se usa tal cual;
- 53–58.3 s: se acelera con `atempo`, conservando el tono, como máximo 1.1×;
- más de 58.3 s: falla con `VOICE_TOO_LONG`. Ofrece recortar, partir o regrabar.
  Nunca edites el original; el render trabaja sobre una copia temporal.

Criterio de cierre: una ruta de audio, una duración conocida y una decisión si
supera el límite.

## Paso 3 — Leer el media pack

Lee `public/data/media-pack/<id>.json`. Contiene:

- `assets`: hasta 4 imágenes Agnes.
- `clips`: clips del partido, de unos 6.5 s a 720×1280.
- `facts`: cifras reales del partido.
- `match`, `home`, `away`.

Descarga los clips y extrae un fotograma de cada uno para ver qué muestran antes
de escribir el plan. Usa `clips[].url` y
`ffmpeg -ss 1 -i clip.mp4 -frames:v 1`. Mira los fotogramas con la herramienta de
lectura de imágenes. Si un clip está corrupto o vacío, anótalo y usa el resto.
Todo clip **utilizable** debe aparecer al menos una vez.

Criterio de cierre: sabes qué muestra cada clip y cuántos vas a usar.

## Paso 4 — Escribir el plan

Crea `video-render/trabajo/<id>/<slug>/plan.json`:

```json
{
  "version": 5,
  "visualStyle": "editorial",
  "music": true,
  "scenes": [{ "start": 0, "end": 4.5 }],
  "code": "import React from 'react'; ..."
}
```

- `visualStyle`: `editorial`, `documentary` o `trailer`.
- `music` debe ser `true`.
- `scenes` son segundos absolutos para muestrear la revisión visual. Deben terminar
  dentro del contenido, que va de 0 a `voiceSeconds / rate + 1` (el cierre de 1 s
  queda fuera). Si no conoces el rate, `voiceSeconds / 1.1 + 1` siempre es seguro.
  No imponen estructura.
- `code` es un módulo JSX, como máximo 200 KB.

### Contrato del código

- Exporta por defecto un componente React.
- Recibe `frames`, `contentFrames`, `photos`, `clips`, `words`, `facts`, `match`,
  `brandName`, `brandUrl`, `font`, `brand`.
- `photos`: `{src, backdrop, focusBlur, width, height}`.
- `clips`: `{src, width, height, duration}`.
- `words`: `{word, start, end}` en segundos, ya en la línea de tiempo final.
- El motor monta el componente durante `contentFrames` y añade el cierre de 1 s
  con el logo. No dibujes el cierre.
- Imports permitidos: `react`; de `remotion` solo `AbsoluteFill`, `Sequence`,
  `Series`, `Freeze`, `Loop`, `Img`, `OffthreadVideo`, `Html5Video`, `Video`,
  `useCurrentFrame`, `useVideoConfig`, `interpolate`, `interpolateColors`,
  `spring`, `Easing`, `random`, `getInputProps`; de `goatlab-kit` solo `Captions`,
  `FitText`, `SafeArea`, `KenBurns`, `StatCard`, `CameraMove`, `ColorWash`,
  `FilmGrain`, `phrases`, `wordAt`, `fitFontSize`.
- Usa `Img` para fotos y `Video`/`OffthreadVideo` para clips. Las rutas salen de
  las props; nunca inventes URLs ni cargues recursos externos.
- Anima con `useCurrentFrame` más `interpolate`/`spring`. Nada de `setTimeout`,
  `setInterval`, `window`, `document`, `fetch` ni imports dinámicos.
- La fuente local es `GoatLabLocal`; usa
  `fontFamily: 'GoatLabLocal, sans-serif'`.
- Respeta la zona segura: 160 px arriba, 340 px abajo, 60 px a la izquierda, 160 px
  a la derecha. El texto debe leerse desde 40 px.
- Subtítulos: usa `Captions` con `words`; relleno `#ffe14a` y borde negro. Puedes
  cambiar tamaño, posición y animación, pero conserva el relleno y el borde de
  marca y hazlos legibles en un teléfono.

### Dirección visual

Preferencias permanentes del usuario, no sugerencias:

- **Color vivo.** Mantén la saturación alta y el verde de la marca vivo. Usa velos
  y degradados como acentos, no como tinte global.
- **Brillo y luz.** Levanta las sombras y mantén los medios abiertos. Sin
  secuencias subexpuestas, pasajes negros largos, negros aplastados ni viñetas
  pesadas.
- **Imagen nítida.** Recorta desde la resolución nativa y evita ampliar por encima
  de la fuente. El desenfoque pertenece a fondos, transiciones y capas gráficas,
  nunca al sujeto; usa `backdrop` y `focusBlur` para separar.
- **Legibilidad sin oscurecer.** Los subtítulos usan el relleno de marca y borde
  negro. No oscurezcas todo el cuadro ni añadas sombras pesadas para que el texto
  se lea.
- **El verde oscuro `#101412` pertenece al cierre.** No dejes que domine el
  contenido.

La variedad sigue importando: estas reglas limitan la calidad, no el concepto.

### Libertad creativa local

No hay presupuesto de CPU de Fly. Puedes usar:

- dos o tres clips a la vez, picture-in-picture, pantallas divididas;
- máscaras, `clip-path`, `mix-blend-mode`, degradados, light leaks;
- `filter: blur` y `backdrop-filter` en fondos y capas gráficas, grano,
  aberración cromática, scanlines;
- SVG con `feTurbulence`, `feGaussianBlur`, `feDisplacementMap`;
- transformaciones 3D, parallax, partículas, tipografía cinética, contadores;
- cortes sobre la voz, transiciones y reencuadres.

Mide el primer render: si el presupuesto local se agota, sube
`CAPTURE_BUDGET_MS` o simplifica solo la escena más cara. No vuelvas al estilo
plano de Fly por precaución.

### Clips y facts

- Todo clip utilizable aparece al menos una vez. Si el audio es más corto que la
  suma de clips, recorta con `startFrom`/`endAt`; si es más largo, reutiliza con
  `Loop` o `Freeze`.
- Usa 2–4 cifras de `facts`; nunca inventes estadísticas.
- Las imágenes Agnes apoyan la pieza; los clips mandan cuando existen.
- Varía el concepto entre audios: nunca repitas la misma plantilla cambiando solo
  el texto.

Criterio de cierre: el JSON parsea, el código tiene export default, `music` es
`true`, aparece cada clip utilizable y `scenes` cabe dentro del contenido.

## Paso 5 — Renderizar

```sh
CAPTURE_BUDGET_MS=3600000 CAPTURE_TIMEOUT_MS=3600000 RENDER_WORKERS=4 \
LAYOUT_CHECK=advisory RENDER_CRF=23 \
node --env-file=.env scripts/render-short.mjs \
  --match=<id> \
  --audio="$HOME/Desktop/goatlab-audios/<file>" \
  --script="public/data/youtube-scripts/<id>.json" \
  --script-n=<n> \
  --plan="video-render/trabajo/<id>/<slug>/plan.json" \
  --out="video-render/videos/<id>-<slug>-v1.mp4" \
  --variant=1 \
  --keep
```

- `CAPTURE_BUDGET_MS=3600000` permite una hora de captura para efectos avanzados.
  `CAPTURE_TIMEOUT_MS` debe coincidir: el valor por defecto es 20 minutos y
  cancelaría un render pesado aunque el presupuesto sea mayor.
- `RENDER_WORKERS=4` usa cuatro núcleos; súbelo o bájalo según la máquina.
- `LAYOUT_CHECK=advisory` avisa de texto fuera de la zona segura sin bloquear.
- `RENDER_CRF=23` mantiene la mayoría de archivos por debajo de 45 MB.
- `--script` es opcional: con él los subtítulos usan el texto del guion y los
  tiempos de Mistral. `--script-n` fija el guion; sin él se elige el de mayor
  coincidencia. Sin `--script` se usa la transcripción cruda.
- `--keep` guarda `composition.json` junto al MP4.
- Ejecuta con un timeout largo (30–60 min).
- `--variant` nombra el directorio temporal `goatlab-short-<match>-v<variant>`.
  Nunca reutilices una variante mientras otro render corre.

| Fallo | Arreglo |
| --- | --- |
| `VOICE_TOO_LONG` | audio de más de 58.3 s: recorta, parte o regraba |
| `guion:` por debajo de 50 | escribe una referencia corregida y re-renderiza |
| `compilación` / `compilación JSX` | corrige imports o JSX |
| `presupuesto de captura` | sube `CAPTURE_BUDGET_MS` o simplifica la escena más cara |
| `falta la música de fondo` | restaura `video-render/render/remotion/assets/bed.mp3` |
| `MP4 fuera del contrato` | revisa duración, formato o tamaño; re-codifica si hace falta |

Si un MP4 llega a 45 MB, re-codifica solo ese archivo:

```sh
ffmpeg -y -i input.mp4 -c:v libx264 -preset medium \
  -b:v 7.2M -maxrate 8M -bufsize 16M -pix_fmt yuv420p \
  -c:a copy -movflags +faststart output.mp4
```

Criterio de cierre: el MP4 existe y `ffprobe` confirma 1080×1920, 30 fps, H.264,
AAC, ≤55 s y <45 MB.

## Paso 6 — Revisar antes de entregar

Comprueba primero el contrato técnico:

```sh
ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,r_frame_rate \
  -show_entries format=duration,size -of default=nw=1 "$OUT"
```

Luego muestrea la línea de tiempo en una carpeta de QA:

```sh
QA="video-render/trabajo/<id>/<slug>/qa"
mkdir -p "$QA"
D=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT")
for pct in 5 25 50 75 95; do
  t=$(node -e "console.log(($D*$pct/100).toFixed(2))")
  ffmpeg -y -loglevel error -ss "$t" -i "$OUT" -frames:v 1 "$QA/f$pct.jpg"
done
END=$(node -e "console.log(($D-0.5).toFixed(2))")
ffmpeg -y -loglevel error -ss "$END" -i "$OUT" -frames:v 1 "$QA/endcard.jpg"
```

Mira los fotogramas y comprueba:

- subtítulos legibles, sin recortes y dentro de la zona segura;
- imagen brillante, nítida y viva, sin pasajes oscuros o turbios;
- clips reconocibles y todo clip utilizable presente;
- el cierre muestra el logo durante 1 s;
- sin fotogramas negros ni recursos rotos.

Detecta segmentos negros no intencionales (el cierre es oscuro a propósito, así
que se excluye):

```sh
D=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT")
CONTENT=$(node -e "console.log(($D-1).toFixed(2))")
ffmpeg -hide_banner -t "$CONTENT" -i "$OUT" -vf blackdetect=d=0.5:pix_th=0.10 \
  -an -f null - 2>&1 | grep blackdetect
```

Sin salida no hay segmento negro. Si algo está mal, edita el plan y renderiza
`-v2`; nunca entregues un archivo roto. Criterio de cierre: revisaste al menos 5
fotogramas más el cierre, el probe técnico cuadra y el score `guion:` fue aceptable
o usaste la referencia corregida.

## Paso 7 — Entregar

Deja el MP4 en `video-render/videos/`. No borres el audio original ni el plan.
Responde con:

- la ruta del archivo;
- una frase sobre el concepto (estilo, clips usados, efectos);
- cualquier limitación (clip ausente, audio acelerado, fallback de alineación…).

Para varios audios, nombra cada salida `<id>-<slug>-v1.mp4` y verifica y entrega
cada una por separado; un fallo no debe bloquear al resto.

## Varios videos en paralelo

El directorio temporal es `$TMPDIR/goatlab-short-<match>-v<variant>` y se borra al
inicio de cada corrida. Dos procesos con el mismo partido y variante se destruyen.
Da identidad propia a cada render concurrente:

| Recurso | Regla |
| --- | --- |
| Temp dir | `--variant` único por proceso. |
| Plan y QA | `video-render/trabajo/<id>/<slug>/…`, un slug por audio. |
| Salida | `<id>-<slug>-v1.mp4`; `--keep` escribe el JSON al lado. |
| Caché de medios | Partidos distintos: la caché compartida es segura (claves por hash de URL). Mismo partido: `PHOTO_CACHE_DIR="video-render/trabajo/<id>/<slug>/photos"` para una caché privada. |
| CPU | 2–3 renders concurrentes con `RENDER_WORKERS=3` cada uno. Nunca lances diez. |

## Referencias

- `references/creative.md`: contrato creativo, imports y kit.
- `references/brand.md`: marca, colores, subtítulos y música.
- `references/remotion.md`: guía de autoría Remotion, patrones y errores comunes.
