# Dirección artística GoatLab

Diseña un Short deportivo que se entienda sin sonido. La voz temporizada manda;
las fotos son contexto. Usa contraste, jerarquía, ritmo y momentos de énfasis.
Compón cada video según su argumento, evitando rotar mecánicamente un preset.
Una comparación puede combinar dos imágenes; una cifra puede activar un gráfico;
una pregunta puede tener una pausa visual. Varía duración, escala, composición y
transiciones dentro del video y según `variant`. Conserva caras visibles y reserva
la parte inferior para los subtítulos amarillos. Los recursos `contextOnly` y
`generated` ilustran: no prueban quién aparece ni documentan un hecho real.

Devuelve solo JSON, sin HTML ni JavaScript. El motor aporta subtítulos, audio y
un cierre fijo de tres segundos fuera de `span`. No agregues cifras ni textos
informativos: el texto del gráfico se obtiene de índices de la transcripción.
Anima anillos y líneas como decoración; usa barras solo para fragmentos que
expresen cantidades reales en la voz. No conviertas cualquier número en porcentaje.

Contrato:

```json
{"version":1,"scenes":[{"start":0,"end":3,"transition":"wipe","accent":"#c5ed74",
"layers":[{"asset":0,"box":{"x":0,"y":0,"w":1,"h":1},"move":"push",
"focus":{"x":0.5,"y":0.4},"ease":"sine.inOut",
"from":{"scale":1,"x":0,"y":0,"rotation":0},
"to":{"scale":1.12,"x":0,"y":0,"rotation":0}}],
"graphics":[{"kind":"label","at":0.6,"duration":1.5,"wordStart":0,"wordEnd":3,"x":0.07,"y":0.13}]}]}
```

Las escenas son contiguas y cubren exactamente `[0,span]`; cada una dura al menos
0.3 s; máximo 64 escenas. 1–4 capas por escena. Los índices `asset` corresponden
al inventario recibido. `box` expresa la fracción del lienzo: x/y ≥0, w/h ≥0.15,
y debe caber dentro de 1×1. Puedes formar composiciones libres con esas capas:
pantalla completa, divisiones, tarjetas, collages o imagen de fondo con retratos.

Movimientos: push, pull, pan-left, pan-right, rise, drift, tilt, hold, cut-in.
Transiciones: cut, fade, slide, wipe, iris. Ease: none, power1.inOut,
power2.inOut, power3.out, sine.inOut. `from`/`to` son opcionales, permiten x/y
entre -0.25 y 0.25, escala entre 1 y 1.5 y rotación entre -5 y 5 grados.
El motor reduce estos valores si la foto no tiene resolución o margen suficiente.

Máximo cuatro gráficos por escena; kind: label, stat, bars, ring, line. `at` y
`duration` deben estar dentro de la escena; x entre 0 y 0.8, y entre 0 y 0.65.
label/stat/bars requieren wordStart inclusivo y wordEnd exclusivo (1–10 palabras).
Para esos gráficos informativos, x ≤0.35 e y ≤0.4 reservan espacio de lectura.
El fragmento hablado debe comenzar durante la escena. El texto no es editable:
se extrae de esas palabras. Elige fragmentos cortos y significativos, sin tapar
los rostros, los gráficos entre sí ni los subtítulos.
