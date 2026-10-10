"""Fresh multimodal review, bounded by an explicit call budget."""
import json
import uuid
import os
from pathlib import Path
from common import atomic_json, request_json, bounded_call
from model_routes import routes
from planner import parse_json

def review(source, env=None, call=request_json):
    env=os.environ if env is None else env
    attempts=[]
    limit=1 if source.get('recheck') else 3
    candidates=routes(env,'GOATLAB_VISION_MODELS')
    if source.get('preferredModel'): candidates.sort(key=lambda route:route['id']!=source['preferredModel'])
    for route in candidates[:limit]:
        if not route['key']:
            attempts.append({'model':route['id'],'status':'unconfigured'}); continue
        try:
            content=[{'type':'text','text':'''Revisa legibilidad, encuadre, zonas seguras y coherencia con el contexto. Son seis fotogramas aislados a 540x960 (la mitad del render), no un video con audio: no puedes diagnosticar retraso de voz, ritmo temporal ni continuidad sonora. Los subtítulos amarillos muestran deliberadamente fragmentos breves de lo hablado; no tienen que coincidir con el titular editorial. Fade y stagger pueden aparecer parcialmente revelados. Clasifica como severe solo texto realmente cortado/ilegible, solapamiento que impida leer, cifras que contradigan hechos referenciados o nombres propios incorrectos. El espacio vacío, repetición de una frase entre titular/subtítulos y preferencias estéticas son minor. Si no hay evidencia concreta de defecto, ok. Devuelve JSON {severity:"ok"|"minor"|"severe",issues:[string],repair:{fontScale:0.8..1,captionBottom:480..600}}. Cada defecto debe identificar su fotograma. repair solo corrige subtítulos y debe ser {} cuando el problema es del titular, datos o transcripción. Contexto: '''+json.dumps(source.get('context',{}),ensure_ascii=False)}]
            content += [{'type':'image_url','image_url':{'url':frame}} for frame in source['frames'][:6]]
            result=bounded_call(call, route['url'],{'model':route['model'],'messages':[{'role':'user','content':content}],'max_tokens':2000,**({'thinking':{'type':'disabled'}} if route['id'].startswith('opencode-go/') else {})},{'Authorization':'Bearer '+route['key'],'User-Agent':'GoatLab/2.0','x-opencode-session':str(uuid.uuid4())},timeout=60)
            answer=parse_json(result['choices'][0]['message']['content'])
            if answer.get('severity') not in ('ok','minor','severe') or not isinstance(answer.get('issues'),list) or any(not isinstance(i,str) for i in answer['issues']): raise ValueError('respuesta inválida')
            repair=answer.get('repair',{})
            if not isinstance(repair,dict) or set(repair)-{'fontScale','captionBottom'}: raise ValueError('reparación no soportada')
            for key,lo,hi in [('fontScale',.8,1),('captionBottom',480,600)]:
                if key in repair and (isinstance(repair[key],bool) or not isinstance(repair[key],(int,float)) or not lo<=repair[key]<=hi): raise ValueError('reparación fuera de rango')
            attempts.append({'model':route['id'],'status':'ok'})
            return {**answer,'model':route['id'],'attempts':attempts}
        except Exception as error:
            attempts.append({'model':route['id'],'status':'unavailable','reason':type(error).__name__})
    return {'severity':'unavailable','issues':['visión no disponible'],'repair':{},'attempts':attempts}
if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(); parser.add_argument('--input'); parser.add_argument('--out'); args=parser.parse_args()
    atomic_json(args.out,review(json.loads(Path(args.input).read_text())))
