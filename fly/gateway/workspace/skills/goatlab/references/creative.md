# Dirección artística GoatLab — Remotion

Produce un plan JSON de montaje version 4 a partir de la voz temporizada. La voz
es la narración; los Image Prompts y Video Prompts describen el banco Agnes.
Los cinco Motion Prompts dirigen gráficos pertinentes al argumento de ese audio.
Compón escenas contiguas que cubran exactamente [0,span]. El motor añade el cierre
fuera de span. Decide ritmo, entradas, salidas y énfasis según las frases escuchadas.

## Composición

Estilo editorial deportivo: fondo carbón #101412, blanco #edf0e6, acentos lima
#c5ed74 y azul gris #8ca6bf. Un punto de atención por escena; alterna imágenes,
clips y análisis con cortes normalmente cada 2–5 segundos. Una comparación puede
ocupar 6–10 segundos cuando la voz lo permita. Reserva el cuarto inferior para los
subtítulos amarillos; títulos y cifras viven arriba y al centro. Evita superponer
rostros, títulos y gráficos. Las imágenes y clips son ilustraciones referenciales.

Entrega solo JSON. Los textos informativos se extraen de la voz o del catálogo
facts. Los componentes React resuelven valores, unidades, fuente y muestra.

## Contrato de escenas

Cada escena tiene start/end en segundos, transition, accent, layers, clips,
graphics y objects opcionales. Máximo 64 escenas; cada una dura al menos 0.3 s.
Hasta cuatro imágenes y dos clips por escena; usa sus índices del inventario.
Layers admiten asset, box {x,y,w,h}, move, focus {x,y}, from/to {x,y,scale,rotation},
ease y focusEffect. Box cabe en 1×1, w/h ≥0.15. Movimientos: push, pull, pan-left,
pan-right, rise, drift, tilt, hold, cut-in. Transiciones: cut, fade, slide, wipe,
iris, focus, defocus. Ease: none, power1.inOut, power2.inOut, power3.out, sine.inOut.
From/to: x/y ±0.25, escala 1–1.5, rotación ±5 grados; el motor limita el recorte
por la resolución real. FocusEffect: none, focus, defocus, pulse.

Clips: [{"clip":0,"offset":1,"duration":3}]. Offset y duración corresponden al
archivo fuente. Duration ≤ escena; offset + duration ≤ duración del recurso.
El motor silencia los clips y conserva el tiempo global de la voz.

## Motion graphics

Selecciona una entrada de motionPrompts cuyo tema aparezca en la voz:
form, goals, clean-sheets, head-to-head o synthesis. Cada gráfico identifica
motionPromptNumber (n original), factIds y wordStart/wordEnd (fragmento hablado
pertinente de 1–10 palabras). At y duration permanecen dentro de la escena.
Máximo ocho referencias por gráfico, todas presentes en ese Motion Prompt y facts.
Usa familias form para victorias/empates/derrotas, goals para goles a favor y
recibidos, clean-sheets para arcos en cero, head-to-head para cruces previos y
synthesis para tarjetas estadísticas. Mantén unidades iguales en comparaciones.
Cuando el tema no tenga datos, usa factIds: []: el componente muestra Datos no
disponibles. No obliga a incluir los cinco temas en cada audio.

Ejemplo:
```json
{"version":4,"scenes":[{"start":0,"end":6,"transition":"fade","layers":[],
"graphics":[{"kind":"goals","motionPromptNumber":2,"factIds":["home.gf","away.gf"],
"wordStart":0,"wordEnd":4,"at":0.5,"duration":5.5}]}]}
```

También existen label, stat, title y bars con fragmento wordStart/wordEnd o
factIds del catálogo; ring y line son decoración geométrica. Máximo cuatro
gráficos por escena. At/duration están dentro de la escena; x 0–0.8, y 0–0.65.
Los informativos legacy usan x ≤0.35, y ≤0.4 y hasta cuatro referencias. Las cifras
provienen del catálogo; usa los componentes motion para estadísticas nuevas.

Objects opcionales: hasta tres tarjetas de profundidad, kind cube/card/prism,
x 0.08–0.7, y 0.08–0.55, size 80–360, rotateX ±35, rotateY/spin ±180. Las etiquetas
opcionales usan 1–6 palabras mediante wordStart/wordEnd. El motor aporta marca,
música, subtítulos y cierre. Los planes guardados 1–3 siguen aceptados.
