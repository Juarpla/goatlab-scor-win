# video-render

Render local de Shorts de GoatLab. Toma un audio, un media pack y un plan JSX, y
entrega un MP4 1080×1920 con voz, música y subtítulos. No hay worker remoto ni
Fly.io: todo corre en esta máquina.

## Estructura

```
video-render/
  engine/                 motor: preparación, transcripción, alineación, cachés
  render/remotion/        proyecto Remotion, kit, assets, bundle y render
  ESTILO.md               preferencias y lecciones (versionado)
  videos/                 MP4 entregados (ignorado por git)
  trabajo/                planes, QA y referencias (ignorado por git)
```

- `engine/short-job.mjs` orquesta voz, transcripción, fotos, clips y composición.
- `engine/transcribe.mjs` usa Mistral (Voxtral) y cae a whisper.cpp.
- `engine/reference-timing.mjs` alinea el guion con lo escuchado.
- `render/remotion/authored-composition.mjs` valida y compila el plan JSX.
- `render/remotion/remotion-render.mjs` captura y codifica.

## Requisitos

Node 22.12 o posterior, ffmpeg y ffprobe. Dependencias del render:

```sh
npm ci --prefix video-render/render/remotion
```

Las claves van en `.env` (nunca en git): `MISTRAL_API_KEY`, `OPENCODE_GO_API_KEY`
y las de R2/Agnes si se generan bancos.

## Uso

```sh
node --env-file=.env scripts/render-short.mjs \
  --match=real-racing-club-vs-real-madrid-2026-11-01 \
  --audio="$HOME/Desktop/goatlab-audios/Track-93.m4a" \
  --script=public/data/youtube-scripts/real-racing-club-vs-real-madrid-2026-11-01.json \
  --script-n=6 \
  --plan=video-render/trabajo/<id>/<slug>/plan.json \
  --out=video-render/videos/<id>-<slug>-v1.mp4 \
  --variant=1 --keep
```

- `--script` es opcional; con él los subtítulos usan el texto del guion y los
  tiempos de Mistral. `--script-n` fija el guion; sin él se elige el de mayor
  coincidencia contra todos los guiones del archivo.
- Sin `--out`, el MP4 va a `video-render/videos/`.
- `--keep` guarda `composition.json` junto al MP4.
- Cada render añade una entrada a `manifest.json` en la carpeta de salida (partido,
  audio, plan, guion elegido, score, duración, bytes y fecha).
- La skill `video-render` contiene el flujo completo, la dirección creativa y la
  guía de autoría.

## A/B de motores (2026-11-01)

Mismo audio (45,696 s), mismo banco 4 imágenes / 4 clips, mismo brief y mismas
1431 frames a 1080×1920/30 fps. Remotion con 3 workers; HyperFrames 0.8.226 con
`--crf=20` y 3 workers.

| Motor | Tiempo | Peso | Salida | Autoría |
| --- | --- | --- | --- | --- |
| Remotion 4.0.537 | 33,2 s | 21 MB | 3,6 Mbps | plan JSX validado por el motor |
| HyperFrames 0.8.226 | 37,0 s | 35 MB | 5,9 Mbps | HTML+GSAP con `check` de layout |

Calidad visual equivalente en los fotogramas comparados. Se conserva **Remotion**:
ya estaba integrado, produce archivos más pequeños con la misma calidad y su
contrato JSX detecta imports y APIs prohibidas antes de capturar. HyperFrames
requería un toolchain aparte (Chrome, CLI y HTML propio) sin ventaja de tiempo.

## Pruebas

```sh
node --test tests/*.test.js
python3 -m unittest discover -s tests/pipeline
```

Los tests de render cubren preparación de voz, transcripción, cachés, layout,
presupuesto de captura, bundle JSX y contrato de composición.
