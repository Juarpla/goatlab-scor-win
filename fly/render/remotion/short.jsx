import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Img, OffthreadVideo, Sequence, useCurrentFrame, interpolate, Easing, spring, delayRender, continueRender, cancelRender } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { iris } from '@remotion/transitions/iris';
import { captionPages } from '../../../src/lib/timing.js';
import { boundedMotion } from '../../../src/lib/edit-plan.js';
import { EditorialMotion } from './editorial.jsx';
import { resolveMotion, MOTION_KINDS } from '../../../src/lib/motion-data.js';
import { FPS, FONT_FAMILY, CAPTION_FILL, ENDCARD_SECONDS } from '../../../src/lib/short-format.js';

const white = '#edf0e6', charcoal = '#101412', lime = '#c5ed74', slate = '#8ca6bf';
const frameAt = seconds => Math.round(seconds * FPS);
const tween = (frame, length, from = 0, to = 1) => interpolate(frame, [0, Math.max(1, length)], [from, to], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
// Motion v4.1 carbon-v1: spring siempre. Presets por signature_move; bans: solo transform+opacity (barras por scaleX, nunca width).
const SPRINGS = {
  ENTER: { damping: 22, stiffness: 180, mass: 0.6 },
  FAST: { damping: 27, stiffness: 260, mass: 0.5 },
  SLOW: { damping: 16, stiffness: 110, mass: 0.8 },
  CAM: { damping: 14, stiffness: 70, mass: 1 },
  POP: { damping: 12, stiffness: 200, mass: 0.6 },
};
const SPRING_BY_SIGNATURE = { 'camera-push': 'CAM', 'glow-pulse': 'SLOW', 'stagger-reveal': 'ENTER', 'count-up-slam': 'POP', 'duel-collide': 'FAST', 'pitch-run': 'FAST' };
const springFor = (contract, sig) => {
  const key = SPRING_BY_SIGNATURE[contract?.signatureMove ?? sig] ?? 'ENTER';
  return (frame, delay = 0) => spring({ frame: Math.max(0, frame - delay), fps: FPS, config: contract?.motion?.spring ?? SPRINGS[key] });
};
const spring01 = (frame, delay = 0) => spring({ frame: Math.max(0, frame - delay), fps: FPS, config: SPRINGS.ENTER });
// Backgrounds carbón v4: grain default datos, glow editorial, grid synthesis/form.
const BACKGROUNDS = {
  'carbon-grain': 'radial-gradient(ellipse at 80% 10%,#273d31,#101412 70%)',
  'carbon-glow': 'radial-gradient(ellipse at 80% 8%,#2c4a2ecc 0%,transparent 45%), radial-gradient(circle at 50% 40%,#223528,#101412 65%)',
  'carbon-grid': 'radial-gradient(ellipse at 80% 10%,#22352888,#101412 70%)',
};
const backgroundFor = graphic => {
  if (!graphic || !MOTION_KINDS.includes(graphic.kind)) return BACKGROUNDS['carbon-grain'];
  if (graphic.presentation === 'editorial') return BACKGROUNDS['carbon-glow'];
  if (graphic.kind === 'synthesis' || graphic.kind === 'form') return BACKGROUNDS['carbon-grid'];
  return BACKGROUNDS['carbon-grain'];
};
const label = { color: white, fontSize: 34, fontWeight: 800, letterSpacing: 1 };

function Photo({ photo, layer, frames }) {
  const frame = useCurrentFrame(), box = layer.box ?? { x: 0, y: 0, w: 1, h: 1 };
  const motion = boundedMotion(layer, photo);
  const easing = {'power1.inOut':Easing.inOut(Easing.quad),'power2.inOut':Easing.inOut(Easing.cubic),'power3.out':Easing.out(Easing.poly(4)),'sine.inOut':Easing.inOut(Easing.sin)}[layer.ease] ?? Easing.linear;
  const p = interpolate(frame, [0, Math.max(1, frames - 1)], [0, 1], { extrapolateRight: 'clamp', easing });
  const value = key => motion.from[key] + (motion.to[key] - motion.from[key]) * p;
  const effect = layer.focusEffect ?? 'none';
  const blurOpacity = effect === 'focus' ? 1 - tween(frame, 18) : effect === 'defocus' ? tween(frame - frames + 18, 18) : effect === 'pulse' ? Math.max(1 - tween(frame, 18), tween(frame - frames + 18, 18)) : 0;
  const imageStyle = { position: 'absolute', width: motion.imageWidth, height: motion.imageHeight, left: '50%', top: '50%',
    transform: `translate(-50%, -50%) translate(${value('x')}px, ${value('y')}px) scale(${value('scale')})` };
  return <div style={{ position: 'absolute', left: box.x * 1080, top: box.y * 1920, width: box.w * 1080, height: box.h * 1920, overflow: 'hidden', background: charcoal }}>
    <Img src={photo.backdrop} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: .4 }} />
    <Img src={photo.src} style={imageStyle} />
    {blurOpacity > 0 && <Img src={photo.focusBlur} style={{ ...imageStyle, opacity: blurOpacity }} />}
    <AbsoluteFill style={{ background: 'linear-gradient(180deg,#10141266,transparent 45%,#101412bb)' }} />
  </div>;
}

function MotionChart({ graphic, facts, prompts, frames }) {
  const frame = useCurrentFrame(), data = resolveMotion(graphic, facts, prompts);
  const prompt = (prompts ?? []).find(p => p.n === graphic.motionPromptNumber) ?? {};
  const springHere = springFor(data.contract, prompt.signature_move);
  const enter = springHere(frame, 0), exit = 1 - tween(frame - frames + 9, 9);
  const isSummary = graphic.kind === 'synthesis';
  const rows = data.facts.filter(f => !f.id.endsWith('.n') && f.id !== 'h2h.total').slice(0, 8);
  const specialCards = graphic.kind === 'clean-sheets';
  const formCards = graphic.kind === 'form';
  const h2hFacts = ['h2h.homeWins', 'h2h.draws', 'h2h.awayWins'].map(id => data.facts.find(f => f.id === id));
  const totalFact = data.facts.find(f => f.id === 'h2h.total');
  const donut = graphic.kind === 'head-to-head' && h2hFacts.every(Boolean) && totalFact?.value > 0 && h2hFacts.reduce((n,f)=>n+f.value,0) === totalFact.value;
  const compact = rows.length > 4;
  const spotlight = data.contract?.revealMode === 'spotlight';
  const focusId = spotlight ? [...rows].sort((a, b) => b.value - a.value)[0]?.id : null;
  const spacing = Math.min(130, 900 / Math.max(1, rows.length));
  const scale = 0.95 + 0.05 * enter;
  return <div style={{ position: 'absolute', left: 70, right: 70, top: 230, maxHeight: 1920 - 520 - 230 - 40, overflow: 'hidden', opacity: enter * exit, transform: `translateY(${(1 - enter) * 24}px) scale(${scale})` }}>
    <div style={{ color: slate, fontSize: 25, letterSpacing: 5 }}>GOATLAB · ANÁLISIS</div>
    <div style={{ color: white, fontSize: data.title.length > 24 ? 55 : 72, lineHeight: 1.06, marginTop: 28, paddingBottom: 28, borderBottom: `5px solid ${lime}` }}>{data.title}</div>
    {!rows.length ? <div style={{ marginTop: 100, color: white, fontSize: 54 }}>Datos no disponibles</div> :
      <div style={{ marginTop: 58, display: isSummary || specialCards || formCards ? 'grid' : 'block', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
        {donut ? <div>
          <svg viewBox="0 0 900 420" width="900" height="420">
            <circle cx="450" cy="210" r="155" fill="none" stroke="#26322c" strokeWidth="44" />
            {h2hFacts.map((fact,index) => {
              const circumference=2*Math.PI*155, fraction=fact.value/totalFact.value;
              const prior=h2hFacts.slice(0,index).reduce((n,f)=>n+f.value,0)/totalFact.value;
              return <circle key={fact.id} cx="450" cy="210" r="155" fill="none" stroke={[lime,white,slate][index]} strokeWidth="44"
                strokeDasharray={`${circumference*fraction*tween(frame-10,30)} ${circumference}`} strokeDashoffset={-prior*circumference} transform="rotate(-90 450 210)" />;
            })}
            <text x="450" y="215" textAnchor="middle" fill={white} fontSize="100">{totalFact.value}</text>
            <text x="450" y="265" textAnchor="middle" fill={slate} fontSize="27">CRUCES PREVIOS</text>
          </svg>
          {h2hFacts.map((fact,index)=><div key={fact.id} style={{display:'flex',justifyContent:'space-between',fontSize:36,marginTop:24,borderLeft:`5px solid ${[lime,white,slate][index]}`,paddingLeft:22}}><span>{fact.label}</span><b>{fact.value}</b></div>)}
        </div> :
        rows.map((fact, index) => {
          const p = springHere(frame, 9 + index * 2);
          const color = fact.id.startsWith('away.') ? slate : fact.id.includes('draw') ? '#d1d7cf' : lime;
          const dim = spotlight && fact.id !== focusId ? 0.45 : 1;
          const glow = spotlight && fact.id === focusId ? `0 0 32px ${color}` : 'none';
          return isSummary || specialCards || formCards ? <div key={fact.id} style={{ background: '#1b2422', borderTop: `4px solid ${color}`, padding: compact ? 18 : 28, opacity: p * dim, transform: spotlight && fact.id === focusId ? 'scale(1.05)' : 'none', boxShadow: glow }}>
            {specialCards && <svg viewBox="0 0 160 160" width="110" height="110" style={{display:'block',margin:'0 auto 20px'}}><path d="M80 12L140 35V85Q130 125 80 148Q30 125 20 85V35Z" fill="none" stroke={color} strokeWidth="5"/><path d="M48 80L72 105L115 58" fill="none" stroke={white} strokeWidth="7" strokeDasharray="120" strokeDashoffset={120*(1-p)}/></svg>}
            <div style={{ ...label, fontSize: compact ? 24 : 30, minHeight: compact ? 52 : 80 }}>{fact.label}</div>
            <div style={{ fontSize: compact ? 68 : 100, color, marginTop: 12 }}>{Number((fact.value * p).toFixed(2))}</div>
            <div style={{ fontSize: 26, color: white }}>{fact.unit}</div>
          </div> : <div key={fact.id} style={{ height: spacing, opacity: p }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 24 }}>
              <span style={{ ...label, fontSize: rows.length > 6 ? 27 : 32 }}>{fact.label}</span>
              <span style={{ fontSize: 44, color, whiteSpace: 'nowrap' }}>{Number((fact.value * p).toFixed(2))} <span style={{ fontSize: 23 }}>{fact.unit}</span></span>
            </div>
            <div style={{ height: 23, background: '#26322c', marginTop: 14, borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${fact.value / data.max * 100}%`, background: color, transform: `scaleX(${p})`, transformOrigin: 'left center' }} />
            </div>
          </div>;
        })}
      </div>}
    {rows.length > 0 && !isSummary && !specialCards && !formCards && !donut && <div style={{ display: 'flex', justifyContent: 'space-between', color: slate, fontSize: 22, marginTop: 8 }}><span>0</span><span>Escala común · {data.max} {rows[0].unit}</span></div>}
    <div style={{ color: slate, fontSize: 24, lineHeight: 1.5, marginTop: 35 }}>{data.notes.join(' / ')}</div>
  </div>;
}

function Graphic({ graphic, words, facts, prompts, frames, match }) {
  const frame = useCurrentFrame();
  if (MOTION_KINDS.includes(graphic.kind) && graphic.presentation === 'editorial') {
    resolveMotion(graphic,facts,prompts);
    return <EditorialMotion graphic={graphic} words={words} frames={frames} match={match} />;
  }
  if (MOTION_KINDS.includes(graphic.kind)) return <MotionChart graphic={graphic} facts={facts} prompts={prompts} frames={frames} />;
  const refs = (graphic.factIds ?? []).map(id => facts.find(f => f.id === id));
  if (refs.some(f => !f)) throw new Error('hecho inexistente');
  const phrase = refs.length ? refs.map(f => `${f.label}: ${f.value} ${f.unit}`).join(' · ') : words.slice(graphic.wordStart ?? 0, graphic.wordEnd ?? 0).map(w => w.word).join(' ');
  const progress = spring01(frame, 0), decorative = ['ring', 'line'].includes(graphic.kind);
  return <div style={{ position: 'absolute', left: (graphic.x ?? .07) * 1080, right: 76, top: Math.min(graphic.y ?? .13, .4) * 1920, opacity: progress,
    transform: `translateY(${(1 - progress) * 25}px) scale(${0.95 + 0.05 * progress})`, color: white, fontSize: phrase.length > 55 ? 48 : 74, lineHeight: 1.1 }}>
    {decorative ? <svg viewBox="0 0 800 240" width="800" height="240" aria-hidden="true">
      {graphic.kind === 'ring' ? <circle cx="400" cy="120" r="95" fill="none" stroke={lime} strokeWidth="4" strokeDasharray="320 280" transform={`rotate(${frame / FPS * 18} 400 120)`} /> : <path d="M0 180H260L370 60H530L620 180H800" fill="none" stroke={lime} strokeWidth="5" strokeDasharray="1000" strokeDashoffset={1000 * (1 - tween(frame, 35))} />}
    </svg> : <div style={{ background: '#101412dd', padding: 28, borderLeft: `6px solid ${lime}` }}>{phrase}</div>}
    {graphic.kind === 'bars' && refs.length > 0 && refs.map(f => <div key={f.id} style={{ height: 20, marginTop: 15, background: lime, width: `${f.value / Math.max(1, ...refs.map(v => v.value)) * tween(frame, 25) * 100}%` }} />)}
  </div>;
}

function Scene({ scene, photos, clips, words, facts, prompts, frames, match }) {
  const frame = useCurrentFrame();
  const motionGraphic = (scene.graphics ?? []).find(g => MOTION_KINDS.includes(g.kind));
  return <AbsoluteFill style={{ background: backgroundFor(motionGraphic), overflow: 'hidden' }}>
    {(scene.layers ?? []).map((layer, index) => <Photo key={index} photo={photos[layer.asset]} layer={{...layer,focusEffect:layer.focusEffect ?? (['focus','defocus'].includes(scene.transition)?scene.transition:'none')}} frames={frames} />)}
    {(scene.clips ?? []).map((layer, index) => <Sequence key={index} durationInFrames={Math.round((layer.duration ?? scene.end - scene.start) * FPS)} layout="none">
      <OffthreadVideo src={clips[layer.clip].src} trimBefore={frameAt(layer.offset ?? 0)} muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
    </Sequence>)}
    <div style={{ position: 'absolute', top: 120, left: 70, width: 90, height: 6, background: scene.accent ?? lime }} />
    {(scene.graphics ?? []).map((graphic, index) => <Sequence key={index} from={frameAt(graphic.at - scene.start)} durationInFrames={Math.max(1, frameAt(graphic.duration))} layout="none">
      <Graphic match={match} graphic={graphic} words={words} facts={facts} prompts={prompts} frames={frameAt(graphic.duration)} />
    </Sequence>)}
    {(scene.objects ?? []).map((object, index) => <div key={index} style={{ position: 'absolute', top: (object.y ?? .35) * 1920, left: (object.x ?? .35) * 1080,
      width: object.size ?? 150, minHeight: object.size ?? 150, padding: 20, background: '#284438', border: `2px solid ${lime}`, fontSize: 35,
      transform: `perspective(900px) rotateX(${object.rotateX ?? -15}deg) rotateY(${(object.rotateY ?? -25) + (object.spin ?? 60) * frame / Math.max(1, frames)}deg)`, boxShadow: '18px 20px 0 #060a0877' }}>
      {words.slice(object.wordStart ?? 0, object.wordEnd ?? 0).map(w => w.word).join(' ') || 'GOATLAB'}
    </div>)}
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 45%, transparent 55%, #060a08cc 100%)', pointerEvents: 'none' }} />
  </AbsoluteFill>;
}

function Captions({ page, words, tweaks = {} }) {
  const frame = useCurrentFrame();
  const fontScale = tweaks.fontScale ?? 1;
  return <div style={{ position: 'absolute', left: 64, right: 64, bottom: tweaks.captionBottom ?? 520, minHeight: 160, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignContent: 'center', gap: '0 16px', textAlign: 'center', fontSize: 64 * fontScale, lineHeight: 1.22,
    color: CAPTION_FILL, WebkitTextStroke: '3px #000', paintOrder: 'stroke fill', textShadow: '0 4px 8px #000', background: '#101412cc', padding: '18px 28px', borderRadius: 18 }}>
    {page.words.map(w => { const on = frame >= frameAt(w.start - page.start) ? 1 : 0; return <span key={w.index} style={{ display: 'inline-block', overflow: 'hidden', maxWidth: '100%' }}><span style={{ display: 'inline-block', transform: `translateY(${(1 - on) * 110}%)`, opacity: on, overflowWrap: 'anywhere' }}>{words[w.index].word}</span></span>; })}
  </div>;
}

export function GoatLabShort({ frames, font, brand, photos, clips, words, facts = [], motionPrompts = [], plan, match }) {
  const frame = useCurrentFrame();
  const [fontHandle] = useState(() => delayRender('GoatLab font'));
  useEffect(() => { document.fonts.load(`800 68px "${FONT_FAMILY}"`).then(() => continueRender(fontHandle)).catch(cancelRender); }, [font, fontHandle]);
  const endStart = frames - ENDCARD_SECONDS * FPS;
  const pages = captionPages(words);
  return <AbsoluteFill style={{ background: charcoal, color: white, fontFamily: FONT_FAMILY, fontWeight: 800 }}>
    <style>{`@font-face{font-family:"${FONT_FAMILY}";src:url("${font}");font-weight:800}*{box-sizing:border-box}`}</style>
    <TransitionSeries>{plan.scenes.flatMap((scene, index) => {
      const start = frameAt(scene.start), length = Math.min(endStart - start, frameAt(scene.end) - start);
      const next=plan.scenes[index+1];
      const overlap=next && next.transition !== 'cut' ? Math.min(8,length,frameAt(next.end)-frameAt(next.start)) : 0;
      const presentation=next?.transition==='slide'?slide():next?.transition==='wipe'?wipe():next?.transition==='iris'?iris({width:1080,height:1920}):fade();
      return length > 0 ? [<TransitionSeries.Sequence key={`scene-${index}`} durationInFrames={length+overlap}>
        <Scene match={match} scene={scene} photos={photos} clips={clips} words={words} facts={facts} prompts={motionPrompts} frames={length} />
      </TransitionSeries.Sequence>, ...(overlap>0 ? [<TransitionSeries.Transition key={`transition-${index}`} presentation={presentation} timing={linearTiming({durationInFrames:overlap})}/>] : [])] : [];
    })}</TransitionSeries>
    {(photos.length > 0 || clips.length > 0) && frame < endStart && <div style={{ position: 'absolute', top: 42, right: 55, color: white, background: '#101412dd', padding: '10px 16px', fontSize: 23 }}>Ilustración con IA</div>}
    {pages.map((page, index) => {
      const start = frameAt(page.start), end = Math.min(endStart, frameAt(pages[index + 1]?.start ?? endStart / FPS));
      return end > start && <Sequence key={index} from={start} durationInFrames={end - start} layout="none"><Captions page={page} words={words} tweaks={plan.tweaks} /></Sequence>;
    })}
    <Sequence from={endStart} durationInFrames={ENDCARD_SECONDS * FPS} layout="none">
      <EndCard brand={brand} match={match} />
    </Sequence>
  </AbsoluteFill>;
}
function EndCard({ brand, match }) {
  const frame = useCurrentFrame(), p = tween(frame, 17);
  return <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 40%,#223528,#101412 65%)', alignItems: 'center', justifyContent: 'center', gap: 35 }}>
    <Img src={brand} style={{ width: 210, height: 210, opacity: p, transform: `scale(${.8 + p * .2})` }} />
    <div style={{ color: lime, fontSize: 88 }}>goatlab.win</div><div style={{ color: white, fontSize: 36, maxWidth: 900, textAlign: 'center' }}>{match}</div>
  </AbsoluteFill>;
}
