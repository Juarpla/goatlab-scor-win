# API-RESEARCH.md

**Free endpoints to populate the null fields of schema v2**
Date: 2026-09-17 · Scope: Bzzoiro (BSD v2), API-Football v3, Football-Data.org v4, Open-Meteo
Method: official documentation + real GET calls with the project keys (read-only; no quota consumed beyond the budgeted amount).
Out of scope: bookmaker odds, Polymarket, writing code or touching the schema.

**Marks used**

| Mark | Meaning |
|---|---|
| ✅ VERIFIED (live) | Real response captured on 2026-09-17 with the project key |
| ✅ VERIFIED (docs) | Current official documentation consulted today |
| 🟡 LIKELY | Documented or reported by third parties, not observed live |
| ⛔ NOT AVAILABLE | Confirmed that the free plan does not serve it |

---

## 1. Main table (data → endpoint → limit → field → risk)

| # | Data | Verified endpoint (URL + response example) | Free plan limit | Schema v2 field | Risk |
|---|---|---|---|---|---|
| 1.1 | **Corners per team and match** | Bzzoiro `GET /api/v2/events/{id}/stats/`: `stats.home.corner_kicks: 6`, `stats.away.corner_kicks: 3` (UCL Bayern-Bodø/Glimt, event 601067) ✅ VERIFIED (live) | 7,500 req/day (reset 00:00 UTC, burst 25/s) | `setPieces.{home,away}.cornersOver95` (+ `method: poisson-corners-v0`) | Detail only from the 2025/26 season (see 1.9); in the Champions League `stats` coverage is 52% (official coverage); `null` ≠ 0 |
| 1.2 | **Yellow/red cards per team** | Bzzoiro `stats.{home,away}.yellow_cards` / `red_cards` (601067: 0 and 0 home; 1 and 1 away) ✅ VERIFIED (live). Timeline complement: `/incidents/` (`card_type: "yellow"|"red"`) ✅ VERIFIED (live) | same as 1.1 | `discipline.{home,away}.yellowOver35`, `redAnytime` (+ `method: poisson-cards-v0`) | `incidents` documents `period_second` and `rescinded` (✅ VERIFIED docs) but **they were not observed in the sampled payload** (🟡 LIKELY); the card count excludes cards annulled by review |
| 1.3 | **Fouls per team** | Bzzoiro `stats.{home,away}.fouls` (601067: 5 and 8) ✅ VERIFIED (live) | same as 1.1 | `discipline.{home,away}.foulsAvg` | Uneven coverage outside the big leagues; `null` is honest |
| 1.4 | **Shots on target** | Bzzoiro `stats.{home,away}.shots_on_target` (601067: 12 and 3) ✅ VERIFIED (live) | same as 1.1 | `setPieces.shots` | Caution: the bag and the `shotmap` can disagree (docs); use `shotmap` if a single number is needed |
| 1.5 | **xG per team** | Bzzoiro `stats.{home,away}.xg.actual` + flag `estimated` (601067: 2.49, measured) ✅ VERIFIED (live), already integrated as `provider.xg` | same as 1.1 | `setPieces.xgTotal` | Whole competitions with **estimated** xG (Ligue 2, League Two, Liga Portugal 2, NWSL): do not mix with measured xG in training |
| 1.6 | **Absences and suspensions** | Bzzoiro `GET /api/v2/events/{id}/lineups/` → `unavailable_players.{home,away}[]` with `status: "injured"` and `reason` (601067: 6 away absences) ✅ VERIFIED (live). Reinforcement: `GET /api/v2/teams/{id}/squad/` → per player `availability: available|injured|doubtful|suspended`, `injury_type`, `injury_expected_return` ✅ VERIFIED (live) | same as 1.1 | `availability.{status, unavailablePlayers, source}` (+ `sample.historyRows`) | `available` means "not listed as absent", not "confirmed fit"; refresh several times a day; the reason can come as `pending_transfer` |
| 1.7 | **Lineups (XI)** | Bzzoiro `lineup_status: confirmed|predicted|unavailable` + `confidence` (601159, January 2027 match: `predicted`, conf. 0.577) ✅ VERIFIED (live) | same as 1.1 | There is no XI field in schema v2; the status feeds `availability` as context | Confirmed ~75 min before; predicted from ~14 days (docs); the observed window reached months out (🟡 LIKELY the exact horizon); teamsheet coverage: 98.6% in 2026, 69% in 2025, 8% in 2024 |
| 1.8 | **Assigned referee** | Bzzoiro `GET /api/v2/events/{id}/` → `referee_id` (601067 → 2217) ✅ VERIFIED (live) + `GET /api/v2/referees/{id}/` → `name: "Rade Obrenovič"`, `avg_yellow_per_match: 4.0`, `avg_red_per_match: 0.25`, `avg_fouls_per_match: 24.5` ✅ VERIFIED (live) | same as 1.1 | `weatherVenue.referee` | Caution: the v2 payload only carries the **id**, not the name → it requires resolution with `/referees/{id}/`; referee coverage 74% globally, 100% in the project competitions |
| 1.9 | **Team history for the priors** | Bzzoiro `GET /api/v2/events/?team_id=&status=finished` + `/{id}/stats/` ✅ VERIFIED (live). Depth sample: 2026-05-24 complete; 2025-10-26 complete; 2025-05-05 xG only; 2023-04-03 xG only | same as 1.1 | `inputs.history.rows` + `sample.historyRows` | **Stats detail starts in the 2025/26 season**: before that only goals/xG. Exact cut-off dates: 🟡 LIKELY (bracket May 2025 → Oct 2025) |
| 1.10 | **API-Football alternative for stats** | `GET /fixtures/statistics?fixture=1561400` → per team `Corner Kicks`, `Yellow Cards`, `Fouls`, `Shots on Goal` (3/5, 5/4, 19/16, 6/1) ✅ VERIFIED (live). `GET /fixtures/events?fixture=` for the timeline ✅ VERIFIED (live) | **100 req/day** (verified in `/status`: Free plan), 10/min | same as 1.1-1.4 | Not usable as an engine: 1 call per match and current season only by `date`/`fixture`; `season` blocked (`"try from 2022 to 2024"`) and `last` blocked |
| 1.11 | **Football-Data.org as a fallback** | `GET /v4/competitions/CL/matches?season=2026` → 144 matches (18 played) ✅ VERIFIED (live). **No `statistics`, no `bookings`, no `lineups`** in the individual resource (probe 551981) ✅ VERIFIED (live) | 10 req/min, 12 competitions, delayed scores | None of the stats; yes calendar/results/standings/scorers | Does not populate item 1; useful as a fixtures fallback. CL depth: 2023/2025/2026 OK; 2021/2022/2015 → 403 "restricted" |
| 1.12 | **Venue weather** | Bzzoiro `/events/{id}/` → `weather: {code: 2, description: "cloudy", wind_speed: 4.7, temperature_c: 13}` ✅ VERIFIED (live) → `weathercode`/`condition`/`wind`. Coordinates: `/venues/{id}/` → `latitude: 48.2188, longitude: 11.6247` ✅ VERIFIED (live). Open-Meteo by coordinates for `temp`/`precipitation` (already integrated in `src/lib/weather.js`) | Bzzoiro same as 1.1; Open-Meteo without a key | `weatherVenue.weather.{temp, precipitation, weathercode, wind, condition}` | Bzzoiro does not provide precipitation; Open-Meteo is an external forecast/archive (request cost negligible with per-venue/day cache) |

---

## 2. Exact free plan limits (what must be cited)

### Bzzoiro (BSD v2)
- **7,500 requests/day** (since 2026-08-17), reset 00:00 UTC; burst 25 req/s; fair use policy.
- 78 competitions with measured coverage; in the project's 5: Premier, LaLiga, Serie A, Bundesliga, Ligue 1 and Libertadores ~100% of `stats`; **Europa League 99%; Champions League 52%** (Basic).
- `/stats/`: **eight keys always present** per side (`ball_possession`, `total_shots`, `shots_on_target`, `corner_kicks`, `fouls`, `yellow_cards`, `red_cards`, `offsides`); when there is no data the value is **`null`, never 0**; the rest of the metrics only appear if the match reported them. Official measurement: 87% of matches were missing at least one of the eight.
- `/lineups/`: `confirmed` ~75 min before and persists; `predicted` with `confidence` (beta) for matches not started; `unavailable` returns 200 with `lineups: null`.
- `/incidents/`: goals, cards, substitutions and VAR decisions; documents `period_second` (sub-minute order) and `rescinded: true` on annulled cards (excluded from the count).
- Odds free: consensus of **11 full-time keys** only (✅ VERIFIED live in `/events/601067/odds/`); the Asian handicap is in the feed vocabulary with a consensus price (✅ VERIFIED docs), while the 1st/2nd half variants and markets such as corners or clean sheet are served by `/odds/comparison/` (requires Football Unlimited) or by the feed without being nameable in the `market` parameter (🟡 LIKELY free access).

### API-Football v3
- **100 req/day**, 10/min. All endpoints included, **but the Free plan only serves seasons 2022-2024**:
  - `GET /fixtures?league=39&season=2026` → `"plan": "Free plans do not have access to this season, try from 2022 to 2024."` ✅ VERIFIED (live)
  - `GET /fixtures?...&last=3` → `"Free plans do not have access to the Last parameter."` ✅ VERIFIED (live)
  - `GET /fixtures?date=2026-09-17` → 182 matches ✅ (access by date does work)
  - `GET /fixtures?league=39&date=2026-09-16` → requires `season` → blocked in practice for the current season.
- Seasons 2022-2024: stats and events per `fixture` work (867947: corners 4/4, yellows 2/0) ✅ VERIFIED (live).
- `/injuries`: available but only in the 2022-2024 window (`team=33&season=2023` → 346 records) ✅ VERIFIED (live) → **useless for current absences**.
- `GET /predictions?fixture=` **does serve the current season with the free key** ✅ VERIFIED (live 2026-09-18, fixture 1557408 Brentford-Chelsea): `winner`, `win_or_draw`, `under_over`, `goals` per team, `advice` and `percent` (`45%` strings). 1 request per match; only parameter `fixture`; hourly update, 1/day recommended. The daily quota is shared with the live endpoint (`/api/live/[id].json`), hence the `AF_PREDICTIONS_MAX` cap.

### Football-Data.org v4
- Free €0: 12 competitions (includes **Champions League**, id 2001, code CL), 10/min, delayed scores, calendar and standings.
- **`statistics` (corners/fouls/shots/cards) = paid add-on (€15)**; lineups, detail-scorers, bookings and squads = **"Free + Deep Data" €29**; odds = €15 add-on.
- In the individual free resource (551981) the payload carries `referees` and `odds` (with the message `"Activate Odds-Package..."`), but **not** `statistics`, `bookings` or `lineups` ✅ VERIFIED (live).
- Verified exception: `GET /v4/competitions/PL/scorers?season=2025` **does return scorers** with the free key ✅ VERIFIED (live): the call already made by `src/lib/football.js:189` works.
- Season depth in CL: 2026 (current) ✅, 2025 ✅ (189 finished), 2023 ✅ (125); **2021, 2022 and 2015 → 403 "restricted"** ✅ VERIFIED (live). Free window ≈ last 3 seasons.

---

## 3. Markets without a public probability (item 5): facts, probability and derivation

The honest wording: **the free providers publish the facts of these scenarios, not a probability**. What can be published is derived from the goals model with a declared method; what cannot, waits for an evaluated event model.

| Scenario | Sporting fact (free) | Probability published free | Derivable from the goals model? |
|---|---|---|---|
| Half-time and full-time result | Half-time score at the three providers; **already stored** in `public/data/results.json` (`halfTime`) ✅ VERIFIED (repo); Bzzoiro exposes it as `home_score_ht`/`away_score_ht` ✅ VERIFIED (live) | The combined market does not exist in free | Only with a halves model + a declared dependency assumption; **not exact** |
| Penalty | API-Football `fixtures/events` (the penalty arrives as a detail of a goal, e.g. `"Penalty"`) 🟡 LIKELY (docs; in the sample only `Card`/`subst` were observed); Bzzoiro `incidents` with `goal_type` ✅ VERIFIED (live, field present; in the sample only `"regular"`) | Does not exist | No: requires a separate event model |
| Red card | Bzzoiro (stats + incidents) ✅ VERIFIED (live); API-Football (`statistics` with `Red Cards` and `events` with `Red Card`) ✅ VERIFIED (docs) | Bzzoiro: *"Cards markets in general are not currently priced"*; `red_card`/`total_red_cards` historical only | No: requires a discipline model (`poisson-cards-v0` still not evaluated) |
| Total goals odd or even | n/a | Not priced | **Yes, exact** from the Poisson goal distribution |
| Asian handicap | n/a | Bzzoiro prices it in its feed (consensus, ✅ VERIFIED docs; the free per-match payload does not include it ✅ VERIFIED live) and API-Football includes odds in free; **excluded by editorial policy** | **Yes, exact** from the goal-margin distribution |

None of these scenarios has a field in schema v2; publishing them would require minimal new fields (later spec, outside this report). The exclusion of odds is an **editorial decision** (`PRODUCT.md`), not a lack of data.

---

## 4. Operating cost (requests per date)

| Path | Arithmetic | Verdict |
|---|---|---|
| Card/corner priors via Bzzoiro | ~32 matches × 2 teams × 20 historical matches ≈ **1,280 stats + ~64 lists/day** | Fits in 7,500/day; cache (the stats of a finished match are immutable) and respect fair use |
| Priors via API-Football | 1 call/match and no current seasons → **impossible** | Discarded as an engine; spot verification only |
| Stats for a specific match via API-Football | 2 calls (stats + events) | Valid for contrasting one match, not for history |
| Football-Data.org | 1 call per competition for results; no stats in free | Calendar/standings/scorers fallback only |
| Weather via Open-Meteo | 1 call per venue and day (cache) | Negligible |

---

## 5. Pending wiring in the repo (no new source)

1. `mapEventDetail` (`src/lib/bzzoiro.js:201-237`) looks for `data.referee`/`data.venue`, but v2 serves `referee_id`/`venue_id` → **that is why `weatherVenue.referee` is always null**; requires resolving id → name with `/referees/{id}/` and `/venues/{id}/`.
2. `weather.code` (0-5) and `weather.description` are not mapped to `weatherVenue.weather.weathercode`/`condition` (today null in 30/32 matches).
3. `unavailable_players` (lineups) and `availability` (squad) have a mapper (`mapUnavailable`, `src/lib/bzzoiro.js:271-279`) but do not reach the JSON → `availability.*` is still null.
4. `incidents` is not persisted: it only feeds live enrichment; it is the natural source of cards with `rescinded`.
5. The halves are already in `results.json.halfTime`: raw material for a future half-time/full-time market with no new calls.

---

## 6. Canonical naming (dictionary seed)

Requirement: the reader cannot see raw keys (`1X2`, `BTTS`, `HT/FT`) or values such as `-1.25` without an explanation. Proposal: **stable keys in the JSON + a label dictionary for the UI** (do not embed presentation text in the schema, which would force `schemaVersion` changes).

| Stable key (JSON) | Term for the reader | Short description |
|---|---|---|
| `oneX2` | Final result | Home win, draw or away win |
| `doubleChance` | Double chance | Two of the three final outcomes |
| `dnb` | Draw no bet | Who wins if the draw is discarded |
| `btts` | Both teams score | Yes/no both teams score |
| `overUnder` | Total goals | Over or under 1.5 / 2.5 / 3.5 |
| `exactScore` | Exact scoreline | Exact result at full time |
| `cleanSheet` | Clean sheet | One team concedes no goals |
| `firstGoal` | First goal | 15-minute band of the first goal |
| `scorers` | Scorers | Anytime / first / split |
| `cornersOver95` | Over 9.5 corners | Match corner total |
| `discipline` | Cards and fouls | Yellows, reds and fouls per team |
| `htFt` | Half-time and full-time result | Half-time→full-time combination (derivable market) |
| `oddEven` | Total goals odd or even | Parity of the total (derivable market) |
| `asianHandicap` | Asian handicap | Advantage/disadvantage applied to the scoreline |
| `redCard` | Red card | Yes/no there is a sending-off |
| `penalty` | Penalty | Yes/no a penalty is awarded |

---

## 7. Excluded by policy (documented, out of scope)

- **Bookmaker odds**: they exist in free (Bzzoiro consensus 11 keys; API-Football includes pre-match and in-play; Football-Data.org in a €15 add-on). Permanent **editorial** exclusion (`PRODUCT.md`), not technical.
- **Polymarket** (`/api/v2/events/{id}/polymarket/`): implied probabilities from a prediction market with real money; same family as betting, marginal coverage (1X2/BTTS/OU and only where there is an active market). Excluded.
- **Sources not evaluated** (TheSportsDB, Understat, FBref): discarded by the agreed scope; they do not add what Bzzoiro already covers for free.

---

## 8. Sources consulted (2026-09-17)

- Bzzoiro: https://sports.bzzoiro.com/docs/football/events/ · /docs/football/odds-predictions/ · /docs/conventions/ · /docs/football/teams-players/ · /docs/football/managers-referees-venues/ · /football-coverage/ · https://sports.bzzoiro.com/api/schema/
- API-Football: https://www.api-football.com/pricing (+ live calls to `v3.football.api-sports.io`)
- Football-Data.org: https://www.football-data.org/pricing · /coverage · https://docs.football-data.org/general/v4/ (policies, competition, match, lookup_tables)
- Project: `src/lib/bzzoiro.js`, `src/lib/football.js:238-240`, `src/lib/probabilities.js:241-263`, `public/data/results.json`, `PRODUCT.md`
