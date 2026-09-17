/**
 * Diccionario del relato: del JSON al lector.
 * Regla única: término cotidiano primero; la sigla del dato, entre paréntesis
 * solo la primera vez que aparece en un capítulo. Las claves crudas
 * (`1X2`, `BTTS`, `DNB`, `H2H`, `HT/FT`) no se imprimen jamás en la vista.
 * Semilla canónica: API-RESEARCH.md §6. `llmReview` es control interno:
 * vive en el JSON y nunca se muestra.
 */
export const STORY_TERMS = {
  oneX2: { term: 'Resultado final', hint: 'Quién gana el partido o si empatan.' },
  doubleChance: { term: 'Doble oportunidad', hint: 'Cubrir dos de los tres resultados posibles.' },
  dnb: { term: 'Gana sin contar el empate', hint: 'Quién gana si el empate no contara.' },
  overUnder: { term: 'Total de goles', hint: 'Si el partido pasa o no de 1.5, 2.5 o 3.5 goles.' },
  btts: { term: 'Marcan los dos', hint: 'Si anotan ambos equipos o al menos uno se queda en cero.' },
  exactScore: { term: 'Marcadores más probables', hint: 'Los resultados exactos que más se repiten en el cálculo.' },
  cleanSheet: { term: 'Arco en cero', hint: 'Que un equipo termine el partido sin recibir goles.' },
  firstGoal: { term: 'El primer gol', hint: 'En qué tramo de 15 minutos cae el primer gol.' },
  noGoal: { term: 'Se queda en cero', hint: 'Que el partido termine sin goles.' },
  anytime: { term: 'Marca en cualquier momento', hint: 'Probabilidad de que anote durante el partido.' },
  firstScorer: { term: 'Abre el marcador', hint: 'Probabilidad de que haga el primer gol del partido.' },
  share: { term: 'Peso en el equipo', hint: 'Qué parte de los goles del equipo lleva ese jugador.' },
  lambdas: { term: 'Lo que espera el cálculo', hint: 'Goles promedio que el modelo prevé para cada equipo.' },
  sample: { term: 'Partidos analizados', hint: 'Tamaño de la muestra con la que se hizo el cálculo.' },
  standings: { term: 'Puesto en la tabla', hint: 'Posición actual del equipo en su liga.' },
  predicted: { term: 'Favorito del proveedor', hint: 'A quién ve mejor el modelo externo (Bzzoiro).' },
  confidence: { term: 'Confianza del modelo', hint: 'Qué tan seguro está el proveedor de su lectura.' },
  xg: { term: 'Goles esperados (xG)', hint: 'Calidad de las ocasiones creadas, según el proveedor.' },
  corners: { term: 'Más de 9.5 córners', hint: 'Total de tiros de esquina del partido.' },
  discipline: { term: 'Tarjetas y faltas', hint: 'Amarillas, rojas y faltas cometidas por equipo.' },
  form: { term: 'Cómo llegan', hint: 'Goles y resultados reales de los últimos partidos.' },
  forecast: { term: 'Lo que pronostica el cálculo', hint: 'Valores esperados para cada cifra del partido, con la muestra declarada.' },
  dominance: { term: 'Frente a frente', hint: 'Comparativa directa de los ritmos esperados de cada equipo.' },
  cornersDuel: { term: 'Quién saca más córners', hint: 'Probabilidad de que cada equipo lance más tiros de esquina o empaten.' },
  cardsDuel: { term: 'Quién ve más tarjetas', hint: 'Probabilidad de que cada equipo reciba más amarillas o empaten.' },
  lastGoalTeam: { term: 'Quién cierra el marcador', hint: 'Probabilidad de que el último gol lo haga cada equipo o no haya goles.' },
  cornerRace: { term: 'Quién llega primero', hint: 'Probabilidad de alcanzar antes 3, 5 o 7 tiros de esquina.' },
  cornerMargin: { term: 'Por cuántos córners', hint: 'Diferencia esperada de tiros de esquina entre los dos equipos.' },
  verdict: { term: 'El veredicto', hint: 'La lectura combinada de GoatLab, con cada insumo y su peso a la vista.' },
};
/** Devuelve { term, hint } para una clave; si no existe, la deja legible sin inventar. */
export function storyTerm(key) {
  return STORY_TERMS[key] ?? { term: String(key), hint: '' };
}
