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
