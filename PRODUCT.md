# GoatLab

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Público hispanohablante de Latinoamérica que quiere entender encuentros de fútbol mediante estadísticas y predicciones. Incluye lectores que usan estos datos para tomar decisiones relacionadas con apuestas, pero GoatLab no promoverá apostar ni enlazará a casas de apuestas.

La experiencia debe funcionar en celulares y escritorio. Los horarios se adaptarán a la zona del visitante, con Lima como referencia de respaldo.

## Product Purpose

Explicar los encuentros destacados del fútbol mediante datos fáciles de interpretar, comparaciones visuales y explicaciones breves. La publicidad de Google AdSense será la fuente principal de ingresos prevista para sostener la web, sin perjudicar la lectura.

## Positioning

Una herramienta de analítica deportiva que prioriza tablas y gráficos sobre artículos extensos. Ofrecerá dos secciones diferenciadas: análisis basado en datos deportivos y análisis preparado con IA. Las explicaciones textuales serán puntuales, en párrafos breves y separados.

## Operating Context

Los lectores consultarán previas, estadísticas históricas, posibles escenarios deportivos y seguimiento de partidos cuando existan datos disponibles. La cobertura inicial solicitada comprende Champions League, Europa League, Copa Libertadores, LaLiga y Premier League; el acceso efectivo depende de los proveedores gratuitos.

## Capabilities and Constraints

- Sitio responsive construido sobre el proyecto Astro existente.
- GitHub Actions para preparar datos y análisis; Cloudflare Pages como alojamiento elegido.
- Solo fuentes deportivas gratuitas en esta etapa. API-Football será el proveedor principal y Football-Data.org el respaldo. El cambio de proveedor debe respetar las diferencias de cobertura, métricas y actualización; no son intercambiables en todas las funciones.
- No exponer credenciales al navegador. Compartir los datos obtenidos entre visitantes para controlar el consumo.
- Si ambos proveedores fallan o no cubren una función, omitirla o mostrar una alternativa honesta, según el contexto. El usuario delegó esta decisión de presentación.
- El seguimiento gráfico con movimiento continuo es una aspiración condicionada a disponer de datos reales. No representar posiciones inventadas como transmisión real. Si faltan datos, se admite un seguimiento más sencillo o su ausencia.
- Incluir estadísticas históricas y predicciones deportivas, diferenciando ambas. El usuario desea cubrir los escenarios habituales en apuestas mediante lenguaje deportivo cotidiano y porcentajes, sin presentar cuotas.
- La amplitud deseada incluye resultados, goles, primer gol y sus intervalos, estadísticas por periodo, córners, tarjetas, faltas, tiros y jugadores. La cobertura será progresiva, decisión confirmada por el usuario: incorporar categorías conforme existan datos suficientes y modelos evaluados; no exigir todas en el primer lanzamiento.
- Los porcentajes predictivos necesitan una metodología estadística evaluada con datos históricos; la generación de texto con un LLM no demuestra por sí sola su fiabilidad. Fuente, muestra, fecha y limitaciones deben poder consultarse.
- Análisis de IA preparados por partido y compartidos entre lectores; no se ha solicitado un chat público.
- Cliente LLM solicitado en `src/lib/llm.js`, sin SDKs, usando `fetch`, compatible con Node y workerd y formato OpenAI Chat Completions. Proveedores configurados por variables de entorno, con prioridad por defecto Mistral → Workers AI → OpenCode Go.
- Contrato LLM confirmado: resolver la cadena en runtime; omitir proveedores sin credenciales o requisitos; deduplicar; registrar nombres desconocidos; un intento por proveedor; failover ante cualquier fallo, incluido contenido vacío o validación del consumidor; timeout configurable de 60 segundos por defecto; `temperature: 0`; error agregado cuando fallen todos. Los consumidores podrán degradar sin bloquear el sitio. La extracción de JSON debe admitir respuestas con bloques de código o razonamiento adicional. Endpoints y modelos concretos están pendientes de verificación.
- Preparar espacios de AdSense inicialmente. Activar anuncios reales solo con la cuenta aprobada y los identificadores configurados; no se ha confirmado disponer de ellos.
- Exclusión permanente: enlaces a casas de apuestas. También quedan fuera cuotas y llamadas a apostar. Usar vocabulario cotidiano no cambia la naturaleza del contenido ni garantiza la aprobación de AdSense.

## Brand Commitments

- Nombre confirmado: **GoatLab**.
- Idioma inicial: español para Latinoamérica.
- Preferencia explícita por una interfaz oscura.
- Preferencia explícita por scrollytelling, con protagonismo de gráficos y tablas. No se ha solicitado un feed de videos reales.
- Publicidad distribuida de forma que no tape ni interrumpa la comprensión del contenido.

Estas preferencias son compromisos del usuario; paleta, tipografía, composición y comportamiento concreto del scrollytelling se definirán en el trabajo de diseño posterior.

## Evidence on Hand

El repositorio contiene el starter de Astro; todavía no hay una interfaz propia, integración de datos, modelos predictivos ni análisis de GoatLab.

Referencias propuestas por el usuario: [Scores24](https://scores24.live/es), [BetMines](https://betmines.com/es), [Flashscore](https://www.flashscore.com/), [StatsBomb Open Data](https://github.com/statsbomb/open-data) y [Football-Data.co.uk](https://www.football-data.co.uk/). Son referencias o fuentes candidatas; no se ha confirmado acceso autorizado, integración ni licencia de reutilización para este producto.

Proveedores elegidos posteriormente:

- [API-Football](https://www.api-football.com/pricing): la documentación consultada confirma 100 peticiones diarias y restricciones de temporadas en el plan gratuito. No asumir disponibilidad de cualquier temporada o métrica por el alcance general del catálogo.
- [Football-Data.org](https://www.football-data.org/pricing): la documentación consultada confirma 12 competiciones, 10 peticiones por minuto y resultados con retraso en el plan gratuito. No presentarlos como seguimiento instantáneo.

No hay porcentajes predictivos validados, resultados de evaluación, credenciales confirmadas, cuenta AdSense aprobada. No inventar estas evidencias.

Licencia de Bzzoiro (investigada, v4.0, docs consultadas en 2026-09): los escudos y fotos son de sus respectivos dueños, no cubren la licencia de datos, y el proveedor los permite expresamente «para identificar equipos, jugadores, competiciones y sedes dentro de la aplicación»; hotlink permitido sin autenticación; un activo puede retirarse en cualquier momento ante petición del titular (el endpoint responde 204). Uso aprobado por el usuario: hotlink de escudos solo para identificación en el muro y la página de partido, con monograma de respaldo y nota de no afiliación en privacidad y metodología. No usar escudos en material promocional.

## Product Principles

1. Hacer comprensibles los datos mediante visualizaciones acompañadas de explicaciones puntuales.
2. Separar hechos históricos, estimaciones estadísticas e interpretación de IA.
3. Mantener accesible el análisis cuando falten datos, fallen proveedores o no se sirvan anuncios.
4. Financiar el contenido sin sacrificar su lectura ni confundir publicidad con información deportiva.
5. Ajustar cobertura y frescura a los límites gratuitos, mostrando las limitaciones relevantes al lector.

## Open Decisions

- Modelos estadísticos, criterios de evaluación y datos históricos suficientes para cada categoría.
- Selección y cantidad diaria de partidos con análisis profundo; no se confirmó un límite de dos.
- Frecuencia de actualización y reparto del presupuesto de peticiones entre previas y seguimiento.
- Mecanismo de almacenamiento y consultas dinámicas en Cloudflare Pages.
- Modelos y endpoints LLM concretos, credenciales disponibles y presupuesto de inferencia. Elegir datos deportivos gratuitos no implica que todos los proveedores LLM sean gratuitos.
- Dominio, información del responsable del sitio y configuración necesaria para publicar y activar AdSense.
