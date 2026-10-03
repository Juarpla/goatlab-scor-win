/** Seekable GSAP composition from a validated transcript-grounded edit plan. */
import { captionPages, figuresFromWords } from './timing.js';
import { CAPTION_FILL, FONT_FAMILY, FONT_FILE, FRAME_W, FRAME_H, ENDCARD_SECONDS } from './hyperframe.js';

const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const js = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const moves = {
  push: [{ scale: 1 }, { scale: 1.18 }], pull: [{ scale: 1.18 }, { scale: 1 }],
  'pan-left': [{ scale: 1.15, x: .035 }, { scale: 1.15, x: -.035 }],
  'pan-right': [{ scale: 1.15, x: -.035 }, { scale: 1.15, x: .035 }],
  rise: [{ scale: 1.15, y: .035 }, { scale: 1.15, y: -.035 }],
  drift: [{ scale: 1.12, x: -.025, y: .02 }, { scale: 1.18, x: .025, y: -.02 }],
  tilt: [{ scale: 1.15, rotation: -1.2 }, { scale: 1.15, rotation: 1.2 }],
  hold: [{ scale: 1 }, { scale: 1 }], 'cut-in': [{ scale: 1.22 }, { scale: 1.1 }],
};

/** Bound transforms by actual image resolution and available crop, not model guesses. */
export function boundedMotion(layer, photo) {
  const box = layer.box ?? { x: 0, y: 0, w: 1, h: 1 };
  const width = FRAME_W * box.w, height = FRAME_H * box.h;
  const iw = photo.width || width, ih = photo.height || height;
  const cover = iw >= width && ih >= height;
  const base = cover ? Math.max(width / iw, height / ih) : Math.min(1, width / iw, height / ih);
  const maxScale = Math.max(1, Math.min(1.35, 1 / base));
  const defaults = moves[layer.move] ?? moves.push;
  const convert = state => {
    const scale = Math.max(1, Math.min(maxScale, state.scale ?? 1));
    const marginX = Math.max(0, (iw * base * scale - width) / 2);
    const marginY = Math.max(0, (ih * base * scale - height) / 2);
    // Rotations consume crop margin; disable them rather than expose empty corners.
    const focus = layer.focus ?? { x: .5, y: .5 };
    return { scale, x: Math.max(-marginX, Math.min(marginX, (state.x ?? 0) * width + (.5 - focus.x) * iw * base * scale)),
      y: Math.max(-marginY, Math.min(marginY, (state.y ?? 0) * height + (.5 - focus.y) * ih * base * scale)), rotation: 0 };
  };
  return { from: convert(layer.from ?? defaults[0]), to: convert(layer.to ?? defaults[1]),
    imageWidth: iw * base, imageHeight: ih * base, cover };
}

export function buildPlannedComposition({ duration, photos, words, plan, facts = [], match = '' }) {
  if (!words?.length || !plan?.scenes?.length) throw new Error('se requiere transcripción y plan de edición');
  const span = duration - ENDCARD_SECONDS;
  const html = [], animations = [];
  let track = 0;
  const animate = (selector, from, to, at) => animations.push(`tl.fromTo(${js(selector)},${js(from)},${js(to)},${at});`);
  const factMap = new Map(facts.map(f=>[f.id,f]));
  plan.scenes.forEach((scene, i) => {
    const length = scene.end - scene.start;
    const overlap = i === plan.scenes.length - 1 ? 0 : Math.min(.3, length / 3);
    const id = `scene${i}`;
    const accent = /^#[0-9a-f]{6}$/i.test(scene.accent) ? scene.accent : '#c5ed74';
    const layers = scene.layers.map((layer, j) => {
      const photo = photos[layer.asset];
      if (!photo) throw new Error('asset del plan inexistente');
      const box = layer.box ?? { x: 0, y: 0, w: 1, h: 1 };
      const motion = boundedMotion(layer, photo);
      const selector = `#photo${i}_${j},#focus${i}_${j}`;
      animate(selector, motion.from, { ...motion.to, duration: length + overlap, ease: layer.ease ?? 'sine.inOut' }, scene.start);
      const focus = layer.focus ?? { x: .5, y: .5 };
      const focusEffect=layer.focusEffect ?? (scene.transition==='focus'?'focus':scene.transition==='defocus'?'defocus':'none');
      if(focusEffect==='focus' || focusEffect==='pulse')
        animate(`#focus${i}_${j}`,{opacity:1},{opacity:0,duration:Math.min(.65,length/3),ease:'power2.out'},scene.start);
      if(focusEffect==='defocus' || focusEffect==='pulse')
        animate(`#focus${i}_${j}`,{opacity:0},{opacity:1,duration:Math.min(.65,length/3),ease:'power2.inOut',immediateRender:false},scene.end-Math.min(.65,length/3));
      return `<div class="photo-box" style="left:${box.x * 100}%;top:${box.y * 100}%;width:${box.w * 100}%;height:${box.h * 100}%;border-color:${accent}">` +
        `<img class="backdrop" src="${esc(photo.backdrop ?? photo.src)}" alt=""/>` +
        `<img id="photo${i}_${j}" class="photo" data-layout-allow-overflow src="${esc(photo.src)}" alt="" style="width:${motion.imageWidth}px;height:${motion.imageHeight}px;object-position:${focus.x * 100}% ${focus.y * 100}%"/>` +
        `<img id="focus${i}_${j}" class="photo focus-blur" data-layout-allow-overflow src="${esc(photo.focusBlur ?? photo.backdrop ?? photo.src)}" alt="" style="width:${motion.imageWidth}px;height:${motion.imageHeight}px;opacity:0"/>` +
        `<div class="photo-shade"></div></div>`;
    }).join('');
    const objects=(scene.objects ?? []).map((obj,j)=>{
      const oid=`object${i}_${j}`, size=obj.size ?? 210;
      const text=words.slice(obj.wordStart ?? 0,obj.wordEnd ?? 0).map(w=>w.word).join(' ');
      animate(`#${oid}`,{rotationX:obj.rotateX ?? -15,rotationY:obj.rotateY ?? -25,y:25},{rotationX:obj.rotateX ?? -15,rotationY:(obj.rotateY ?? -25)+(obj.spin ?? 70),y:0,duration:length,ease:'sine.inOut'},scene.start);
      const faces=obj.kind==='card'?['front','back','edge']:['front','back','left','right','top','bottom'];
      return `<div class="object-position" style="left:${(obj.x ?? .35)*100}%;top:${(obj.y ?? .34)*100}%;--size:${size}px;--half:${size/2}px;--depth:${obj.kind==='prism'?size/5:obj.kind==='card'?12:size/2}px"><div id="${oid}" class="object3d ${esc(obj.kind)}">${faces.map((face,k)=>`<div class="face ${face}">${k===0?esc(text):''}</div>`).join('')}</div></div>`;
    }).join('');
    html.push(`<section id="${id}" class="scene clip ${scene.layers.length?'':'motion-scene'}" data-start="${scene.start}" data-duration="${length + overlap}" data-track-index="${track++}" style="--accent:${accent}"><div id="camera${i}" data-layout-allow-overflow class="camera">${layers}<div class="motion-grid"></div>${objects}</div><div class="scene-edge"></div></section>`);
    if(scene.camera && !scene.layers.length) animate(`#camera${i}`,{x:0,y:0,scale:1},{x:(scene.camera.x ?? 0)*FRAME_W,y:(scene.camera.y ?? 0)*FRAME_H,scale:scene.camera.scale ?? 1,duration:length,ease:'sine.inOut'},scene.start);
    if (i) {
      const transitions = {
        fade: [{ opacity: 0 }, { opacity: 1 }], slide: [{ opacity: .2, x: 100 }, { opacity: 1, x: 0 }],
        wipe: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }],
        iris: [{ clipPath: 'circle(0% at 50% 45%)' }, { clipPath: 'circle(120% at 50% 45%)' }],
        focus: [{ opacity: 0 }, { opacity: 1 }], defocus: [{ opacity: 0 }, { opacity: 1 }],
      };
      const transition = transitions[scene.transition];
      if (transition) animate(`#${id}`, transition[0], { ...transition[1], duration: Math.min(.3, length / 3), ease: 'power2.out' }, scene.start);
    }
    (scene.graphics ?? []).forEach((graphic, g) => {
      const gid = `graphic${i}_${g}`;
      const selectedFacts=(graphic.factIds ?? []).map(ref=>{
        const fact=factMap.get(ref);
        if(!fact || !Number.isFinite(fact.value) || !fact.unit || !fact.source) throw new Error('hecho de gráfico inválido');
        return fact;
      });
      if(graphic.kind==='bars' && selectedFacts.length && new Set(selectedFacts.map(f=>f.unit)).size!==1) throw new Error('unidades incompatibles en gráfico');
      const phrase = selectedFacts.length ? selectedFacts.map(f=>`${f.label}: ${f.value}`).join(' · ') : words.slice(graphic.wordStart ?? 0, graphic.wordEnd ?? 0).map(w => w.word).join(' ');
      let content;
      if (graphic.kind === 'ring') content = '<svg viewBox="0 0 240 240" width="240" height="240"><circle cx="120" cy="120" r="96" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="440 163"/></svg>';
      else if (graphic.kind === 'line') content = '<svg viewBox="0 0 480 60" width="480" height="60"><path d="M0 45H120L145 15H270L295 45H480" fill="none" stroke="currentColor" stroke-width="5"/></svg>';
      else if (graphic.kind === 'bars') {
        const values = selectedFacts.length ? selectedFacts.map(f=>f.value) : figuresFromWords(words.slice(graphic.wordStart, graphic.wordEnd), 4).map(f => f.value).filter(v => v != null && v >= 0);
        const max = Math.max(1, ...values);
        content = selectedFacts.length ? `<div class="bars fact-bars">${selectedFacts.map(f=>`<span class="fact-label">${esc(f.label)} <b>${f.value} ${esc(f.unit)}</b></span><div class="bar-fill" style="width:${f.value / max * 100}%"></div>`).join('')}</div>` : `<span>${esc(phrase)}</span><div class="bars">${values.slice(0, 4).map(n => `<div class="bar-fill" style="width:${n / max * 100}%"></div>`).join('')}</div>`;
      } else content = `<span>${esc(phrase)}</span>`;
      html.push(`<div id="${gid}" class="graphic graphic-${esc(graphic.kind)} clip" data-start="${graphic.at}" data-duration="${graphic.duration}" data-track-index="${track++}" style="left:${(graphic.x ?? .07) * 100}%;right:7%;top:${(graphic.y ?? .13) * 100}%;--accent:${accent};${graphic.kind === 'stat' && phrase.length > 25 ? 'font-size:52px' : ''}">${content}</div>`);
      animate(`#${gid}`, { opacity: 0, y: 30, scale: .92 }, { opacity: 1, y: 0, scale: 1, duration: Math.min(.3, graphic.duration / 2), ease: 'power3.out' }, graphic.at);
      if (graphic.kind === 'ring') animations.push(`tl.to('#${gid} svg',{rotation:90,duration:${graphic.duration},ease:'none'},${graphic.at});`);
      if (graphic.kind === 'bars') animate(`#${gid} .bar-fill`, { scaleX: 0 }, { scaleX: 1, duration: Math.min(.6, graphic.duration / 2), stagger: .08, ease: 'power2.out' }, graphic.at);
    });
  });
  const pages=captionPages(words);
  pages.forEach((page, p) => {
    const end = Math.min(pages[p+1]?.start ?? span, span);
    if (page.start >= end) return;
    html.push(`<div class="captions clip" data-start="${page.start}" data-duration="${end - page.start}" data-track-index="${track++}">${page.words.map(w => `<span id="word${w.index}">${esc(w.word)}</span>`).join(' ')}</div>`);
    for (const word of page.words) animate(`#word${word.index}`, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: .07 }, word.start);
  });
  html.push(`<div id="endcard" class="endcard clip" data-start="${span}" data-duration="3" data-track-index="${track++}"><img id="brand-logo" src="brand.svg" alt="GoatLab"/><div class="brand">goatlab.win</div><div class="match">${esc(match)}</div></div>`);
  animate('#brand-logo', { opacity: 0, scale: .8, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: .55, ease: 'power3.out' }, span);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"/><script src="gsap.min.js"></script><style>
@font-face{font-family:"${FONT_FAMILY}";src:url("${FONT_FILE}");font-weight:800}
*{box-sizing:border-box}html,body{margin:0;background:#101412}
#stage{position:relative;width:${FRAME_W}px;height:${FRAME_H}px;overflow:hidden;background:#101412;font-family:"${FONT_FAMILY}";color:white}
.scene{position:absolute;inset:0;overflow:hidden;z-index:1;background:#101412}.photo-box{position:absolute;overflow:hidden;border:2px solid;background:#101412}
.camera{position:absolute;inset:0;perspective:1000px}.motion-scene{background:radial-gradient(ellipse at 70% 30%,#29453c,#101412 72%)}
.motion-grid{display:none;position:absolute;inset:8%;opacity:.12;background:linear-gradient(90deg,transparent 98%,var(--accent) 99%),linear-gradient(transparent 98%,var(--accent) 99%);background-size:90px 90px;transform:perspective(900px) rotateX(25deg)}.motion-scene .motion-grid{display:block}
.object-position{position:absolute;perspective:900px;width:var(--size);height:var(--size)}.object3d{position:relative;width:100%;height:100%;transform-style:preserve-3d}.face{position:absolute;width:100%;height:100%;border:2px solid var(--accent);background:#183f35;backface-visibility:hidden;display:flex;align-items:center;justify-content:center;text-align:center;font-size:40px;padding:15px;overflow-wrap:anywhere;box-shadow:inset 0 0 40px #0004}
.front{transform:translateZ(var(--depth));background:linear-gradient(135deg,#497454,#163d33)}.back{transform:rotateY(180deg) translateZ(var(--depth))}.left{transform:rotateY(-90deg) translateZ(var(--half))}.right{transform:rotateY(90deg) translateZ(var(--half));background:#0c2822}.top{transform:rotateX(90deg) translateZ(var(--half));background:#547f56}.bottom{transform:rotateX(-90deg) translateZ(var(--half))}.card .edge{width:24px;transform:rotateY(90deg) translateZ(calc(var(--size) - 12px))}.prism .left,.prism .right{width:calc(var(--depth)*2)}.prism .top,.prism .bottom{height:calc(var(--depth)*2)}
.photo{position:absolute;left:50%;top:50%;translate:-50% -50%;max-width:none;will-change:transform}
.backdrop{position:absolute;width:100%;height:100%;object-fit:cover;opacity:.25}
.photo-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.12),transparent 40%,rgba(0,0,0,.48))}
.scene-edge{position:absolute;top:80px;left:65px;width:95px;height:8px;background:var(--accent)}
.graphic{position:absolute;z-index:20;max-width:82%;max-height:970px;color:var(--accent);font-size:64px;font-weight:800;line-height:1.08;overflow-wrap:anywhere;text-shadow:0 3px 10px #000}
.graphic-title{font-size:88px;letter-spacing:-2px;padding:30px 15px;text-shadow:2px 2px #163c2b,4px 4px #163c2b,6px 6px #163c2b}
.graphic-label{padding:18px 26px;background:rgba(16,20,18,.87);border-left:8px solid var(--accent);font-size:46px}
.graphic-stat{padding:24px;background:rgba(16,20,18,.8);border-top:6px solid var(--accent);font-size:86px}
.bars{width:560px;max-width:100%;margin-top:18px}.bar-fill{height:18px;background:var(--accent);margin:12px 0;transform-origin:left center}
.fact-bars{width:800px;font-size:42px;padding:24px;background:#101412e8;border-left:6px solid var(--accent)}.fact-label{display:block}.fact-label b{color:white}
.captions{position:absolute;z-index:1000;left:64px;right:64px;bottom:260px;min-height:170px;display:flex;flex-wrap:wrap;justify-content:center;align-content:center;gap:0 16px;text-align:center;font-size:68px;font-weight:800;line-height:1.22;color:${CAPTION_FILL};-webkit-text-stroke:3px #000;paint-order:stroke fill;text-shadow:0 4px 8px #000}
.captions span{display:inline-block;max-width:100%;overflow-wrap:anywhere}
.endcard{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 40%,#223528,#101412 65%);color:#c5ed74;gap:35px;text-align:center}
.endcard img{width:210px;height:210px}.brand{font-size:88px;font-weight:800}.match{font-size:36px;color:white;max-width:900px}
</style></head><body><div id="stage" data-composition-id="main" data-start="0" data-width="1080" data-height="1920" data-duration="${duration}">${html.join('\n')}</div><script>
const tl=gsap.timeline({paused:true});${animations.join('\n')}window.__timelines=window.__timelines||{};window.__timelines['main']=tl;
</script></body></html>`;
}
