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
- Guion en texto corrido ≤ 110 palabras (~50s), listo para leer en voz alta: hook + datos entrelazados + cierre + CTA hablada a `goatlab.win`. Fotos con licencia + atribución registrada en `media-pack`.
- Título de clic distinto del gancho. Lo estampa `shortTitle`: icono de la fila, `⚽` y la frase fija del skill `redactar-guiones-shorts` (equipos, o hasta dos jugadores de los guiones 3, 4, 7 y 9). Hashtags con equipos y jugadores delante, tope de 15. El lint falla si el JSON no coincide.

## Fotos

Fotos actuales de los dos equipos masculinos (entrenamiento, entrevista, llegada o bajada del bus, hinchada, rueda de prensa o retrato). Entre 8 y 15 por manifiesto. No es el partido en sí. Fuentes: Wikimedia Commons (dominio público, CC0, CC BY, CC BY-SA), Pexels (Pexels License), Pixabay (Pixabay Content License) y, si faltan, hasta 5 de apoyo generadas con Agnes. Fuera: equipo femenino, acción del encuentro, CC BY-NC, CC BY-ND, "uso justo", Getty/AP/Reuters/Shutterstock/Alamy/Instagram y scraping de Google. Cada foto trae `seen` con el modelo y la fecha; sin eso el manifiesto no vale. Cada manifiesto registra fuente (`commons`, `pexels`, `pixabay` o `agnes`), id, url https, fotógrafo, licencia y atribución. Lo arma el gateway al elegir el partido, a partir de los dos equipos, no de los guiones. Cada audio ordena ese pool al renderizar.

## Video

`pnpm short -- --match=<webId>`: MP4 1080x1920. La plantilla fija es HyperFrames (HTML + GSAP) dentro de `goatlab-render`: subtítulo por palabra en amarillo con borde negro, cifras que entran animadas, recorrido de cámara de esa secuencia y end card `goatlab.win`. Node 22 lanza el render; Chrome captura y FFmpeg comprime y mezcla la voz. No hay otro motor. Renders en `public/shorts/` (gitignorados, se regeneran).
