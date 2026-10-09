"""Transcript-grounded creative editing plans, with one repair and model failover."""
import argparse
import json
import math
import os
import re
import sys
import urllib.error
import time
import uuid
import hashlib
import socket
from pathlib import Path

from common import atomic_json, request_json

MOVES = {"push", "pull", "pan-left", "pan-right", "rise", "drift", "tilt", "hold", "cut-in"}
MOTION_KINDS = {'form', 'goals', 'clean-sheets', 'head-to-head', 'synthesis'}
TRANSITIONS = {"cut", "fade", "slide", "wipe", "iris", "focus", "defocus"}
EASES = {"none", "power1.inOut", "power2.inOut", "power3.out", "sine.inOut"}


def number(value, low, high, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f"{label} fuera de rango [{low},{high}]")
    return value


def validate(plan, source):
    span, assets, words = source["span"], source["assets"], source["words"]
    if not isinstance(plan, dict) or plan.get("version") not in (1, 2, 3, 4):
        raise ValueError("version debe ser 1, 2, 3 o 4")
    facts = {f['id']: f for f in source.get('facts', []) if isinstance(f, dict) and isinstance(f.get('id'), str)}
    scenes = plan.get("scenes")
    if not isinstance(scenes, list) or not 1 <= len(scenes) <= 64:
        raise ValueError("se requieren 1–64 escenas")
    cursor = 0
    photo_run = 0
    for scene in scenes:
        start = number(scene.get("start"), 0, span, "start")
        end = number(scene.get("end"), 0, span, "end")
        if abs(start - cursor) > 0.03 or end - start < 0.3:
            raise ValueError("escenas contiguas, de duración positiva")
        cursor = end
        if scene.get("transition", "fade") not in TRANSITIONS:
            raise ValueError("transición desconocida")
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", scene.get("accent", "#c5ed74")):
            raise ValueError("accent requiere un color hexadecimal")
        layers = scene.get("layers")
        if not isinstance(layers, list) or not 0 <= len(layers) <= 4:
            raise ValueError("cada escena admite 0–4 capas de fotos")
        if not layers and not scene.get('clips') and not scene.get('graphics') and not scene.get('objects'):
            raise ValueError("una escena sin fotos requiere gráficos u objetos")
        clip_layers = scene.get('clips', [])
        if not isinstance(clip_layers, list) or len(clip_layers)>2: raise ValueError('máximo dos clips por escena')
        for item in clip_layers:
            index = item.get('clip')
            source_clips = source.get('clips', [])
            if isinstance(index,bool) or not isinstance(index,int) or not 0<=index<len(source_clips): raise ValueError('clip inexistente')
            offset = number(item.get('offset',0),0,source_clips[index]['duration'],'clip.offset')
            duration = number(item.get('duration',end-start),.2,end-start,'clip.duration')
            if offset+duration>source_clips[index]['duration']+.02: raise ValueError('recorte de clip fuera de duración')
        photo_run = photo_run+1 if layers or clip_layers else 0
        if plan['version']>=2 and len(scenes)>2 and photo_run>2:
            raise ValueError('intercala una escena de motion graphics tras dos escenas de fotos')
        camera = scene.get('camera', {})
        for key, bounds in {'x': (-.03,.03), 'y': (-.03,.03), 'scale': (1,1.08)}.items():
            if key in camera: number(camera[key], *bounds, 'camera.'+key)
        for layer in layers:
            index = layer.get("asset")
            if isinstance(index, bool) or not isinstance(index, int) or not 0 <= index < len(assets):
                raise ValueError("asset inexistente")
            box = layer.get("box", {"x": 0, "y": 0, "w": 1, "h": 1})
            for key in ["x", "y", "w", "h"]:
                number(box.get(key), 0, 1, "box." + key)
            if box["w"] < .15 or box["h"] < .15 or box["x"] + box["w"] > 1.001 or box["y"] + box["h"] > 1.001:
                raise ValueError("box debe caber en el lienzo")
            if layer.get("move", "push") not in MOVES:
                raise ValueError("movimiento desconocido")
            if layer.get("ease", "sine.inOut") not in EASES:
                raise ValueError("ease desconocido")
            if layer.get('focusEffect', 'none') not in {'none','focus','defocus','pulse'}:
                raise ValueError('focusEffect desconocido')
            for state in ["from", "to"]:
                transform = layer.get(state, {})
                for key, bounds in {"x": (-.25, .25), "y": (-.25, .25), "scale": (1, 1.5), "rotation": (-5, 5)}.items():
                    if key in transform:
                        number(transform[key], *bounds, state + "." + key)
            focus = layer.get("focus", {"x": .5, "y": .5})
            number(focus.get("x"), 0, 1, "focus.x")
            number(focus.get("y"), 0, 1, "focus.y")
        graphics = scene.get("graphics", [])
        if not isinstance(graphics, list) or len(graphics) > 4:
            raise ValueError("máximo cuatro gráficos por escena")
        used_motion = set()
        last_motion_presentation = None
        for graphic in graphics:
            if graphic.get("kind") not in {"label", "stat", "bars", "ring", "line", "title"} | MOTION_KINDS:
                raise ValueError("gráfico desconocido")
            at = number(graphic.get("at"), start, end, "graphic.at")
            number(graphic.get("duration"), .2, end - at + .03, "graphic.duration")
            number(graphic.get("x", .07), 0, .8, "graphic.x")
            number(graphic.get("y", .13), 0, .65, "graphic.y")
            if graphic['kind'] in MOTION_KINDS:
                if plan['version'] != 4: raise ValueError('motion requiere plan version 4')
                motion_n = graphic.get('motionPromptNumber')
                if not isinstance(motion_n, int) or isinstance(motion_n, bool) or not 1 <= motion_n <= 30: raise ValueError('motionPromptNumber debe ser 1-30')
                prompt = next((p for p in source.get('motionPrompts', []) if p.get('n') == motion_n), None)
                if not prompt or prompt.get('kind') != graphic['kind']: raise ValueError('Motion Prompt inexistente o incompatible')
                refs = graphic.get('factIds', [])
                if not isinstance(refs, list) or len(refs) > 8 or any(not isinstance(r, str) or r not in facts or r not in prompt.get('factIds', []) for r in refs) or len(set(refs)) != len(refs):
                    raise ValueError('hecho ajeno al Motion Prompt')
                presentation = graphic.get('presentation','statistical')
                if presentation not in ('editorial','statistical'): raise ValueError('presentación de motion desconocida')
                if presentation == 'editorial' and refs: raise ValueError('motion editorial no admite cifras')
                if motion_n in used_motion and not graphic.get('reuseJustification'):
                    raise ValueError('Motion Prompt repetido sin reuseJustification')
                used_motion.add(motion_n)
                if last_motion_presentation == 'statistical' and presentation == 'statistical':
                    raise ValueError('no dos statistical consecutivos; alterna editorial/statistical')
                last_motion_presentation = presentation
                selected = [facts[r] for r in refs]
                for fact in selected:
                    number(fact.get('value'), 0, 1e6, 'motion.value')
                    if not fact.get('label') or not fact.get('unit') or not fact.get('source'): raise ValueError('hecho sin procedencia')
                if graphic['kind'] != 'synthesis' and len({f['unit'] for f in selected}) > 1: raise ValueError('unidades incompatibles')
                lo, hi = graphic.get('wordStart'), graphic.get('wordEnd')
                if any(isinstance(v, bool) or not isinstance(v, int) for v in (lo, hi)) or not 0 <= lo < hi <= len(words) or hi-lo > 10:
                    raise ValueError('motion requiere fragmento hablado de 1–10 palabras')
                if not start-.3 <= words[lo]['start'] <= end: raise ValueError('motion fuera de su fragmento hablado')
                graphic.pop('text', None); graphic.pop('value', None)
            if graphic["kind"] in {"label", "stat", "bars", "title"}:
                number(graphic.get("x", .07), 0, .35, "text graphic.x")
                number(graphic.get("y", .13), 0, .4, "text graphic.y")
                refs = graphic.get('factIds')
                if refs is not None:
                    if not isinstance(refs,list) or not 1 <= len(refs) <= 4 or any(not isinstance(r,str) or r not in facts for r in refs):
                        raise ValueError('referencia de hecho inexistente')
                    selected = [facts[r] for r in refs]
                    for fact in selected:
                        if not isinstance(fact.get('label'),str) or not fact.get('source'):
                            raise ValueError('hecho sin etiqueta o procedencia')
                        if graphic['kind']=='bars': number(fact.get('value'),0,1e6,'fact.value')
                    if graphic['kind']=='bars' and len({f.get('unit') for f in selected}) != 1:
                        raise ValueError('barras requieren unidades iguales')
                else:
                    lo, hi = graphic.get("wordStart"), graphic.get("wordEnd")
                    if any(isinstance(v, bool) or not isinstance(v, int) for v in [lo, hi]) or not 0 <= lo < hi <= len(words) or hi - lo > 10:
                        raise ValueError("gráfico requiere un fragmento de 1–10 palabras de la voz")
                    if not start - .3 <= words[lo]["start"] <= end:
                        raise ValueError("el gráfico debe aparecer durante su fragmento hablado")
                # The renderer derives text and bars from these exact words. No invented values.
                graphic.pop("text", None)
                graphic.pop("value", None)
        objects = scene.get('objects', [])
        if not isinstance(objects,list) or len(objects)>3:
            raise ValueError('máximo tres objetos 3D por escena')
        for obj in objects:
            if obj.get('kind') not in {'cube','card','prism'}: raise ValueError('objeto 3D desconocido')
            for key,bounds in {'x':(.08,.7),'y':(.08,.55),'size':(80,360),'rotateX':(-35,35),'rotateY':(-180,180),'spin':(-180,180)}.items():
                if key in obj: number(obj[key],*bounds,'object.'+key)
            if obj.get('wordStart') is not None:
                lo,hi=obj.get('wordStart'),obj.get('wordEnd')
                if any(isinstance(v,bool) or not isinstance(v,int) for v in (lo,hi)) or not 0<=lo<hi<=len(words) or hi-lo>6:
                    raise ValueError('título 3D requiere 1–6 palabras de la voz')
            obj.pop('text',None)
    if abs(cursor - span) > .03:
        raise ValueError("las escenas deben cubrir span completo")
    by_n = {p.get('n'): p for p in source.get('motionPrompts', []) if isinstance(p, dict)}
    sigs = {by_n[g.get('motionPromptNumber')].get('signature_move') for s in scenes for g in s.get('graphics', []) if g.get('kind') in MOTION_KINDS and isinstance(by_n.get(g.get('motionPromptNumber')), dict) and by_n[g.get('motionPromptNumber')].get('signature_move')}
    if len(sigs) > 2:
        raise ValueError('máximo 2 signature moves por video; alterna editorial/statistical en su lugar')
    return plan


def parse_json(content):
    content = re.sub(r"<think\b[^>]*>.*?</think>", "", content, flags=re.S)
    content = re.sub(r"```(?:json)?", "", content).strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        decoder = json.JSONDecoder()
        for match in re.finditer(r"\{", content):
            try:
                value, _ = decoder.raw_decode(content[match.start():])
                return value
            except json.JSONDecodeError:
                continue
    raise ValueError("respuesta JSON inválida")


def local_plan(source, reason="proveedores no disponibles", attempts=None):
    """Narration-grounded fallback with an independent scene/caption timeline."""
    if not source.get('words'):
        raise ValueError('se requiere transcripción antes del montaje')
    span, words, assets = source['span'], source['words'], source.get('assets', [])
    count = max(1, min(64, math.ceil(span/4)))
    scenes=[]
    for i in range(count):
        start, end = i*span/count, (i+1)*span/count
        indices=[j for j,w in enumerate(words) if start-.3 <= w['start'] < end-.2]
        graphics=[{'kind':'ring' if i%2 else 'line','at':start,'duration':end-start,'x':.15,'y':.3}]
        if indices:
            lo=indices[0]
            # Start on a substantive phrase instead of a dangling connective.
            weak={'y','o','pero','porque','que','de','del','el','la','los','las','un','una','en','a','al','con','es','se','su','sus'}
            while lo < indices[-1] and words[lo]['word'].lower().strip('.,:;¿?¡!') in weak: lo+=1
            hi=min(lo+6,indices[-1]+1)
            for j in range(lo,hi):
                if words[j]['word'].endswith(('.', '?', '!', ';')):
                    hi=j+1; break
            while hi>lo+1 and words[hi-1]['word'].lower().strip('.,:;¿?¡!') in weak: hi-=1
            graphics.append({'kind':'title','at':max(start,words[lo]['start']),
                             'duration':end-max(start,words[lo]['start']), 'wordStart':lo,'wordEnd':hi,'x':.07,'y':.13})
        layers=[]
        if assets and i%2==0:
            layers=[{'asset':(i//2+int(source.get('variant',0)))%len(assets),'move':'push' if i%4==0 else 'pan-left',
                     'focusEffect':'focus','from':{'scale':1},'to':{'scale':1.05}}]
        clip_layers=[]
        if source.get('clips') and i%3==1:
            clip_index=(i//3+int(source.get('variant',0)))%len(source['clips'])
            clip_layers=[{'clip':clip_index,'offset':0,'duration':min(end-start,source['clips'][clip_index]['duration'])}]
        scenes.append({'start':start,'end':end,'transition':['fade','focus','slide','wipe'][i%4],
                       'accent':'#c5ed74','layers':layers,'clips':clip_layers,'graphics':graphics,
                       'objects':[{'kind':['card','cube','prism'][i%3],'x':.7,'y':.53,'size':100,'rotateX':12,'rotateY':-20,'spin':35}] if not layers else []})
    if source.get('planVersion') == 4:
        patterns = {'form': r'racha|forma|victoria|derrota|empate', 'goals': r'goles?|anota|marc[oó]|recib',
                    'clean-sheets': r'arco|porter[ií]a|valla', 'head-to-head': r'cara a cara|cruces?|entre ellos|enfrentamientos?',
                    'synthesis': r'clave|balance|estad[ií]stic|resumen'}
        statistical = False
        used = set(source.get('usedMotionNumbers', []) or [])
        for i, scene in enumerate(scenes):
            indices = [j for j,w in enumerate(words) if scene['start'] <= w['start'] < scene['end']-.3]
            if not indices: continue
            text = ' '.join(words[j]['word'] for j in indices).lower()
            prompt = next((p for kind in ('clean-sheets','head-to-head','goals','form','synthesis') for p in source.get('motionPrompts', []) if p.get('n') not in used and p.get('kind') == kind and re.search(patterns[kind], text)), None)
            if not prompt:
                prompt = next((p for kind in ('clean-sheets','head-to-head','goals','form','synthesis') for p in source.get('motionPrompts', []) if p.get('kind') == kind and re.search(patterns[kind], text)), None)
            matched = bool(prompt)
            if not prompt and i % 3 == 0:
                prompt = next((p for p in source.get('motionPrompts',[]) if p.get('n') not in used and p.get('kind') == ('head-to-head' if i == 0 else 'synthesis')),None)
            if not prompt and i % 3 == 0:
                prompt = next((p for p in source.get('motionPrompts',[]) if p.get('kind') == ('head-to-head' if i == 0 else 'synthesis')),None)
            if not prompt: continue
            used.add(prompt['n'])
            refs = [r for r in prompt.get('factIds',[]) if not r.endswith('.n') and r in {f['id'] for f in source.get('facts',[])}][:8]
            presentation = 'statistical' if matched and refs and not statistical else 'editorial'
            statistical = presentation == 'statistical'
            graphic={'kind':prompt['kind'],'motionPromptNumber':prompt['n'],'presentation':presentation,
                     'factIds':refs if statistical else [],'wordStart':indices[0],'wordEnd':min(indices[0]+10,indices[-1]+1),
                     'at':scene['start'],'duration':scene['end']-scene['start']}
            scene.update(objects=[],graphics=[graphic])
            if statistical: scene.update(layers=[],clips=[])
    version = 4 if source.get('planVersion') == 4 else 3 if source.get('clips') else 2
    return {**validate({'version':version,'scenes':scenes},source),'model':'local-montage','fallback':True,
            'fallbackReason':reason,'attempts':attempts or []}


def create_plan(source, call=request_json, env=None, clock=time.monotonic, logger=None):
    env = os.environ if env is None else env
    if not source.get("words"):
        raise ValueError("se requiere transcripción antes del montaje")
    guide = (Path(__file__).resolve().parents[1] / "references/creative.md").read_text()
    models = list(dict.fromkeys([
        env.get("OPENCODE_GO_MODEL", "deepseek-v4.1-flash"),
        env.get("OPENCODE_GO_FALLBACK_MODEL", "mimo-v2.6-flash"),
    ]))
    if not env.get("OPENCODE_GO_API_KEY"):
        return local_plan(source, "configuración del proveedor no disponible")
    url = env.get("OPENCODE_GO_BASE_URL", "https://opencode.ai/zen/go/v1").rstrip("/") + "/chat/completions"
    errors, attempts = [], []
    started = clock()
    # No Telegram identifiers or credentials enter provider routing headers.
    identity = source.get('requestId') or hashlib.sha256(json.dumps(source,sort_keys=True).encode()).hexdigest()
    session = str(uuid.uuid5(uuid.NAMESPACE_URL, 'goatlab:edit:'+str(identity)))
    per_call = max(1,min(90,int(env.get('EDIT_PLAN_TIMEOUT_SECONDS','90'))))
    budget = 240
    def note(model, status, at, http=None):
        item={'model':model,'stage':'planning','status':status,'durationMs':round((clock()-at)*1000),'httpStatus':http}
        attempts.append(item)
        if logger: logger(item)
    for index, model in enumerate(models):
        messages = [{"role": "system", "content": guide}, {"role": "user", "content": json.dumps(source, ensure_ascii=False)}]
        for attempt in range(2):
            remaining = budget - (clock()-started) - (60 if index==0 and len(models)>1 else 0)
            if remaining <= 0:
                errors.append(f'{model}: presupuesto de planificación agotado'); break
            content = ''
            at = clock()
            try:
                result = call(url, {"model": model, "messages": messages, "max_tokens": 14000},
                              {"Authorization": "Bearer " + env["OPENCODE_GO_API_KEY"],
                               'User-Agent':'GoatLab/2.0', 'x-opencode-session':session},
                              timeout=min(per_call,remaining))
                choice = result["choices"][0]
                if choice.get("finish_reason") == "length":
                    raise ValueError("plan truncado")
                content = choice["message"].get("content") or ""
                plan = validate(parse_json(content), source)
                note(model,'ok',at,200)
                return {**plan, "model": model, 'attempts':attempts}
            except ValueError as error:
                note(model,'validation',at,200)
                errors.append(f"{model}: {error}")
                messages.append({"role": "assistant", "content": content or "{}"})
                messages.append({"role": "user", "content": f"Corrige el JSON completo. Error de validación: {error}"})
                if attempt:
                    break
            except urllib.error.HTTPError as error:
                status=error.code; error.close()
                kind='configuración' if status in (400,401,403,404,422) else 'transporte'
                errors.append(f'{model}: {kind} HTTP {status}')
                note(model,kind,at,status)
                break
            except (TimeoutError,socket.timeout,urllib.error.URLError):
                errors.append(f'{model}: timeout o red')
                note(model,'transport',at)
                break
            except Exception:
                errors.append(f"{model}: respuesta del proveedor inválida")
                note(model,'response',at)
                break
    return local_plan(source, "; ".join(errors), attempts)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    try:
        atomic_json(args.out, create_plan(json.loads(Path(args.input).read_text()),
                    logger=lambda item: print('planner: '+json.dumps(item),file=sys.stderr)))
    except Exception as error:
        print(str(error) if isinstance(error, ValueError) else type(error).__name__, file=sys.stderr)
        sys.exit(1)
