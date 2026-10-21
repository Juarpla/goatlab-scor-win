import { parse } from '@babel/parser';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { FPS, FRAME_W, FRAME_H, MAX_FRAMES, DIRECTOR_ENDCARD_SECONDS } from '../../src/lib/short-format.js';

const require = createRequire(import.meta.url);
const modules = dirname(dirname(require.resolve('react/package.json')));
const imports = new Set(['react', 'remotion']);
const forbidden = new Set(['require', 'eval', 'Function', 'process', 'global', 'globalThis', 'window', 'document', 'fetch', 'XMLHttpRequest', 'WebSocket', 'Worker', 'navigator', 'localStorage', 'sessionStorage', 'setInterval', 'setTimeout']);
const remotionExports = new Set(['AbsoluteFill', 'Sequence', 'Series', 'Freeze', 'Loop', 'Img', 'OffthreadVideo', 'Html5Video', 'Video', 'useCurrentFrame', 'useVideoConfig', 'interpolate', 'interpolateColors', 'spring', 'Easing', 'random', 'getInputProps']);

/** Syntax/import limits protect the host; they do not prescribe a visual style. */
export function validateAuthoredPlan(plan, frames) {
  if (plan?.version !== 5 || typeof plan.code !== 'string' || !plan.code.trim()) throw new Error('se requiere plan version:5 y code JSX');
  if (Buffer.byteLength(plan.code) > 200_000) throw new Error('code supera 200 KB');
  if (!Number.isInteger(frames) || frames <= DIRECTOR_ENDCARD_SECONDS * FPS || frames > MAX_FRAMES) throw new Error('duración fuera de límite');
  if (plan.music !== undefined && typeof plan.music !== 'boolean') throw new Error('music requiere boolean');
  const span = frames / FPS - DIRECTOR_ENDCARD_SECONDS;
  if (!Array.isArray(plan.scenes) || !plan.scenes.length) throw new Error('scenes requiere tiempos para la revisión visual');
  for (const scene of plan.scenes) {
    if (!scene || !Number.isFinite(scene.start) || !Number.isFinite(scene.end) || scene.start < 0 || scene.end <= scene.start || scene.end > span + 1 / FPS)
      throw new Error('tiempos de revisión fuera del contenido');
  }
  const ast = parse(plan.code, { sourceType: 'module', plugins: ['jsx'] });
  if (!ast.program.body.some(node => node.type === 'ExportDefaultDeclaration')) throw new Error('code debe exportar default un componente React');
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'ImportDeclaration') {
      if (!imports.has(node.source.value)) throw new Error(`import no disponible: ${node.source.value}; usa react o remotion`);
      if (node.source.value === 'remotion' && node.specifiers.some(s => s.type !== 'ImportSpecifier' || !remotionExports.has(s.imported.name))) throw new Error('import Remotion fuera de la interfaz disponible');
    }
    if (node.type === 'ExportAllDeclaration' || node.type === 'ExportNamedDeclaration' && node.source || node.type === 'Import' || node.type === 'ImportExpression' || node.type === 'MetaProperty') throw new Error('carga dinámica o reexportación no disponible');
    if (node.type === 'Identifier' && forbidden.has(node.name)) throw new Error(`API no disponible en composición: ${node.name}`);
    if (node.type === 'JSXIdentifier' && ['iframe', 'script', 'object', 'embed', 'link', 'base'].includes(node.name)) throw new Error(`elemento no disponible: ${node.name}`);
    for (const [key, value] of Object.entries(node)) if (!['loc', 'comments', 'tokens', 'extra'].includes(key)) {
      if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(ast.program);
  return ast;
}

export function authoredProps(prepared, plan) {
  validateAuthoredPlan(plan, prepared.frames);
  return { frames: prepared.frames, contentFrames: prepared.frames - DIRECTOR_ENDCARD_SECONDS * FPS,
    photos: prepared.photos, clips: prepared.clips, words: prepared.words, facts: prepared.facts ?? [],
    match: prepared.match ?? '', brandName: 'GoatLab', brandUrl: 'goatlab.win', font: 'LiberationSans-Bold.ttf', brand: 'brand.svg', plan };
}

// Source is bundled, never imported/evaluated in the Node process. Media wrappers
// accept only this job's asset URLs; Chromium additionally receives a network CSP.
const facade = `import React from 'react';
import {Img as Image,OffthreadVideo as Clip,Html5Video as HtmlVideo,useVideoConfig} from 'remotion';
export {AbsoluteFill,Sequence,Series,Freeze,Loop,useCurrentFrame,useVideoConfig,interpolate,interpolateColors,spring,Easing,random,getInputProps} from 'remotion';
function checked(src,props){const list=[props.font,props.brand,...props.photos.flatMap(p=>[p.src,p.backdrop,p.focusBlur]),...props.clips.map(c=>c.src)];if(!list.includes(src))throw Error('recurso ajeno al trabajo');return src;}
export function Img(p){const {props}=useVideoConfig();return <Image {...p} src={checked(p.src,props)}/>;}
export function OffthreadVideo(p){const {props}=useVideoConfig();return <Clip {...p} src={checked(p.src,props)} muted/>;}
export function Html5Video(p){const {props}=useVideoConfig();return <HtmlVideo {...p} src={checked(p.src,props)} muted/>;}
export const Video=OffthreadVideo;
`;

const entry = `import React,{useState,useEffect} from 'react';
import {Composition,registerRoot,AbsoluteFill,Sequence,Img,delayRender,continueRender,cancelRender} from 'remotion';
import Piece from './piece.jsx';
function Short(props){const [handle]=useState(()=>delayRender('GoatLab font'));useEffect(()=>{document.fonts.load('800 68px GoatLabLocal').then(()=>continueRender(handle)).catch(cancelRender)},[handle]);return <AbsoluteFill style={{background:'#101412',fontFamily:'GoatLabLocal, sans-serif',color:'white'}}>
<style>{'@font-face{font-family:GoatLabLocal;src:url('+JSON.stringify(props.font)+')}*{box-sizing:border-box}'}</style>
<Sequence durationInFrames={props.contentFrames}><Piece {...props}/></Sequence>
<Sequence from={props.contentFrames} durationInFrames={${DIRECTOR_ENDCARD_SECONDS * FPS}}><AbsoluteFill style={{background:'#101412',alignItems:'center',justifyContent:'center'}}><Img src={props.brand} style={{width:240,height:240}}/></AbsoluteFill></Sequence>
</AbsoluteFill>}
registerRoot(()=> <Composition id="GoatLabShort" component={Short} fps={${FPS}} width={${FRAME_W}} height={${FRAME_H}} durationInFrames={90} calculateMetadata={({props})=>({durationInFrames:props.frames})}/>);
`;

export async function bundleAuthored(tmp, props) {
  const ast = validateAuthoredPlan(props.plan, props.frames);
  const id = createHash('sha256').update(facade + entry + props.plan.code).digest('hex');
  const root = join(tmp, 'authored', id), out = join(root, 'bundle');
  if (existsSync(join(out, 'index.html'))) return out;
  mkdirSync(root, { recursive: true });
  let source = props.plan.code;
  for (const node of ast.program.body.filter(n => n.type === 'ImportDeclaration' && n.source.value === 'remotion').reverse()) {
    source = source.slice(0, node.source.start) + JSON.stringify('./safe-remotion.jsx') + source.slice(node.source.end);
  }
  writeFileSync(join(root, 'piece.jsx'), source);
  writeFileSync(join(root, 'safe-remotion.jsx'), facade);
  writeFileSync(join(root, 'index.jsx'), entry);
  try {
    await bundle({ entryPoint: join(root, 'index.jsx'), rootDir: dirname(modules),
      outDir: out, publicDir: null, webpackOverride: config => ({ ...config, resolve: { ...config.resolve, modules: [modules, 'node_modules'] } }) });
  } catch (error) { throw new Error(`compilación JSX: ${String(error.message).slice(0, 900)}`); }
  return out;
}

export function compositionCsp() {
  return "default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http://127.0.0.1:* http://localhost:*; media-src 'self' blob: http://127.0.0.1:* http://localhost:*; font-src 'self' data:; connect-src 'self' http://127.0.0.1:* http://localhost:*; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--bundle') {
  try { console.log(await bundleAuthored(process.argv[3], JSON.parse(readFileSync(join(process.argv[3], 'composition.json'), 'utf8')))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
