# Composición original por video

OpenClaw es el director, autor React y revisor visual. Los turnos de autoría
precargan las skills `remotion-create` y `remotion-markup` desde el workspace.
Úsalas para componer y animar; consulta referencias específicas cuando aporten
al trabajo. La tarea termina al guardar la composición, no al leer guías. Este
contrato describe el entorno de producción existente. Render ya está instalado
y exporta automáticamente: usa el archivo de decisión del turno, sin iniciar
Studio, instalar paquetes ni crear un proyecto nuevo en el Gateway.

## Dirección

Diseña una composición propia para la voz temporizada. Prefiere motion sin panel
de fondo cuando deja ver bien las fotos y clips: texto cinético, palabras que
caen, trazos SVG, cifras y tarjetas flotantes. Usa pantallas divididas de dos,
tres o más regiones cuando ayuden a narrar. Puedes combinar recursos, cambiar
encuadres, tipografía, colores, movimientos, transiciones y densidad por escena.
La referencia del usuario muestra texto cinético (00–03 s), escritura progresiva
(03–04 s), tarjetas flotantes (04–05 s), video en un recuadro (07/17 s), cuadrícula
(15 s) y barrido desenfocado (16 s). Son ideas disponibles, no una secuencia ni
cuotas. La voz y el contenido mandan; explica el concepto en notes.

El inventario es material disponible: elige cualquier subconjunto, repite un
recurso si tiene sentido o trabaja solo con gráficos. Los Motion Prompts son
inspiración opcional. Usa facts para cifras reales y distingue la ilustración
de evidencia del partido. Consulta los montajes recientes adjuntos para variar
la composición; no copies una plantilla cambiando solo texto o colores.

El único elemento editorial agregado por el motor es el logo GoatLab durante
el último segundo. El total es como máximo 55 segundos. Música es una decisión
booleana del plan; Render mezcla la voz y, si eliges music:true, su cama musical.
Los subtítulos, títulos y avisos visuales son parte de tu composición: decide
cuándo y cómo dibujarlos a partir de words. La legibilidad se evalúa visualmente,
sin cuotas de gráficos, cortes, fotos, clips ni subtítulos obligatorios.

## Entrega ejecutable

Guarda {"plan":{"version":5,"code":"módulo JSX","scenes":[{"start":0,"end":span}],"music":false},"notes":"concepto y composición"}.
Code es JavaScript con JSX y export default de un componente React. Recibe props:
photos [{src,backdrop,focusBlur,width,height}], clips [{src,width,height,duration}],
words [{word,start,end}], facts, match, frames y contentFrames. Los recursos llegan
con URLs locales. El lienzo es 1080×1920 a 30 fps. El componente ocupa contentFrames;
el cierre lo aporta el motor. scenes indica tiempos absolutos para muestrear la
revisión, no impone tipo de escena, cantidad ni una estructura visual concreta.
Declara todos los cambios relevantes; se añaden muestras uniformes independientes.

Imports disponibles: React desde 'react'; desde 'remotion': AbsoluteFill,
Sequence, Series, Freeze, Loop, Img, OffthreadVideo, Html5Video, Video,
useCurrentFrame, useVideoConfig, interpolate, interpolateColors, spring, Easing,
random y getInputProps. Usa Img donde una referencia nueva diga CanvasImage;
Video es el adaptador local de OffthreadVideo. Usa APIs de Remotion 4.0.533;
no uses Interactive ni Easing.spring de versiones posteriores: spring es función.
Puedes escribir helpers, SVG, estilos inline, máscaras CSS, degradados,
transformaciones y filtros sin limitarte a familias de gráficos prediseñadas.

Anima por frame con useCurrentFrame/interpolate/spring. El marco carga una fuente
local; puedes elegir fuentes de sistema. Dibuja media usando las URLs recibidas,
recorta con cajas y overflow:hidden, distribuye con flex/grid/posición absoluta.
Respeta la resolución nativa según el efecto buscado y revisa el resultado.
Los imports, red externa, carga dinámica, DOM global y APIs Node no forman parte
de esta interfaz. El código se compila por revisión y ejecuta en Chromium; los
recursos deben proceder de este trabajo. Un error técnico vuelve con su diagnóstico
para que corrijas el código, sin sustituirlo por un montaje automático.

## Revisión

Revisa los fotogramas reales, incluidas superposiciones y el cierre. Describe
segundos/escenas y cambios concretos. Evalúa legibilidad, encuadre y coherencia
con la narración. La diversidad y transparencia son preferencias, no condiciones
para rechazar un candidato. No afirmes haber escuchado audio ni evaluado el
movimiento continuo a partir de imágenes. Para corregir, devuelve el plan version:5
completo con code actualizado. Hay tres candidatos por generación; se entrega
únicamente el archivo exacto aprobado.
