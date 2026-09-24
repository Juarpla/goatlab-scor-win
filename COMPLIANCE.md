# COMPLIANCE — GoatLab Shorts

Reglas bloqueantes pre-render. El lint (`pnpm lint:shorts`) falla la corrida si alguna se viola.

## Prohibido (cero tolerancia)

1. **Footage de transmisión**: solo foto fija con licencia registrada, Ken Burns, gráficos y web-card propia.
2. **Logos de equipos/ligas y marcas**: el único logo permitido es el de GoatLab (`public/favicon.svg`).
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
- Guion ≤ 110 palabras (~50s). Fotos con licencia + atribución registrada en `media-pack`.

## Fotos

Relleno genérico (estadio, hinchada, balón), sin portada por partido, nada que parezca footage. Fuentes: Pexels → Pixabay vía API (keys en `PEXELS_API_KEY` / `PIXABAY_API_KEY`, solo secrets/entorno, jamás en git) > Commons/Flickr CC con atribución. Cada manifiesto `media-pack/<webId>.json` registra fuente, id, url https, fotógrafo y atribución. Prohibido: Getty/AP/Reuters/Shutterstock/Alamy/Instagram/scraping Google.

## Video

`pnpm short -- --match=<webId>`: MP4 1080x1920 30fps ~42s (3 fotos Ken Burns + dissolves + web-card propia + end card `goatlab.win`), sin audio salvo `--audio`. Renders en `public/shorts/` (gitignorados, se regeneran).
