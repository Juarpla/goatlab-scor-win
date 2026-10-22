# Dirección visual y medición del video

Implementación del 22 de octubre de 2026. La infraestructura mantiene dos autorías,
una captura y dos workers. La resolución, duración, audio, música y validación por
hash siguen con el contrato vigente.

## Dirección y evaluación

Cada nueva autoría elige `plan.visualStyle`: `editorial` (Libre / editorial),
`documentary` (Documental deportivo) o `trailer` (Tráiler deportivo). El director
elige en el mismo turno según la voz y las preferencias del chat. Son intenciones,
con composición libre y sin cuotas de escenas ni rotación obligatoria.

La etiqueta se muestra en la descripción de Telegram y se conserva tras liberar
los archivos del trabajo. Los planes anteriores siguen siendo válidos sin
clasificación. `notes` explica concepto, relación con la voz y diferencia respecto
a los recientes. La memoria incorpora estilo, métricas y duración de los turnos;
los votos existentes se siguen asociando al mismo requestId.

CameraMove permite transformar fotos, clips o grupos, con curva suave y tiempos
locales a una Sequence. ColorWash se coloca sobre la imagen y debajo del texto;
la paleta es artística, porque `match` es texto. FilmGrain está implementado y
permitido por el compilador para pruebas, pero no se anuncia al director. Usa un
PNG precalculado, con desplazamiento determinista cada dos cuadros. Su promoción
requiere evaluación visual y de rendimiento con muestras reales.

## Muestras reales y conservación

Tras entregar un candidato verificado, Render intenta conservar una copia local
para cada categoría `photos`, `clips` y `graphics`, en
`$RENDER_STATE_DIR/evaluation/<categoría>`. Incluye composición, recursos locales,
voz ajustada, transcripción y MP4 completo. Hay tres plazas y un presupuesto total
de 384 MB; si no cabe, la entrega continúa sin guardar la muestra. La categoría
se infiere del uso de recursos en el código y requiere confirmación viendo el MP4.
Una muestra de 15–25 s de voz sustituye la de su categoría si aún no hay una de
esa duración en el conjunto.

`evaluation.json` registra el vencimiento a las 24 h. Render limpia al arrancar
y cada cinco minutos; los comandos de comparación rechazan muestras caducadas.
El disco es local a la máquina: una sustitución durante un despliegue puede perder
las muestras. Copiar las seleccionadas antes de sustituirla. No se añade un volumen
ni almacenamiento externo.

El conjunto queda pendiente hasta disponer de las tres categorías confirmadas,
una voz cercana a 20 s y revisión del movimiento en los MP4 completos. Un fixture
no sustituye esa evidencia.

## Comparaciones reproducibles

`captureMs` conserva su significado histórico: tiempo de pared de `renderMedia`,
incluida la codificación. `renderedDoneIn` y `encodedDoneIn` son los valores de
Remotion; `resolvedConcurrency`, `parallelEncoding` y `slowestFrames` permiten
atribuir el coste. Las medidas paralelas no se suman como etapas independientes.
Fuentes: [renderMedia](https://www.remotion.dev/docs/renderer/render-media),
[rendimiento](https://www.remotion.dev/docs/performance),
[opciones GL](https://www.remotion.dev/docs/gl-options).

En la máquina actual, ejecutar cada composición seleccionada con:

```sh
node scripts/benchmark-shorts.mjs --input=/data/render-jobs/evaluation/photos --photo-max=1472,1280,1080 --workers=2 --runs=3 --output-dir=/data/bench-photos
```

Repetir para clips y gráficos. Cada condición usa una copia temporal propia y la
misma normalización que producción; actualiza dimensiones reales sin ampliar
originales pequeños. Se mide una pasada con bundle frío y tres con bundle caliente,
alternando orden. Los MP4 de la primera pasada caliente se conservan en output-dir
para revisar recortes y acercamientos. El original queda intacto. Los resúmenes
señalan candidatos con mejora de al menos 15 %, pero requieren revisión visual;
no cambian producción automáticamente.

La normalización de producción sigue en 1472×2624. Perfil y versión forman parte
de la caché, conservando la protección por URL de los recursos activos. El GL
predeterminado sigue vigente; probar `swangle` por separado solo si hay evidencia
de un cuello de botella que lo justifique.

Para comparar las herramientas individualmente sobre el mismo material, texto,
duración y composición de prueba:

```sh
node scripts/benchmark-cinema-kit.mjs --input=/data/render-jobs/evaluation/photos --output-dir=/data/bench-kit --workers=2 --runs=3
```

Genera baseline.mp4, camera.mp4, wash.mp4 y grain.mp4 de siete segundos y
metrics.json. La composición de esta prueba es sintética, aunque use medios
reales. La aprobación estética de una pieza real requiere ver el MP4 completo.
El grano sigue fuera del prompt mientras no supere esa evaluación.

Para resumir los primeros seis videos clasificados desde el despliegue, sin
llamadas al modelo y con votos actuales:

```sh
node scripts/report-video-styles.mjs --memory=/data/director-memory/CHAT.json --since=FECHA_ISO_DEL_DESPLIEGUE
```

El informe devuelve muestras pendientes y, por dirección, número de videos, votos,
medianas disponibles y motivos de rechazo. Un estilo sin muestras no se considera
peor. El reporte y el banco de pruebas se ejecutan bajo demanda; no generan otros
videos ni mensajes en Telegram automáticamente. Rehacer queda para una fase posterior.

## Verificación realizada

Las 604 pruebas JavaScript y las 108 pruebas Python del flujo pasan. Se probó la
etiqueta con el worker HTTP real y Telegram simulado, incluyendo liberación de
archivos, reinicio y rechazo de un MP4 alterado.

Una prueba local de siete segundos a 1080×1920/30 fps produjo las cuatro variantes
del kit. En una pasada caliente por variante: base 4,971 s, cámara 4,961 s, velo
4,994 s y grano 5,796 s de render más codificación. El grano elevó el archivo de
92 KB a 2,87 MB en esa composición muy compresible. Son datos de un Mac con 12
CPU reportadas y 2 workers, con un gráfico sintético; no prueban el coste de una
pieza real en Fly. El grano sigue fuera del prompt.

La comparación local de fotos también ejercitó las tres resoluciones sobre una
copia de una composición de prueba, preservando el original. No alcanzó una
mejora de 15 % y no se modificaron ni tamaño de producción ni GL. Las muestras
reales, la revisión de sus MP4 completos y los votos de los seis siguientes videos
permanecen pendientes de recibir esos trabajos.

## Despliegue verificado

Render recibió primero el soporte del contrato y del kit; después se desplegó
el Gateway. Una corrección posterior de Render unifica el cálculo del límite
de la descripción con la decisión de adjuntar los créditos completos.

- Render: `visual-directions-20261022-cc094183123e`; shared 2 CPU, 4096 MB,
  RENDER_WORKERS=2. Health confirma estilos, kit, revisión orientativa y 55 s.
- Gateway: `visual-directions-20261022-0b93c2f2a74e`; shared 2 CPU, 2048 MB,
  GOATLAB_MAX_DIRECTORS=2. Se comprobaron módulo de estilos, guía, reporte
  ejecutable y razonamiento max en el código desplegado.
- Inicio de la cohorte de seis videos: `2026-10-22T10:38:18.589Z`
  (arranque del Gateway con el nuevo contrato). Usar esa fecha en --since.

Una prueba aislada en la máquina real de Render compiló y ejecutó CameraMove,
ColorWash y FilmGrain juntos. Produjo H.264 1080×1920 a 30 fps, AAC y duración
exacta de 2 s. Render más codificación: 4,016 s; bundle frío: 17,176 s. Es una
composición técnica con tono sintético, no una narración real ni un benchmark
comparativo. No hubo llamadas al modelo ni envíos a Telegram; sus archivos
temporales se borraron.

La comprobación de determinismo produjo los mismos cuadros decodificados con
uno y dos workers, incluyendo cámara y grano. Al cerrar el despliegue, el reporte
del chat registra 0 muestras clasificadas y 6 pendientes.
