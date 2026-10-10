# GoatLab: implementación y diagnóstico cinematográfico

Fecha: 10 de octubre de 2026. Caso piloto: los cinco audios originales de Chelsea FC–AFC Bournemouth. Este informe separa resultados medidos de objetivos artísticos.

## Resultado

El nuevo montaje versión 5 ya produce los cinco videos del piloto. Todos cumplen 1080×1920, 30 fps, H.264/AAC, menos de 50 segundos y menos de 45 MB. Tres revisiones visuales devolvieron observaciones menores y dos no encontraron defectos. El piloto no envió videos ni mensajes a Telegram.

La producción tiene ahora un catálogo ejecutable y controles de calidad. Todavía necesita evolucionar para alcanzar una estética cinematográfica premium: predominan los gráficos y faltan clips en el banco de este partido. Una revisión automatizada favorable no es una calificación artística ni garantiza que todo defecto visual haya sido detectado.

## Qué cambió

- **Dirección por audio.** El planificador recibe transcripción, fragmentos indexados, hechos verificables, recursos disponibles, variantes anteriores y la guía GoatLab. Produce escenas con tiempos, composición, variante, fragmento hablado, referencias a hechos/medios y controles que Remotion realmente ejecuta.
- **Biblioteca.** Seis familias, dos variantes por familia: protagonista, encuentro, dato principal, comparación, editorial y resolución. Comparten zonas seguras, tipografía, paleta, cámara y animaciones. Se conservan subtítulos amarillos, música, marca y cierre.
- **Movimientos distintivos.** Se cuentan las apariciones ejecutadas, incluso cuando se repite el mismo efecto. Máximo dos por video. La IA y el respaldo local usan el mismo catálogo y validador; las demás escenas mantienen animaciones sobrias.
- **Remotion.** Sus paquetes siguen alineados y fijados en 4.0.533. Se verificaron fuentes locales, Chromium, bundle y efectos reales mediante imágenes renderizadas. Los skills oficiales están incorporados al desarrollo y al workspace de OpenClaw, fijados en la revisión `32b241b97f4e0e4ab61fe9a41b05e6e64503f8c5`.
- **Hechos independientes.** `/partido/:id/production.json` ofrece contexto versión 1 sin llamadas a modelos. Conserva identidad, publicación, procedencia y hash. Los hechos antiguos necesarios se migraron a snapshots independientes: el consumo nuevo no necesita motion prompts para obtener estadísticas.
- **R2.** Se mantiene el lector del banco con compatibilidad y hashes. Los medios ausentes se sustituyen por composiciones gráficas. Telegram consume recursos preparados; no inicia generación de imágenes o clips.
- **Actions.** Se retiró `motion-prompts` del selector, de `all`, de la generación automática y de los requisitos normales de QA. Guiones, Image Prompts y Video Prompts siguen disponibles. JSON y rutas antiguos se conservan temporalmente como legado, fuera de la navegación principal.
- **Persistencia.** Los metadatos opcionales de contexto/dirección se conservan en `POST /render`, sin cambiar identificadores. Cada trabajo guarda reporte de modelos, recursos, versiones, tiempos, respaldo, hechos utilizados y QA. Los reportes compactos sobreviven a la limpieza de archivos temporales, con retención acotada.

Remotion no interpreta un prompt como lo haría un modelo generativo: renderiza código y parámetros. Los prompts sirven para dirigir al planificador; el plan estructurado es el contrato con el motor. La mejora consiste en ejecutar controles concretos y rechazar los que no existen. No hay evidencia para afirmar que ahora se usa “el 90 % del texto” de un prompt antiguo; esa métrica no representa el flujo nuevo.

## Modelos y respaldos

| Función | Orden configurado |
|---|---|
| OpenClaw y planificación | OpenCode Go/MiMo V2.6 Flash → DeepSeek V4.1 Flash → Agnes 3.0 Flash → Mistral Small 2603 |
| Visión | OpenCode Go/MiMo → DeepSeek → Mistral Small 2603 |
| Transcripción | Mistral Voxtral Mini → Whisper local |

Se reutilizaron las claves existentes y se añadieron las credenciales faltantes a cada servicio sin incluirlas en el código. Los selectores `GOATLAB_AGENT_MODELS`, `GOATLAB_PLANNER_MODELS` y `GOATLAB_VISION_MODELS` se leen efectivamente. Se añadió el encabezado de sesión requerido por OpenCode Go.

MiMo, DeepSeek y Agnes respondieron a pruebas reales de texto. MiMo y DeepSeek aceptaron imágenes y llamadas a herramientas; ambos completaron además una lectura de la guía mediante el agente OpenClaw real. Agnes produjo el plan del quinto video. **Mistral devolvió HTTP 429:** está conectado como respaldo, pero falta confirmar su disponibilidad con cuota suficiente. No se comprobó una ejecución real del agente con cada proveedor secundario.

Planificación: una llamada por modelo, hasta cuatro y 240 segundos; luego plan local validado. Visión: hasta tres llamadas iniciales de 60 segundos y una comprobación después de corregir. La detección de un defecto no se trata como una caída del proveedor. Se permite como máximo un render adicional, compartido entre recuperación de texto y corrección visual.

## Porcentaje real de graphic motions

La métrica cuenta tiempo de escenas **dominadas por gráficos**, no superficie de pantalla ni cantidad de efectos. Excluye escenas de protagonista con medios, subtítulos y los tres segundos de cierre. Las escenas del encuentro pueden incluir imágenes de fondo, pero se clasifican como gráficos por su composición dominante.

| Audio | Duración final | Tamaño | Gráficos / video | Gráficos / narración | Modelo del plan | QA visual |
|---|---:|---:|---:|---:|---|---|
| 1 | 30,97 s | 6,27 MB | 77,4 % | 85,7 % | MiMo | Menor |
| 2 | 32,87 s | 12,03 MB | 68,2 % | 75,0 % | DeepSeek | Menor |
| 3 | 33,40 s | 8,78 MB | 68,3 % | 75,0 % | DeepSeek | Sin observaciones |
| 4 | 34,13 s | 3,89 MB | 79,8 % | 87,5 % | MiMo | Menor |
| 5 | 32,93 s | 11,42 MB | 79,5 % | 87,5 % | Agnes | Sin observaciones |

**Promedio ponderado: 74,6 % del tiempo total.** Cada video ejecuta dos movimientos distintivos y siete u ocho escenas. No es un porcentaje fijo: cambia con audio, hechos y medios disponibles. El caso adicional sin medios usa gráficos en el 100 % de la narración y el 90,9 % del video completo; fue renderizado con respaldo local y sin revisión de visión en esa reproducción final.

El banco original del piloto contiene cuatro imágenes y cero clips disponibles. Los planes reales de IA se guardaron y reprodujeron después de corregir el renderer; las cifras anteriores corresponden a los MP4 finales, no a una predicción del planificador. El detalle está en `cinema-pilot-2026-10-10.json`.

## Qué salió bien y qué falló

**Bien:** los cinco audios que fallaban ahora completan el montaje; los respaldos entre proveedores funcionaron; doce variantes y los controles creativos probados modifican imágenes renderizadas; las referencias estadísticas se validan; el flujo funciona sin medios y sin motion prompts. La suite aislada pasó 526 pruebas Node y 98 Python, sincronización del skill, lints, bundle Remotion y build Astro.

**Problemas encontrados y corregidos:** la guía JSON confundía el formato; el razonamiento de los modelos agotaba tiempo o truncaba la respuesta; el límite de movimientos rechazaba planes; la transcripción deformaba Bournemouth/GoatLab; cuatro comparaciones verticales no cabían; la medición de layout se hacía antes de fijar dimensiones; el endpoint descartaba metadatos opcionales. Se corrigieron formato, presupuesto, fragmentos preindexados, sesgo de transcripción compatible con Voxtral, grid 2×2, medición tras fuentes y persistencia.

**Límites que siguen:** Mistral tiene cuota insuficiente en la prueba; la visión juzga seis fotogramas y no escucha audio; algunas observaciones sobre fases de fade/stagger son ambiguas; hay titulares de frase hablada poco pulidos y escenas con mucho espacio vacío. Las imágenes generadas contienen texto/emblemas imperfectos y no sustituyen material deportivo auténtico. Se revisaron fotogramas y propiedades temporales/técnicas, pero falta una evaluación humana completa de los cinco videos con sonido para certificar ritmo y acabado cinematográfico.

Los edit-input originales habían sido purgados. Se recuperaron los cinco audios y la serie; el replay legado se reconstruyó con sus transcripciones y los quince prompts originales. Es una reproducción documentada, no una recuperación exacta de cada archivo temporal antiguo.

## Despliegue y operación

Contexto público publicado. Gateway y Render activos con `GOATLAB_CINEMA_V5=1` y revisión `cinema-v5-active-20261010`; Render confirma `editPlanVersion=5` en `/healthz`. Los cambios están aislados en `codex/goatlab-cinema-v5` y la PR #1; la integración de Actions se verifica con sus checks antes de incorporarlos a main.

La bandera `GOATLAB_CINEMA_V5` permite volver al flujo compatible versión 4 sin borrar trabajos pendientes. Los planes antiguos siguen admitidos. Para rollback operativo, volver a `0` en ambos servicios y desplegar sus configuraciones; conservar reportes, ledger y recursos. La limpieza normal de trabajos temporales sigue vigente.

Benchmark Fly: en la VM de 4 GB y dos CPU compartidas, una captura de 986 fotogramas tardó 137,6 segundos (otra medición: 143,6 s). Memoria usada de toda la VM: 363,6 MiB al inicio y pico de 920,1 MiB, muestreada cada 500 ms como MemTotal menos MemAvailable. El MP4 sin voz pesó 11,36 MB. Es una captura de un plan guardado, no el tiempo completo desde recepción hasta Telegram. Las llamadas a modelos y revisión visual tienen presupuestos adicionales.

## Qué conviene trabajar después

1. **Dirección artística del siguiente piloto.** Comparar los cinco MP4 completos con sonido y una referencia acordada. Medir legibilidad, repetición, cortes, relación voz/imagen y variedad. Dar a titulares texto editorial breve, en lugar de reutilizar siempre frases habladas.
2. **Mejor metraje.** Completar clips en Actions/R2 y validar su pertinencia antes del montaje. Añadir revisión específica de imágenes, rostros, emblemas y lettering. Más clips útiles permitirán bajar la dominancia gráfica cuando lo pida el relato; no imponer un porcentaje arbitrario.
3. **Biblioteca y ritmo.** Más variantes por familia, encuadre por sujeto, highlights tácticos y transiciones ligadas a cambios narrativos. Conservar el contrato de parámetros ejecutables y su prueba visual.
4. **QA temporal.** Evaluación con audio y secuencias, más allá de seis fotogramas. Un conjunto de ejemplos aprobado por humanos permitirá comparar calidad entre versiones y modelos sin inventar una puntuación.
5. **Operación.** Resolver cuota de Mistral, probar agente/respaldos secundarios completos, observar tiempos y memoria de trabajos reales, y fijar también la revisión y checksum del respaldo Whisper para ampliar reproducibilidad.

El siguiente salto de calidad depende de dirección artística, medios pertinentes y revisión humana. Añadir más texto genérico al prompt o más proveedores, por sí solo, no lo produce.
