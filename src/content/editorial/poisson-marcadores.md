---
title: Cómo calcula Poisson un marcador de fútbol
description: De una tasa esperada de goles a las probabilidades de 0–0 y 1–0, con un ejemplo que puedes reproducir.
category: El juego y sus números
date: 2026-11-14
order: 8
sources:
  - name: NIST · Distribución de Poisson
    url: https://www.itl.nist.gov/div898/handbook/eda/section3/eda366j.htm
  - name: GoatLab · Metodología y fuentes
    url: https://goatlab.win/metodologia/#datos-historicos
---

Si un modelo espera 1,5 goles del local y 0,9 del visitante, la distribución de Poisson convierte esas tasas en probabilidades para cero, uno, dos o más goles. Para cada equipo, `P(k) = e^(−λ) · λ^k / k!`, donde λ es su tasa esperada y k el número de goles. El caso de cero se resume en `e^(−λ)`.

## Un cálculo desde cero

En el ejemplo, la probabilidad de que el local se quede a cero es 22,3%; para el visitante es 40,7%. Si los goles de ambos se tratan como independientes, el 0–0 tiene un 9,1% de probabilidad, el producto de esos valores. Para el 1–0 se multiplica 33,5%, el valor de un gol local, por el mismo 40,7%.

| Marcador | Probabilidad del ejemplo |
| --- | ---: |
| 0–0 | 9,1% |
| 1–0 | 13,6% |
| 1–1 | 12,2% |
| 2–0 | 10,2% |

Para calcular la victoria local se suman todos los resultados en los que los goles del local superan a los del visitante. Conviene conservar suficientes celdas para que los marcadores altos omitidos apenas afecten a la suma.

## Dónde puede fallar

Todo depende de cómo se estiman las tasas. Un promedio de liga, una muestra reciente del club y un ajuste por rival pueden dar números diferentes. El supuesto de independencia también deja fuera el efecto del marcador: tras el primer gol, un equipo puede defender más bajo y el otro atacar con más jugadores. Los pocos marcadores más probables siguen reuniendo solo una parte del total. Una lectura responsable compara la distribución completa con resultados posteriores y con una referencia simple.
