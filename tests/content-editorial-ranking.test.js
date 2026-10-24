import test from 'node:test';
import assert from 'node:assert/strict';
import { contentRanking } from '../src/lib/teams.js';
const now = Date.parse('2026-10-24T13:00:00Z');
const m = (id, home, away, day=24, extra={}) => ({ id, home, away, status:'NS', kickoff:`2026-10-${day}T20:00:00Z`, ...extra });
const ids = matches => contentRanking(matches,now).ranked.map(m=>m.id);
test('Barcelona and Madrid reserve their nearest match beyond tomorrow, once per team',()=>{
 assert.deepEqual(ids([m('early','Arsenal','Everton'),m('later-barca','Barcelona','Getafe',29),m('barca','FC Barcelona','Elche',28),m('madrid','Real Madrid CF','Osasuna',30)]),['barca','madrid','early']);
});
test('the next classic occupies one slot and later appearances cannot fill more slots',()=>{
 assert.deepEqual(ids([m('second','Barcelona','Elche',29),m('classic','Barcelona','Real Madrid',28),m('other','Chelsea','Fulham')]),['classic','other']);
});
test('Atletico outranks Arsenal and Bayern Dortmund outranks an ordinary Arsenal match',()=>{
 assert.deepEqual(ids([m('arsenal','Arsenal','Everton'),m('atleti','Club Atlético de Madrid','Deportivo'),m('derby','FC Bayern München','Borussia Dortmund')]),['derby','atleti','arsenal']);
});
test('finals outrank ordinary club matches; semi-finals are not misclassified as finals',()=>{
 assert.deepEqual(ids([m('chelsea','Chelsea','Everton'),m('semi','Unknown A','Unknown B',24,{round:'Semi-finals'}),m('final','Flamengo','Palmeiras',24,{round:'Final',competition:'libertadores'})]),['final','chelsea','semi']);
});
test('today/tomorrow precedes later fill, except mandatory Barcelona and Madrid',()=>{
 assert.deepEqual(ids([m('psg','Paris Saint-Germain','Lens',28),m('today','Valencia','Villarreal'),m('barca','Barcelona','Elche',30)]),['barca','today','psg']);
});
test('future NS, descriptive identity and unique nearest fixtures only',()=>{
 assert.deepEqual(ids([m('done','Barcelona','Elche',24,{status:'FT'}),m('past','Real Madrid','Getafe',23),m('fd-123','Arsenal','Everton'),m('live','Valencia','Villarreal'),m('repeat','Valencia','Osasuna',25)]),['live']);
});
test('nation hierarchy still applies when no editorial clubs play in the window',()=>{
 assert.deepEqual(ids([m('ab','Argentina','Brazil'),m('de','Germany','Austria'),m('es','Spain','Greece')]),['es','de','ab']);
});
