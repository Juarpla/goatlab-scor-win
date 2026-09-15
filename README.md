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
