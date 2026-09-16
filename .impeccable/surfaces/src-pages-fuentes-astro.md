---
version: 1
slug: "src-pages-fuentes-astro"
primary_target: "src/pages/fuentes.astro"
related_targets: ["src/styles/fuentes.css"]
---

# Surface brief — src/pages/fuentes.astro

## Scope and visitor mode

Ruta `/fuentes/`, plataforma web. Modo **Read**: el visitante entiende de dónde salen los datos antes de seguir leyendo el sitio. Audiencia: lector hispanohablante de LATAM que quiere saber qué respalda cada cifra y qué límites tiene el sitio. Tarea: identificar las 3 fuentes, su cadencia y la regla de marcas. Acción: abrir una fuente o pasar a metodología/privacidad.

## Constraints

- Mundo visual fijado por DESIGN.md ("La sala de análisis"): carbón, tinta cálida, lima solo como señal, azul pizarra como segunda serie, superficies mate, reglas de 1px, sin gradientes ni brillos.
- Publicidad solo como espacios reservados (`AdSlot.astro`), fuera del gráfico y del texto que se lee; mínimo 2 visibles en mobile.
- Copy condensado pero verbatim en hechos: cadencia 2:00 a. m. (hora de Perú), marcadores cada 6 horas, consultas compartidas, no posiciones del balón ni seguimiento continuo, disclaimer de escudos completo, links a api-football.com, football-data.org, sports.bzzoiro.com, /metodologia/, /privacidad/.
- Sin datos deportivos inventados: los diagramas muestran la forma de los datos, no partidos ni cifras ficticias. Monogramas de proveedores como texto de iniciales (AF, FD, BZ), no logos de terceros.
- Vanilla JS + CSS, `prefers-reduced-motion` respetado, foco visible, sin dependencias nuevas.

## Chosen direction and memorable moment

Dirección elegida por el usuario vía entrevista (grilling, respuestas confirmadas "sí a todas"): scrollytelling híbrido — reveals con SVG por sección para las 3 fuentes, stage sticky con dial para "Con qué frecuencia", escudo genérico para marcas; 3 `AdSlot` fijos entre capítulos. Momento memorable: el dial de 24 h que barre el día al hacer scroll y enciende las marcas de 6 h, con la muesca de 2:00 a. m. (Lima).

## Unresolved decisions

Ninguna bloqueante. Pendiente del usuario: activación real de AdSense (fuera de alcance; slots siguen siendo placeholder).

---

## Direction contract

**THESIS.** Esta página es el diagrama de la sala de análisis: tres tuberías de proveedores gratuitos alimentan el tablero que publica GoatLab. Refusa el arreglo por defecto de la categoría: un documento de texto largo de `prose` con listas de proveedores; en su lugar, cada fuente es una escena geométrica con su regla de fuente al pie, y el tiempo de actualización es un instrumento, no un párrafo.

**OWN-WORLD.** Carbón #101412 con tinta cálida #edf0e6; lima #c5ed74 solo en señal (nodo vivo, arco de barrido, muesca 2:00, ticks encendidos); azul pizarra #8ca6bf para la segunda serie; superficies mate #181e1a y elevada #222a24 con reglas #354035 de 1px; radios 12px en paneles, 5px en controles; Barlow Condensed para nombres y cifras grandes, Manrope para notas y metadatos con numerales tabulares; monogramas de iniciales sobre superficie elevada; sin sombras, sin cristal.

**STORY.** El visitante entiende: cada cifra tiene fuente y fecha; hay tres proveedores con roles distintos (marcadores; ventana e historial; xG, eventos y modelo); los datos se renuevan a horarios fijos y compartidos; los escudos son de sus dueños. Cree que el sitio declara sus límites con honestidad. Hace: abre la fuente que le interesa o sigue a metodología/privacidad.

**FIRST VIEWPORT.** A 1440px: header estándar; en el viewport de la página, h1 display de dos líneas "De dónde salen / los datos." (segunda línea en lima, ~72px) a la izquierda con párrafo introductorio de 2 frases y 2 enlaces contextuales abajo; a la derecha, panel mate 12px con la escena de tubería: tres reglas etiquetadas AF / FD / BZ que convergen en un nodo lima y alimentan un marcador esquemático con punto vivo. Sin kicker sobre el h1. La escena se dibuja sola una vez al entrar (strokes que avanzan, desfasados).

**FORM.** Forma elegida: scrollytelling híbrido en grilla de dos columnas con ritmo zebra (copy|escena alterna), pin dial en el capítulo de frecuencia, cierre callado con escudo genérico y enlaces. Derivada directamente de la entrevista; sin tournament ni seed key (petición estrechamente especificada). Momento firmado: el barrido del dial ligado al scroll con --freq-progress.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

---

## Extension note — 2026-09-16 (documentation check, ordinary-extension audit)

Audit of the finished build (`src/pages/fuentes.astro` + `src/styles/fuentes.css`) against `DESIGN.md` ("La sala de análisis") and `global.css`: full token parity (zero hardcoded hex/rgb; every color/spacing/radius resolves to a `:root` token; fonts only `var(--display)`/`var(--body)`), `AdSlot` reused unmodified ×3, `.f-note` mirrors incumbent `.chapter-note` (11px muted + 1px top rule), sticky stage/reduced-motion/mobile mirror `.story-stage`, `js-anim` + rAF-passive scroll mirror `index.astro` / `partido/[id].astro`, zero raster assets (all visuals inline SVG).

Genuinely new durable component rule committed, not covered by DESIGN.md:

- **Dial de frecuencia (`.f-dial-*`)**: instrumento de 24 h cuyo estado vive en una variable de scroll (`--freq-progress` 0–1 en `.f-freq`) que gobierna el arco (`stroke-dashoffset`), la aguja (`rotate`), los ticks encendidos (umbral `p ≥ .01 + k·.25`) y las notas activas. En reposo sin JS y con `prefers-reduced-motion`. Vocabulario candidato para una sección de extensión futura en DESIGN.md (precedente: extensiones por página de portada/jornada/contacto).
- La familia `.f-scene .s-*/.t-*` es geometría de página que reutiliza el precedente documentado de geometría declarativa (DESIGN.md, «Escenas del método»): extensión coherente, sin cambio de sistema (mismos tokens, lima escasa, azul pizarra como segunda serie).
