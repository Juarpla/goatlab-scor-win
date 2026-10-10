"""Executable v5 contract shared by model and deterministic fallback."""
import json
import math
import re
from pathlib import Path
CATALOG = json.loads((Path(__file__).resolve().parents[1]/'references/cinema-catalog.json').read_text())

def validate(plan, source):
    if plan.get('version') != 5: raise ValueError('version debe ser 5')
    scenes = plan.get('scenes')
    if not isinstance(scenes,list) or not 1 <= len(scenes) <= 64: raise ValueError('escenas inválidas')
    cursor, distinctive = 0, 0
    facts = {f['id']:f for f in source.get('facts',[]) if isinstance(f,dict) and isinstance(f.get('id'),str)}
    words = source['words']
    for scene in scenes:
        allowed={'start','end','composition','variant','wordStart','wordEnd','factIds','camera','reveal','transition','emphasis','distinctive','asset','clip'}
        if set(scene)-allowed: raise ValueError('parámetro de escena no soportado: '+','.join(sorted(set(scene)-allowed)))
        start,end = scene.get('start'),scene.get('end')
        if any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) for v in (start,end)) or abs(start-cursor)>.03 or end-start<.3 or end>source['span']+.03: raise ValueError('timeline inválida')
        cursor=end
        family,variant=scene.get('composition'),scene.get('variant')
        if family not in CATALOG['families'] or variant not in CATALOG['families'][family]: raise ValueError('composición/variante inválida')
        for key, default in [('camera','hold'),('reveal','fade'),('transition','fade'),('emphasis','none'),('distinctive','none')]:
            allowed=CATALOG['transitions'] if key=='transition' else CATALOG[key]
            if scene.get(key,default) not in allowed: raise ValueError('parámetro no soportado: '+key)
        if scene.get('distinctive')=='duel' and family not in ('encounter','comparison'): raise ValueError('duel requiere encuentro o comparación')
        distinctive += scene.get('distinctive','none') != 'none'
        lo,hi=scene.get('wordStart'),scene.get('wordEnd')
        if any(isinstance(v,bool) or not isinstance(v,int) for v in (lo,hi)) or not 0<=lo<hi<=len(words) or hi-lo>16: raise ValueError(f'fragmento inválido: [{lo},{hi}) de {len(words)} palabras; máximo 16')
        if not start-.3<=words[lo]['start']<end: raise ValueError('fragmento fuera de escena')
        refs=scene.get('factIds',[])
        if not isinstance(refs,list) or len(refs)>4 or len(set(refs))!=len(refs) or any(r not in facts for r in refs): raise ValueError('hecho inexistente')
        for r in refs:
            f=facts[r]
            if not f.get('source') or not f.get('unit') or not isinstance(f.get('value'),(int,float)) or isinstance(f['value'],bool) or not math.isfinite(f['value']) or f['value']<0: raise ValueError('hecho inválido')
        if family=='comparison' and (len(refs)<2 or len({facts[r]['unit'] for r in refs})!=1): raise ValueError('comparación requiere unidades iguales')
        if family=='primary-stat' and len(refs)!=1: raise ValueError('dato principal requiere un hecho')
        if family not in ('primary-stat','comparison') and refs: raise ValueError('hechos requieren composición de datos')
        for key,items in [('asset',source.get('assets',[])),('clip',source.get('clips',[]))]:
            value=scene.get(key)
            if value is not None and (isinstance(value,bool) or not isinstance(value,int) or not 0<=value<len(items)): raise ValueError('recurso inexistente')
        if family=='protagonist' and scene.get('asset') is None and scene.get('clip') is None: raise ValueError('protagonista requiere recurso')
        if scene.get('clip') is not None and source['clips'][scene['clip']]['duration']<end-start: raise ValueError('clip demasiado corto')
    if abs(cursor-source['span'])>.03: raise ValueError('timeline incompleta')
    if distinctive>2: raise ValueError('máximo dos movimientos distintivos ejecutados')
    return plan

def local_plan(source):
    words,span=source['words'],source['span']
    count=max(1,min(len(words),math.ceil(span/4)))
    scenes=[]
    for i in range(count):
        start,end=i*span/count,(i+1)*span/count
        candidates=[j for j,w in enumerate(words) if start-.3<=w['start']<end]
        if not candidates:
            if scenes: scenes[-1]['end']=end; continue
            candidates=[0]
        lo=candidates[0]; hi=min(lo+10,candidates[-1]+1)
        weak={'y','o','pero','porque','que','de','del','el','la','los','las','un','una','en','a','al','con','es','se','su','sus'}
        while lo<hi-1 and words[lo]['word'].lower().strip('.,:;¿?¡!') in weak: lo+=1
        for j in range(lo,hi):
            if words[j]['word'].endswith(('.', '?', '!', ';')): hi=j+1; break
        while hi>lo+1 and words[hi-1]['word'].lower().strip('.,:;¿?¡!') in weak: hi-=1
        family='encounter' if not scenes else 'resolution' if i==count-1 else 'editorial'
        scene={'start':start,'end':end,'composition':family,'variant':CATALOG['families'][family][(i+int(source.get('variant',0)))%2], 'wordStart':lo,'wordEnd':hi,'factIds':[], 'camera':'hold','reveal':'stagger' if i%2 else 'fade','transition':'fade','emphasis':'underline' if i%2 else 'none','distinctive':'none'}
        if i%2 and i<count-1 and source.get('assets'):
            scene.update(composition='protagonist',variant=CATALOG['families']['protagonist'][(i//2+int(source.get('variant',0)))%2],asset=(i+int(source.get('variant',0)))%len(source['assets']),camera='push')
        text=' '.join(words[j]['word'] for j in range(max(0,lo-2),min(len(words),hi+2))).lower()
        topics=[(r'goles a favor|goles anotados|anotaron', 'gf'),(r'victorias|ganados|ganaron (?:[0-9]|dos|tres|cuatro)', 'wins'),(r'porter[ií]as a cero|arcos en cero', 'clean'),(r'goles recibidos|goles en contra', 'ga')]
        ids={f['id'] for f in source.get('facts',[]) if isinstance(f,dict) and 'id' in f}
        if i%2==0 and i and i<count-1:
            key=next((key for pattern,key in topics if re.search(pattern,text)),None)
            refs=[side+'.'+key for side in ('home','away') if key and side+'.'+key in ids]
            if refs:
                family='comparison' if len(refs)>1 else 'primary-stat'
                scene.update(composition=family,variant=CATALOG['families'][family][i%2],factIds=refs)
        candidates=CATALOG['families'][scene['composition']]
        unused=[v for v in candidates if scene['composition']+'/'+v not in source.get('usedVariants',[])]
        if unused: scene['variant']=unused[(i+int(source.get('variant',0)))%len(unused)]
        scenes.append(scene)
    if len(scenes)>1:
        scenes[-1].update(composition='resolution',variant=CATALOG['families']['resolution'][int(source.get('variant',0))%2],factIds=[])
        scenes[-1].pop('asset',None);scenes[-1].pop('clip',None)
    return validate({'version':5,'libraryVersion':CATALOG['version'],'scenes':scenes},source)
