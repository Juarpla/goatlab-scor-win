import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Img, OffthreadVideo } from 'remotion';

export default function Piece({ photos = [], clips = [], words = [], facts = [], brandName, brandUrl, contentFrames }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const photo = photos[0];
  const ken = interpolate(frame, [0, Math.max(1, contentFrames)], [1, 1.12], { extrapolateRight: 'clamp' });
  const blur = interpolate(frame, [0, 18, 36], [14, 0, 0], { extrapolateRight: 'clamp' });
  const seconds = frame / fps;
  const word = words.find(item => seconds >= item.start && seconds < item.end);
  const fact = facts[0];
  const enter = spring({ frame, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ background: '#101412' }}>
      {photo ? <Img src={photo.src} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${ken})`, filter: `blur(${blur}px)` }} /> : null}
      {clips[0] ? (
        <Sequence from={60} durationInFrames={90}>
          <OffthreadVideo src={clips[0].src} style={{ position: 'absolute', right: 48, top: 220, width: 420, height: 746, objectFit: 'cover', borderRadius: 28 }} />
        </Sequence>
      ) : null}
      <svg width="1080" height="360" style={{ position: 'absolute', top: 96 }}>
        <circle cx={140 + (frame % 90) * 4} cy="170" r={36 + enter * 24} fill="none" stroke="#7CFFB2" strokeWidth="8" />
      </svg>
      {fact ? (
        <div style={{ position: 'absolute', left: 64, top: 460, padding: '28px 36px', background: 'rgba(16,20,18,.75)', borderRadius: 24, fontSize: 56, fontWeight: 800, textShadow: '0 10px 28px rgba(0,0,0,.55)' }}>
          {fact.label} {Math.round(fact.value)} {fact.unit}
        </div>
      ) : null}
      <div style={{ position: 'absolute', left: 64, right: 64, bottom: 300, fontSize: 72, fontWeight: 800, textShadow: '0 8px 24px rgba(0,0,0,.65)' }}>
        {word ? word.word : brandName}
      </div>
      <div style={{ position: 'absolute', left: 64, bottom: 200, fontSize: 36, opacity: .85 }}>{brandUrl}</div>
    </AbsoluteFill>
  );
}
