# Estilo y lecciones

Preferencias permanentes de GoatLab para Shorts. Se versionan para que opencode,
Claude y Codex partan del mismo criterio. Añade una lección solo cuando se haya
probado en un render real; no conviertas una corazonada en regla.

## Imagen

- Color vivo. Saturación alta sin quemar; el verde de marca debe notarse.
- Luz abierta. Sin pasajes oscuros, negros aplastados ni viñetas pesadas.
- Nitidez primero. Recorta desde la resolución nativa; no amplíes por encima de
  la fuente.
- El desenfoque es recurso de fondo, transición o capa gráfica. Nunca del sujeto.
- `#101412` pertenece al cierre; no lo uses como fondo dominante del contenido.

## Texto

- Subtítulos `#ffe14a` con borde negro, 4 palabras por grupo como base.
- Nada de dos capas de subtítulos ni offsets manuales: `words` ya viene en la
  línea de tiempo final.
- Zona segura: 160 px arriba, 340 px abajo, 60 px izquierda, 160 px derecha.
- El texto debe leerse desde 40 px en un teléfono.
- No oscurezcas todo el cuadro para que el texto se lea; usa una franja o un
  degradado local.

## Montaje

- Todo clip utilizable aparece al menos una vez.
- Los clips mandan cuando existen; las imágenes apoyan.
- Usa 2–4 cifras de `facts`. Nunca inventes estadísticas ni porcentajes.
- Varía el concepto entre audios. No repitas plantilla cambiando solo el texto.
- Un corte sobre la voz suele leerse mejor que un fundido lento.

## Entrega

- 1080×1920, 30 fps, H.264/AAC, ≤55 s y <45 MB.
- 0.5 s de entrada + voz + 0.5 s de salida + 1 s de cierre con logo.
- Música obligatoria (`music: true`).
- Revisa al menos 5 fotogramas más el cierre antes de entregar.

## Lecciones del A/B de motores (2026-11-01)

- Remotion y HyperFrames producen calidad equivalente con el mismo material.
- Remotion fue más rápido con el mismo número de workers (33 s vs 37 s) y generó
  archivos más pequeños con el mismo CRF (21 MB vs 35 MB).
- HyperFrames aporta un `check` de layout útil, pero exige Chrome, CLI y HTML
  propio; no compensa como segundo motor.
- El plan JSX validado por el motor detecta imports y APIs prohibidas antes de
  capturar, lo que ahorra renders fallidos.

## Lecciones de alineación

- El guion es el texto maestro; Mistral pone el reloj.
- No edites tiempos a mano. Corrige el texto de referencia.
- Con `--script` sin `--script-n`, el CLI elige el guion de mayor coincidencia y
  lo registra en `guion: script N, NN%`.
- Por debajo de 50% de coincidencia, usa la transcripción cruda antes que una
  referencia equivocada.
