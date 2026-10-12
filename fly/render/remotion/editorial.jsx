import React from 'react';
import {interpolate, Easing, useCurrentFrame} from 'remotion';
const lime='#c5ed74',white='#edf0e6',slate='#8ca6bf';
const titles={form:'EL RITMO DEL PARTIDO',goals:'CAMINO AL ARCO','clean-sheets':'DEFENSA EN MOVIMIENTO','head-to-head':'EL DUELO',synthesis:'CLAVES DEL PARTIDO'};
const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.out(Easing.cubic)};

/** Illustrative sports motion: paths and shapes express energy, never match statistics. */
export function EditorialMotion({graphic,words,frames,match=''}) {
  const frame=useCurrentFrame();
  const p=interpolate(frame,[0,20],[0,1],clamp),exit=interpolate(frame,[Math.max(1,frames-10),frames],[1,0],clamp);
  const names=match.split(/\s+(?:vs\.?|contra)\s+/i);
  const teams=names.length===2?names:['EQUIPO LOCAL','EQUIPO VISITANTE'];
  const phrase=words.slice(graphic.wordStart??0,graphic.wordEnd??0).map(w=>w.word).join(' ');
  const moving=interpolate(frame,[0,Math.max(1,frames-1)],[0,1],clamp);
  const points=[[150,640],[370,490],[220,360],[610,260],[700,90]];
  const segment=Math.min(3,Math.floor(moving*4)),t=moving*4-segment;
  const ball=[0,1].map(axis=>points[segment][axis]+(points[segment+1][axis]-points[segment][axis])*t);
  return <div style={{position:'absolute',inset:0,background:'linear-gradient(180deg,#10141299,#101412f2 65%)',opacity:p*exit}}>
    <div style={{position:'absolute',left:70,right:70,top:220,transform:`translateY(${(1-p)*30}px)`}}>
      <div style={{fontSize:25,letterSpacing:5,color:slate}}>GOATLAB · EN JUEGO</div>
      <div style={{fontSize:titles[graphic.kind].length>24?54:70,lineHeight:1.08,marginTop:28,borderBottom:`5px solid ${lime}`,paddingBottom:30}}>{titles[graphic.kind]}</div>
      {graphic.kind==='head-to-head' ? <div style={{display:'flex',alignItems:'center',gap:24,marginTop:180}}>
        {teams.map((team,i)=><React.Fragment key={i}>{i===1&&<div style={{fontSize:38,color:slate}}>VS</div>}
          <div style={{flex:1,minWidth:0,borderTop:`5px solid ${i?slate:lime}`,background:'#1b2422',padding:'45px 22px',textAlign:'center',transform:`translateX(${(1-p)*(i?80:-80)}px)`}}>
            <div style={{fontSize:110,color:i?slate:lime,lineHeight:1.1}}>{team.trim().slice(0,1)}</div>
            <div style={{fontSize:team.length>18?30:42,overflowWrap:'anywhere',marginTop:35}}>{team}</div>
          </div>
        </React.Fragment>)}
      </div> : graphic.kind==='goals' ? <svg viewBox="0 0 900 760" width="900" height="760" style={{marginTop:40}}>
        <rect x="60" y="20" width="780" height="680" rx="10" fill="#1b3026" stroke={slate} strokeWidth="3"/>
        <path d="M60 360H840M320 20V140H580V20M320 700V580H580V700" fill="none" stroke={slate} strokeWidth="3"/>
        <circle cx="450" cy="360" r="80" fill="none" stroke={slate} strokeWidth="3"/>
        <path d="M150 640L370 490L220 360L610 260L700 90" fill="none" stroke={lime} strokeWidth="6" strokeDasharray="1500" strokeDashoffset={1500*(1-moving)}/>
        <circle cx={ball[0]} cy={ball[1]} r="17" fill={white} stroke={lime} strokeWidth="5"/>
        <text x="450" y="750" textAnchor="middle" fill={slate} fontSize="22">RECORRIDO ILUSTRATIVO</text>
      </svg> : graphic.kind==='clean-sheets' ? <svg viewBox="0 0 900 700" width="900" height="700" style={{marginTop:70}}>
        {[0,1,2].map(i=><circle key={i} cx="450" cy="330" r={170+i*60+Math.sin(frame/18+i)*12} fill="none" stroke={i%2?slate:lime} strokeWidth="3" opacity={.6-i*.15}/>)}
        <path d="M450 140L590 185V350Q560 460 450 520Q340 460 310 350V185Z" fill="#20362d" stroke={lime} strokeWidth="7"/>
        <path d="M380 330L430 380L525 260" fill="none" stroke={white} strokeWidth="10" strokeDasharray="240" strokeDashoffset={240*(1-p)}/>
        <text x="450" y="660" textAnchor="middle" fill={slate} fontSize="22">ANIMACIÓN REFERENCIAL</text>
      </svg> : <div style={{marginTop:130,minHeight:650,position:'relative',display:'flex',flexWrap:'wrap',alignContent:'center',justifyContent:'center',gap:'18px 24px',padding:35}}>
        <div style={{position:'absolute',inset:'35px 0',border:`3px solid ${lime}`,borderRadius:graphic.kind==='form'?20:'50%',transform:`rotate(${Math.sin(frame/35)*3}deg)`,opacity:.35}}/>
        {phrase.split(' ').map((word,i)=><span key={i} style={{fontSize:phrase.length>90?48:phrase.length>55?60:76,lineHeight:1.14,color:i%3===0?lime:white,opacity:interpolate(frame,[i*2,i*2+12],[0,1],clamp),transform:`translateY(${(1-interpolate(frame,[i*2,i*2+12],[0,1],clamp))*25}px)`,position:'relative',maxWidth:'100%',overflowWrap:'anywhere'}}>{word}</span>)}
      </div>}
      {['head-to-head','goals','clean-sheets'].includes(graphic.kind)&&<div style={{fontSize:phrase.length>90?38:48,lineHeight:1.18,marginTop:40,textAlign:'center'}}>{phrase}</div>}
    </div>
  </div>;
}
