---
name: GoatLab
description: Sistema visual oscuro para leer el fútbol mediante datos comparables.
colors:
  deep-carbon: "#101412"
  matte-surface: "#181e1a"
  raised-surface: "#222a24"
  lime-signal: "#c5ed74"
  slate-blue: "#8ca6bf"
  warm-ink: "#edf0e6"
  quiet-ink: "#a4aea3"
  rule: "#354035"
  verde-forma: "#29351d"
  gris-forma: "#303732"
  rojo-forma: "#3b2824"
typography:
  display:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "clamp(3rem, 7vw, 5.125rem)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "clamp(2.25rem, 4vw, 4rem)"
    fontWeight: 600
    lineHeight: 1.03
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.3
  body:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.08em"
rounded:
  sm: "5px"
  md: "12px"
spacing:
  xs: "5px"
  sm: "12px"
  md: "22px"
  lg: "48px"
components:
  button-primary:
    backgroundColor: "{colors.lime-signal}"
    textColor: "{colors.deep-carbon}"
    rounded: "{rounded.sm}"
    padding: "12px 18px"
    height: "48px"
  button-filter-active:
    backgroundColor: "{colors.lime-signal}"
    textColor: "{colors.deep-carbon}"
    rounded: "6px"
    padding: "9px 12px"
    height: "40px"
  field-search:
    backgroundColor: "{colors.deep-carbon}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.sm}"
    padding: "10px 0"
  team-logo:
    hotlink: "https://sports.bzzoiro.com/img/team/{id}/?bg=transparent"
    fallback: "monograma de iniciales en Barlow Condensed sobre la superficie local"
    size: "28px en tarjetas; 30px en cabecera de partido"
  match-card:
    backgroundColor: "{colors.matte-surface}"
    rounded: "12px"
    padding: "18px 20px"
    grid: "masonry CSS (columns) en el muro de la portada"
    content: "chip de competición · kickoff hora local · escudos · forma G/E/P · sede o competición"
  hero-band:
    slides: "máximo 3, cifras reales de la base; rotación CSS 12s; primer slide estático con reduced-motion"
    figure: "Barlow Condensed 700 en lima señal, tabular-nums"
  form-chip:
    backgroundColor: "{colors.verde-forma} | {colors.gris-forma} | {colors.rojo-forma} según G/E/P"
    textColor: "#d2eea7 | #c7cfc6 | #e9b4a3 en el marcador; nota del rival en {colors.quiet-ink}"
    rounded: "6px"
    padding: "8px 8px 7px"
  map-pin:
    backgroundColor: "{colors.slate-blue} en reposo; {colors.lime-signal} activo o en vivo"
    size: "punto de 9px en botón de 30px de toque"
  ticker:
    motion: "loop lineal CSS 46s, contenido duplicado aria-hidden; fila estática con reduced-motion"
  verdict-bars:
    track: "12px con regla de 1px y relleno lima; etiqueta condensada y valor tabular"
    weight-bar: "mini barra lima de 5px por insumo declarado"

---

# Design System: GoatLab

## Overview

**Creative North Star: “La sala de análisis”**

GoatLab se comporta como una estación de análisis de video: la pantalla es mate, los datos tienen escala y cada capítulo deja claro qué se sabe. La interfaz usa una base verde carbón, texto marfil y señales lima o azul pizarra para distinguir equipos y estados.

La densidad cambia con el relato. Un gráfico grande abre la lectura; tablas y notas breves aterrizan la cifra; una pausa publicitaria ocupa un espacio reservado fuera del área de análisis. El sistema se mantiene legible cuando se reduce a una sola columna en móvil.

**Key Characteristics:**

- Datos comparables con ejes y escalas estables.
- Tipografía condensada para titulares y Manrope para lectura y controles.
- Capas tonales planas, reglas finas y una señal lima escasa.
- Movimiento concentrado en el cambio de capítulo y el scroll del análisis.

## Colors

La paleta se apoya en un carbón verdoso y una tinta cálida, con lima para acción o selección y azul pizarra para la segunda serie de datos.

### Primary

- **Lima señal** (#c5ed74): acción principal, selección activa y serie local del gráfico.

### Secondary

- **Azul pizarra** (#8ca6bf): segunda serie de datos y estados comparables.

### Neutral

- **Carbón profundo** (#101412): fondo de toda la aplicación y texto sobre la señal lima.
- **Superficie mate** (#181e1a): paneles de datos, gráficos y bloques destacados.
- **Superficie elevada** (#222a24): estados de filtro no activos y agrupaciones internas.
- **Tinta cálida** (#edf0e6): titulares, nombres de equipos y cifras principales.
- **Tinta quieta** (#a4aea3): notas, metadatos y explicaciones secundarias.
- **Regla** (#354035): divisores, ejes y bordes de campos.

**The Signal Rule.** La lima aparece en acciones, selección y una serie de datos; nunca pinta toda una sección.

**The Verdict Tint Rule.** Los resultados G/E/P usan tres tintas dedicadas (verde #29351d sobre texto #d2eea7, gris #303732 sobre #c7cfc6, rojo #3b2824 sobre #e9b4a3) en la forma de tarjetas y chips; jamás sustituyen a las señales primarias ni pintan superficies completas.

## Typography

**Display Font:** Barlow Condensed (with sans-serif)

**Body Font:** Manrope Variable (with sans-serif)

**Label/Mono Font:** Manrope Variable with tabular numerals for measurements.

**Character:** Barlow Condensed da a los nombres de partidos el pulso de una transmisión; Manrope mantiene las notas y los controles tranquilos y precisos.

### Hierarchy

- **Display** (700, `clamp(3rem, 7vw, 5.125rem)`, 0.95): tesis de portada y cierre editorial.
- **Headline** (600, `clamp(2.25rem, 4vw, 4rem)`, 1.03): títulos de encuentros y capítulos.
- **Title** (650, 1rem, 1.3): títulos de gráficos y bloques de lectura.
- **Body** (400, 0.9375rem, 1.6): contexto, metodología y notas; se mantiene en medidas de lectura cómodas.
- **Label** (600, 0.6875rem, 0.08em): competición, fuente, estado y acciones auxiliares.

**The Two Voices Rule.** Barlow Condensed nombra el juego; Manrope explica qué significa. No intercambiarlos para decorar.

## Layout

El contenedor máximo es de 1360px con 48px de margen lateral en escritorio y 22px en móvil. La portada abre con una tesis alineada a una nota lateral, luego una barra de filtros, un encuentro destacado en dos columnas y una lista de encuentros. El análisis divide notas y escenario gráfico: la nota avanza por capítulos y el escenario queda fijo mientras hay espacio.

En menos de 1150px se reduce la densidad de la lista; en menos de 760px todo pasa a una columna, los filtros se desplazan horizontalmente y el escenario del análisis se vuelve el bloque superior. La navegación se reduce a las acciones esenciales. El ritmo usa 12, 22, 32, 48 y 70px según la escala del bloque.

## Elevation & Depth

La profundidad se construye con capas tonales y reglas de 1px. No hay sombras decorativas: un panel de datos se reconoce por la superficie mate y su separación. La única elevación adicional es el bloque de gráfico frente al fondo.

**The Matte Surface Rule.** Las superficies permanecen opacas y quietas; el movimiento pertenece al capítulo activo, no a un efecto de cristal.

## Shapes

Los controles de acción tienen esquinas contenidas de 5px. Los paneles de lectura y gráficos usan 12px para marcar un conjunto completo. Las reglas son finas y rectas; no se usan bordes gruesos laterales en tarjetas o avisos. Las etiquetas de estado pueden usar una pastilla pequeña, nunca una forma que compita con el dato.

## Components

### Buttons

- **Shape:** esquinas contenidas (5px).
- **Primary:** lima señal sobre carbón, 48px de altura y `12px 18px` de espacio interno.
- **Hover / Focus:** lima aclarada al pasar; foco visible de 2px lima con 5px de separación.
- **Secondary:** texto quieto sobre fondo transparente; la selección usa superficie elevada o lima según su función.

### Chips

- **Style:** texto pequeño, fondo transparente y reglas mínimas.
- **Shape:** 6px para los filtros de competición; los controles de acción mantienen 5px.
- **State:** el filtro activo usa lima y texto carbón; los demás se mantienen quietos hasta interacción.

### Cards / Containers

- **Corner Style:** 12px para escenarios y paneles; 5px para controles.
- **Background:** superficie mate sobre carbón profundo.
- **Shadow Strategy:** capas tonales; sin sombra en reposo.
- **Border:** regla de 1px cuando se necesita separar un bloque.
- **Internal Padding:** 25–36px en paneles; 18–22px en móvil.

### Inputs / Fields

- **Style:** campo sin caja brillante, texto cálido y regla de 1px debajo.
- **Focus:** contorno lima visible y caret lima.
- **Error / Disabled:** texto quieto y mensaje de recuperación; no ocultar un estado de datos vacío.

### Navigation

La navegación usa Manrope pequeño, texto quieto y separación amplia. Los enlaces permanecen visibles en escritorio; en móvil quedan solo inicio y exploración del análisis.

### Chapter Stage

El escenario de capítulos es el componente distintivo: controles superiores, un gráfico que cambia de forma completa y una línea de fuente en el pie. El capítulo activo siempre tiene una alternativa de teclado y el contenido permanece disponible con movimiento reducido.

### Componentes de la portada (extensión 2026-09)

La portada añade cinco bloques dentro del mismo mundo:

- **Hero con banda rotativa:** la tesis editorial a la izquierda y una banda mate a la derecha con hasta tres cifras reales de la base (resultados, partidos de la ventana, cruces cara a cara) que rotan con CSS. Con `prefers-reduced-motion` la banda muestra la primera cifra estática.
- **Ticker de la ventana:** franja de 1px de regla con los encuentros de la semana (chip de competición, equipos abreviados, hora local) en loop lineal; decorativo (`aria-hidden`) y estático con movimiento reducido.
- **Forma destacada:** panel de dos columnas con el encuentro prioritario; la comparación de goles reales se revela hacia arriba (`clip-path`) cuando entra en pantalla, una sola vez.
- **Ruta de lectura:** tres paradas numeradas (forma, números, límites) unidas por separadores; no son tarjetas.
- **Muro de encuentros:** masonry de tarjetas con escudo por hotlink y monograma de respaldo, forma G/E/P de ambos lados y hora local. Los filtros y la búsqueda viven en `/encuentros/`.

### Muro de encuentros (/encuentros, extensión 2026-09)

- **Fila de 3:** en escritorio los tres primeros encuentros visibles viven en una fila de ancho completo (3 pistas `minmax(0,1fr)`) encima del muro; la anatomía de la card no cabe en pistas de ~200px, así que en tablet y mobile la fila no existe y todo va al masonry (el JS redistribuye; sin JS nada desaparece).
- **Anuncios reservados:** en escritorio el masonry de 2 columnas va flanqueado por dos ads verticales de 300×600 (`AdSlot variant="vertical"`, en flujo, sin sticky, terminan antes del footer). Tablet muestra solo el horizontal final; mobile añade un horizontal debajo de los filtros. Alturas reservadas: sin layout shift, listos para el snippet real de AdSense.
- **Regla de expiración:** un partido sale del muro (y del JSON en los runs de datos) al cumplir 90' de juego + 15' de descanso + 10' fijos desde el kickoff; no hay filtro de finalizados ni partidos del pasado en la página.
- **Momento autoral:** al cambiar cualquier filtro, las tarjetas visibles re-entran en escalera (rise de 14px, ease-out exponencial, 45ms por tarjeta, tope 10); punto lima con pulso de 1.8s junto a «EN VIVO» (el mismo lenguaje del pin vivo). Ambos callados con `prefers-reduced-motion`.

### Región de jornada (extensión Fase 2, 2026-09)

Un bloque único entre los anuncios, con cuatro piezas del mismo mundo:

- **Mapa de sedes:** retícula equirectangular de puntos de tierra (PNG generado de Natural Earth, dominio público, fondo idéntico a la superficie mate) con un pin por ciudad — azul pizarra en reposo, lima con parpadeo de 1.8s cuando hay partido en vivo (ventana kickoff → +1 h 50 min, minuto «est.» calculado en cliente). Cada pin abre una ficha elevada con estadio, capacidad declarada y horarios; los encuentros sin sede resuelta bajan a una fila de texto bajo el mapa, nunca desaparecen. Con `prefers-reduced-motion` el pin vivo queda lima sólida, sin animación.
- **Pulso de la base:** ledger de hasta 4 hitos reales (racha vigente, más goles, goleada, equipo de moda) en filas con rango en lima; nunca tarjetas de cifra hero.
- **Los nombres que marcan:** el mismo ledger en versión jugadores — goleador, asistente y el más eficaz (goles por partido, sin repetir al goleador) entre las ligas cubiertas, con club y competición en el detalle; solo leaders que la fuente entregó.
- **Tabla viva:** top-10 por competición con pestañas de filtro; solo se muestran tablas que el proveedor entregó y, si no llegó ninguna, un estado vacío honesto con la siguiente acción.
- **Termómetro:** la banda rotativa del hero, en versión panel, con tres cifras reales de los últimos 60 días.

**The Micro-Label Ramp Rule.** Las etiquetas y metadatos usan una escala fina de 9–13px (10px para notas de panel, 11px para pies, 12–13px para metadatos y controles) siempre en Manrope con numeración tabular; Barlow Condensed queda reservado para nombres y cifras de 16px hacia arriba.

### Veredicto (página de partido)

El capítulo de veredicto muestra cada insumo con su peso en una mini barra lima y explica los ausentes. Las barras de probabilidad (1X2 y mercados binarios) solo llevan porcentajes cuando la evaluación histórica publicada supera su referencia; sin ella, el panel muestra «Evaluación en curso», la dirección cualitativa de los insumos y la reserva de muestra corta. La localía y las ausencias acompañan como texto, nunca como número.

### Contacto y cierre promocional (extensión 2026-09)

La página de contacto abandona el `prose` estático y entra en el relato del sistema:

- **Scrollytelling de contacto:** la grilla `.story` reutilizada con tres capítulos (reporte de errores, límites de la IA, exclusión de apuestas) y un escenario sticky que cambia de escena por capítulo sin pestañas; la activación sigue el marcador de la página de partido y las capas cruzan con el vocabulario de 240/420ms. El trazo de cada escena se dibuja al activarse (`pathLength` escalonado); los trazos discontinuos (una estimación declarada) aparecen en vez de trazarse. Con `prefers-reduced-motion` el intercambio es instantáneo y el escenario deja de ser sticky; sin JS el texto queda íntegro y el primer gráfico visible. En ≤760px el escenario desaparece y cada capítulo lleva su escena inline, con los trazos ya resueltos.
- **Escenas del método (`ContactScene.astro`):** geometría declarativa (barras, sobre, lupa, prohibición) con lima escasa como señal única por escena y azul pizarra como segunda serie; `aria-hidden`, etiquetadas al pie como «geometría declarativa, sin datos de ejemplo». Nunca partidos ni cifras reales.
- **Slide de cierre (`PromoSlide.astro`):** autopromoción de GoatLab, no inventario AdSense — lleva la etiqueta PUBLICIDAD fuera; sin disfraz de anuncio de terceros. Superficie mate con regla de 1px y radio 12px; titular a dos voces con la segunda línea en lima por el precedente de la banda del hero; botón primario a `/encuentros/`; nota de exclusión permanente de casas de apuestas. En móvil apila con el CTA a ancho completo.
- **Pausas AdSense:** dos slots reservados viven dentro de la columna de relato (rect tras el capítulo 2, horizontal al cierre, claves `contactoCap2` y `contactoCierre` en `src/config/ads.ts`) con el pacing apretado de metodología (`margin-block:6px`); el escenario sticky queda sin publicidad, y el slot de cierre se separa del slide de cierre. Sin credenciales, muestran el marcador reservado y el script de Google nunca se carga.
- **Mockup de teléfono:** SVG decorativo (`aria-hidden`) con UI esquemática del producto — chips de forma con los tres tintas de veredicto y la barra de probabilidad que se llena una vez al entrar en vista (`js-anim` + `in-view`); sin marcadores, nombres ni cifras inventadas.

## Do's and Don'ts

### Do:

- **Do** etiquetar demostraciones, fuentes, retrasos y fechas de actualización junto al dato.
- **Do** conservar ejes, escalas y colores de serie al cambiar de capítulo.
- **Do** mantener la publicidad en espacios reservados fuera del gráfico y del texto que se está leyendo.
- **Do** diseñar el estado vacío con una siguiente acción clara.
- **Do** respetar `prefers-reduced-motion` y el foco visible en teclado.

### Don't:

- **Don't** mostrar porcentajes predictivos sin evaluación histórica publicada.
- **Don't** usar datos sintéticos como si fueran partidos reales.
- **Don't** usar gradientes de texto, brillos o sombras de bloque como decoración.
- **Don't** poner enlaces a casas de apuestas ni llamadas a apostar.
- **Don't** ocultar una ausencia de datos detrás de una animación o un número inventado.
