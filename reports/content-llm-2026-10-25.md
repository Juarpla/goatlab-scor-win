# Generación de contenido — 25 de octubre de 2026

Se probaron los diez guiones de Manchester United–Bournemouth con los hechos
y jugadores locales (sin archivo de probabilidades para ese partido), a través del mismo gateway OpenCode Go que
utiliza la publicación. Los borradores de prueba no se publicaron ni sustituyeron
los guiones existentes. Son pocas observaciones de un solo partido; no representan
un percentil de latencia ni garantizan tiempos para todas las corridas.

## Hallazgos y configuración

- Tanto en local como en GitHub Actions, DeepSeek V4.1 Flash escribe primero y
  GLM-5.3-Flash queda como respaldo, mediante `SCRIPT_PROVIDER_ORDER` y los valores
  por defecto del generador y del workflow. La configuración de modelos de Fly.io
  conserva sus valores anteriores.
- Ambos reciben `thinking.type=enabled` y `reasoning_effort=max`.
- El presupuesto anterior de 12.000 tokens era insuficiente para estas pruebas:
  GLM agotó incluso 32.768 tokens en dos intentos (178 y 197 segundos).
- Un intento GLM sin streaming se cortó a los 301 segundos pese a configurar
  un timeout de 600 segundos. El cliente ahora consume SSE desde el inicio y
  conserva un deadline de diez minutos para toda la respuesta, incluidos sus datos.
- Se permiten hasta 131.072 tokens para compartir entre razonamiento y respuesta;
  ese techo no es un objetivo de consumo. Se mantienen los límites de duración
  de los guiones: 55–100 palabras, con techo absoluto de 110.

## Mediciones

| Modelo y configuración | Tiempo total | Tokens de salida | Validación de los diez guiones |
| --- | ---: | ---: | --- |
| DeepSeek, max, 65.536 tokens, sin streaming | 80,4 s | 17.885 | Correcta |
| DeepSeek, max, 65.536 tokens, sin streaming | 177,8 s | 32.671 | Correcta |
| DeepSeek, max, 131.072 tokens, streaming | 116,0 s | 13.128 | Correcta |
| GLM, max, 131.072 tokens, streaming | 223,1 s | 19.892 | Correcta tras normalizar el gancho |

GLM devolvió los ganchos en su campo separado; se antepusieron a las narraciones
con la misma normalización que ya emplea la generación de producción. Los textos
normalizados mantienen el techo de 110 palabras y pasan la validación completa.

Los tokens de salida incluyen razonamiento. La validación comprueba longitud,
ganchos, equipos, ubicación de jugadores, frases de proyección, cifras y compliance.
La coherencia y la naturalidad también se revisaron leyendo los borradores.

## Reproducción

```sh
node --env-file=.env scripts/benchmark-content-llm.mjs \
  --match=manchester-united-vs-bournemouth-2026-10-25 --runs=2
```

Los borradores y métricas quedan en un subdirectorio de
`.cache/content-llm-benchmark/`. `--model=<id>` permite aislar un modelo y
`--max-tokens=<n>` comparar un presupuesto distinto. Los archivos `.env` y las
credenciales no se escriben en los resultados.

La compatibilidad de esfuerzo máximo se contrastó con la documentación de
[DeepSeek](https://api-docs.deepseek.com/guides/thinking_mode/),
[GLM](https://docs.z.ai/api-reference/llm/chat-completion) y el
[endpoint de OpenCode Go](https://opencode.ai/v2/docs/console/go/), además de las
llamadas reales.
