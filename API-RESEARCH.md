# API-RESEARCH.md

**Endpoints gratuitos para poblar los campos nulos del schema v2**
Fecha: 2026-09-17 · Alcance: Bzzoiro (BSD v2), API-Football v3, Football-Data.org v4, Open-Meteo
Método: documentación oficial + llamadas GET reales con las claves del proyecto (solo lectura; no se consumió cuota más allá de lo presupuestado).
Fuera del alcance: cuotas de casas de apuestas, Polymarket, escribir código o tocar el schema.

**Marcas usadas**

| Marca | Significado |
|---|---|
| ✅ VERIFICADO (live) | Respuesta real capturada el 2026-09-17 con la clave del proyecto |
| ✅ VERIFICADO (docs) | Documentación oficial vigente consultada hoy |
| 🟡 PROBABLE | Documentado o indicado por terceros, no observado en vivo |
| ⛔ NO DISPONIBLE | Comprobado que el plan gratuito no lo sirve |

---

## 1. Tabla principal (dato → endpoint → límite → campo → riesgo)

| # | Dato | Endpoint verificado (URL + ejemplo de respuesta) | Límite plan gratuito | Campo schema v2 | Riesgo |
|---|---|---|---|---|---|
| 1.1 | **Córners por equipo y partido** | Bzzoiro `GET /api/v2/events/{id}/stats/` — `stats.home.corner_kicks: 6`, `stats.away.corner_kicks: 3` (UCL Bayern–Bodø/Glimt, event 601067) ✅ VERIFICADO (live) | 7.500 req/día (reset 00:00 UTC, burst 25/s) | `setPieces.{home,away}.cornersOver95` (+ `method: poisson-corners-v0`) | Detalle solo desde la temporada 2025/26 (ver 1.9); en Champions la cobertura de `stats` es del 52% (coverage oficial); `null` ≠ 0 |
| 1.2 | **Tarjetas amarillas/rojas por equipo** | Bzzoiro `stats.{home,away}.yellow_cards` / `red_cards` (601067: 0 y 0 local; 1 y 1 visitante) ✅ VERIFICADO (live). Complemento timeline: `/incidents/` (`card_type: "yellow"|"red"`) ✅ VERIFICADO (live) | ídem 1.1 | `discipline.{home,away}.yellowOver35`, `redAnytime` (+ `method: poisson-cards-v0`) | `incidents` documenta `period_second` y `rescinded` (✅ VERIFICADO docs) pero **no se observaron en el payload muestreado** (🟡 PROBABLE); el conteo de tarjetas excluye anuladas por revisión |
| 1.3 | **Faltas por equipo** | Bzzoiro `stats.{home,away}.fouls` (601067: 5 y 8) ✅ VERIFICADO (live) | ídem 1.1 | `discipline.{home,away}.foulsAvg` | Cobertura desigual fuera de las grandes ligas; `null` honesto |
| 1.4 | **Tiros a puerta** | Bzzoiro `stats.{home,away}.shots_on_target` (601067: 12 y 3) ✅ VERIFICADO (live) | ídem 1.1 | `setPieces.shots` | Ojo: el bag y el `shotmap` pueden discrepar (docs); usar `shotmap` si hace falta un solo número |
| 1.5 | **xG por equipo** | Bzzoiro `stats.{home,away}.xg.actual` + flag `estimated` (601067: 2.49, medido) ✅ VERIFICADO (live) — ya integrado como `provider.xg` | ídem 1.1 | `setPieces.xgTotal` | Competiciones enteras con xG **estimado** (Ligue 2, League Two, Liga Portugal 2, NWSL): no mezclar con xG medido en entrenamiento |
| 1.6 | **Bajas y sanciones** | Bzzoiro `GET /api/v2/events/{id}/lineups/` → `unavailable_players.{home,away}[]` con `status: "injured"` y `reason` (601067: 6 bajas visitantes) ✅ VERIFICADO (live). Refuerzo: `GET /api/v2/teams/{id}/squad/` → por jugador `availability: available|injured|doubtful|suspended`, `injury_type`, `injury_expected_return` ✅ VERIFICADO (live) | ídem 1.1 | `availability.{status, unavailablePlayers, source}` (+ `sample.historyRows`) | `available` significa "no listado como baja", no "confirmado apto"; refresco varias veces al día; razón puede venir como `pending_transfer` |
| 1.7 | **Alineaciones (XI)** | Bzzoiro `lineup_status: confirmed|predicted|unavailable` + `confidence` (601159, partido de enero 2027: `predicted`, conf. 0.577) ✅ VERIFICADO (live) | ídem 1.1 | No hay campo de XI en schema v2; el estado alimenta `availability` como contexto | Confirmado ~75 min antes; predicho desde ~14 días (docs); la ventana observada llegó a meses fuera (🟡 PROBABLE el horizonte exacto); cobertura de teamsheets: 98.6% en 2026, 69% en 2025, 8% en 2024 |
| 1.8 | **Árbitro asignado** | Bzzoiro `GET /api/v2/events/{id}/` → `referee_id` (601067 → 2217) ✅ VERIFICADO (live) + `GET /api/v2/referees/{id}/` → `name: "Rade Obrenovič"`, `avg_yellow_per_match: 4.0`, `avg_red_per_match: 0.25`, `avg_fouls_per_match: 24.5` ✅ VERIFICADO (live) | ídem 1.1 | `weatherVenue.referee` | Ojo: el payload v2 solo trae **id**, no nombre → requiere resolución con `/referees/{id}/`; cobertura de árbitro 74% global, 100% en las competiciones del proyecto |
| 1.9 | **Historial por equipo para los priors** | Bzzoiro `GET /api/v2/events/?team_id=&status=finished` + `/{id}/stats/` ✅ VERIFICADO (live). Muestra de profundidad: 2026-05-24 completo; 2025-10-26 completo; 2025-05-05 solo xG; 2023-04-03 solo xG | ídem 1.1 | `inputs.history.rows` + `sample.historyRows` | **El detalle de stats arranca en la temporada 2025/26**: antes solo goles/xG. Fechas exactas de corte: 🟡 PROBABLE (bracket may-2025 → oct-2025) |
| 1.10 | **Alternativa API-Football para stats** | `GET /fixtures/statistics?fixture=1561400` → por equipo `Corner Kicks`, `Yellow Cards`, `Fouls`, `Shots on Goal` (3/5, 5/4, 19/16, 6/1) ✅ VERIFICADO (live). `GET /fixtures/events?fixture=` para timeline ✅ VERIFICADO (live) | **100 req/día** (verificado en `/status`: plan Free), 10/min | mismos que 1.1–1.4 | No sirve como motor: 1 llamada por partido y temporada actual solo por `date`/`fixture`; `season` bloqueado (`"try from 2022 to 2024"`) y `last` bloqueado |
| 1.11 | **Football-Data.org como respaldo** | `GET /v4/competitions/CL/matches?season=2026` → 144 partidos (18 jugados) ✅ VERIFICADO (live). **Sin `statistics`, sin `bookings`, sin `lineups`** en el recurso individual (probe 551981) ✅ VERIFICADO (live) | 10 req/min, 12 competiciones, marcadores con retraso | Ninguno de stats; sí calendario/resultados/tablas/goleadores | No puebla el ítem 1; útil como respaldo de fixtures. Profundidad CL: 2023/2025/2026 OK; 2021/2022/2015 → 403 "restricted" |
| 1.12 | **Clima de la sede** | Bzzoiro `/events/{id}/` → `weather: {code: 2, description: "cloudy", wind_speed: 4.7, temperature_c: 13}` ✅ VERIFICADO (live) → `weathercode`/`condition`/`wind`. Coordenadas: `/venues/{id}/` → `latitude: 48.2188, longitude: 11.6247` ✅ VERIFICADO (live). Open-Meteo por coordenadas para `temp`/`precipitation` (ya integrado en `src/lib/weather.js`) | Bzzoiro ídem 1.1; Open-Meteo sin clave | `weatherVenue.weather.{temp, precipitation, weathercode, wind, condition}` | Bzzoiro no trae precipitación; Open-Meteo es pronóstico/archivo externo (coste de peticiones despreciable con caché por sede/día) |

---

## 2. Límites exactos del plan gratuito (lo que hay que citar)

### Bzzoiro (BSD v2)
- **7.500 peticiones/día** (desde 2026-08-17), reset 00:00 UTC; ráfaga 25 req/s; política de uso razonable.
- 78 competiciones con cobertura medida; en las 5 del proyecto: Premier, LaLiga, Serie A, Bundesliga, Ligue 1 y Libertadores ~100% de `stats`; **Europa League 99%; Champions League 52%** (Basic).
- `/stats/`: **ocho claves siempre presentes** por lado (`ball_possession`, `total_shots`, `shots_on_target`, `corner_kicks`, `fouls`, `yellow_cards`, `red_cards`, `offsides`); cuando no hay dato el valor es **`null`, nunca 0**; el resto de métricas solo aparece si el partido las reportó. Medición oficial: 87% de partidos les faltaba al menos una de las ocho.
- `/lineups/`: `confirmed` ~75 min antes y persiste; `predicted` con `confidence` (beta) para partidos no empezados; `unavailable` devuelve 200 con `lineups: null`.
- `/incidents/`: goles, tarjetas, cambios y decisiones VAR; documenta `period_second` (orden sub-minuto) y `rescinded: true` en tarjetas anuladas (excluidas del conteo).
- Odds free: consenso de **11 claves de tiempo completo** únicamente (✅ VERIFICADO live en `/events/601067/odds/`); el hándicap asiático sí está en el vocabulario del feed con precio consenso (✅ VERIFICADO docs), mientras que las variantes de 1ª/2ª mitad y mercados como córners o portería a cero se sirven por `/odds/comparison/` (requiere Football Unlimited) o por el feed sin poder nombrarse en el parámetro `market` (🟡 PROBABLE su acceso free).

### API-Football v3
- **100 req/día**, 10/min. Todos los endpoints incluidos, **pero el plan Free solo sirve temporadas 2022–2024**:
  - `GET /fixtures?league=39&season=2026` → `"plan": "Free plans do not have access to this season, try from 2022 to 2024."` ✅ VERIFICADO (live)
  - `GET /fixtures?...&last=3` → `"Free plans do not have access to the Last parameter."` ✅ VERIFICADO (live)
  - `GET /fixtures?date=2026-09-17` → 182 partidos ✅ (acceso por fecha sí funciona)
  - `GET /fixtures?league=39&date=2026-09-16` → exige `season` → bloqueado en práctica para temporada actual.
- Temporada 2022–2024: stats y eventos por `fixture` funcionan (867947: córners 4/4, amarillas 2/0) ✅ VERIFICADO (live).
- `/injuries`: disponible pero solo en la ventana 2022–2024 (`team=33&season=2023` → 346 registros) ✅ VERIFICADO (live) → **inservible para bajas actuales**.
- `GET /predictions?fixture=` **sí sirve la temporada en curso con la clave free** ✅ VERIFICADO (live 2026-09-18, fixture 1557408 Brentford–Chelsea): `winner`, `win_or_draw`, `under_over`, `goals` por equipo, `advice` y `percent` (`45%` strings). 1 request por partido; único parámetro `fixture`; actualización horaria, recomendado 1/día. La cuota diaria se comparte con el endpoint en vivo (`/api/live/[id].json`), de ahí el tope `AF_PREDICTIONS_MAX`.

### Football-Data.org v4
- Free €0: 12 competiciones (incluye **Champions League**, id 2001, código CL), 10/min, marcadores con retraso, calendario y tablas.
- **`statistics` (córners/faltas/tiros/tarjetas) = add-on de pago (€15)**; alineaciones, goleadores-de-detalle, bookings y plantillas = **"Free + Deep Data" €29**; odds = add-on €15.
- En el recurso individual free (551981) el payload trae `referees` y `odds` (con mensaje `"Activate Odds-Package..."`), pero **no** `statistics`, `bookings` ni `lineups` ✅ VERIFICADO (live).
- Excepción verificada: `GET /v4/competitions/PL/scorers?season=2025` **sí devuelve goleadores** con la clave free ✅ VERIFICADO (live) — la llamada que ya hace `src/lib/football.js:189` funciona.
- Profundidad de temporadas en CL: 2026 (actual) ✅, 2025 ✅ (189 terminados), 2023 ✅ (125); **2021, 2022 y 2015 → 403 "restricted"** ✅ VERIFICADO (live). Ventana free ≈ últimas 3 temporadas.

---

## 3. Mercados sin probabilidad pública (ítem 5) — hechos, probabilidad y derivación

La redacción honesta: **los proveedores gratuitos publican los hechos de estos escenarios, no una probabilidad**. Lo que se puede publicar se deriva del modelo de goles con método declarado; lo que no, espera a un modelo de eventos evaluado.

| Escenario | Hecho deportivo (gratis) | Probabilidad publicada gratis | ¿Derivable del modelo de goles? |
|---|---|---|---|
| Resultado al descanso y al final | Marcador al descanso en los tres proveedores; **ya guardado** en `public/data/results.json` (`halfTime`) ✅ VERIFICADO (repo); Bzzoiro lo expone como `home_score_ht`/`away_score_ht` ✅ VERIFICADO (live) | No existe el mercado combinado en free | Solo con un modelo de mitades + supuesto de dependencia declarado; **no exacto** |
| Penalti | API-Football `fixtures/events` (el penalti llega como detalle de un gol, p. ej. `"Penalty"`) 🟡 PROBABLE (docs; en la muestra solo se observaron `Card`/`subst`); Bzzoiro `incidents` con `goal_type` ✅ VERIFICADO (live, campo presente; en la muestra solo `"regular"`) | No existe | No: requiere modelo de eventos aparte |
| Tarjeta roja | Bzzoiro (stats + incidents) ✅ VERIFICADO (live); API-Football (`statistics` con `Red Cards` y `events` con `Red Card`) ✅ VERIFICADO (docs) | Bzzoiro: *"Cards markets in general are not currently priced"*; `red_card`/`total_red_cards` solo histórico | No: requiere modelo de disciplina (`poisson-cards-v0` aún sin evaluar) |
| Total de goles par o impar | — | No cotizado | **Sí, exacto** desde la distribución Poisson de goles |
| Hándicap asiático | — | Bzzoiro lo cotiza en su feed (consenso, ✅ VERIFICADO docs; el payload free por partido no lo incluye ✅ VERIFICADO live) y API-Football incluye odds en free; **excluidos por política editorial** | **Sí, exacto** desde la distribución del margen de goles |

Ninguno de estos escenarios tiene campo en el schema v2; publicarlos exigiría campos nuevos mínimos (spec posterior, fuera de este informe). La exclusión de cuotas es **decisión editorial** (`PRODUCT.md`), no una carencia de datos.

---

## 4. Coste operativo (peticiones por fecha)

| Camino | Aritmética | Veredicto |
|---|---|---|
| Priors de tarjetas/córners vía Bzzoiro | ~32 partidos × 2 equipos × 20 partidos históricos ≈ **1.280 stats + ~64 listas/día** | Cabe en 7.500/día; cachear (las stats de un partido terminado son inmutables) y respetar uso razonable |
| Priors vía API-Football | 1 llamada/partido y sin temporadas actuales → **imposible** | Descartado como motor; solo verificación puntual |
| Stats de un partido concreto vía API-Football | 2 llamadas (stats + events) | Válido para contraste de un partido, no para historial |
| Football-Data.org | 1 llamada por competición para resultados; sin stats en free | Solo respaldo de calendario/tabla/goleadores |
| Clima vía Open-Meteo | 1 llamada por sede y día (caché) | Despreciable |

---

## 5. Cableados pendientes en el repo (sin fuente nueva)

1. `mapEventDetail` (`src/lib/bzzoiro.js:201-237`) busca `data.referee`/`data.venue`, pero v2 sirve `referee_id`/`venue_id` → **por eso `weatherVenue.referee` siempre es null**; requiere resolver id → nombre con `/referees/{id}/` y `/venues/{id}/`.
2. `weather.code` (0–5) y `weather.description` no se mapean a `weatherVenue.weather.weathercode`/`condition` (hoy null en 30/32 partidos).
3. `unavailable_players` (lineups) y `availability` (squad) tienen mapper (`mapUnavailable`, `src/lib/bzzoiro.js:271-279`) pero no llegan al JSON → `availability.*` sigue null.
4. `incidents` no se persiste: solo alimenta el enriquecimiento en vivo; es la fuente natural de tarjetas con `rescinded`.
5. Las mitades ya están en `results.json.halfTime`: materia prima para un futuro mercado de descanso/final sin llamadas nuevas.

---

## 6. Nomenclatura canónica (semilla de diccionario)

Requisito: el lector no puede ver claves crudas (`1X2`, `BTTS`, `HT/FT`) ni valores como `-1.25` sin explicación. Propuesta: **claves estables en el JSON + diccionario de etiquetas para UI** (no incrustar texto de presentación en el schema, que forzaría cambios de `schemaVersion`).

| Clave estable (JSON) | Término para el lector | Descripción corta |
|---|---|---|
| `oneX2` | Resultado final | Gana local, empate o gana visitante |
| `doubleChance` | Doble oportunidad | Dos de los tres resultados finales |
| `dnb` | Sin empate | Quién gana si se descarta el empate |
| `btts` | Ambos equipos marcan | Sí/no marcan los dos |
| `overUnder` | Total de goles | Más o menos de 1.5 / 2.5 / 3.5 |
| `exactScore` | Marcador exacto | Resultado exacto al final |
| `cleanSheet` | Portería a cero | Un equipo no recibe goles |
| `firstGoal` | Primer gol | Tramo de 15 minutos del primer gol |
| `scorers` | Goleadores | Anytime / primero / reparto |
| `cornersOver95` | Más de 9.5 córners | Total de córners del partido |
| `discipline` | Tarjetas y faltas | Amarillas, rojas y faltas por equipo |
| `htFt` | Resultado al descanso y al final | Combinación descanso→final (mercado derivable) |
| `oddEven` | Total de goles par o impar | Paridad del total (mercado derivable) |
| `asianHandicap` | Hándicap asiático | Ventaja/desventaja aplicada al marcador |
| `redCard` | Tarjeta roja | Sí/no hay expulsión |
| `penalty` | Penalti | Sí/no se señala penalti |

---

## 7. Excluido por política (documentado, fuera de alcance)

- **Cuotas de casas de apuestas**: existen en free (Bzzoiro consenso 11 claves; API-Football incluye pre-match e in-play; Football-Data.org en add-on €15). Exclusión **editorial** permanente (`PRODUCT.md`), no técnica.
- **Polymarket** (`/api/v2/events/{id}/polymarket/`): probabilidades implícitas de un mercado de predicción con dinero real; misma familia de apuestas, cobertura marginal (1X2/BTTS/OU y solo donde hay mercado activo). Excluido.
- **Fuentes no evaluadas** (TheSportsDB, Understat, FBref): descartadas por el alcance acordado; no aportan lo que Bzzoiro ya cubre gratis.

---

## 8. Fuentes consultadas (2026-09-17)

- Bzzoiro: https://sports.bzzoiro.com/docs/football/events/ · /docs/football/odds-predictions/ · /docs/conventions/ · /docs/football/teams-players/ · /docs/football/managers-referees-venues/ · /football-coverage/ · https://sports.bzzoiro.com/api/schema/
- API-Football: https://www.api-football.com/pricing (+ llamadas live a `v3.football.api-sports.io`)
- Football-Data.org: https://www.football-data.org/pricing · /coverage · https://docs.football-data.org/general/v4/ (policies, competition, match, lookup_tables)
- Proyecto: `src/lib/bzzoiro.js`, `src/lib/football.js:238-240`, `src/lib/probabilities.js:241-263`, `public/data/results.json`, `PRODUCT.md`
