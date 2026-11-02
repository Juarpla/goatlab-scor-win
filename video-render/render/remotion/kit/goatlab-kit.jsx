import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate } from './safe-remotion.jsx';
import { phrases, wordAt, fitFontSize, cameraAt, grainPosition } from './kit-logic.mjs';
import { GRAIN_TEXTURE } from './grain-texture.mjs';

export { phrases, wordAt, fitFontSize };

export function Captions({ words = [], style, wordStyle, activeStyle, maxWords = 4, render }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = frame / fps;
  const active = wordAt(words, seconds);
  const group = phrases(words, { maxWords }).find(item => seconds >= item[0].start && seconds < item.at(-1).end + .35) || [];
  const local = group.findIndex(item => words.indexOf(item) === active);
  if (render) return render(group, local);
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', padding: '0 60px 360px', ...style }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', fontSize: 64, fontWeight: 800, ...wordStyle }}>
        {group.map((item, index) => <span key={index} style={index === local ? { color: '#7CFFB2', ...activeStyle } : undefined}>{item.word}</span>)}
      </div>
    </AbsoluteFill>
  );
}

export function FitText({ children, maxWidth = 960, max = 120, min = 40, style }) {
  return <div style={{ fontSize: fitFontSize(children, { maxWidth, max, min }), fontWeight: 800, ...style }}>{children}</div>;
}

export function SafeArea({ children, style }) {
  return <AbsoluteFill style={{ padding: '160px 160px 340px 60px', ...style }}>{children}</AbsoluteFill>;
}

export function KenBurns({ src, from = { scale: 1, x: 0, y: 0 }, to = { scale: 1.12, x: 0, y: -40 }, durationInFrames, style }) {
  const frame = useCurrentFrame();
  const span = Math.max(1, durationInFrames || 1);
  const mix = interpolate(frame, [0, span], [0, 1], { extrapolateRight: 'clamp' });
  const scale = from.scale + (to.scale - from.scale) * mix;
  const x = from.x + (to.x - from.x) * mix;
  const y = from.y + (to.y - from.y) * mix;
  return <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `translate(${x}px, ${y}px) scale(${scale})`, ...style }} />;
}

export function StatCard({ label, value, unit, source, countUp = true, style }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shown = countUp ? Math.round(interpolate(frame, [0, fps], [0, value], { extrapolateRight: 'clamp' })) : value;
  return (
    <div style={{ padding: '28px 36px', background: 'rgba(16,20,18,.75)', borderRadius: 24, ...style }}>
      <div style={{ fontSize: 28, letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 84, fontWeight: 800 }}>{shown} {unit}</div>
      {source ? <div style={{ fontSize: 22, opacity: .75 }}>{source}</div> : null}
    </div>
  );
}

/** Put images/clips inside this wrapper and keep captions in a separate layer. */
export function CameraMove({ children, from, to, durationInFrames, startFrame = 0, style }) {
  const frame = useCurrentFrame();
  const config = useVideoConfig();
  const { scale, x, y } = cameraAt(frame, { from, to, durationInFrames: durationInFrames ?? config.durationInFrames, startFrame });
  return <AbsoluteFill style={{ overflow: 'hidden', ...style }}><AbsoluteFill style={{ transformOrigin: 'center', transform: `translate(${x}px, ${y}px) scale(${scale})` }}>{children}</AbsoluteFill></AbsoluteFill>;
}

/** Overlay the media layer, below text. Colors are artistic choices, not team metadata. */
export function ColorWash({ colors = ['#183449', '#412319'], opacity = .08 }) {
  const palette = Array.isArray(colors) ? colors.slice(0, 2) : [colors];
  const background = palette.length > 1 ? `linear-gradient(135deg, ${palette[0]}, ${palette[1]})` : palette[0];
  return <AbsoluteFill style={{ pointerEvents: 'none', background, opacity: Math.max(0, Math.min(1, opacity)) }} />;
}

/** Experimental: expose to the director only after a real visual/performance comparison. */
export function FilmGrain({ opacity = .025, seed = 0 }) {
  const frame = useCurrentFrame();
  const { x, y } = grainPosition(frame, seed);
  return <AbsoluteFill style={{ pointerEvents: 'none', opacity: Math.max(0, Math.min(1, opacity)), backgroundImage: `url(${GRAIN_TEXTURE})`, backgroundRepeat: 'repeat', backgroundPosition: `${x}px ${y}px` }} />;
}
