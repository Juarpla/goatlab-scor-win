# Autoría Remotion

Guía del motor que gana el A/B: Remotion 4.0.537, React 19 y el kit local de
GoatLab. El plan es un módulo JSX de un solo archivo que el motor valida, compila
y ejecuta en Chromium.

## Cómo se ejecuta el plan

1. `validateAuthoredPlan` parsea el JSX con Babel y rechaza imports, globals y
   APIs prohibidas.
2. `bundleAuthored` envuelve el código en una composición `GoatLabShort`:
   - `<Sequence durationInFrames={contentFrames}>` monta tu componente.
   - Después añade 1 s de cierre con `brand.svg`.
   - Carga `LiberationSans-Bold.ttf` como `GoatLabLocal`.
3. `renderMedia` captura a 1080×1920, 30 fps, H.264/AAC, con `crf` configurable
   (`RENDER_CRF`, por defecto 20).

Tu componente **no** dibuja el cierre ni controla la duración total. Cubre
`contentFrames` y deja que el motor cierre.

## Esqueleto mínimo

```jsx
import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from 'remotion';

export default function Piece(props) {
  return (
    <AbsoluteFill style={{ background: '#101412' }}>
      <Sequence durationInFrames={props.contentFrames}>
        <MiEscena words={props.words} />
      </Sequence>
    </AbsoluteFill>
  );
}
```

`useCurrentFrame` dentro de una `Sequence` empieza en 0 en esa secuencia. Para
timear escenas absolutas, usa `from` y `durationInFrames` en la `Sequence` padre.

## Patrones

### Escena de foto con movimiento

```jsx
function Foto({ src, frames }) {
  return (
    <AbsoluteFill>
      <KenBurns src={src} durationInFrames={frames} from={{ scale: 1.02, x: 0, y: 0 }} to={{ scale: 1.13, x: 0, y: -30 }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(16,20,18,.05), rgba(16,20,18,.92))' }} />
      <AbsoluteFill style={{ padding: '160px 90px 340px', justifyContent: 'flex-end' }}>
        <div style={{ fontSize: 92, fontWeight: 800, color: '#F5F1E8' }}>TÍTULO</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
```

### Clip con overlay

```jsx
<Sequence from={690} durationInFrames={255}>
  <AbsoluteFill style={{ background: '#000' }}>
    <OffthreadVideo src={props.clips[0].src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, transparent, rgba(16,20,18,.9))' }} />
    <div style={{ position: 'absolute', left: 90, right: 90, bottom: 340 }}>
      <div style={{ fontSize: 82, fontWeight: 800, color: '#F5F1E8' }}>AHORA JUEGA EN SU CAMPO</div>
    </div>
  </AbsoluteFill>
</Sequence>
```

### Subtítulos

```jsx
<Sequence durationInFrames={props.contentFrames}>
  <Captions
    words={props.words}
    maxWords={4}
    style={{ padding: '0 70px 300px' }}
    wordStyle={{ fontSize: 58, textShadow: '0 4px 18px rgba(0,0,0,.85)' }}
    activeStyle={{ color: '#ffe14a' }}
  />
</Sequence>
```

Usa el relleno `#ffe14a` y un borde/sombra negra. No pongas dos capas de
subtítulos ni sumes offsets: `words` ya viene en la línea de tiempo final.

### Cifra real

```jsx
<StatCard label="ÚLTIMO CRUCE" value={4} unit="goles" source="Real Madrid CF" style={{ width: 430 }} />
```

`value` debe salir de `facts`. No inventes cifras ni uses porcentajes que el
partido no respalde.

### Cámara y color

```jsx
<CameraMove from={{ scale: 1, x: 0, y: 0 }} to={{ scale: 1.08, x: 0, y: -20 }} durationInFrames={300}>
  <Img src={props.photos[0].src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
</CameraMove>
<ColorWash colors={['#1B3A2A', '#101412']} opacity={0.12} />
```

`CameraMove` va dentro de una `Sequence` para reiniciar el movimiento por escena.

### Transiciones

`@remotion/transitions` no está en la lista de imports permitidos. Para
transiciones, anima opacidad, `clipPath`, `transform` o usa cortes secos. Un
corte sobre la voz suele leerse mejor que un fundido lento.

## Reglas que el validador aplica

- `version: 5`, `code` no vacío, máximo 200 KB.
- Duración dentro de `MAX_FRAMES`; `scenes` dentro del contenido.
- `music` booleano; `visualStyle` uno de los tres valores.
- Export default.
- Imports solo de `react`, `remotion` y `goatlab-kit`, con la lista exacta.
- Nada de `require`, `eval`, `Function`, `process`, `global`, `globalThis`,
  `window`, `document`, `fetch`, `XMLHttpRequest`, `WebSocket`, `Worker`,
  `navigator`, `localStorage`, `sessionStorage`, `setInterval`, `setTimeout`.

Un error de validación devuelve el mensaje y no renderiza. Corrige el plan; no
cambies el motor.

## Rendimiento

- `RENDER_WORKERS` reparte frames entre procesos. 3–4 es un buen punto en un
  portátil; cada worker abre su propio Chromium.
- `CAPTURE_BUDGET_MS` y `CAPTURE_TIMEOUT_MS` deben ir juntos. El primero decide
  si el render se considera viable; el segundo cancela la captura.
- `RENDER_CRF`: 20 por defecto; 23 produce archivos más pequeños; 16–18 para
  máxima calidad.
- `LAYOUT_CHECK=advisory` reporta texto recortado, fuera del lienzo o en zonas
  tapadas sin bloquear la entrega. Úsalo en el primer render.
- Evita decenas de capas con blur simultáneo. Si el presupuesto se agota,
  simplifica la escena más cara, no todo el video.

## Errores comunes

| Síntoma | Causa | Arreglo |
| --- | --- | --- |
| `compilación JSX` | import no permitido, sintaxis o export ausente | revisa imports y `export default` |
| `recurso ajeno al trabajo` | usaste una URL o un archivo que no viene de props | usa `photos[].src`, `clips[].src`, `font` o `brand` |
| `duración fuera de límite` | `scenes` o `frames` fuera de rango | ajusta `scenes` al contenido |
| `plan version:5 y code JSX` | falta `code` o versión | completa el JSON |
| Captions vacíos | `words` no se pasó a `Captions` | pasa `props.words` |
| Video negro | clip/foto no encontrado o capa opaca encima | revisa `src`, `zIndex` y el orden de capas |
| Texto cortado | no respeta la zona segura | usa `SafeArea` o padding 160/340/60/160 |

## Checklist antes de renderizar

- [ ] El JSON parsea y tiene `version: 5`, `music: true`, `visualStyle` válido.
- [ ] `scenes` termina dentro de `contentFrames / 30`.
- [ ] Export default y solo imports permitidos.
- [ ] Cada clip utilizable aparece al menos una vez.
- [ ] 2–4 cifras de `facts`, ninguna inventada.
- [ ] Subtítulos con `props.words`, relleno `#ffe14a` y borde negro.
- [ ] Texto dentro de la zona segura; nada crítico bajo los 320 px inferiores.
- [ ] Sin cierre propio: el motor añade el logo.
