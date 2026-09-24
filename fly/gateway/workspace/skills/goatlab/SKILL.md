---
name: goatlab
description: GoatLab Shorts. Responde al mensaje /goatlab en Telegram: lista los partidos vigentes con número, deja elegir uno y recibe la nota de voz para narrar el Short.
---

# GoatLab Shorts (`/goatlab`)

Flujo (todo en el mismo chat de Telegram):

1. **Lista vigentes**: lee `/home/node/goatlab/public/data/youtube-scripts/*.json` y muestra la lista numerada con `match` (o `home vs away`), `competition` y `kickoff`. Si no hay archivos, dilo y termina.
2. **Elige número**: el usuario responde con el número. Confirma el partido elegido (`matchId`).
3. **Recibe la voz**: pide la nota de voz que narrará el Short. Al recibirla, transcribe y muestra la transcripción para visto bueno.
4. **Cierre F5**: confirma partido + transcripción lista. El render del video llega en F6 (no prometas MP4 todavía).

Reglas: cero cuotas, cero garantías de resultado, CTA siempre a `goatlab.win`. Si piden `estado`, `ayuda` o `re-render`, responde que llegan en F6.
