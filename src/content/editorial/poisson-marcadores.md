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

## Qué cambia al mover la tasa

Si la tasa local sube de **1,5 a 1,8**, la probabilidad de que ese equipo se quede a cero baja de 22,3% a 16,5%. Con la misma tasa visitante de 0,9, la probabilidad del 0–0 pasa de cerca del 9,1% al 6,7%. Ese cambio ocurre antes de mirar cualquier resultado real. Permite comprobar cuánto depende la salida del modelo de una sola decisión sobre los datos de entrada.

La distribución mueve su masa entre varios marcadores. Para el local, subir su tasa obliga a redistribuir parte de la probabilidad de cero y un gol hacia dos o más. Por eso mirar solo la celda de **1–0** puede esconder un cambio importante en la expectativa total. Un gráfico por escenario ayuda a distinguir el marcador individual más probable del grupo de marcadores en que gana cada equipo.

## Cómo comprobarlo sobre partidos reales

Conviene guardar el pronóstico con la fecha de cálculo y las tasas usadas. Luego se pueden agrupar los marcadores reales por competición y comparar el error en 0–0, 1–0, 0–1 y 1–1 frente al resto. Un patrón persistente en esos resultados bajos puede justificar probar un ajuste de dependencia. Una racha breve puede ser ruido y merece un corte de fechas aparte.

Las decisiones de muestreo deben publicarse junto a la evaluación. Si un proveedor aporta datos de 90 minutos, los goles de prórroga no deberían entrar en esa misma comparación. Si un partido se suspende o reprograma, cada captura debe corresponder a su inicio efectivo. La [guía de evaluación](/el-juego-en-datos/evaluar-pronosticos-futbol/) explica cómo seleccionar esas capturas.
