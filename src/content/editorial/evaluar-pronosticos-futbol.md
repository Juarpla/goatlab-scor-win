---
title: Cómo saber si un pronóstico de fútbol aporta valor
description: Qué mide la puntuación de Brier, cómo se evita la fuga temporal y por qué acertar el favorito cuenta solo parte de la historia.
category: El juego y sus números
date: 2026-11-14
order: 9
sources:
  - name: Glenn W. Brier · Artículo original en Monthly Weather Review
    url: https://doi.org/10.1175/1520-0493(1950)078%3C0001:VOFEIT%3E2.0.CO;2
  - name: GoatLab · Diseño de evaluación y sus límites
    url: https://goatlab.win/metodologia/#datos-historicos
---

Un pronóstico que da 51% a la victoria local y otro que da 90% pueden acertar el mismo favorito. Si el local pierde, la segunda estimación se equivocó con mucha más seguridad. Contar únicamente los aciertos del favorito les da el mismo resultado. La puntuación de Brier mide la diferencia entre lo que el modelo anticipó y lo que sucedió.

## Un empate, dos modelos

Escribamos local, empate y visitante en ese orden. Si el partido empata, los valores observados son 0, 1, 0. Con la suma de cuadrados que usa GoatLab para esta comparación, una previsión de 0,60 / 0,25 / 0,15 obtiene **0,945**. Otra de 0,45 / 0,35 / 0,20 obtiene **0,665**. El valor más bajo indica menor error. También importa la escala, porque algunas implementaciones dividen la suma por el número de categorías.

## La prueba empieza antes del saque

Guarda el pronóstico, la hora efectiva de cálculo y el inicio del encuentro. Evalúa únicamente capturas fechadas antes del saque. Si el partido se reprograma y cambia de contexto, vincula cada captura al horario y a la versión de datos correspondientes. Une después el marcador oficial y conserva los partidos ausentes en el recuento de cobertura.

En el primer corte que aplicó este requisito, GoatLab encontró 337 registros de encuentros en su archivo de capturas y ninguno contaba con una marca de cálculo verificable bajo la nueva regla. La evaluación de la serie empezará con las capturas que registren la hora efectiva de cálculo y cuenten con marcador final.

Para que la mejora sea interpretable, compara en la misma muestra con una referencia, por ejemplo las frecuencias históricas de local, empate y visitante que estaban disponibles en cada corte. Mide además calibración por intervalos. Si la categoría que recibe alrededor de 60% ocurre mucho menos que seis veces de cada diez en una muestra amplia, hay indicios de exceso de confianza. Para una competición con pocos casos, conviene mostrar el tamaño de la muestra antes de sacar una conclusión.
