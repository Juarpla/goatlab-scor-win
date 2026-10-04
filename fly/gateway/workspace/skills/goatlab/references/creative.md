# Dirección artística GoatLab

## Composición editorial deportiva

Fotos protagonistas y escenas de análisis con jerarquía clara. El motor incorpora
una cancha con perspectiva como geometría decorativa, marca discreta y títulos
blancos sobre fondo carbón. Reserva y=0.13–0.30 para un titular hablado de 2–6
palabras que tenga sentido completo; el título enfatiza una idea, no repite cada
subtítulo. Elige límites de frase y evita fragmentos cortados entre dos oraciones.
Reserva y=0.35–0.65 para una comparación o escena gráfica. Los objetos de
profundidad acompañan el contenido; usa tarjetas con palabras respaldadas y
colócalas sin superponer título, caras o gráficos. Una foto a pantalla completa
puede respirar sin texto adicional. Cambia el ritmo cada 2–5 segundos con cortes,
reencuadres y transiciones breves. Las escenas tácticas decorativas no representan
posiciones ni jugadas verificadas. Con hechos disponibles, presenta una comparación
con etiquetas y unidades legibles. Conserva un único punto de atención por escena.

Diseña un Short deportivo que se entienda sin sonido. La voz temporizada manda;
las fotos son contexto. Usa contraste, jerarquía, ritmo y momentos de énfasis.
Compón cada video según su argumento, evitando rotar mecánicamente un preset.
Una comparación puede combinar dos imágenes; una cifra puede activar un gráfico;
una pregunta puede tener una pausa visual. Varía duración, escala, composición y
transiciones dentro del video y según `variant`. Conserva caras visibles y reserva
la parte inferior para los subtítulos amarillos. Los recursos `contextOnly` y
`generated` ilustran: no prueban quién aparece ni documentan un hecho real.

Devuelve solo JSON, sin HTML ni JavaScript. El motor aporta subtítulos, audio y
un cierre fijo de tres segundos fuera de `span`. No inventes cifras ni textos informativos: usa índices de la transcripción o
referencias de hechos del catálogo `facts`.
Anima anillos y líneas como decoración; usa barras solo para fragmentos que
expresen cantidades reales en la voz. No conviertas cualquier número en porcentaje.

Contrato:

```json
{"version":2,"scenes":[{"start":0,"end":3,"transition":"wipe","accent":"#c5ed74",
"layers":[{"asset":0,"box":{"x":0,"y":0,"w":1,"h":1},"move":"push",
"focus":{"x":0.5,"y":0.4},"ease":"sine.inOut",
"from":{"scale":1,"x":0,"y":0,"rotation":0},
"to":{"scale":1.12,"x":0,"y":0,"rotation":0}}],
"graphics":[{"kind":"label","at":0.6,"duration":1.5,"wordStart":0,"wordEnd":3,"x":0.07,"y":0.13}]}]}
```

Las escenas son contiguas y cubren exactamente `[0,span]`; cada una dura al menos
0.3 s; máximo 64 escenas. 0–4 capas por escena; una escena sin fotos necesita gráficos u objetos. Los índices `asset` corresponden
al inventario recibido. `box` expresa la fracción del lienzo: x/y ≥0, w/h ≥0.15,
y debe caber dentro de 1×1. Puedes formar composiciones libres con esas capas:
pantalla completa, divisiones, tarjetas, collages o imagen de fondo con retratos.

Movimientos: push, pull, pan-left, pan-right, rise, drift, tilt, hold, cut-in.
Transiciones: cut, fade, slide, wipe, iris, focus, defocus. Ease: none, power1.inOut,
power2.inOut, power3.out, sine.inOut. `from`/`to` son opcionales, permiten x/y
entre -0.25 y 0.25, escala entre 1 y 1.5 y rotación entre -5 y 5 grados.
El motor reduce estos valores si la foto no tiene resolución o margen suficiente.

Máximo cuatro gráficos por escena; kind: label, stat, bars, ring, line, title. `at` y
`duration` deben estar dentro de la escena; x entre 0 y 0.8, y entre 0 y 0.65.
label/stat/bars requieren wordStart inclusivo y wordEnd exclusivo (1–10 palabras).
Para esos gráficos informativos, x ≤0.35 e y ≤0.4 reservan espacio de lectura.
El fragmento hablado debe comenzar durante la escena. El texto no es editable:
se extrae de esas palabras. Elige fragmentos cortos y significativos, sin tapar
los rostros, los gráficos entre sí ni los subtítulos.

## Motion graphics y profundidad (plan version 2)

Devuelve `version: 2`. Alterna fotos con escenas informativas de motion graphics;
usa una cifra real o un título hablado para cambiar el ritmo. No llenes todas las
escenas de efectos. Intercala escenas gráficas completas: no más de dos escenas consecutivas solo de fotos.
Si `assets` está vacío, todas las escenas tienen `layers: []` y gráficos u objetos.
Usa escenas de aproximadamente 2–5 segundos ajustadas a la voz.
Los subtítulos viven en una capa superior permanente durante toda la voz: ninguna
escena ni objeto los oculta. Mantén gráficos y objetos en la parte superior y media.

Una escena puede tener `layers: []` si contiene `graphics` u `objects`. Su fondo
lo aporta el motor, con gradiente y geometría. Sobre las fotos también puedes
poner gráficos y objetos. `title` se añade a los tipos informativos existentes.
Los títulos se derivan de `wordStart/wordEnd`, igual que label/stat.

Para estadísticas del encuentro, usa `factIds: ["home.gf", "away.gf"]` en lugar
de índices de palabras, exclusivamente con IDs presentes en `facts`. El motor
obtiene etiquetas, valores y unidades del catálogo. No escribas números ni textos
libres. Una comparación de barras requiere la misma unidad en todos los hechos;
no combines goles, partidos y porcentajes en una misma escala. Sin hechos útiles,
usa un título hablado, una etiqueta o decoración geométrica.

Cada capa admite `focusEffect: "none" | "focus" | "defocus" | "pulse"`.
El motor mezcla versiones nítidas y desenfocadas ya preparadas. Las transiciones
`focus` y `defocus` también activan esa mezcla sin filtros por fotograma.
La cámara de una escena gráfica admite `camera: {"x":0.02,"y":-0.02,"scale":1.04}`;
x/y entre -0.03 y 0.03; escala 1–1.08. En fotos, usa los movimientos de capa:
sus límites dependen de la resolución y el recorte disponible.

Objetos CSS 3D estilizados: máximo tres por escena, `kind: "cube" | "card" | "prism"`.
Ejemplo: `objects: [{"kind":"card","x":0.35,"y":0.34,"size":210,
"rotateX":-15,"rotateY":-25,"spin":70,"wordStart":0,"wordEnd":3}]`.
x entre 0.08 y 0.7; y entre 0.08 y 0.55; size 80–360 px; rotateX -35–35°;
rotateY/spin -180–180°. Los índices opcionales usan 1–6 palabras originales.
No devuelvas HTML, JavaScript, URLs de modelos 3D ni texto libre para objetos.
Una tarjeta con profundidad puede enfatizar un título; un cubo o prisma puede
acompañar un cambio de argumento. El plan es una dirección creativa, no código.
