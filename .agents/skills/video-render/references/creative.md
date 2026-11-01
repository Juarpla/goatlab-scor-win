# Contrato creativo

Un Short de GoatLab es analítica de fútbol en 1080×1920: una voz, un banco de
imágenes y clips del partido, y una composición original que traduce la narración
a imagen. No hay plantilla obligatoria ni catálogo cerrado de gráficos.

## Material

El media pack (`public/data/media-pack/<id>.json`) trae:

- `assets`: hasta 4 imágenes Agnes de referencia.
- `clips`: clips del partido, normalmente 4, de unos 6.5 s a 720×1280.
- `facts`: cifras reales con fuente y tamaño de muestra.
- `match`, `home`, `away`, `competition`, `kickoff`.

Las imágenes ilustran; los clips muestran. Ni las imágenes ni los clips son
prueba de un resultado o de una alineación: no los presentes como tales.

## Plan

```json
{
  "version": 5,
  "visualStyle": "editorial | documentary | trailer",
  "music": true,
  "scenes": [{ "start": 0, "end": 4.5 }],
  "code": "módulo JSX con export default"
}
```

- `scenes` son tiempos absolutos para muestrear la revisión, no una estructura.
  Deben caber en el contenido: `0 … voiceSeconds / rate + 1`.
- `music` debe ser `true`.
- `code` se compila en Chromium y se ejecuta con los props del trabajo. Máximo
  200 KB.
- El cierre de 1 s con el logo lo añade el motor. El componente cubre solo
  `contentFrames`.

## Props

| Prop | Forma |
| --- | --- |
| `frames` | frames totales, incluido el cierre |
| `contentFrames` | frames del contenido, sin el cierre |
| `photos` | `[{src, backdrop, focusBlur, width, height}]` |
| `clips` | `[{src, width, height, duration}]` |
| `words` | `[{word, start, end}]`, ya desplazados 0.5 s |
| `facts` | cifras reales del partido |
| `match` | texto del partido |
| `brandName`, `brandUrl` | `GoatLab`, `goatlab.win` |
| `font`, `brand` | archivos locales del trabajo |

## Imports

Desde `react`: React y hooks estándar.

Desde `remotion` (4.0.537): `AbsoluteFill`, `Sequence`, `Series`, `Freeze`,
`Loop`, `Img`, `OffthreadVideo`, `Html5Video`, `Video`, `useCurrentFrame`,
`useVideoConfig`, `interpolate`, `interpolateColors`, `spring`, `Easing`, `random`,
`getInputProps`.

Desde `goatlab-kit`: `Captions`, `FitText`, `SafeArea`, `KenBurns`, `StatCard`,
`CameraMove`, `ColorWash`, `FilmGrain`, `phrases`, `wordAt`, `fitFontSize`.

`Video` es el alias local de `OffthreadVideo`. Nada de red externa, imports
dinámicos, DOM global ni APIs de Node.

## Kit

- `Captions({words, style, wordStyle, activeStyle, maxWords, render})` dibuja la
  frase activa. `render(grupo, índice)` la sustituye.
- `FitText({children, maxWidth, max, min})` ajusta el tamaño al ancho.
- `SafeArea({children, style})` deja 160/340/60/160 px.
- `KenBurns({src, from, to, durationInFrames, style})` mueve y acerca una foto.
- `StatCard({label, value, unit, source, countUp, style})` cuenta una cifra.
- `CameraMove({children, from, to, durationInFrames, startFrame, style})` mueve
  fotos, clips o grupos. `from`/`to` usan `scale`, `x`, `y`.
- `ColorWash({colors, opacity})` superpone uno o dos colores.
- `FilmGrain({opacity, seed})` añade grano determinista.
- `phrases(words)`, `wordAt(words, seconds)`, `fitFontSize(text, opciones)`.

El kit no define un estilo. Puedes combinarlo con código propio o no usarlo.

## Dirección visual

- Color vivo, saturación alta, verde de marca presente.
- Imagen brillante y nítida. Sin pasajes oscuros, negros aplastados ni viñetas
  pesadas.
- Desenfoque solo en fondos, transiciones y capas gráficas; nunca en el sujeto.
- Subtítulos `#ffe14a` con borde negro, legibles en teléfono.
- El verde oscuro `#101412` pertenece al cierre, no al contenido.
- Varía concepto, encuadre, ritmo y transiciones entre audios. No repitas una
  plantilla cambiando solo el texto.

## Zonas del formato

Lienzo 1080×1920. La interfaz de Shorts tapa unos 320 px inferiores y unos 140 px
del lateral derecho a partir de los 700 px de alto. Texto legible desde 40 px.
La zona segura del kit es 160 px arriba, 340 px abajo, 60 px izquierda y 160 px
derecha. El control de layout es un aviso, no un bloqueo.

## Clips y facts

- Todo clip utilizable aparece al menos una vez.
- Audio más corto que la suma de clips: recorta con `startFrom`/`endAt`.
- Audio más largo: reutiliza con `Loop` o `Freeze`.
- Usa 2–4 cifras de `facts`; nunca inventes estadísticas.
- Distingue la ilustración de la evidencia del partido.

## Revisión

Antes de entregar, muestrea al menos 5 fotogramas más el cierre y comprueba:
subtítulos legibles y dentro de la zona segura, imagen viva y nítida, clips
reconocibles, cierre con logo, sin negros accidentales. Si algo falla, edita el
plan y renderiza otra variante.
