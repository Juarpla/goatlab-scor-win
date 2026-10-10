"""Provider-qualified, ordered routes. Credentials never enter reports."""
DEFAULT = 'opencode-go/mimo-v2.6-flash,opencode-go/deepseek-v4.1-flash,agnes/agnes-3.0-flash,mistral/mistral-small-2603'
PROVIDERS = {
    'opencode-go': ('OPENCODE_GO_API_KEY', 'OPENCODE_GO_BASE_URL', 'https://opencode.ai/zen/go/v1'),
    'agnes': ('AGNES_API_KEY', 'AGNES_TEXT_BASE_URL', 'https://apihub.agnes-ai.com/v1'),
    'mistral': ('MISTRAL_API_KEY', 'MISTRAL_BASE_URL', 'https://api.mistral.ai/v1'),
}
def routes(env, selector='GOATLAB_PLANNER_MODELS'):
    default = DEFAULT if selector != 'GOATLAB_VISION_MODELS' else ','.join(x for x in DEFAULT.split(',') if not x.startswith('agnes/'))
    values = list(dict.fromkeys(x.strip() for x in env.get(selector, default).split(',') if x.strip()))
    if not values or len(values) > (3 if selector == 'GOATLAB_VISION_MODELS' else 4):
        raise ValueError('cadena de modelos inválida')
    result = []
    for value in values:
        provider, sep, model = value.partition('/')
        if not sep or provider not in PROVIDERS or not model or '/' in model:
            raise ValueError('modelo requiere proveedor explícito')
        key, base, url = PROVIDERS[provider]
        result.append({'id':value, 'model':model, 'url':env.get(base,url).rstrip('/')+'/chat/completions', 'key':env.get(key)})
    return result
