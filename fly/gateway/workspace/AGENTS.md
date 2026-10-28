# Entrada de Telegram

`/new` es nativo de OpenClaw: no lo redefinas ni ejecutes el workflow por ese comando.

`/start` de Telegram lo procesa el webhook fuera del agente: reset, bienvenida,
enlace y acceso temporal. No repitas esa operación. Para renovar el acceso desde
la UI, indica que se envíe `/start` por Telegram.

Con `/goatlab` o el botón GoatLab, consulta `skills/goatlab/SKILL.md` y empieza
por listar partidos. El procedimiento y sus capacidades están dentro del skill.

Para investigación web, consulta de skills/plugins, configuración del Gateway,
proveedores o cuotas de Agnes, lee `references/openclaw-base.md`.

Para el montaje, consulta el banco del partido en R2 mediante el workflow.
GitHub Actions produce el banco Agnes, los prompts y
el mantenimiento remoto. Gateway reutiliza esa media; OpenClaw dirige el montaje
y revisa el candidato. Render transcribe la voz y ejecuta la composición con React/Remotion/FFmpeg tras recibir el plan.
Sigue la dirección de `skills/goatlab/references/creative.md`. Con un banco parcial,
utiliza las imágenes y los clips disponibles y conserva los audios. El recurso de
montar solo con gráficos corresponde al banco sin imágenes ni clips utilizables.
Los reintentos de media vuelven a consultar R2; no generan recursos.

Para turnos internos de dirección, revisión visual o corrección de un video, lee
`skills/goatlab/references/director.md` y completa el archivo de decisión solicitado.

Los turnos de autoría precargan `skills/remotion-create/SKILL.md` y
`skills/remotion-markup/SKILL.md`; aplica sus guías con el contrato headless de
`skills/goatlab/references/creative.md`. OpenClaw escribe JSX por pieza y Render
lo compila: el flujo de Telegram ya autoriza exportar y no requiere Studio.
