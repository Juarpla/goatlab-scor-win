import React, {useEffect,useRef,useState} from 'react';
import {AbsoluteFill, Img, OffthreadVideo, interpolate, spring, useCurrentFrame,cancelRender,delayRender,continueRender} from 'remotion';
const colors={background:'#101412',text:'#edf0e6',accent:'#c5ed74'};
export function CinemaScene({scene,photos,clips,words,facts,match,frames}) {
  const frame=useCurrentFrame();
  const safe=useRef(null);
  const [layoutHandle]=useState(()=>delayRender('cinema safe area'));
  useEffect(()=>{document.fonts.ready.then(()=>requestAnimationFrame(()=>{
    if(safe.current && safe.current.clientHeight>0 && safe.current.scrollHeight>safe.current.clientHeight+2) cancelRender(new Error(`texto excede la zona segura: ${scene.composition}/${scene.variant} ${safe.current.scrollHeight}/${safe.current.clientHeight}`));
    else continueRender(layoutHandle);
  })).catch(cancelRender);},[layoutHandle]);
  const p=interpolate(frame,[0,Math.max(1,frames-1)],[0,1],{extrapolateRight:'clamp'});
  const enter=scene.distinctive==='slam'?spring({frame,fps:30,config:{damping:14,stiffness:210}}):interpolate(frame,[0,16],[0,1],{extrapolateRight:'clamp'});
  const scale=scene.camera==='push'?1+p*.05:scene.camera==='pull'?1.05-p*.05:1;
  const phrase=words.slice(scene.wordStart,scene.wordEnd).map(w=>w.word).join(' ');
  const stackLines=phrase.split(' ').reduce((lines,word,i)=>{if(i%2===0)lines.push(word);else lines[lines.length-1]+=' '+word;return lines;},[]);
  const rows=(scene.factIds??[]).map(id=>facts.find(f=>f.id===id));
  const mediaStyle={position:'absolute',inset:0,width:'100%',height:scene.variant==='split'?'54%':'100%',objectFit:'cover',transform:`scale(${scale})`};
  const stagger=index=>scene.reveal==='stagger'?interpolate(frame,[index*5,index*5+16],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}):enter;
  const titleStyle={fontSize:phrase.length>55?48:64,lineHeight:1.12,overflowWrap:'anywhere',margin:0,fontWeight:800};
  return <AbsoluteFill style={{background:colors.background,color:colors.text,overflow:'hidden'}}>
    {scene.asset!=null && <Img src={photos[scene.asset].src} style={mediaStyle}/>}
    {scene.clip!=null && <OffthreadVideo src={clips[scene.clip].src} muted style={mediaStyle}/>}
    <AbsoluteFill style={{background:'linear-gradient(180deg,#10141255,#10141222 25%,#101412ee 68%)'}}/>
    <div ref={safe} style={{position:'absolute',left:76,width:928,top:scene.composition==='protagonist'?700:230,height:scene.composition==='protagonist'?460:930,opacity:enter,transform:`translateY(${(1-enter)*24}px) scale(${scale*(scene.distinctive==='slam'?.92+.08*enter:1)})`,overflow:'hidden'}}>
      <div style={{fontSize:24,letterSpacing:4,color:colors.accent,marginBottom:32}}>GOATLAB · {scene.composition==='resolution'?'LA CLAVE':'ANÁLISIS'}</div>
      {scene.composition==='encounter' && <div style={{fontSize:match.length>45?42:54,lineHeight:1.12,marginBottom:42,opacity:stagger(1),transform:scene.distinctive==='duel'?`translateX(${(1-enter)*90}px)`:undefined}}>{match}</div>}
      <div style={{...titleStyle,display:scene.variant==='stack'?'flex':'block',flexDirection:'column',borderBottom:scene.emphasis==='underline'?`5px solid ${colors.accent}`:undefined,paddingBottom:24}}>
        {scene.variant==='stack'?stackLines.map((line,i)=><span key={i} style={{opacity:stagger(i),fontSize:phrase.length>90?46:64}}>{line}</span>):scene.reveal==='stagger'?phrase.split(' ').map((word,i)=><span key={i} style={{opacity:stagger(i)}}>{word} </span>):phrase}
      </div>
      <div style={{display:(['cards','spotlight'].includes(scene.variant)||rows.length>2)?'grid':'block',gridTemplateColumns:(scene.variant==='cards'||rows.length>2)?'1fr 1fr':'1fr',gap:24,marginTop:44}}>
        {rows.map((fact,i)=><div key={fact.id} style={{opacity:stagger(i+1),transform:scene.distinctive==='duel'?`translateX(${(i%2?1:-1)*(1-enter)*80}px)`:undefined,padding:18,background:'#24362ee8',marginBottom:20,borderLeft:scene.variant==='spotlight'?`7px solid ${colors.accent}`:undefined}}>
          <div style={{fontSize:26,overflowWrap:'anywhere'}}>{fact.label}</div>
          <div style={{fontSize:scene.composition==='primary-stat'?120:58,color:colors.accent}}>{fact.value}<span style={{fontSize:28}}> {fact.unit}</span></div>
          {scene.variant==='bars' && <div style={{height:16,background:colors.accent,transformOrigin:'left',transform:`scaleX(${fact.value/Math.max(1,...rows.map(f=>f.value))*stagger(i+1)})`}}/>}
          <div style={{fontSize:19,color:'#b9c8bd'}}>Muestra: {fact.sampleSize??'no indicada'}</div>
        </div>)}
      </div>
      {scene.variant==='takeaway' && <div style={{width:100,height:8,background:colors.accent,marginTop:42,transform:`scaleX(${enter})`,transformOrigin:'left'}}/>}
      {scene.variant==='masthead' && <div style={{borderTop:`2px solid ${colors.accent}`,marginTop:30,paddingTop:20,fontSize:26}}>DOCUMENTAL DEPORTIVO</div>}
    </div>
  </AbsoluteFill>;
}
