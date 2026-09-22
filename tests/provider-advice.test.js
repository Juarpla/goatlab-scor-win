import test from 'node:test';
import assert from 'node:assert/strict';
import { favoriteName, neutralGoals, adviceToNeutral, buildProviderAdvice } from '../src/lib/provider-advice.js';

test('favoriteName resuelve lados, nombres y empate sin inventar', () => {
  assert.equal(favoriteName('home', 'Andorra', 'Malta'), 'Andorra');
  assert.equal(favoriteName('A', 'Andorra', 'Malta'), 'Malta');
  assert.equal(favoriteName('away', 'Andorra', 'Malta'), 'Malta');
  assert.equal(favoriteName('draw', 'Andorra', 'Malta'), 'el empate');
  assert.equal(favoriteName('Malta', 'Andorra', 'Malta'), 'Malta');
  assert.equal(favoriteName('nadie', 'Andorra', 'Malta'), null);
  assert.equal(favoriteName(null, 'Andorra', 'Malta'), null);
});

test('neutralGoals traduce líneas over/under sin jerga', () => {
  assert.equal(neutralGoals('-3.5'), 'menos de 4 goles');
  assert.equal(neutralGoals('+1.5'), '2 o más goles');
  assert.equal(neutralGoals('-0.5'), 'menos de 1 gol');
  assert.equal(neutralGoals('??'), null);
  assert.equal(neutralGoals(null), null);
});

test('adviceToNeutral reformula el advice AF en español neutro', () => {
  assert.equal(
    adviceToNeutral('Combo Double chance : draw or Aston Villa and -3.5 goals'),
    'Aston Villa sin perder y menos de 4 goles',
  );
  assert.equal(
    adviceToNeutral('Combo Winner : Barcelona and +1.5 goals'),
    'gana Barcelona y 2 o más goles',
  );
  assert.equal(adviceToNeutral('Double chance : draw or Chelsea'), 'Chelsea sin perder');
  // Ejemplo del usuario: sin prefijo de mercado y con "draws" en plural.
  assert.equal(
    adviceToNeutral('Deportivo Santani or draws and -3.5 goals'),
    'Deportivo Santani sin perder y menos de 4 goles',
  );
  // Lo irreconocible se omite, nunca se imprime jerga en crudo.
  assert.equal(adviceToNeutral('Bet X now!'), null);
  assert.equal(adviceToNeutral(null), null);
});

test('buildProviderAdvice combina Bzzoiro + AF y es null-honesto', () => {
  const advice = buildProviderAdvice({
    provider: { score: '1-1', over25: 0.528, btts: 0.517, recommendations: { favorite: 'A', favoriteProb: 0.391, over25: false, btts: false } },
    afPrediction: { advice: 'Double chance : draw or Chelsea' },
    home: 'Andorra',
    away: 'Malta',
  });
  assert.deepEqual(advice.bz.map(line => line.text), [
    'Malta (39%)', '53% que haya 3 o más goles, según el modelo', '52% que sí, según el modelo',
  ]);
  assert.deepEqual(advice.af.map(line => line.text), ['Chelsea sin perder']);
  assert.equal(buildProviderAdvice({ provider: null, afPrediction: null }), null);
  // Sin recommendations pero con advice, el fallback sigue emitiendo.
  const onlyAf = buildProviderAdvice({ afPrediction: { advice: 'Double chance : Leeds or draw' } });
  assert.equal(onlyAf.bz.length, 0);
  assert.deepEqual(onlyAf.af.map(line => line.text), ['Leeds sin perder']);
});

test('buildProviderAdvice usa el booleano solo sin probabilidad', () => {
  const fallback = buildProviderAdvice({
    provider: { score: '2-0', recommendations: { favorite: 'home', over25: false, btts: false } },
    home: 'Andorra',
    away: 'Malta',
  });
  assert.deepEqual(fallback.bz.map(line => line.text), [
    'Andorra', 'El modelo espera menos de 3 goles', 'No, según el modelo',
  ]);
  // La probabilidad emite aun sin recommendations.
  const onlyProb = buildProviderAdvice({ provider: { over25: 0.6, btts: 0.4 } });
  assert.deepEqual(onlyProb.bz.map(line => line.text), [
    '60% que haya 3 o más goles, según el modelo', '40% que sí, según el modelo',
  ]);
});
