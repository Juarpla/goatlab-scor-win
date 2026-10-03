"""Transcript-grounded creative editing plans, with one repair and model failover."""
import argparse
import json
import math
import os
import re
import sys
import urllib.error
from pathlib import Path

from common import atomic_json, request_json

MOVES = {"push", "pull", "pan-left", "pan-right", "rise", "drift", "tilt", "hold", "cut-in"}
TRANSITIONS = {"cut", "fade", "slide", "wipe", "iris"}
EASES = {"none", "power1.inOut", "power2.inOut", "power3.out", "sine.inOut"}


def number(value, low, high, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f"{label} fuera de rango [{low},{high}]")
    return value


def validate(plan, source):
    span, assets, words = source["span"], source["assets"], source["words"]
    if not isinstance(plan, dict) or plan.get("version") != 1:
        raise ValueError("version debe ser 1")
    scenes = plan.get("scenes")
    if not isinstance(scenes, list) or not 1 <= len(scenes) <= 64:
        raise ValueError("se requieren 1–64 escenas")
    cursor = 0
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
        if not isinstance(layers, list) or not 1 <= len(layers) <= 4:
            raise ValueError("cada escena requiere 1–4 capas de fotos")
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
        for graphic in graphics:
            if graphic.get("kind") not in {"label", "stat", "bars", "ring", "line"}:
                raise ValueError("gráfico desconocido")
            at = number(graphic.get("at"), start, end, "graphic.at")
            number(graphic.get("duration"), .2, end - at + .03, "graphic.duration")
            number(graphic.get("x", .07), 0, .8, "graphic.x")
            number(graphic.get("y", .13), 0, .65, "graphic.y")
            if graphic["kind"] in {"label", "stat", "bars"}:
                number(graphic.get("x", .07), 0, .35, "text graphic.x")
                number(graphic.get("y", .13), 0, .4, "text graphic.y")
                lo, hi = graphic.get("wordStart"), graphic.get("wordEnd")
                if any(isinstance(v, bool) or not isinstance(v, int) for v in [lo, hi]) or not 0 <= lo < hi <= len(words) or hi - lo > 10:
                    raise ValueError("gráfico requiere un fragmento de 1–10 palabras de la voz")
                if not start - .3 <= words[lo]["start"] <= end:
                    raise ValueError("el gráfico debe aparecer durante su fragmento hablado")
                # The renderer derives text and bars from these exact words. No invented values.
                graphic.pop("text", None)
                graphic.pop("value", None)
    if abs(cursor - span) > .03:
        raise ValueError("las escenas deben cubrir span completo")
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


def create_plan(source, call=request_json, env=None):
    env = os.environ if env is None else env
    if not source.get("words"):
        raise ValueError("se requiere transcripción antes del montaje")
    guide = (Path(__file__).resolve().parents[1] / "references/creative.md").read_text()
    models = list(dict.fromkeys([
        env.get("OPENCODE_GO_MODEL", "deepseek-v4.1-flash"),
        env.get("OPENCODE_GO_FALLBACK_MODEL", "mimo-v2.6-flash"),
    ]))
    if not env.get("OPENCODE_GO_API_KEY"):
        raise ValueError("falta OPENCODE_GO_API_KEY para planificar el montaje")
    url = env.get("OPENCODE_GO_BASE_URL", "https://opencode.ai/zen/go/v1").rstrip("/") + "/chat/completions"
    errors = []
    for model in models:
        messages = [{"role": "system", "content": guide}, {"role": "user", "content": json.dumps(source, ensure_ascii=False)}]
        for attempt in range(2):
            try:
                result = call(url, {"model": model, "messages": messages, "max_tokens": 14000},
                              {"Authorization": "Bearer " + env["OPENCODE_GO_API_KEY"]},
                              timeout=int(env.get("EDIT_PLAN_TIMEOUT_SECONDS", "120")))
                choice = result["choices"][0]
                if choice.get("finish_reason") == "length":
                    raise ValueError("plan truncado")
                content = choice["message"].get("content") or ""
                plan = validate(parse_json(content), source)
                return {**plan, "model": model}
            except ValueError as error:
                errors.append(f"{model}: {error}")
                messages.append({"role": "assistant", "content": content if 'content' in locals() else "{}"})
                messages.append({"role": "user", "content": f"Corrige el JSON completo. Error de validación: {error}"})
                if attempt:
                    break
            except Exception:
                errors.append(f"{model}: proveedor no disponible")
                break
    raise ValueError("No se pudo validar el montaje: " + "; ".join(errors))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    try:
        atomic_json(args.out, create_plan(json.loads(Path(args.input).read_text())))
    except Exception as error:
        print(str(error) if isinstance(error, ValueError) else type(error).__name__, file=sys.stderr)
        sys.exit(1)
