import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { CameraMove, ColorWash, FilmGrain } from 'goatlab-kit';

export default function CinemaComparison({ photos, contentFrames }) {
  const picture = <AbsoluteFill style={{ background: '#18272c' }}>{photos[0] ? <Img src={photos[0].src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <svg viewBox="0 0 1080 1920"><circle cx="540" cy="780" r="350" fill="#315d63"/><path d="M0 1450L1080 650V1920H0Z" fill="#7b522e"/></svg>}</AbsoluteFill>;
  return <AbsoluteFill>
    {CAMERA_ENABLED ? <CameraMove from={{scale:1,x:0,y:0}} to={{scale:1.08,x:-24,y:-16}} durationInFrames={contentFrames}>{picture}</CameraMove> : picture}
    {WASH_ENABLED ? <ColorWash colors={['#173f58', '#713d26']} opacity={.07} /> : null}
    {GRAIN_ENABLED ? <FilmGrain opacity={.025} seed={17} /> : null}
    <div style={{ position:'absolute',left:60,right:170,bottom:370,fontSize:88,fontWeight:800,lineHeight:1.06,color:'white',textShadow:'0 2px 5px #000' }}>La imagen<br/>marca el ritmo</div>
  </AbsoluteFill>;
}
