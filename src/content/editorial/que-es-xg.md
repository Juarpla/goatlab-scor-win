---
title: Qué dicen los goles esperados sobre un partido
description: Dos equipos pueden sumar el mismo xG con ocasiones muy distintas. Un ejemplo muestra cómo leer esa diferencia.
category: El juego y sus números
date: 2026-11-14
order: 7
sources:
  - name: StatsBomb · Qué son los goles esperados
    url: https://statsbomb.com/soccer-metrics/expected-goals-xg-explained/
  - name: GoatLab · Metodología y fuentes
    url: https://goatlab.win/metodologia/#datos-historicos
---

El xG asigna a un remate una probabilidad estimada de gol a partir de sus características. Una ocasión de 0,60 xG representa un tipo de remate que el modelo espera que se convierta alrededor de seis veces de cada diez. Los proveedores pueden llegar a valores distintos porque observan variables distintas, desde la distancia y el ángulo hasta la posición de defensores y arquero.

## Una ocasión clara o seis pequeñas

El equipo A tiene un tiro de 0,60 xG. El equipo B tiene seis de 0,10. Ambos suman 0,60 xG. El equipo A concentra toda su amenaza en una ocasión. Para el equipo B, si suponemos que los tiros son independientes, la probabilidad de fallarlos todos es 0,90 elevado a seis, cerca del 53%. La probabilidad de marcar al menos una vez es entonces de alrededor del 47%, frente al 60% del A.

| Secuencia | Suma de xG | Probabilidad de al menos un gol en el ejemplo |
| --- | ---: | ---: |
| Un tiro de 0,60 | 0,60 | 60% |
| Seis tiros de 0,10 | 0,60 | 46,9% |

La diferencia surge porque el equipo B tiene varias oportunidades de marcar dos veces. El valor esperado mide el promedio de goles en muchas repeticiones. El porcentaje de conseguir al menos uno mide una sola condición. La independencia es una simplificación: un remate tras un rebote depende de lo que ocurrió en el tiro anterior.

## Cómo aplicarlo durante la jornada

Separa el xG calculado sobre remates reales del xG previo al partido que estima el volumen y la calidad futuros. En una crónica, empieza por cuántas ocasiones hubo, cómo se distribuyeron y en qué momento del marcador aparecieron. Un equipo que iba perdiendo puede acumular remates tras adelantarse el rival y alterar el perfil de la segunda mitad.

## El contexto cambia el peso del total

Un equipo puede terminar con **1,20 xG y cero goles**. Bajo un modelo razonable, ese resultado es compatible con una tarde de mala definición o buenas intervenciones del rival. Para distinguir las explicaciones ayuda observar la calidad de los remates, cuántos encontraron portería y qué secuencias potenciales acabaron sin tiro. El xG previo al disparo suele valorar el contexto del remate. Las variantes posteriores al disparo pueden introducir la colocación de la pelota.

También importa **cuándo** llegaron las ocasiones. Si un equipo se adelanta pronto y el rival termina tirando desde posiciones malas, el total puede acercarse aunque se mantenga una diferencia importante en el tipo de peligro. Una curva por minutos ayuda a ubicar ese cambio de comportamiento. Para interpretarla, marca también el primer gol, una expulsión o el momento en que se agotaron los cambios.

## Tres preguntas para leer la cifra

Primero, quién calculó la estadística y qué datos observó. Segundo, cómo se distribuyeron los tiros entre **ocasiones claras y remates de baja probabilidad**. Tercero, si el partido tenía algún hecho que alteró la muestra. Un penal añade una ocasión de valor alto, mientras que una cadena de dos tiros en la misma jugada puede contar más de una acción vinculada.

En una comparación por temporada, conviene usar el mismo proveedor y el mismo criterio para todas las fechas. Si se mezclan metodologías, un cambio aparentemente abrupto puede venir de la medición. La secuencia hipotética de esta página ofrece una forma de comprobar cómo se comportan dos muestras con el mismo total.
