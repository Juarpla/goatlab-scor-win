---
title: ¿Tres partidos o cinco para medir la forma de un equipo?
description: Qué cambia cuando acortas la ventana de resultados y cómo probar si una racha breve da mejores señales.
category: El juego y sus números
date: 2026-11-14
order: 10
sources:
  - name: GoatLab · Datos históricos, ventanas y contexto
    url: https://goatlab.win/metodologia/#datos-historicos
  - name: Football-Data.org · Documentación de partidos
    url: https://docs.football-data.org/general/v4/match.html
---

Imagina un club que, del partido más antiguo al más nuevo, pierde dos veces, gana dos y empata. Con cinco encuentros el equipo obtiene **7 de 15 puntos posibles**, el 46,7%. Con tres consigue **7 de 9**, el 77,8%. Ambos números proceden de la misma secuencia. La ventana corta responde con rapidez a una mejora; la larga conserva más contexto.

## El coste de una jornada atípica

Si el siguiente partido es una derrota, la ventana de tres pasa a victoria, empate y derrota, es decir, 4 de 9 puntos. La de cinco queda en derrota, victoria, victoria, empate y derrota, todavía 7 de 15. Antes de interpretar la caída, mira contra quién jugó, dónde y qué pasó en el encuentro. Una expulsión temprana o un calendario excepcional pueden producir un salto en una muestra corta.

## Qué mostró una primera prueba

GoatLab comparó ambas ventanas sobre **126 partidos** de su base en un corte de noviembre de 2026. Para estimar la diferencia de goles del siguiente partido, promedió el margen de cada equipo en la misma competición y tomó la mitad de la diferencia entre los dos promedios. Cada equipo debía tener al menos cinco partidos anteriores en esa competición.

| Ventana | Error absoluto medio en diferencia de goles |
| --- | ---: |
| Tres partidos | 1,37 |
| Cinco partidos | 1,34 |

La ventaja observada fue de unos **0,03 goles** de error medio. La diferencia es pequeña y corresponde a esta muestra y a esta fórmula. Para saber si se mantiene, habría que repetir la prueba por liga y con varias temporadas.

## Cómo comparar las ventanas

Reúne varios meses de jornadas y fija un objetivo, como la diferencia de goles del próximo partido. Para cada fecha, calcula ambas ventanas usando solo partidos anteriores y el mismo criterio de competición. Conserva una muestra común para que los dos métodos se enfrenten a exactamente los mismos cruces. Entrena o ajusta con fechas anteriores y comprueba el error en fechas posteriores.

También se puede evaluar una media ponderada donde los últimos partidos pesan más y los antiguos siguen aportando contexto. Publica la muestra por liga y, si procede, por localía. El ejemplo inicial explica la sensibilidad de ambas ventanas. Una comparación fuera de muestra en otras temporadas ayudaría a comprobar si la ventaja se repite.

## El efecto de quién estaba enfrente

Dos equipos pueden lograr **siete puntos en cinco partidos** con rivales completamente distintos. Si uno acumuló esos puntos contra equipos del fondo y el otro afrontó dos partidos de visitante ante líderes, la cifra bruta describe dos muestras con distinta dificultad. Para comparar la forma en serio, hay que mostrar rivales, fecha, competición y localía. Un ajuste por fuerza del contrincante necesita una referencia disponible antes del partido.

En el ejemplo de GoatLab, el margen medio usa la diferencia de goles, así que una goleada aislada pesa más que un triunfo ajustado. Una variante robusta podría limitar el efecto de una diferencia extrema o combinar el margen con goles esperados si están disponibles de forma comparable. Es una propuesta para otra prueba. Para medir su efecto habría que enfrentar ambas fórmulas sobre los mismos 126 partidos o una muestra posterior equivalente.

## Qué preguntar al ver una racha

Pregunta si el periodo coincide con un cambio de entrenador, lesiones o un calendario muy cargado. Una ventana corta puede recoger un cambio reciente y también puede incluir dos cruces poco representativos. Una larga suaviza ese ruido y tarda más en reflejar cambios persistentes. En ambos casos **la regla se fija antes de conocer el resultado siguiente** para evitar seleccionar la ventana que hace ver mejor al equipo.

La diferencia de 0,03 goles del corte inicial da una referencia del tamaño del efecto. Para decidir si compensa cambiar de ventana, conviene publicar el error por competición y comprobar si la mejora persiste durante varias jornadas.
