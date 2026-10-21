# Dirección creativa de video en OpenClaw y Remotion

Investigación del 21 de octubre de 2026. Solo lectura de fuentes y código: no instala skills ni cambia producción.

Complementa [VIDEO-SKILLS-RESEARCH.md](VIDEO-SKILLS-RESEARCH.md), investigación del 27 de septiembre sobre el catálogo de Hermes y skills de edición. Aquí se releen los archivos de origen pertinentes y se evalúan contra OpenClaw y el motor actual de GoatLab.

## Recomendación

Usar la skill oficial de Remotion como conocimiento técnico de OpenClaw y complementar las instrucciones propias de GoatLab con dirección editorial. Para que cada video pueda tener una composición nueva, también hay que ampliar lo que Render acepta: instalar instrucciones no elimina las limitaciones del motor.

Remotion publica `remotion-best-practices`, que reúne sus skills, y módulos específicos para crear composiciones, escribir React, exportar y manejar subtítulos. La opción más pertinente es el paquete oficial, especialmente `remotion-markup` y `remotion-create`. [Catálogo oficial](https://www.remotion.dev/docs/ai/skills), [repositorio oficial](https://github.com/remotion-dev/skills).

Snapshot leído: commit `039e8a2fc78b67efc228d5645367838b85818a1c`, versión declarada `4.0.537`. El motor actual del proyecto fija Remotion `4.0.533` en `fly/render/package.json`. Una instalación posterior debe fijar una revisión compatible y verificar sus ejemplos contra esa versión; no actualizar automáticamente el motor como efecto secundario.

## Qué aporta cada skill

| Skill oficial | Aporte comprobado | Encaje en GoatLab |
| --- | --- | --- |
| `remotion-best-practices` | Dirige al agente a las referencias pertinentes. | Entrada general; conservar referencias y archivos auxiliares completos. |
| `remotion-markup` | Animación por fotogramas, composición, medios, transiciones, recortes, texto y efectos. | Base técnica para escribir composiciones y motion nuevos. |
| `remotion-create` | Construcción de composición y disposición de escenas. | Puede orientar la composición original por video. |
| `remotion-render` | Exportación de videos y fotogramas; transparencia. | Referencia de ejecución para Render, que ya tiene su propio renderizador. |

Fuentes inspeccionadas: [SKILL principal](https://github.com/remotion-dev/skills/blob/039e8a2fc78b67efc228d5645367838b85818a1c/skills/remotion-best-practices/SKILL.md), [markup](https://github.com/remotion-dev/skills/blob/039e8a2fc78b67efc228d5645367838b85818a1c/skills/remotion-markup/SKILL.md), [create](https://github.com/remotion-dev/skills/blob/039e8a2fc78b67efc228d5645367838b85818a1c/skills/remotion-create/SKILL.md), [render](https://github.com/remotion-dev/skills/blob/039e8a2fc78b67efc228d5645367838b85818a1c/skills/remotion-render/SKILL.md).

La referencia de disposición recomienda establecer el foco de cada escena, espacio seguro y texto legible; no prescribe cuotas de fotos, clips o gráficos. Son pautas útiles de composición, no una garantía de calidad ni una directora editorial independiente. [Video layout](https://github.com/remotion-dev/skills/blob/039e8a2fc78b67efc228d5645367838b85818a1c/skills/remotion-create/video-layout.md).

Dos candidatos de terceros del informe anterior se releyeron y no son la recomendación principal:

- [`short-form-video`, de iart-ai](https://github.com/iart-ai/tiktok-video-skills/blob/main/skills/short-form-video/SKILL.md): propone cambios visuales cada dos a cuatro segundos y subtítulos obligatorios. Sus consejos de gancho pueden servir de referencia, pero adoptar toda la skill reintroduciría obligaciones que el usuario quiere quitar. Sus porcentajes de retención no se verificaron y no sustentan esta recomendación.
- [`chart-animation`, de iart-ai](https://github.com/iart-ai/data-animation-skills/blob/main/skills/chart-animation/SKILL.md): aporta contadores, interpolación de datos y gráficos por fotograma. También promueve una plantilla común aplicada a muchos datasets; útil como referencia técnica puntual, poco adecuada para dirigir videos que deben diferenciarse visualmente.

El router principal está orientado a trabajo interactivo: pide abrir Studio y reserva el render para solicitudes explícitas. Para el flujo ya autorizado de Telegram, las instrucciones de integración deben explicar que Render exporta de forma automática después de la revisión; no copiar ese comportamiento interactivo sin contexto. La skill aporta conocimiento, no otro modelo ni un proveedor de inferencia.

## Compatibilidad con OpenClaw

OpenClaw usa el formato AgentSkills y descubre skills en `<workspace>/skills`; el archivo requiere nombre y descripción. El formato de la skill de Remotion es compatible en principio. En esta instalación conviene incluir la carpeta completa en `fly/gateway/workspace/skills/` para que viaje con Docker, preservando referencias relativas. Esta es una propuesta de integración; no se ha instalado.

La comprobación se hizo también contra la [documentación de OpenClaw v2026.9.6](https://github.com/openclaw/openclaw/blob/v2026.9.6/docs/tools/skills.md), versión fijada por el Dockerfile, además de la [documentación actual](https://docs.openclaw.ai/tools/skills). Una skill no concede herramientas, dependencias ni permisos ausentes.

## Por qué seguirían pareciéndose los videos con solo instalarla

Hallazgo local: `fly/gateway/creative-director.mjs` pide a OpenClaw escribir una decisión JSON y le indica que no cambie otros archivos. `src/lib/edit-plan.js` limita las familias de gráficos conocidas. El bundle de `fly/render/remotion/short.jsx` y `editorial.jsx` contiene implementaciones prediseñadas con posiciones, fondos, tipografía y movimientos repetidos.

`Photo` admite `layer.box`, por lo que las fotos pueden ocupar regiones. En cambio, el clip se dibuja con `inset: 0`, ancho y alto completos: varios clips no forman una pantalla dividida real. Los motions editoriales incluyen fondo completo; algunas tarjetas de gráficos son opacas. Esto limita transparencia y composición libre aunque el texto de dirección ya no exija alternancia.

El banco de cuatro fotos y dos clips es una decisión de producción/disponibilidad, distinta de obligar a usarlos todos. `server.mjs` sigue truncando a ese inventario; el workflow envía mínimo cero. Separar ambas decisiones evita confundir presupuesto de recursos con montaje obligatorio. El cierre actual está fijado en tres segundos y las instrucciones mantienen música, subtítulos y estilo constantes: también requieren revisión si el único requisito editorial será un logo breve al final.

## Transparencia y libertad propuesta

Para superponer gráficos a una foto o clip en el mismo Remotion basta dibujar texto, SVG o elementos sin un panel de fondo que los tape. No hace falta exportar otro video con alpha. Si se desea un archivo transparente independiente, Remotion documenta ProRes 4444 y WebM VP9 con alpha. [Referencia oficial de transparencia](https://github.com/remotion-dev/skills/blob/039e8a2fc78b67efc228d5645367838b85818a1c/skills/remotion-render/transparent-videos.md).

Propuesta, todavía sin implementar: OpenClaw diseña y escribe una composición React por video; Render la compila y ejecuta en un entorno aislado con medios y dependencias permitidos. OpenClaw revisa el resultado y modifica esa composición cuando pide correcciones. Render conserva transcripción y ejecución sin añadir otro LLM. Esto permite superposiciones transparentes, dos o tres regiones, tipografía y ritmos propios por narración. Reutilizar utilidades técnicas puede seguir siendo conveniente sin reutilizar una plantilla visual completa.

La preferencia por gráficos transparentes y diversidad debe ser una guía editorial, no una nueva cuota de overlays o cantidad de paneles. Mantener como requisitos editoriales el máximo de 55 segundos y el logo breve final; conservar las verificaciones técnicas necesarias para ejecutar y entregar el archivo. Para evitar repetir montajes entre videos, OpenClaw necesitaría además recibir un resumen visual de composiciones recientes: una skill aislada no suministra esa memoria.

## Referencia audiovisual del usuario: efectos sobre video

Referencia revisada el 21 de octubre de 2026: `/Users/juarpla/Downloads/2026-10-21 02.49.43.mp4` (24.52 s, 576 × 1024, 30 fps). El adjunto señalaba inicialmente una ruta en el directorio personal; se encontró el mismo nombre en Downloads. Se inspeccionaron secuencias de fotogramas a cuatro muestras por segundo y una vista general. Los tiempos siguientes son aproximados. Esta revisión evalúa imagen y cambios visuales; no analiza la mezcla sonora ni atribuye las herramientas con que se produjo el original.

El patrón principal es una toma continua con texto, tarjetas y pequeños videos superpuestos. Las capas se introducen y retiran sin sustituir permanentemente el fondo. Es una referencia apropiada para la preferencia del usuario por gráficos sin fondo. Las tarjetas del original sí tienen sus propios paneles; se puede conservar solo el texto, líneas o contornos cuando convenga mostrar más media.

| Referencia observada | Tiempo aproximado | Adaptación propuesta para GoatLab |
| --- | --- | --- |
| Texto cinético, caída de palabras y tipografía grande | 00–03 s | Destacar palabras de la voz, nombres de equipos o una cifra real con entradas y escalas propias por pieza. Evitar que una segunda transcripción completa compita con subtítulos. |
| Barra con escritura progresiva | 03–04 s | Pregunta breve, concepto o titular que se escribe sobre una foto o clip; el aspecto de buscador no es obligatorio. |
| Tira de tarjetas flotantes, llamada Storyboard deck | 04–05 s | Hacer entrar varias fotos o recortes, reorganizarlos y dejar protagonista al recurso que corresponde a la narración. |
| Video pequeño superpuesto, llamado File drop, y tarjeta de video posterior | 07 s y 17 s | Clip en una región con texto o gráficos en otra; cambiar entre imagen a pantalla completa y composición dividida sin una plantilla fija. |
| Comparación de color mediante un deslizador y cambio de tratamiento | 10–13 s | Recurso opcional para comparaciones visuales o énfasis. Si compara datos o equipos, etiquetar el significado; el efecto del original muestra tratamiento de color, no estadísticas. |
| Cuadrícula con varias piezas, llamada Playing grid | 15 s | Dos o tres regiones de foto, video y gráfico, con un foco principal y sincronización con la voz. El número de paneles queda a criterio del director. |
| Barrido vertical con desenfoque hacia otra toma | 16 s | Transición puntual entre ideas, con dirección y duración diseñadas para ese corte. |

No priorizar la simulación de una línea de tiempo de edición, los iconos de aplicaciones tachados ni las llamadas a comentar EDIT: cumplen una función promocional del video de referencia, no de la narración deportiva. El cierre de GoatLab sigue siendo un logo breve al final.

Incorporar estas referencias al plan junto con `remotion-create` y `remotion-markup`, sin crear otro catálogo cerrado ni cuotas de uso. OpenClaw debe poder generar la composición y animación concreta de cada video, privilegiando overlays transparentes cuando funcionan, con libertad para omitir estos efectos. Para diferenciar piezas, recibir ejemplos o resúmenes de montajes recientes, no solo variar aleatoriamente efectos. Render conserva la transcripción y ejecuta el resultado sin otro modelo creativo. No se modificó ni desplegó producción durante esta revisión.
