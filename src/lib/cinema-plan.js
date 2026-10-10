import catalog from './cinema-catalog.json' with {type:'json'};
export {catalog};
export function validateCinema(plan,{span,words,photos=[],clips=[],facts=[]}) {
  if(plan.version!==5||!Array.isArray(plan.scenes)||!plan.scenes.length||plan.scenes.length>64) throw new Error('plan cinematográfico inválido');
  let cursor=0,moves=0;
  for(const s of plan.scenes) {
    const allowed=['start','end','composition','variant','wordStart','wordEnd','factIds','camera','reveal','transition','emphasis','distinctive','asset','clip'];
    if(Object.keys(s).some(k=>!allowed.includes(k))) throw new Error('parámetro de escena no soportado');
    if(!Number.isFinite(s.start)||!Number.isFinite(s.end)||Math.abs(s.start-cursor)>.03||s.end-s.start<.3||s.end>span+.03) throw new Error('timeline inválida');
    cursor=s.end;
    if(!catalog.families[s.composition]?.includes(s.variant)) throw new Error('composición/variante inválida');
    for(const [k,def] of [['camera','hold'],['reveal','fade'],['transition','fade'],['emphasis','none'],['distinctive','none']]) if(!(k==='transition'?catalog.transitions:catalog[k]).includes(s[k]??def)) throw new Error('parámetro no soportado');
    if(s.distinctive==='duel'&&!['encounter','comparison'].includes(s.composition)) throw new Error('duel requiere encuentro o comparación');
    if(s.distinctive&&s.distinctive!=='none') moves++;
    if(!Number.isInteger(s.wordStart)||!Number.isInteger(s.wordEnd)||s.wordStart<0||s.wordEnd<=s.wordStart||s.wordEnd>words.length||s.wordEnd-s.wordStart>catalog.constraints.maxPhraseWords||words[s.wordStart].start<s.start-.3||words[s.wordStart].start>=s.end) throw new Error('fragmento inválido');
    const refs=s.factIds??[];
    if(!Array.isArray(refs)||refs.length>4||new Set(refs).size!==refs.length) throw new Error('referencias inválidas');
    const selected=refs.map(id=>facts.find(f=>f.id===id));
    if(selected.some(f=>!f||!Number.isFinite(f.value)||f.value<0||!f.unit||!f.source)) throw new Error('hecho inválido');
    if(s.composition==='primary-stat'&&refs.length!==1) throw new Error('dato principal requiere un hecho');
    if(s.composition==='comparison'&&(refs.length<2||new Set(selected.map(f=>f.unit)).size!==1)) throw new Error('unidades incompatibles');
    if(!['primary-stat','comparison'].includes(s.composition)&&refs.length) throw new Error('hecho fuera de composición de datos');
    for(const [key,items] of [['asset',photos],['clip',clips]]) if(s[key]!=null&&(!Number.isInteger(s[key])||s[key]<0||!items[s[key]])) throw new Error('recurso inexistente');
    if(s.composition==='protagonist'&&s.asset==null&&s.clip==null) throw new Error('protagonista requiere recurso');
    if(s.clip!=null&&clips[s.clip].duration<s.end-s.start) throw new Error('clip demasiado corto');
  }
  if(Math.abs(cursor-span)>.03||moves>2) throw new Error('timeline incompleta o movimientos excesivos');
  return plan;
}
