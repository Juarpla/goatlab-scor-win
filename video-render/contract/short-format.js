/** Shared delivery and voice policy, used by the worker and local renders. */
export const FRAME_W = 1080;
export const FRAME_H = 1920;
export const FPS = 30;
export const FONT_FAMILY = 'Liberation Sans';
export const FONT_FILE = 'LiberationSans-Bold.ttf';
export const CAPTION_FILL = '#ffe14a';
export const ENDCARD_SECONDS = 3;
// Legacy plans retain their original closing budget; authored videos use a short logo.
export const DIRECTOR_ENDCARD_SECONDS = 1;
export const LEAD_SECONDS = .5;
export const MAX_FRAMES = 1650;
export const MAX_SECONDS = MAX_FRAMES / FPS;
export const VOICE_SECONDS = MAX_SECONDS - DIRECTOR_ENDCARD_SECONDS - 2 * LEAD_SECONDS;
export const MAX_VOICE_RATE = 1.1;

export function voicePolicy(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('El audio debe tener una duración positiva.');
  const rate = Math.max(1, seconds / VOICE_SECONDS);
  if (rate > MAX_VOICE_RATE + 1e-9) {
    const error = new Error(`Tu audio dura ${seconds.toFixed(1)} segundos. Incluso acelerándolo un 10% supera el límite de 55 segundos. Graba hasta 50 segundos y sustituye este audio.`);
    error.code = 'VOICE_TOO_LONG';
    throw error;
  }
  return { rate: Math.min(rate, MAX_VOICE_RATE), seconds: seconds / rate,
    frames: Math.min(MAX_FRAMES, Math.ceil((seconds / rate + DIRECTOR_ENDCARD_SECONDS + 2 * LEAD_SECONDS) * FPS - 1e-7)) };
}
