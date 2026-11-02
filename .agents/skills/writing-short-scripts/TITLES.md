# Titles and hashtags

The save step in `actions/2-scripting/generate-youtube-scripts.mjs` discards the model's `title` and hashtags and stamps `shortTitle` and `hashtagLine`. This sheet is for whoever writes by hand. The spoken hook remains `hook` and is not copied into the title.

Row icon, then `⚽`, then the text. Limit: 100 characters. In scripts 3, 4, 7 and 9, `{jugadores}` means up to two names already written in that narration, joined with «y». A single name is conjugated in the singular («puede»). If that narration does not name players, use the team phrase.

1. `🔥` `¿{home} o {away}? Uno llega más caliente`
2. `👀` `{home} vs {away}: el historial que no te cuentan`
3. `⚡` `{jugadores}: ¿quién marca en {home} vs {away}?` — no players: `{home} vs {away}: ¿se abre el marcador?`
4. `🧤` `{jugadores}: ¿aguanta el arco en {home} vs {away}?` — no players: `¿Quién cierra el arco en {home} vs {away}?`
5. `✈️` `{away} llega a {home}: ¿alcanza la visita?`
6. `⏪` `{home} vs {away}: ¿se repite el último golpe?`
7. `🧱` `{jugadores} puede decidir {home} vs {away}` — two names: «pueden». No players: `{home} vs {away}: el primer gol lo cambia`
8. `🤝` `{home} vs {away}: cuidado, puede terminar en empate`
9. `✨` `{jugadores} en {home} vs {away}` — no players: `{home} vs {away}: marcar no es ganar`
10. `⏱️` `{home} vs {away}: lo único que importa al pitazo`

Hashtags include both teams and up to four players, in this order: goals (3), creation (9), fouls (7), goalmouth (4). Then `#Shorts` and `#goatlab`. Limit: 15. Teams and players go first so YouTube does not ignore the list.
