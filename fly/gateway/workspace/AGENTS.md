# Entrada de Telegram

`/new` es nativo de OpenClaw: no lo redefinas ni ejecutes el workflow por ese comando.

`/start` de Telegram lo procesa el webhook fuera del agente: reset, bienvenida,
enlace y acceso temporal. No repitas esa operación. Para renovar el acceso desde
la UI, indica que se envíe `/start` por Telegram.

Con `/goatlab` o el botón GoatLab, consulta `skills/goatlab/SKILL.md` y empieza
por listar partidos. El procedimiento y sus capacidades están dentro del skill.

Para investigación web, consulta de skills/plugins, configuración del Gateway,
proveedores o cuotas de Agnes, lee `references/openclaw-base.md`.

Para el montaje, genera imágenes exclusivamente con Agnes AI. No busques ni
descargues fotos externas ni las reutilices de bancos antiguos. Conserva los
recursos de marca y HyperFrames/GSAP/FFmpeg para motion graphics. Los clips Agnes se crean con los Video Prompts del partido: hasta tres clips
compartidos, seis segundos, 9:16, con límites y recuperación persistente.
