import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
export const DEFAULT_MODELS='opencode-go/mimo-v2.6-flash,opencode-go/deepseek-v4.1-flash,agnes/agnes-3.0-flash,mistral/mistral-small-2603';
export function configureModels(text,env=process.env) {
  const models=[...new Set((env.GOATLAB_AGENT_MODELS??DEFAULT_MODELS).split(',').map(s=>s.trim()).filter(Boolean))];
  if (!models.length || models.length>4 || models.some(s=>! /^(opencode-go|agnes|mistral)\/[a-z0-9.-]+$/.test(s))) throw new Error('GOATLAB_AGENT_MODELS inválido');
  return text.replace(/"x-opencode-session":\s*"[^\"]+"/,`"x-opencode-session": ${JSON.stringify(env.GOATLAB_OPENCODE_SESSION??randomUUID())}`).replace(/primary:\s*"[^"]*",/,`primary: ${JSON.stringify(models[0])},`).replace(/fallbacks:\s*\[[^\]]*\],/,`fallbacks: ${JSON.stringify(models.slice(1))},`);
}
export function writeModelConfig(path,env=process.env) { writeFileSync(path,configureModels(readFileSync(path,'utf8'),env)); }
