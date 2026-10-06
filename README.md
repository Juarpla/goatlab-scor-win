# GoatLab

Analítica de fútbol en español para Latinoamérica. Astro, GitHub Actions y Cloudflare Pages.

## Estado

Base de datos e IA implementada; interfaz propia pendiente de la elección visual abierta en Impeccable. No hay credenciales configuradas ni predicciones validadas. Los JSON iniciales representan datos no disponibles, no partidos inventados.

## Desarrollo

Node 22.12 o posterior.

```sh
pnpm install
pnpm run dev -- --background
pnpm run astro -- dev status
pnpm run astro -- dev logs
pnpm run astro -- dev stop
node --test tests/*.test.js
pnpm run build
```

## Datos y análisis

`node scripts/update-data.mjs` construye una ventana de siete días fusionando dos proveedores gratuitos: Football-Data.org sirve cualquier rango en una consulta; API-Football (plan gratis limitado a ayer–mañana) es autoridad para esas fechas y aporta marcador con minuto. El modo `--refresh` actualiza solo los marcadores del día. La forma reciente se calcula contra una base local de resultados (`public/data/results.json`): relleno inicial por competición en Football-Data.org más los resultados de ayer, con deduplicación tolerante a diferencias de nombres entre proveedores. Bzzoiro (REST gratuito) aporta estadísticas con xG e incidentes de los partidos del día, con emparejamiento por nombre y presupuesto acotado. Las métricas ausentes permanecen ausentes (`null`), nunca cero inventado.

El diccionario de equipos (`public/data/teams.json`, 129 vigentes 2026/27 y Libertadores 2026) asigna a cada club su slug web más los ids de Bzzoiro, API-Football (roster 2024 como puente, `bridged:true`; el free bloquea la temporada vigente) y Football-Data.org; se construye con `pnpm run data:teams` y las URLs de partido usan `home-vs-away-fecha`. Los ids de fixture antiguos (`af-`/`fd-`) siguen resolviendo.

El flujo de Actions corre a las 07:00 UTC (corrida completa: ventana, forma, análisis; 2 a.m. hora de Perú) y cada seis horas (solo marcadores), además de ejecuciones manuales y cambios en `main`. Este intervalo **no es una transmisión en vivo**. El seguimiento minuto a minuto quedó fuera de alcance: no existe fuente gratuita en tiempo real; el WebSocket de Bzzoiro (coordenadas del balón) cuesta USD 3/mes.

Las claves se configuran como GitHub Secrets con los nombres de `.env.example`; no deben entrar al navegador. La configuración de modelos usa variables del repositorio. OpenCode Go está diseñado para tráfico de agentes de programación según su documentación: confirmar que la cuenta permite este uso editorial antes de habilitar ese proveedor. No se suplanta otro cliente.

El análisis se prepara para todos los partidos vigentes de la ventana de siete días, cacheado por `inputKey`: un partido sin cambios no se vuelve a pagar. Cuando el partido se juega, su análisis se elimina en la siguiente corrida. Se conserva entre ejecuciones mediante artefactos de Actions; no se genera por visitante. Si solo hay calendario, el prompt exige describir exclusivamente ese contexto. Una caída del LLM no bloquea los datos deportivos.

El motor Poisson es una base experimental aislada. No se conecta a porcentajes públicos sin evaluación histórica. El control inicial exige al menos 200 partidos de evaluación y una puntuación Brier mejor que la referencia; esto no sustituye una revisión de calibración, segmentación y calidad de datos antes de producción.

## Publicación en Cloudflare Pages

Crear un proyecto Pages de Direct Upload y configurar en GitHub:

- Secrets `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_API_TOKEN`, con permisos limitados de publicación en Pages.
- Variable `CLOUDFLARE_PAGES_PROJECT`, con el nombre real del proyecto.
- Secrets de las APIs deportivas y de los proveedores LLM que se vayan a utilizar.

El workflow ejecuta pruebas, prepara datos, construye Astro y publica `dist` mediante Wrangler. Sin nombre de proyecto, omite la publicación. No se ha ejecutado un despliegue externo.

AdSense está pendiente de implementación; no se cargan anuncios ni rastreadores. Se prepararán ubicaciones antes de configurar identificadores de una cuenta aprobada.

## Referencias

- [API-Football: planes y temporadas](https://www.api-football.com/pricing)
- [Football-Data.org: límites y retraso](https://www.football-data.org/pricing)
- [Mistral: Chat Completions](https://docs.mistral.ai/api)
- [Workers AI: API compatible](https://developers.cloudflare.com/ai-gateway/usage/rest-api/)
- [OpenCode Go: endpoints y uso](https://opencode.ai/docs/go/)

Las decisiones del producto están en PRODUCT.md. El diseño se construirá directamente en código, según `.impeccable/config.json`.


### Contenido audiovisual

`pnpm content` prepara los guiones y prompts del top 5 configurable. Admite
`--category=all|scripts|image-prompts|video-prompts|motion-prompts`, `--match=<webId>`,
`--top=N` y `--force`. Las categorías se guardan de forma independiente y conservan
el contenido válido existente. Prioridad: MiMo → DeepSeek → Mistral → Workers AI,
configurada por `SCRIPT_PROVIDER_ORDER`, independiente del análisis deportivo.

Cada partido tiene `/scripts`, `/image-prompts`, `/video-prompts` y `/motion-prompts`
con su equivalente `.json`; `/content-index.json` lista los guiones disponibles
para próximos partidos. OpenClaw toma una copia del contenido al seleccionar el
partido, genera un banco compartido de 10 imágenes y hasta 3 clips Agnes, y monta
los gráficos según la voz. La preparación dura hasta 15 minutos, con entrega
parcial cuando falten recursos. `/youtube` conserva una redirección a `/scripts`.


El montaje usa React y Remotion en Fly.io: la IA entrega un plan validado version
4 y los componentes dibujan forma reciente, goles, arcos en cero, cara a cara y
síntesis. La presentación editorial añade tipografía cinética, duelos y recorridos
ilustrativos; la estadística utiliza hechos del catálogo. Se alternan cuando la
voz y los datos lo permiten. Las versiones 1–3 se adaptan. La voz manda los
tiempos; los clips Agnes se silencian. El render final mide como máximo 49.9 s.
Recomendación de grabación: hasta 45 s; ajuste automático de velocidad hasta
1.10 conservando el tono. Si no cabe, se solicita sustituir ese audio.

Instalar el worker con npm ci --prefix fly/render y preparar el bundle con
node fly/render/remotion-build.mjs. El render local usa el mismo camino:
node --env-file=.env scripts/render-short.mjs --match=<webId> --audio=<archivo>.

Los cinco intentos de Agnes Video Flash emparejan prompts e imágenes distintas
antes de reutilizarlas. Una tarea incierta con identificador tiene hasta 60 s de
recuperación por banco, conservados tras reinicios; sin identificador, el montaje
parcial continúa inmediatamente. Los intentos inciertos no se repiten y un 429
conserva la pareja respetando Retry-After dentro del presupuesto de 15 minutos.
