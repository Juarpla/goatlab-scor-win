---
name: goatlab
description: "Procesa /goatlab en Telegram: elegir un partido, leer diez guiones, recibir hasta diez audios en orden y entregar Shorts con imágenes Agnes, motion graphics y montaje creativo."
---

# GoatLab Shorts

`/new` pertenece a OpenClaw: no lo interceptes ni ejecutes herramientas por ese comando.
`/start` se procesa fuera del agente; el webhook cancela la serie y envía el acceso.
`/goatlab` inicia el workflow. Consulta [operación](references/series.md).

Responde en español. Para operar una serie, lee [references/series.md](references/series.md).
Usa `python3 {baseDir}/scripts/goatlab.py` con los argumentos indicados allí.
El JSON de la herramienta es información interna; comunica solo el resultado
necesario. El código conserva el estado y asigna el número de cada audio.

Flujo: elegir partido → mostrar los diez guiones originales → recibir audios en
orden y en silencio → entrega automática de MP4. Gateway consulta el banco de
cuatro imágenes y dos clips publicado por GitHub Actions en R2. Después Render
monta los audios recibidos, uno a la vez, con la media disponible y motion graphics
React/Remotion guiados por los Motion Prompts publicados. Un banco parcial o vacío
continúa con gráficos; no esperes diez audios. La producción de imágenes, clips y
prompts y el mantenimiento remoto pertenecen exclusivamente a GitHub Actions.
El webhook registra los audios de una serie activa con los identificadores
originales de Telegram; no inventes `file_id` ni uses una ruta local como tal.
El código actualiza un mensaje de progreso; no confirmes cada audio ni inventes
porcentajes. No modifiques archivos del servidor ni solicites tokens administrativos
durante una serie: informa el fallo y usa el reintento documentado.

La voz es la fuente del texto del video. Los guiones son para leer y grabar;
muéstralos completos y literalmente. Cada audio tiene un montaje propio, decidido
por el planificador a partir de su transcripción. El usuario solo envía audios.

Para errores de media, recuperación de tareas, solicitudes de reintento o poda, lee
[references/media.md](references/media.md). Para cambios en la dirección artística,
consulta `{baseDir}/references/creative.md`; es la misma referencia usada por el
planificador de Render. Los scripts son responsables de límites y validación.

Mantén la música existente, subtítulos amarillos con borde negro y cierre con el
logo y `goatlab.win` según [references/brand.md](references/brand.md). La creatividad está en la composición; la secuencia de
recepción, la transcripción y la identidad de marca permanecen verificables.

Para instalar, desplegar o comprobar técnicamente este skill y su integración con
Gateway/Render, lee [references/deployment.md](references/deployment.md).

## Dirección cinematográfica

Para montar cada audio, consulta [contrato ejecutable versión 5](references/cinema.md) y [catálogo](references/cinema-catalog.json). El planificador carga ambos explícitamente. Para desarrollar las composiciones usa [skills oficiales Remotion](../remotion-best-practices/SKILL.md), fijados en su archivo UPSTREAM. La bandera GOATLAB_CINEMA_V5 activa el contrato nuevo; el flujo anterior conserva sus reintentos. Los hechos provienen de production.json; Actions prepara medios y Gateway lee R2.
