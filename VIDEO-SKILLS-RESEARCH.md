# VIDEO-SKILLS-RESEARCH.md

**¿Qué skills de agente existen para editar videos cortos tipo TikTok/Reels/Shorts (subtítulos quemados, transiciones, dinamismo y overlays de datos)? ¿Tiene Hermes un skill hub que sirva para eso?**
Fecha: 2026-09-27 · Alcance: el Skills Hub de **Hermes Agent (Nous Research)** y los registros que ese hub integra (skills oficiales de Hermes, skills.sh, ClawHub, LobeHub, browse.sh, taps de GitHub). También se revisan registros primarios vecinos (Agent Skills / agentskills.io, `anthropics/skills`, ClawHub/OpenClaw) y skills de proveedores que el hub indexa (Remotion, HeyGen HyperFrames).
Método: descargué el índice público del hub (`skills.json`, 100.839 entradas) y lo filtré por *video, caption, subtitle, ffmpeg, remotion, tiktok, reels, shorts, karaoke, transition, motion, overlay, chart*. De cada candidato abrí el `SKILL.md` o README en su repositorio de origen (GitHub raw), su página en skills.sh o su ficha en ClawHub (web o API). Cada URL citada se abrió hoy.
Fuera del alcance: probar o instalar skills, medir calidad de render, blogs o listas de terceros, y proponer cambios en este repo.

**Marcas usadas**

| Marca | Significado |
|---|---|
| ✅ VERIFICADO (docs) | Página oficial o `SKILL.md`/README abierto el 2026-09-27 |
| 🟡 PROBABLE | Lo insinúa el proyecto (índice o ficha), pero no pude abrir el detalle |
| ⛔ NO ENCONTRADO | Se buscó en el hub y no hay skill que haga eso |

**Ojo con el nombre.** «Hermes» aquí es **Hermes Agent**, de Nous Research ([repo](https://github.com/NousResearch/hermes-agent)). No tiene relación con **Hermes, el motor JavaScript de Meta** (`facebook/hermes`), que se trata en `JS-ENGINES-RESEARCH.md` y no tiene skills. ✅ VERIFICADO (docs)

---

## Respuesta directa

**Sí, el hub existe y sirve para esto.** Hermes Agent tiene un **Skills Hub** público en [hermes-agent.nousresearch.com/docs/skills](https://hermes-agent.nousresearch.com/docs/skills), mantenido por Nous Research. No es un marketplace propio: indexa skills oficiales de Hermes junto con registros de terceros (skills.sh, ClawHub, LobeHub, browse.sh, taps de GitHub y endpoints `/.well-known/skills`). Se instala con `hermes skills install <fuente>/<ruta>` y cada instalación pasa por un escáner de seguridad. Los skills siguen el estándar abierto Agent Skills (agentskills.io). ✅ VERIFICADO (docs) — [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills).

**Los cuatro pedidos del usuario están cubiertos**, aunque la cobertura es desigual:

- **Subtítulos quemados:** cobertura fuerte, por tres vías (FFmpeg/ASS, Remotion o HyperFrames).
- **Transiciones:** bien cubiertas (FFmpeg `xfade` o transiciones shader de HyperFrames).
- **Ritmo y dinamismo:** existen guías de short-form (gancho, interrupciones de patrón cada ~2–4 s, loops) y un skill de cortes al beat.
- **Overlays de estadísticas:** solo hay skills genéricos (count-up, gráficos animados). ⛔ No hay ningún skill específico de marcadores o estadísticas de fútbol.

**Los skills más útiles (verificados):**

1. **`hyperframes`** (Hermes, oficial opcional): renderiza MP4 desde HTML+GSAP, con captions palabra por palabra, TTS, transiciones shader y overlays sociales.
2. **`remotion-captions`** y **`remotion-best-practices`** (Remotion, oficial del proveedor): transcribir, importar SRT, mostrar y animar captions en Remotion.
3. **`caption-animation`** (iart-ai): captions karaoke palabra por palabra, en 9:16, dentro del área segura, quemadas o como SRT/VTT.
4. **`short-form-video`** (iart-ai): gramática gancho → retención → loop, con una interrupción de patrón cada ~2–4 s y punch-in zoom.
5. **`ffmpeg-captions-subtitles`** (josiahsiegel): quemar SRT/ASS/VTT con estilos, `drawtext` y Whisper dentro de FFmpeg 8.
6. **`ffmpeg-kinetic-captions`** y **`viral-video-animated-captions`** (josiahsiegel): captions estilo CapCut (pop, bounce, word-grow) con etiquetas ASS.
7. **`ffmpeg-transitions-effects`** (josiahsiegel): más de 40 tipos de `xfade`, slideshows desde imágenes y Ken Burns con `zoompan`.
8. **`motion-graphics`** (HeyGen HyperFrames): piezas cortas de stat count-up, gráficos, lower thirds y overlays, en MP4 u overlay transparente.
9. **`chart-animation`** (iart-ai): bar chart race, contadores y líneas animadas, todo derivado del frame.
10. **`video-editing`** (Pruna AI): postproducción local con FFmpeg (concat, crossfades, captions quemadas, lower thirds, música de fondo, export 9:16).
11. **`wjs-burning-subtitles`** (ClawHub): video + SRT → quemado con libass o soft-mux, más mezcla de doblaje, en un solo encode.
12. **`beat-sync-video-editing`** (ecliptic-ai): arma un plan de cortes sincronizado con la música y lo renderiza con `filter_complex`. Requiere Gemini.

---

## 1. Qué es el Skills Hub de Hermes

| Aspecto | Qué dice la doc | Marca | Fuente |
|---|---|---|---|
| URL del hub | Página pública «Skills Hub». Se renderiza en el cliente; sin JavaScript muestra contadores en 0. | ✅ | [docs/skills](https://hermes-agent.nousresearch.com/docs/skills) |
| Datos del hub | El Desktop y el hub público leen el mismo snapshot en CDN, `/docs/api/skills.json`. Se genera en el build de la doc a partir de `skills/`, `optional-skills/` y un índice centralizado. Navegar no consulta GitHub en vivo. | ✅ | [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills), [skills.json](https://nousresearch.github.io/hermes-agent/docs/api/skills.json) |
| Quién lo mantiene | Nous Research, dentro del repo `NousResearch/hermes-agent`. Los skills «official» viven en `optional-skills/` y se aceptan por pull request. | ✅ | [Optional Skills Catalog](https://hermes-agent.nousresearch.com/docs/reference/optional-skills-catalog) |
| Fuentes integradas | `official`, `skills-sh`, `well-known`, `github` (taps), `clawhub`, `lobehub`, `browse-sh` y URL directa. | ✅ | [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) |
| Tamaño del snapshot de hoy | 100.839 entradas: ClawHub 78.612, skills.sh 20.000, GitHub 514, LobeHub 505, browse.sh 474, NVIDIA 382, optional 152, built-in 58, gstack 54, OpenAI 44, HuggingFace 25, Anthropic 19. Lo conté localmente sobre el JSON; no verifiqué si los 20.000 de skills.sh son un tope del indexador. | ✅ | [skills.json](https://nousresearch.github.io/hermes-agent/docs/api/skills.json) |
| Instalar | `hermes skills install official/<cat>/<skill>`, `skills-sh/<owner>/<repo>/<skill>`, `well-known:<url>` o una URL directa a un `SKILL.md`. También se puede con el botón «Install in Hermes» (`hermes://skill/install?identifier=…`). | ✅ | [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) |
| Publicar | `hermes skills publish skills/<skill> --to github --repo owner/repo`, o crear un «tap» (un repo de GitHub con `SKILL.md`) que otros agregan con `hermes skills tap add`. | ✅ | [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) |
| Seguridad | Todo lo instalado desde el hub pasa por un escáner (exfiltración, prompt injection, comandos destructivos). `--force` no anula un veredicto `dangerous`. Niveles de confianza: `builtin`, `official`, `trusted` (`openai/skills`, `anthropics/skills`, `huggingface/skills`, `NVIDIA/skills`) y `community` (skills.sh, ClawHub y la mayoría de marketplaces). | ✅ | [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) |
| Relación con Agent Skills | La doc de Hermes dice que sus skills son compatibles con el estándar abierto agentskills.io. Agentskills.io lista a Hermes Agent y a OpenClaw entre los productos que lo adoptan, y dice que el formato lo creó Anthropic y luego se liberó como estándar abierto. | ✅ | [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills), [agentskills.io](https://agentskills.io/) |
| Relación con ClawHub/OpenClaw | ClawHub es el registro público de OpenClaw. OpenClaw instala con `openclaw skills install @owner/<slug>` y también acepta referencias `skills-sh:owner/repo/slug`. Hermes indexa ClawHub como fuente `clawhub`. | ✅ | [OpenClaw Skills](https://docs.openclaw.ai/tools/skills), [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) |

Nota sobre advertencias de seguridad: el `SKILL.md` de `brag` dice que el escáner de Hermes bloquea hoy cuatro de los cinco skills de dominio de HeyGen (`hyperframes-core`, `-animation`, `-creative`, `-keyframes`, `-cli`). Uno de ellos, `hyperframes-creative`, puntúa como `dangerous`, y `--force` no lo anula. En cambio, el `hyperframes` del catálogo oficial es un port de un solo archivo y **no** trae esos skills de dominio. ✅ VERIFICADO (docs) — [brag SKILL.md](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/creative/brag/SKILL.md).

---

## 2. Catálogo

Cobertura: **Sub** = subtítulos/captions, **Tr** = transiciones, **Din** = dinamismo/ritmo, **Dat** = overlays de datos, **Otra** = otras capacidades afines.

### 2.1 Oficiales de Hermes (built-in u `official`)

| Skill | Hub/repo | Qué cubre | Cómo se invoca (alto nivel) | Qué NO hace | Fuente |
|---|---|---|---|---|---|
| `hyperframes` | Hermes `official/creative/hyperframes` (autor: heygen-com, Apache-2.0) | **Sub, Tr, Din, Dat, Otra.** El HTML con `data-*` y un timeline GSAP es la fuente del video; lo renderiza a MP4/WebM con FFmpeg. Plantillas como `kinetic-type` y `nyt-graph`. `hyperframes transcribe` da transcripción palabra por palabra para captions. TTS con voces en español (prefijo `e`). Transiciones CSS o shader (`flash-through-white`, `liquid-wipe`…) y visuales reactivos al audio. Advierte no usar modelos Whisper `.en` con audio que no esté en inglés. | `hermes skills install official/creative/hyperframes` y después la CLI `npx hyperframes init / lint / render`. Requiere Node ≥ 22, FFmpeg y chrome-headless-shell. | No hace animación matemática (eso es `manim-video`) ni generación de imágenes. Obliga a usar transición entre escenas: nada de jump cuts. | ✅ [SKILL.md](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/creative/hyperframes/SKILL.md), [catálogo](https://hermes-agent.nousresearch.com/docs/reference/optional-skills-catalog) |
| `kanban-video-orchestrator` | Hermes `official/creative/…` | **Otra.** Meta-pipeline: hace preguntas de descubrimiento, redacta un `brief.md`, diseña un equipo de perfiles de Hermes y lanza tareas en un Kanban con un «director». Pregunta la relación de aspecto (incluye 9:16). | `hermes skills install official/creative/kanban-video-orchestrator`, genera un `setup.sh` y se monitorea con `hermes kanban watch`. | **No renderiza nada por sí mismo**: delega en otros skills o en FFmpeg. | ✅ [SKILL.md](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/creative/kanban-video-orchestrator/SKILL.md) |
| `ai-presenter-video` | Hermes `official/creative/…` (port de cclank, MIT) | **Sub, Otra.** Video con presentador IA a partir de un guion y UNA imagen: narración, avatar con QA de lip-sync, captions, edición determinista con FFmpeg y normalización de loudness. | `hermes skills install official/creative/ai-presenter-video`. Pide consentimiento antes de cada generación paga. | Solo sirve si hay un presentador (avatar); no está pensado para un montaje de fotos. | ✅ [SKILL.md](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/creative/ai-presenter-video/SKILL.md) |
| `brag` / `brag-slim` | Hermes `official/creative/…` (stub; el contenido vive en `latent-spaces/brag`) | **Din, Otra.** Video de lanzamiento de 15–25 s con tono elegible, `--format vertical`, música y SFX con cues al beat. | `hermes skills install official/creative/brag` | Es para lanzar un proyecto de software, no para narrar contenido. La ruta completa depende de skills de HeyGen que hoy están bloqueados (ver §1). | ✅ [SKILL.md](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/creative/brag/SKILL.md) |
| `manim-video` | Hermes built-in | **Dat, Otra.** Animaciones con Manim CE. Tiene un modo «Data story» (gráficos animados, comparaciones, contadores). | Viene incluido. Necesita Python, Manim, LaTeX y FFmpeg. | No trabaja con fotos ni video real. | ✅ [SKILL.md](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/skills/creative/manim-video/SKILL.md) |
| `whisper` | Hermes `official/mlops/whisper` | **Sub (insumo).** Transcripción en 99 idiomas con timestamps por palabra (`word_timestamps=True`). | `hermes skills install official/mlops/whisper` | No quema ni anima subtítulos: solo produce el texto con tiempos. | ✅ [SKILL.md](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/mlops/whisper/SKILL.md) |
| `ascii-video` | Hermes built-in | **Otra.** Video en arte ASCII, con un modo «Lyrics/text» (audio + SRT). | Viene incluido. | Es solo una estética ASCII. | ✅ [SKILL.md](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/skills/creative/ascii-video/SKILL.md) |

### 2.2 Oficiales del proveedor (indexados vía skills.sh)

| Skill | Hub/repo | Qué cubre | Cómo se invoca | Qué NO hace | Fuente |
|---|---|---|---|---|---|
| `remotion-best-practices` (router), `remotion-captions`, `remotion-render`, `remotion-create`, `remotion-multimedia` | `remotion-dev/skills` | **Sub, Otra.** El router carga el skill que toque. `remotion-captions` usa el tipo `Caption` de `@remotion/captions`, con guías para transcribir, mostrar y animar captions e importar `.srt`. `remotion-render` usa `npx remotion render` (y renders con transparencia). | `npx skills add remotion-dev/skills`, o `hermes skills install skills-sh/remotion-dev/skills/<skill>`. | Los `SKILL.md` son routers cortos: el detalle está en archivos de referencia que no abrí. | ✅ [Remotion AI skills](https://www.remotion.dev/docs/ai/skills), [remotion-captions](https://raw.githubusercontent.com/remotion-dev/skills/main/skills/remotion-captions/SKILL.md), [best-practices](https://raw.githubusercontent.com/remotion-dev/skills/main/skills/remotion-best-practices/SKILL.md), [render](https://raw.githubusercontent.com/remotion-dev/skills/main/skills/remotion-render/SKILL.md) |
| `motion-graphics` | `heygen-com/hyperframes` | **Dat, Din.** Motion graphic corto (< 10 s, hasta ~30 s): tipografía cinética, **stat count-up**, gráfico o data-viz, lower third, overlay social y mapas animados. Sale en MP4 u **overlay transparente**. | `npx skills add heygen-com/hyperframes --skill motion-graphics` | No sirve para piezas narradas o de varias escenas (eso es `/general-video`). | ✅ [SKILL.md](https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/motion-graphics/SKILL.md), [README](https://raw.githubusercontent.com/heygen-com/hyperframes/HEAD/README.md) |
| `embedded-captions` | `heygen-com/hyperframes` | **Sub.** Captions sobre un video *talking-head* existente: un «rail» verbatim con un clímax incrustado detrás del sujeto, a partir de un catálogo de 35 estilos. Transcribe y recorta al sujeto en local. | `npx skills add heygen-com/hyperframes --skill embedded-captions` | Está pensado para un único sujeto hablando a cámara; el material con varios planos hay que dividirlo antes. | ✅ [SKILL.md](https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/embedded-captions/SKILL.md) |
| `media-use` | `heygen-com/hyperframes` | **Otra.** Resuelve música de fondo, SFX, imagen, logo, voz y etalonaje; también hace voiceover, transcripción, captions y cortes/reencuadres. | `npx hyperframes media-use resolve --type … --intent …`. Usa la CLI `heygen`. | Depende del catálogo y la cuenta de HeyGen. | ✅ [SKILL.md](https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/media-use/SKILL.md) |
| `captions-overlay` | `heygen-com/hyperframes` | **Sub.** Doctrina de captions como overlay (drop / rail / embed). | Marcado `internal: true`. El README dice que los skills internos del repo quedan excluidos por defecto. | No es instalable por defecto; skills.sh dice «No SKILL.md available». | ✅ [SKILL.md](https://raw.githubusercontent.com/heygen-com/hyperframes/HEAD/.agents/skills/captions-overlay/SKILL.md), [skills.sh](https://skills.sh/heygen-com/hyperframes/captions-overlay) |
| `slideshow` | `heygen-com/hyperframes` | **Otra.** Deck navegable con fragmentos. | `npx skills add heygen-com/hyperframes --skill slideshow` | **No produce un MP4 lineal**: el propio skill advierte que `render` lo trunca. | ✅ [SKILL.md](https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/slideshow/SKILL.md) |

### 2.3 Comunidad (skills.sh y ClawHub, confianza `community` en Hermes)

| Skill | Hub/repo | Qué cubre | Cómo se invoca | Qué NO hace | Fuente |
|---|---|---|---|---|---|
| `caption-animation` | skills.sh · `iart-ai/tiktok-video-skills` | **Sub, Din.** Pipeline Whisper → tokens `{text,startMs,endMs}` → «páginas» de 1–4 palabras (`createTikTokStyleCaptions()`) → pop por palabra y resaltado de la palabra activa → área segura 9:16 → quemado o SRT/VTT. Regla: timing por palabra, nunca por línea. | `npx skills add iart-ai/tiktok-video-skills` (o `--skill caption-animation`). Implementación en Remotion o CSS. | No transcribe por sí mismo: usa Whisper o AssemblyAI. | ✅ [SKILL.md](https://raw.githubusercontent.com/iart-ai/tiktok-video-skills/HEAD/skills/caption-animation/SKILL.md), [skills.sh](https://skills.sh/iart-ai/tiktok-video-skills/caption-animation), [README](https://raw.githubusercontent.com/iart-ai/tiktok-video-skills/HEAD/README.md) |
| `short-form-video` | skills.sh · `iart-ai/tiktok-video-skills` | **Din.** Gancho en ~1–3 s, una idea por video, interrupciones de patrón cada ~2–4 s con intervalos irregulares, punch-in zoom como interrupción barata, loops (último frame = primero) y áreas seguras 9:16. Entrega en Remotion. | Igual que arriba. | Las cifras de retención que cita (p. ej. «~87 % decide en 3 s») no traen fuente primaria dentro del skill. | ✅ [SKILL.md](https://raw.githubusercontent.com/iart-ai/tiktok-video-skills/HEAD/skills/short-form-video/SKILL.md) |
| `lower-thirds`, `countdown-video` | skills.sh · `iart-ai/tiktok-video-skills` | **Dat, Din.** Lower thirds con entrada escalonada y plantilla para varias personas. Contadores precisos al frame, con dígitos que giran o se voltean. | Igual que arriba. | Son genéricos, no deportivos. | ✅ [lower-thirds](https://raw.githubusercontent.com/iart-ai/tiktok-video-skills/HEAD/skills/lower-thirds/SKILL.md), [countdown](https://raw.githubusercontent.com/iart-ai/tiktok-video-skills/HEAD/skills/countdown-video/SKILL.md) |
| `chart-animation` | skills.sh · `iart-ai/data-animation-skills` | **Dat.** Bar chart race, líneas animadas, count-ups. Todos los valores salen de `useCurrentFrame()`, y se puede renderizar una plantilla con N datasets en lote. | `hermes skills install skills-sh/iart-ai/data-animation-skills/chart-animation` | Solo hace el gráfico; no compone el video completo. | ✅ [SKILL.md](https://raw.githubusercontent.com/iart-ai/data-animation-skills/HEAD/skills/chart-animation/SKILL.md) |
| `ffmpeg-captions-subtitles` | skills.sh · `josiahsiegel/claude-plugin-marketplace` | **Sub.** Quema de SRT/ASS/VTT, `force_style`, posición, `drawtext`, Whisper en FFmpeg 8 con VAD, pistas soft en varios idiomas. | `npx skills add https://github.com/josiahsiegel/claude-plugin-marketplace --skill ffmpeg-captions-subtitles` | No anima palabra por palabra (eso está en los skills cinéticos de abajo). | ✅ [SKILL.md](https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-core/skills/ffmpeg-captions-subtitles/SKILL.md), [skills.sh](https://skills.sh/josiahsiegel/claude-plugin-marketplace/ffmpeg-captions-subtitles) |
| `ffmpeg-kinetic-captions`, `ffmpeg-karaoke-animated-text`, `viral-video-animated-captions` | mismo repo | **Sub, Din.** Karaoke con word-grow, pop y bounce estilo CapCut, spring y shake, typewriter, perfiles de timing para TikTok y Shorts, y lower thirds animados, todo con etiquetas ASS y `drawtext`. | Igual (`--skill <nombre>`). | Todo es FFmpeg/ASS: no hay preview interactivo. | ✅ [kinetic](https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-effects/skills/ffmpeg-kinetic-captions/SKILL.md), [karaoke](https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-effects/skills/ffmpeg-karaoke-animated-text/SKILL.md), [viral captions](https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-social-video/skills/viral-video-animated-captions/SKILL.md) |
| `ffmpeg-transitions-effects` | mismo repo | **Tr, Din.** Más de 40 tipos de `xfade`, fundidos, wipes, slide/push, iris, secuencias de varios clips, **slideshow desde imágenes** y **Ken Burns con `zoompan`**. | Igual. | No es un editor visual. | ✅ [SKILL.md](https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-effects/skills/ffmpeg-transitions-effects/SKILL.md) |
| `viral-video-short-form`, `viral-video-platform-specs` | mismo repo | **Din, Otra.** Estrategia de short-form por plataforma (ganchos, loops) y specs de export y presets de FFmpeg por plataforma. | Igual. | Las afirmaciones sobre algoritmos no tienen fuente primaria dentro del skill. | ✅ [short-form](https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/viral-video-master/skills/viral-video-short-form/SKILL.md), [specs](https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-social-video/skills/viral-video-platform-specs/SKILL.md) |
| `video-editing` | ClawHub y GitHub · `PrunaAI/pruna-skills` | **Sub, Tr, Dat, Otra.** Postproducción local con FFmpeg sobre material ya renderizado: concat, crossfades, captions quemadas, title cards y lower thirds, música de fondo, export 9:16 con normalización de loudness. HyperFrames es opcional. | `npx skills add PrunaAI/pruna-skills@video-editing -y`. En ClawHub el slug es ambiguo (hay dos dueños con el mismo nombre). | **No genera video** ni escribe prompts de movimiento. | ✅ [SKILL.md](https://raw.githubusercontent.com/PrunaAI/pruna-skills/HEAD/skills/guides/video-editing/SKILL.md) |
| `whisperx` | mismo repo | **Sub (insumo).** Timestamps por palabra vía Replicate (`victor-upmeet/whisperx`); escribe JSON y SRT. | Igual. Requiere `REPLICATE_API_TOKEN`. | Es un servicio pago remoto. | ✅ [SKILL.md](https://raw.githubusercontent.com/PrunaAI/pruna-skills/HEAD/skills/audio/whisperx/SKILL.md) |
| `illustrated-story-reel`, `visual-transition-reel` | ClawHub y GitHub · Pruna | **Tr, Din.** Reel narrado a partir de imágenes con Ken Burns (modo `ken_burns`: imágenes + TTS, sin API de video) y montaje ensamblado localmente con FFmpeg. `visual-transition-reel` hace transiciones entre tomas generadas. | `npx skills add PrunaAI/pruna-skills@<skill> -y` | Parte de **imágenes generadas** con APIs pagas (Pruna/Replicate), no de fotos propias. | ✅ [illustrated (ClawHub API)](https://clawhub.ai/api/v1/skills/illustrated-story-reel), [visual-transition-reel](https://raw.githubusercontent.com/PrunaAI/pruna-skills/HEAD/skills/workflows/visual-transition-reel/SKILL.md) |
| `wjs-burning-subtitles` | ClawHub · `@jianshuo` | **Sub.** Video + SRT → quemado con libass o soft-mux `mov_text`. Mezcla el doblaje con el audio original de fondo en un solo encode. Comprueba antes que FFmpeg tenga libass y calibra `Fontsize` extrayendo un frame. | `openclaw skills install @jianshuo/wjs-burning-subtitles` | No hace captions cinéticas ni por palabra (las deriva a otro skill). | ✅ [ClawHub](https://clawhub.ai/jianshuo/skills/wjs-burning-subtitles) |
| `remotion-word-highlight-subtitles` | ClawHub | **Sub.** Resalta la palabra actual combinando timestamps de Whisper y render de Remotion, sobre videos cortos locales. | Por ClawHub. Requiere python3, FFmpeg, whisper y node. | — | ✅ [ClawHub API](https://clawhub.ai/api/v1/skills/remotion-word-highlight-subtitles) |
| `beat-sync-video-editing` | skills.sh · `ecliptic-ai/skills` | **Din, Tr.** Un «EditPlan» JSON (clips, audio) generado con Gemini, validado y renderizado con `filter_complex` de FFmpeg. | Script `gemini-edit-plan.sh`. | Depende de Gemini y parte de un video fuente, no de fotos. | ✅ [SKILL.md](https://raw.githubusercontent.com/ecliptic-ai/skills/HEAD/plugins/ecliptic/skills/beat-sync-video-editing/SKILL.md) |
| `moviepy`, `ffmpeg` | skills.sh · `digitalsamba/claude-code-video-toolkit` | **Dat, Otra.** Texto determinista superpuesto (labels, captions, lower thirds) con PIL y moviepy 2.x. FFmpeg para convertir, recortar, comprimir y extraer audio. | Vía skills.sh. | `ffmpeg` no trata subtítulos; `moviepy` no hace karaoke. | ✅ [moviepy](https://raw.githubusercontent.com/digitalsamba/claude-code-video-toolkit/HEAD/.claude/skills/moviepy/SKILL.md), [ffmpeg](https://raw.githubusercontent.com/digitalsamba/claude-code-video-toolkit/HEAD/.claude/skills/ffmpeg/SKILL.md) |

### 2.4 Vistos en el índice pero no verificados

- `openclaw/openclaw/video-frames` figura en el índice de Hermes (fuente skills.sh), pero no aparece en el árbol actual del repo `openclaw/openclaw`. 🟡 PROBABLE que existiera o que se haya movido — [skills.json](https://nousresearch.github.io/hermes-agent/docs/api/skills.json).
- ClawHub tiene decenas de skills más con descripciones afines (`tiktok-clipper`, `08-video-merge`, `chart-animation`, `byteplus-mediakit-video-highlights`…). Solo abrí los de la tabla. Los demás quedan 🟡 PROBABLE según su descripción en el índice.

---

## 3. Huecos

| Lo que pidió el usuario | ¿Hay skill? | Detalle |
|---|---|---|
| Subtítulos quemados | ✅ Sí, varios | Hay tres familias: FFmpeg/ASS (`ffmpeg-captions-subtitles`, `wjs-burning-subtitles`), Remotion (`remotion-captions`, `caption-animation`) y HyperFrames (`hyperframes`, `embedded-captions`). |
| Karaoke / palabra por palabra en español | ✅ Parcial | Los skills son agnósticos al idioma. `hyperframes` advierte explícitamente no usar Whisper `.en` con audio no inglés. ⛔ Ningún skill está enfocado en español. |
| Transiciones entre imágenes o clips | ✅ Sí | `ffmpeg-transitions-effects` (xfade, slideshow, Ken Burns), transiciones shader de `hyperframes`, crossfades de `video-editing`. |
| Ideas de ritmo y dinamismo | ✅ Como guía | `short-form-video` e `viral-video-short-form` son guías de oficio. `beat-sync-video-editing` corta al beat, pero exige Gemini y video fuente. ⛔ No hay skill que decida el ritmo a partir de una **narración ya grabada** sin música. |
| Overlays de estadísticas | ✅ Genérico | Count-up, gráficos y lower thirds: `motion-graphics`, `chart-animation`, `lower-thirds`, modo «Data story» de `manim-video`. ⛔ **No hay** skill de marcadores, alineaciones, xG o tablas de fútbol. |
| Skill oficial genérico de FFmpeg en Hermes | ⛔ No encontrado | Entre los skills `built-in`/`official` del hub no hay ninguno de edición FFmpeg general. Hay que ir a skills.sh o ClawHub. |
| Skills de video en `anthropics/skills` | ⛔ No encontrado | La carpeta `skills/` contiene algorithmic-art, canvas-design, slack-gif-creator, pptx, pdf, etc. Ninguno es de video. — [GitHub API](https://api.github.com/repos/anthropics/skills/contents/skills) |

---

## 4. Relevancia para shorts de fútbol con narración y fotos

Esta sección solo informa; no propone implementar nada en este repo.

- **El agente de GoatLab es OpenClaw, no Hermes.** Los mismos skills se pueden instalar desde OpenClaw sin pasar por Hermes: ClawHub con `openclaw skills install @owner/<slug>` y skills.sh con `skills-sh:owner/repo/slug`. El hub de Hermes sirve sobre todo como **buscador unificado**. ✅ [OpenClaw Skills](https://docs.openclaw.ai/tools/skills)
- **Dos familias encajan con «narración + fotos».** La primera es FFmpeg puro: slideshow con `xfade` y Ken Burns, más ASS para captions. Solo necesita FFmpeg con libass, y `wjs-burning-subtitles` documenta que el FFmpeg de Homebrew a veces viene sin libass. La segunda son los renderers HTML/React: HyperFrames o Remotion, que suman `motion-graphics`/`chart-animation` para las cifras, pero exigen Node y Chrome headless.
- **Las captions sincronizadas necesitan timestamps por palabra.** Todos los skills de captions animadas los piden (Whisper, WhisperX o `hyperframes transcribe`). Con narración en español, hay que evitar los modelos `.en`.
- **Para cifras** (probabilidades, forma, H2H) lo más cercano son los count-ups y gráficos genéricos. Cualquier overlay deportivo específico habría que diseñarlo.
- **Confianza:** casi todo lo útil es `community` en Hermes (escaneado, pero sin aval de Nous). Solo `hyperframes`, `kanban-video-orchestrator`, `ai-presenter-video`, `brag`, `whisper` y los built-in `manim-video`/`ascii-video` son `official` o `builtin`.

---

## 5. URLs consultadas (abiertas el 2026-09-27)

**Hermes Agent / Nous Research**
- https://github.com/NousResearch/hermes-agent
- https://hermes-agent.nousresearch.com/docs/skills
- https://hermes-agent.nousresearch.com/docs/user-guide/features/skills
- https://hermes-agent.nousresearch.com/docs/reference/optional-skills-catalog
- https://nousresearch.github.io/hermes-agent/docs/api/skills.json
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/creative/hyperframes/SKILL.md
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/creative/kanban-video-orchestrator/SKILL.md
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/creative/ai-presenter-video/SKILL.md
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/creative/brag/SKILL.md
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/optional-skills/mlops/whisper/SKILL.md
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/skills/creative/manim-video/SKILL.md
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/skills/creative/ascii-video/SKILL.md

**Estándar y registros vecinos**
- https://agentskills.io/
- https://docs.openclaw.ai/tools/skills
- https://api.github.com/repos/anthropics/skills/contents/skills
- https://clawhub.ai/jianshuo/skills/wjs-burning-subtitles
- https://clawhub.ai/api/v1/skills/illustrated-story-reel
- https://clawhub.ai/api/v1/skills/remotion-word-highlight-subtitles
- https://skills.sh/heygen-com/hyperframes/captions-overlay
- https://skills.sh/iart-ai/tiktok-video-skills/caption-animation
- https://skills.sh/josiahsiegel/claude-plugin-marketplace/ffmpeg-captions-subtitles

**Remotion**
- https://www.remotion.dev/docs/ai/skills
- https://raw.githubusercontent.com/remotion-dev/skills/main/skills/remotion-best-practices/SKILL.md
- https://raw.githubusercontent.com/remotion-dev/skills/main/skills/remotion-captions/SKILL.md
- https://raw.githubusercontent.com/remotion-dev/skills/main/skills/remotion-render/SKILL.md

**HeyGen HyperFrames**
- https://raw.githubusercontent.com/heygen-com/hyperframes/HEAD/README.md
- https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/motion-graphics/SKILL.md
- https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/embedded-captions/SKILL.md
- https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/media-use/SKILL.md
- https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/slideshow/SKILL.md
- https://raw.githubusercontent.com/heygen-com/hyperframes/HEAD/.agents/skills/captions-overlay/SKILL.md

**Comunidad**
- https://raw.githubusercontent.com/iart-ai/tiktok-video-skills/HEAD/README.md
- https://raw.githubusercontent.com/iart-ai/tiktok-video-skills/HEAD/skills/caption-animation/SKILL.md
- https://raw.githubusercontent.com/iart-ai/tiktok-video-skills/HEAD/skills/short-form-video/SKILL.md
- https://raw.githubusercontent.com/iart-ai/tiktok-video-skills/HEAD/skills/lower-thirds/SKILL.md
- https://raw.githubusercontent.com/iart-ai/tiktok-video-skills/HEAD/skills/countdown-video/SKILL.md
- https://raw.githubusercontent.com/iart-ai/data-animation-skills/HEAD/skills/chart-animation/SKILL.md
- https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-core/skills/ffmpeg-captions-subtitles/SKILL.md
- https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-effects/skills/ffmpeg-kinetic-captions/SKILL.md
- https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-effects/skills/ffmpeg-karaoke-animated-text/SKILL.md
- https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-effects/skills/ffmpeg-transitions-effects/SKILL.md
- https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-social-video/skills/viral-video-animated-captions/SKILL.md
- https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/ffmpeg-social-video/skills/viral-video-platform-specs/SKILL.md
- https://raw.githubusercontent.com/josiahsiegel/claude-plugin-marketplace/HEAD/plugins/viral-video-master/skills/viral-video-short-form/SKILL.md
- https://raw.githubusercontent.com/PrunaAI/pruna-skills/HEAD/skills/guides/video-editing/SKILL.md
- https://raw.githubusercontent.com/PrunaAI/pruna-skills/HEAD/skills/audio/whisperx/SKILL.md
- https://raw.githubusercontent.com/PrunaAI/pruna-skills/HEAD/skills/workflows/visual-transition-reel/SKILL.md
- https://raw.githubusercontent.com/ecliptic-ai/skills/HEAD/plugins/ecliptic/skills/beat-sync-video-editing/SKILL.md
- https://raw.githubusercontent.com/digitalsamba/claude-code-video-toolkit/HEAD/.claude/skills/moviepy/SKILL.md
- https://raw.githubusercontent.com/digitalsamba/claude-code-video-toolkit/HEAD/.claude/skills/ffmpeg/SKILL.md
