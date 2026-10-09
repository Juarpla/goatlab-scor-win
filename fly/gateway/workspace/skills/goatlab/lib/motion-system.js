/** Motion System carbon-v1: tokens cinematográficos compartidos por guía, validador y Remotion.
 * El contrato cita motionSystem:"carbon-v1" y solo define overrides puntuales. */
export const MOTION_SYSTEM_VERSION = 'carbon-v1';
export const MOTION_SYSTEM = Object.freeze({
  version: 'carbon-v1',
  easings: Object.freeze({
    enter: 'cubic-bezier(0.23,1,0.32,1)',
    outCubic: 'cubic-bezier(0.33,1,0.68,1)',
    captionMask: 'cubic-bezier(0.16,1,0.3,1)',
    camera: 'cubic-bezier(0.36,0,0.2,1)',
  }),
  springs: Object.freeze({
    ENTER: { damping: 22, stiffness: 180, mass: 0.6 },
    FAST: { damping: 27, stiffness: 260, mass: 0.5 },
    SLOW: { damping: 16, stiffness: 110, mass: 0.8 },
    CAM: { damping: 14, stiffness: 70, mass: 1 },
    POP: { damping: 12, stiffness: 200, mass: 0.6 },
  }),
  staggerMs: Object.freeze({ stat: 60, word: 45, card: 100, min: 30, max: 80 }),
  idle: Object.freeze({ breathe: { scale: 1.02, periodFrames: 72 }, pulse: { scale: 1.03, periodFrames: 48 } }),
  backgrounds: Object.freeze(['carbon-grain', 'carbon-glow', 'carbon-grid']),
  revealModes: Object.freeze(['sequential', 'spotlight']),
  signatureMoves: Object.freeze(['camera-push', 'glow-pulse', 'stagger-reveal', 'count-up-slam', 'duel-collide', 'pitch-run']),
  emphasisStyles: Object.freeze(['lime-glow', 'bracket', 'outline-pulse', 'slam']),
  /** Bans duros: lo que empobrece el look cinematográfico. */
  bans: Object.freeze(['linear-easing', 'width-height-animation', 'scale-from-zero', 'more-than-2-signatures', 'captions-over-graphics']),
});
/** 0-2 signature moves por video; cada prompt declara como máximo 1. */
export function signatureMoveErrors(moves) {
  if (!Array.isArray(moves)) return ['signature_move debe ser lista'];
  if (moves.length > 2) return ['máximo 2 signature moves por video'];
  const bad = moves.filter(m => !MOTION_SYSTEM.signatureMoves.includes(m));
  return bad.length ? [`signature moves desconocidos: ${bad.join(', ')}`] : [];
}
