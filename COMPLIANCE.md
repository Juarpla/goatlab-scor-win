# COMPLIANCE — GoatLab Shorts

Reglas bloqueantes pre-render. El lint (`pnpm lint:shorts`) falla la corrida si alguna se viola.

## Prohibido (cero tolerancia)

1. **Footage de transmisión**: solo foto fija con licencia registrada. El movimiento es un recorrido de cámara sobre esa foto, más gráficos y la web-card propia. Nada de clips de un partido televisado.
2. **Logos dibujados por GoatLab**: la plantilla no agrega escudos, ligas ni marcas. El único logo que pinta es el de GoatLab (`public/favicon.svg`). El escudo y el patrocinador que ya vienen en la foto del jugador se quedan.
3. **Cuotas, casas de apuestas y CTA de apuesta**: nada de cuotas/momios, picks, stake/bankroll, tipster, bonos, casino, parlay/combinada, hándicap, "fija/segura".
4. **Garantías de resultado**: nada de "gana seguro", "100% seguro", "garantizado".
5. **Claves crudas al lector**: `1X2`, `BTTS`, `DNB`, `H2H`, `HT/FT` jamás se imprimen (ver `src/lib/story-dictionary.js`).

## Gate de probabilidades

- `evaluation-report.json → published: false` ⇒ **cero `%` en guiones y descripciones**. Solo métricas: forma, goles, xG, cara a cara, muestras declaradas.
- Con `published: true`, porcentajes solo de insumos que superaron su referencia (misma regla que el veredicto web).

## Obligatorio en cada entrega

- Beat con CTA web (`goatlab.win`) dentro del guion.
- Descripción con: hook + análisis + `🔗 Más data: https://goatlab.win/partido/<id>` + `#goatlab` + disclaimer fijo:
  > Análisis con fines educativos e informativos. No es asesoría de apuestas y no garantiza resultados.
- Guion en texto corrido ≤ 110 palabras (~50s), listo para leer en voz alta: hook + datos entrelazados + cierre + CTA hablada a `goatlab.win`. Ilustraciones Agnes con procedencia y aviso referencial registrados en `media-pack`.
- Título de clic distinto del gancho. Lo estampa `shortTitle`: icono de la fila, `⚽` y la frase fija del skill `redactar-guiones-shorts` (equipos, o hasta dos jugadores de los guiones 3, 4, 7 y 9). Hashtags con equipos y jugadores delante, tope de 15. El lint falla si el JSON no coincide.

## Fotos

Banco por partido: cuatro imágenes y dos clips referenciales Agnes. Las imágenes conservan modelo, prompt, fecha y dimensiones; los clips públicos conservan modelo, hashes de prompt/referencia y dimensiones, mientras sus identificadores de tarea quedan en el estado privado. El presupuesto efímero por corrida es de 50 minutos, limitado a kickoff + 24 h. SQLite es caché; admisión y cuotas dependen de `app-states/goatlab/agnes-state.json`, privado en R2. Los reportes públicos están saneados y no incluyen identificadores de tareas, respuestas crudas, credenciales o URLs firmadas. Las ilustraciones no documentan jugadas reales. Marca, música y fuentes propias mantienen sus licencias. Las cifras de gráficos se resuelven del catálogo verificable; datos ausentes se indican sin inventar ceros.

Los bancos v2 completos requieren fingerprint e identidad coherentes, cuatro fotos y dos clips distintos y disponibilidad de almacenamiento comprobada. Los bancos legacy siguen siendo legibles y necesitan verificación antes de declararse completos. `_agnes-hourly.json` es telemetría, no un manifiesto. La poda requiere final FT/AET/PEN comprobado y más de una hora desde su primera detección válida; se aplica a guiones, prompts, media, análisis y probabilidades. Media requiere además cierre compartido y borrado remoto confirmado antes de borrar localmente. Los resultados y la evaluación histórica quedan fuera de esta poda.

## Video

`pnpm short -- --match=<webId> --audio=<archivo>`: MP4 H.264/AAC 1080×1920 a 30 fps. React/Remotion interpreta el plan validado de la voz, combinando imágenes, clips mudos y gráficos estadísticos. Conserva subtítulos amarillos con borde negro, música y cierre goatlab.win. Máximo 49.9 segundos y menos de 45 MB; voz hasta 45.9 s, aceleración máxima 1.10 conservando el tono y todas las palabras. La transcripción usa el audio ajustado. Renders en public/shorts/ (gitignorados).
