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

Banco por partido: hasta diez imágenes y tres clips referenciales generados con Agnes AI, a partir de los prompts publicados. Cada imagen conserva modelo, fecha, prompt y dimensiones; cada clip conserva su tarea y resultado. Preparación conjunta de quince minutos, reutilizable entre chats. Las ilustraciones no documentan jugadas reales. Marca, música y fuentes propias mantienen sus licencias. Las cifras de los gráficos se resuelven del catálogo verificable; datos ausentes se indican sin inventar ceros.

## Video

`pnpm short -- --match=<webId> --audio=<archivo>`: MP4 H.264/AAC 1080×1920 a 30 fps. React/Remotion interpreta el plan validado de la voz, combinando imágenes, clips mudos y gráficos estadísticos. Conserva subtítulos amarillos con borde negro, música y cierre goatlab.win. Máximo 49.9 segundos y menos de 45 MB; voz hasta 45.9 s, aceleración máxima 1.10 conservando el tono y todas las palabras. La transcripción usa el audio ajustado. Renders en public/shorts/ (gitignorados).
