---
version: 1
slug: "src-pages-contacto-astro"
primary_target: "src/pages/contacto.astro"
related_targets: ["src/styles/contacto.css","src/components/PromoSlide.astro","src/components/ContactScene.astro"]
---

---
version: 1
slug: "src-pages-contacto-astro"
primary_target: "src/pages/contacto.astro"
related_targets: ["src/styles/contacto.css", "src/components/PromoSlide.astro", "src/components/ContactScene.astro"]
---

# Surface brief — src/pages/contacto.astro

## Scope and visitor mode

Ruta `/contacto/`, plataforma web. Modo **Read**: el visitante entiende cómo reportar un error, qué límites declaran los análisis preparados con IA y qué queda fuera del proyecto por criterio editorial; la banda de cierre autopromociona el sitio. Audiencia: lector hispanohablante de LATAM que encontró una cifra dudosa, quiere saber cómo se controla la IA o qué no se atiende. Acción: escribir a contacto@scor.win (mailto) o continuar a /encuentros/ desde el slide de cierre.

## Constraints

- Mundo fijado por DESIGN.md («La sala de análisis»): carbón #101412, tinta cálida, lima solo como señal, azul pizarra como segunda serie, superficies mate, reglas de 1px, radios 12px en paneles y 5px en controles; sin gradientes, brillos ni sombras decorativas.
- Copy condensado conservando los hechos verbatim: correo contacto@scor.win; las correcciones se revisan antes de la siguiente actualización programada; los análisis con IA indican sus limitaciones junto al texto; exclusión permanente de cuotas, casas de apuestas y recomendaciones de apuesta.
- Sin escudos y sin contenido de apuestas. Los SVG son geometría declarativa del método (barras, sobre, lupa, prohibición), nunca partidos ni cifras reales ni escenas ilustrativas; se etiquetan como decorativos (aria-hidden).
- Vanilla JS + CSS, sin dependencias nuevas. Sin JS: texto íntegro y primer gráfico visible. `prefers-reduced-motion`: intercambio instantáneo, sin trazo animado. Foco visible y markup reutilizando la grilla `.story` global.
- El slide de cierre es autopromoción de GoatLab (no inventario AdSense): sin etiqueta PUBLICIDAD, con mockup SVG de teléfono (UI esquemática, sin marcadores inventados) y CTA a /encuentros/. Debe verse en mobile.
- Slots AdSense orgánicos a la metodología: dos reservados dentro de `.story-notes` (rect tras el cap. 2 `contactoCap2`; horizontal al cierre `contactoCierre`), pacing `margin-block:6px`, escenario sin publicidad. Aprobado por el usuario tras el primer ship («2 slots»).

## Chosen direction and memorable moment

Dirección elegida por el usuario vía entrevista (grilling, «sí a todas las recomendaciones» + «agrega dinamismo y belleza»): scrollytelling ligero — tres capítulos a la izquierda y escenario sticky a la derecha cuyo diagrama lineal cambia por capítulo (sin pestañas); en ≤760px el escenario desaparece y cada capítulo lleva su diagrama inline. Slide de autopromoción al cierre con mockup de teléfono y barra de veredicto animada. Momento memorable: el trazo del escenario que se dibuja en cada cambio de capítulo (dato descollante → lupa → prohibición).

## Unresolved decisions

Ninguna. Resuelto al cierre con aprobación del usuario: entrada «Contacto y cierre promocional (extensión 2026-09)» añadida a DESIGN.md. Veredicto del finish review: ship (re-review con evidencia `contact-*.png`, hashes verificados).

---

## Direction contract

**THESIS.** La página de contacto es un capítulo más de la sala de análisis: reportar un error es parte del método, no un pie de página. Refusa el arreglo por defecto de la categoría: `prose` estático de tres párrafos con mucho texto; en su lugar, tres capítulos que avanzan sobre un escenario gráfico fijo que se redibuja, y un cierre editorial que autopromociona el producto sin disfrazarse de anuncio de terceros.

**OWN-WORLD.** Carbón #101412; escenario y slide en superficie mate #181e1a con regla #354035 y radio 12px; lima #c5ed74 solo en señal (dato descollante, barra estimada, prohibición, CTA); azul pizarra #8ca6bf como segunda serie de los diagramas; Barlow Condensed para titulares de capítulo y slide, Manrope para lectura, notas (11px) y metadatos con numerales tabulares; sin kickers, sin sombras, sin cristal.

**STORY.** El visitante entiende: dónde reportar (correo real; revisión antes de la siguiente actualización programada), que la IA marca sus límites y que reportar un dato inventado es exactamente lo que se busca, y que cuotas/casas de apuestas quedan fuera por criterio editorial permanente. Cree que el sitio se corrige en público. Hace: escribe al correo o entra a /encuentros/ desde el cierre.

**FIRST VIEWPORT.** A 1440px: header estándar; h1 «Contacto.» display ~72px con una línea introductoria (sin kicker); grilla story: a la izquierda el capítulo 1 («Reporta lo que / no cuadra.») con el mailto como control de acción en superficie elevada y nota de correcciones al pie; a la derecha, escenario mate sticky con la escena 1 (fila de barras en azul pizarra, una lima más alta con anillo, flecha hacia un sobre de línea) ya visible, trazándose al cargar. Sin kickers ni numeración de secciones.

**FORM.** Forma elegida: scrollytelling ligero sobre la grilla `.story` existente (capítulos + stage sticky con capas SVG cruzadas is-active/is-leaving), sin tabs ni override manual; activación por marcador de scroll con rAF (patrón de partido, funciona también con movimiento reducido); en ≤760px stage fuera y diagrama inline por capítulo. Momento firmado: el trazo (`ct-draw` con pathLength) que se dibuja al activarse cada capítulo; en el slide, la barra de veredicto del teléfono que se llena una vez al entrar en vista (`js-anim` + `in-view`, patrón de portada). Petición estrechamente especificada: sin tournament ni seed key.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
