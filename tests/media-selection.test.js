import test from 'node:test';
import assert from 'node:assert/strict';
import { relevantAssets } from '../src/lib/media.js';
import { telegramCaption } from '../src/lib/youtube.js';

test('metadata establishes relevance and diversity; the search query alone never identifies a team', () => {
  const asset = (id, title, motive = 'training') => ({ id, source:'pexels',license:'Pexels License',page:'https://example.test/photo',photographer:'Author', url: `https://example.test/${id}.jpg`, query: 'Alpha FC football', title, motive, width: 1472, height: 2624 });
  const selected = relevantAssets([
    ...Array.from({ length: 12 }, (_, i) => asset(i, 'Alpha FC football training')),
    asset('away', 'Beta FC football training'), asset('fans', 'Alpha FC supporters', 'fans'),
    asset('context', 'Soccer football pitch', 'scene'), asset('wrong', 'Landscape mountain')
  ], { home: 'Alpha FC', away: 'Beta FC' });
  assert.ok(selected.slice(0, 4).some(a => a.id === 'away'));
  assert.ok(selected.slice(0, 4).some(a => a.id === 'fans'));
  assert.ok(!selected.some(a => a.id === 'context'));
  assert.ok(!selected.some(a => a.id === 'wrong'));
});

test('country names, ambiguous surnames and American football cannot fill a soccer pack',()=>{
  const assets=['Prague Czechia banknotes money','Spain city bus tour','Yamal winter snow family','American football quarterback training','Spain football team training'].map((title,id)=>({id:String(id),source:'pexels',license:'Pexels License',page:'https://example.test/photo',photographer:'Author',title,url:`https://example.test/${id}.jpg`,width:1440,height:1920}));
  assert.deepEqual(relevantAssets(assets,{home:'Spain',away:'Czechia',players:['Lamine Yamal']}).map(a=>a.id),['4']);
});

test('long credits use an attachment notice while preserving the generated-image disclosure', () => {
  const caption = telegramCaption({ title: 'Título', hook: 'Gancho', musicCredit: 'Música CC BY 4.0', attribution: `${'Autor CC BY 4.0\n'.repeat(120)}Imágenes generadas con IA — Agnes` });
  assert.ok(caption.length <= 1024);
  assert.match(caption, /Agnes/);
  assert.match(caption, /archivo adjunto/);
});

test('Openverse auto-tags and country locations cannot identify national-team photographs',()=>{
 const base={source:'openverse',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',photographer:'Author',page:'https://example.test/source',width:1472,height:2624};
 const assets=[['train','Virgin Trains billboard','england football training'],['handball','Jakov Gojun','croatia football handball training'],['nfl','DSC_0324','new england nfl football training'],['football','England national football team training','england football training']].map(([id,title,description])=>({...base,id,title,description,url:`https://example.test/${id}.jpg`}));
 assert.deepEqual(relevantAssets(assets,{home:'Croatia',away:'England'}).map(a=>a.id),['football']);
 const stock={...base,source:'pexels',license:'Pexels License',id:'stock',title:'',description:'Soccer players in a field in Croatia',url:'https://example.test/stock.jpg'};
 assert.equal(relevantAssets([stock],{home:'Croatia',away:'England'}).length,0);
});
