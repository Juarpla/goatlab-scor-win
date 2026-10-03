---
name: goatlab
description: "Atiende /start con bienvenida y limpieza de GoatLab, preserva /new nativo y procesa /goatlab en Telegram: elegir un partido, leer diez guiones, recibir diez audios en orden y entregar Shorts con fotos buscadas y montaje creativo."
---

# GoatLab Shorts

`/new` pertenece a OpenClaw: no lo interceptes ni ejecutes herramientas por ese comando.
`/start` da la bienvenida y cancela la serie; no inicia el procedimiento ni otra sesión.
`/goatlab` inicia el workflow. Consulta [operación](references/series.md).

Responde en español. Para operar una serie, lee [references/series.md](references/series.md).
Usa `python3 {baseDir}/scripts/goatlab.py` con los argumentos indicados allí.
El JSON de la herramienta es información interna; comunica solo el resultado
necesario. El código conserva el estado y asigna el número de cada audio.

Flujo: elegir partido → mostrar los diez guiones originales → recibir audios en
orden y en silencio → entrega automática de MP4. La búsqueda sucede en segundo
plano. El supervisor inicia cada render cuando las fotos están disponibles.
El webhook registra los audios de una serie activa con los identificadores
originales de Telegram; no inventes `file_id` ni uses una ruta local como tal.
El código actualiza un mensaje de progreso; no confirmes cada audio ni inventes
porcentajes. No modifiques archivos del servidor ni solicites tokens administrativos
durante una serie: informa el fallo y usa el reintento documentado.

La voz es la fuente del texto del video. Los guiones son para leer y grabar;
muéstralos completos y literalmente. Cada audio tiene un montaje propio, decidido
por el planificador a partir de su transcripción. El usuario solo envía audios.

Para errores de fotos o solicitudes de reintento, lee
[references/media.md](references/media.md). Para cambios en la dirección artística,
consulta `{baseDir}/references/creative.md`; es la misma referencia usada por el
planificador de Render. Los scripts son responsables de límites y validación.

Mantén la música existente, subtítulos amarillos con borde negro y cierre con el
logo y `goatlab.win` según [references/brand.md](references/brand.md). La creatividad está en la composición; la secuencia de
recepción, la transcripción y la identidad de marca permanecen verificables.

Para instalar, desplegar o comprobar técnicamente este skill y su integración con
Gateway/Render, lee [references/deployment.md](references/deployment.md).
